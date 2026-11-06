import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

import { Button, Modal } from "../../ui";
import { promotionQrTargetValue, type PromotionQrTarget } from "../../lib/promotions";
import { printPromotionQr } from "./printPromotionQr";

type Props = {
  promotionName: string;
  /** La fila entera: de acá salen destino, acción y sucursal contenedora. */
  target: PromotionQrTarget;
  /** Token PURO. El prefijo lo agrega `promotionQrTargetValue`. */
  token: string;
  onClose: () => void;
  onError: (msg: string) => void;
  onCopied: () => void;
};

/** Cómo se llama cada acción en pantalla y en el papel. */
const ACCION = {
  GRANT: {
    titulo: "Activación",
    papel: "Otorgar beneficio",
    ayuda: (lugar: string) => `Este QR otorga el beneficio en ${lugar}.`,
  },
  USE: {
    titulo: "Utilización",
    papel: "Utilizar beneficio",
    ayuda: (lugar: string) => `Este QR registra la utilización del beneficio en ${lugar}.`,
  },
} as const;

/**
 * El QR de una combinación promoción + destino + acción, en grande.
 *
 * Todo lo que se ve acá está pensado para que el papel impreso se pueda
 * identificar sin escanearlo: nombre de la promoción, qué hace el QR y dónde
 * va pegado. Con varios destinos por promoción, dos QR distintos son
 * visualmente idénticos si no se rotulan.
 *
 * Un destino se rotula SIEMPRE igual, sea una sucursal o un punto: solo su
 * nombre. Hell Experiment es VENUE en la base, pero en pantalla y en el papel
 * se presenta como cualquier otra ubicación — nada dice "venue", ni aclara la
 * sucursal que lo contiene. Para quien pega el cartel, es un lugar y punto.
 */
export default function PromotionQrTargetModal({
  promotionName,
  target,
  token,
  onClose,
  onError,
  onCopied,
}: Props) {
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const [copying, setCopying] = useState(false);

  const copia = ACCION[target.action];
  const value = promotionQrTargetValue(target.action, token);
  const lugar = `la sucursal ${target.targetName}`;

  const print = () => {
    printPromotionQr(
      canvasWrapRef.current?.querySelector("canvas") ?? null,
      {
        title: promotionName,
        subtitle: copia.papel,
        branch: target.targetName,
        note: copia.ayuda(lugar),
      },
      onError
    );
  };

  /** Mismo recurso que ya usan Usuarios y el código GM de la topbar. */
  const copiar = async () => {
    setCopying(true);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(value);
      onCopied();
    } catch {
      onError("No pude copiar el código. Copialo a mano desde el QR.");
    } finally {
      setCopying(false);
    }
  };

  return (
    <Modal
      open
      title={promotionName}
      description={`${copia.titulo} · ${target.targetName}`}
      size="md"
      panelClassName="eg-promo-modal"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          <Button variant="primary" icon="qr" onClick={print}>Imprimir QR</Button>
        </>
      }
    >
      <div className="eg-promo-qrbig">
        {/* Rótulo de identificación. Es el mismo texto que sale impreso, para
            que lo que se ve en pantalla y lo que queda en el papel coincidan. */}
        <div className="eg-promo-qrbig__label">
          <strong>{promotionName}</strong>
          <span className={`eg-promo-qrbig__action eg-promo-qrbig__action--${target.action.toLowerCase()}`}>
            {copia.papel}
          </span>
          <em>{target.targetName}</em>
        </div>

        <div className="eg-promo-qrbig__code" ref={canvasWrapRef}>
          <QRCodeCanvas value={value} size={260} marginSize={2} />
        </div>

        <p className="eg-promo-qrbig__help">{copia.ayuda(lugar)}</p>

        {!target.targetActive && (
          <p className="eg-promo-qrbig__warning" role="note">
            La sucursal está inactiva, pero este QR sigue habilitado y funcionando.
          </p>
        )}

        <div className="eg-promo-qrbig__actions">
          <Button size="sm" variant="ghost" icon="copy" loading={copying} onClick={() => void copiar()}>
            Copiar código
          </Button>
        </div>
      </div>
    </Modal>
  );
}

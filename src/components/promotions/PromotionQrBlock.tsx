import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";

import { Button } from "../../ui";
import { printPromotionQr } from "./printPromotionQr";

type Props = {
  title: string;
  description: string;
  /** Valor completo ya prefijado (EG-PROMO-GRANT-… / EG-PROMO-USE-…). */
  value: string;
  /** Nombre de la promoción, para el encabezado de la hoja impresa. */
  promotionName?: string;
  printLabel?: string;
  rotateLabel?: string;
  onRotate?: () => void;
  rotating?: boolean;
  loading?: boolean;
  size?: number;
  onError?: (msg: string) => void;
};

/**
 * Bloque visual de un QR de promoción. El token puro llega ya prefijado por
 * quien lo monta: acá solo se codifica y se muestra.
 */
export default function PromotionQrBlock({
  title,
  description,
  value,
  promotionName,
  printLabel,
  rotateLabel,
  onRotate,
  rotating = false,
  loading = false,
  size = 148,
  onError,
}: Props) {
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);

  const print = () => {
    printPromotionQr(
      canvasWrapRef.current?.querySelector("canvas") ?? null,
      {
        title: promotionName ? `${promotionName} · Escape Games` : "Promoción · Escape Games",
        subtitle: title,
      },
      (msg) => onError?.(msg)
    );
  };

  return (
    <section className="eg-promo-qr">
      <div className="eg-promo-qr__code" ref={canvasWrapRef}>
        {value ? (
          <QRCodeCanvas value={value} size={size} marginSize={2} />
        ) : (
          <span className="eg-promo-qr__code-empty" style={{ width: size, height: size }}>
            {loading ? "Cargando…" : "Sin token"}
          </span>
        )}
      </div>

      <div className="eg-promo-qr__copy">
        <strong>{title}</strong>
        <p>{description}</p>
        {value && <code className="eg-promo-qr__value">{value}</code>}

        {(printLabel || rotateLabel) && (
          <div className="eg-promo-qr__actions">
            {printLabel && (
              <Button size="sm" variant="secondary" icon="qr" disabled={!value || rotating} onClick={print}>
                {printLabel}
              </Button>
            )}
            {rotateLabel && onRotate && (
              <Button size="sm" variant="ghost" icon="refresh" loading={rotating} disabled={loading} onClick={onRotate}>
                {rotateLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

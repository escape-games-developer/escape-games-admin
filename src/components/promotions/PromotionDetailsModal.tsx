import { useCallback, useState } from "react";

import { Badge, Button, Icon, Modal, StatCard } from "../../ui";
import type { ToastKind } from "../Toast";
import {
  fetchPromotionAdmin,
  formatPromotionDate,
  promotionErrorMessage,
  type Promotion,
  type PromotionDetail,
} from "../../lib/promotions";
import PromotionQrTargetPanel from "./PromotionQrTargetPanel";
import PromotionQrPair from "./PromotionQrPair";

type Props = {
  promotion: Promotion | null;
  /** "details" muestra todo; "qr" solo los códigos (acción "Ver QR"). */
  mode?: "details" | "qr";
  onClose: () => void;
  onEdit?: (promotion: Promotion) => void;
  toast: (kind: ToastKind, text: string) => void;
};

/**
 * Detalle de una promoción.
 *
 * Los QR ahora son POR DESTINO: una sucursal entera o un punto específico
 * dentro de una. Cada combinación promoción + destino + acción tiene su propio
 * token, y todo eso lo maneja `PromotionQrTargetPanel`.
 *
 * Los dos QR globales del sistema anterior (`grant_token` / `use_token` de
 * `get_promotion_admin`) siguen existiendo en la base y se conservan acá, pero
 * relegados a un bloque colapsado y en modo lectura:
 *
 *   · se cargan RECIÉN al desplegar el bloque, no al abrir el modal, así una
 *     visita normal ya no pide tokens que nadie va a mirar — y si esa lectura
 *     falla, no rompe la pantalla de los QR por sucursal;
 *   · no se ofrece regenerarlos. Durante la transición, rotar por error un QR
 *     global invalidaría material impreso viejo sin que nadie lo pida.
 */
export default function PromotionDetailsModal({ promotion, mode = "details", onClose, onEdit, toast }: Props) {
  /** Tokens del sistema anterior. Null hasta que alguien despliega el bloque. */
  const [legacy, setLegacy] = useState<PromotionDetail | null>(null);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [legacyPedido, setLegacyPedido] = useState(false);

  const promotionId = promotion?.id ?? null;

  const cargarLegacy = useCallback(async () => {
    if (!promotionId) return;

    setLegacyLoading(true);
    setLegacyError(null);

    try {
      setLegacy(await fetchPromotionAdmin(promotionId));
    } catch (err) {
      setLegacy(null);
      setLegacyError(promotionErrorMessage(err, "No pude cargar los QR anteriores."));
    } finally {
      setLegacyLoading(false);
    }
  }, [promotionId]);

  if (!promotion) return null;

  const onlyQr = mode === "qr";

  /** Se dispara al abrir el `<details>`, una sola vez. */
  const alDesplegarLegacy = (abierto: boolean) => {
    if (!abierto || legacyPedido) return;
    setLegacyPedido(true);
    void cargarLegacy();
  };

  return (
    <Modal
      open
      title={onlyQr ? `QR · ${promotion.name}` : promotion.name}
      description={onlyQr
        ? "Códigos de activación y utilización por sucursal y punto."
        : `Creada el ${formatPromotionDate(promotion.createdAt)}`}
      size="lg"
      panelClassName="eg-promo-modal"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          {!onlyQr && onEdit && <Button variant="primary" icon="edit" onClick={() => onEdit(promotion)}>Editar</Button>}
        </>
      }
    >
      <div className="eg-promo-details">
        {!onlyQr && (
          <div className="eg-promo-details__summary">
            <div className="eg-promo-details__image">
              {promotion.imageUrl ? (
                <img src={promotion.imageUrl} alt={`Imagen de ${promotion.name}`} />
              ) : (
                <span className="eg-promo-details__image-empty"><Icon name="image" size={28} /><small>Sin imagen</small></span>
              )}
            </div>

            <div className="eg-promo-details__info">
              <div className="eg-promo-details__title">
                <strong>{promotion.name}</strong>
                <Badge tone={promotion.active ? "success" : "neutral"} dot small>{promotion.active ? "Activa" : "Inactiva"}</Badge>
              </div>
              <p>{promotion.description || "Sin descripción."}</p>
              <div className="eg-promo-details__stats">
                <StatCard value={promotion.totalGranted} label="Otorgados" tone="success" />
                <StatCard value={promotion.availableCount} label="Disponibles" tone="accent" />
                <StatCard value={promotion.usedCount} label="Utilizados" />
              </div>
            </div>
          </div>
        )}

        <PromotionQrTargetPanel
          promotionId={promotion.id}
          promotionName={promotion.name}
          toast={toast}
        />

        {/* --------------------- QR del sistema anterior --------------------- */}
        <details
          className="eg-promo-legacy"
          onToggle={(event) => alDesplegarLegacy(event.currentTarget.open)}
        >
          <summary className="eg-promo-legacy__summary">
            <Icon name="chevronRight" size={14} />
            <span>QR anteriores</span>
          </summary>

          <div className="eg-promo-legacy__body">
            <p className="eg-promo-legacy__warning" role="note">
              Estos QR pertenecen al sistema anterior y se mantienen temporalmente por
              compatibilidad. No tienen sucursal asociada y no se pueden regenerar desde acá.
            </p>

            {legacyError ? (
              <div className="eg-promo-error" role="alert">
                <span>{legacyError}</span>
                <Button size="sm" variant="secondary" icon="refresh" onClick={() => void cargarLegacy()}>Reintentar</Button>
              </div>
            ) : (
              /*
                Sin `printable` y sin callbacks de rotación: el par queda en
                modo lectura. No es solo esconder botones — los handlers no
                existen, así que no hay forma de llamar a las RPC de rotación
                del sistema anterior desde esta pantalla.
              */
              <PromotionQrPair
                grantToken={legacy?.grantToken ?? null}
                useToken={legacy?.useToken ?? null}
                promotionName={promotion.name}
                loading={legacyLoading}
              />
            )}
          </div>
        </details>
      </div>
    </Modal>
  );
}

import { useCallback, useEffect, useState } from "react";

import { Badge, Button, Icon, Modal, StatCard } from "../../ui";
import type { ToastKind } from "../Toast";
import {
  fetchPromotionAdmin,
  formatPromotionDate,
  promotionErrorMessage,
  rotatePromotionGrantToken,
  rotatePromotionUseToken,
  type Promotion,
  type PromotionDetail,
} from "../../lib/promotions";
import PromotionQrPair from "./PromotionQrPair";

const ROTATE_CONFIRM = "El QR actualmente impreso dejará de funcionar.\n\n¿Confirmás la rotación?";

type Props = {
  promotion: Promotion | null;
  /** "details" muestra todo; "qr" solo los códigos (acción "Ver QR"). */
  mode?: "details" | "qr";
  onClose: () => void;
  onEdit?: (promotion: Promotion) => void;
  toast: (kind: ToastKind, text: string) => void;
};

/**
 * Detalle de una promoción. Los tokens NO vienen del listado: se piden con
 * `get_promotion_admin` al abrir, que es el único camino que los expone.
 */
export default function PromotionDetailsModal({ promotion, mode = "details", onClose, onEdit, toast }: Props) {
  const [detail, setDetail] = useState<PromotionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotating, setRotating] = useState<"grant" | "use" | null>(null);

  const promotionId = promotion?.id ?? null;

  const load = useCallback(async () => {
    if (!promotionId) return;

    setLoading(true);
    setError(null);

    try {
      setDetail(await fetchPromotionAdmin(promotionId));
    } catch (err) {
      setDetail(null);
      setError(promotionErrorMessage(err, "No pude cargar el detalle de la promoción."));
    } finally {
      setLoading(false);
    }
  }, [promotionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!promotion) return null;

  const onlyQr = mode === "qr";

  const rotate = async (kind: "grant" | "use") => {
    if (rotating) return;
    if (!window.confirm(ROTATE_CONFIRM)) return;

    setRotating(kind);

    try {
      const token = kind === "grant"
        ? await rotatePromotionGrantToken(promotion.id)
        : await rotatePromotionUseToken(promotion.id);

      // Solo se reemplaza el token rotado: el otro QR no se toca.
      setDetail((prev) => prev
        ? { ...prev, ...(kind === "grant" ? { grantToken: token } : { useToken: token }) }
        : prev);

      toast("success", kind === "grant"
        ? "QR de otorgar regenerado. El anterior dejó de funcionar."
        : "QR de usar regenerado. El anterior dejó de funcionar.");
    } catch (err) {
      toast("error", promotionErrorMessage(err, "No pude regenerar el QR."));
    } finally {
      setRotating(null);
    }
  };

  return (
    <Modal
      open
      title={onlyQr ? `QR · ${promotion.name}` : promotion.name}
      description={onlyQr ? "Códigos para otorgar y usar la promoción." : `Creada el ${formatPromotionDate(promotion.createdAt)}`}
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

        {error ? (
          <div className="eg-promo-error" role="alert">
            <span>{error}</span>
            <Button size="sm" variant="secondary" icon="refresh" onClick={() => void load()}>Reintentar</Button>
          </div>
        ) : (
          <PromotionQrPair
            grantToken={detail?.grantToken ?? null}
            useToken={detail?.useToken ?? null}
            promotionName={promotion.name}
            printable
            loading={loading}
            rotating={rotating}
            onRotateGrant={() => void rotate("grant")}
            onRotateUse={() => void rotate("use")}
            onError={(msg) => toast("error", msg)}
          />
        )}
      </div>
    </Modal>
  );
}

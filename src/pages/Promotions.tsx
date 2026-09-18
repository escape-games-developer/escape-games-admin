import { useCallback, useEffect, useMemo, useState } from "react";

import { useToasts, ToastStack } from "../components/Toast";
import PromotionsTable from "../components/promotions/PromotionsTable";
import PromotionClientsTable from "../components/promotions/PromotionClientsTable";
import PromotionFormModal, { type PromotionDraft } from "../components/promotions/PromotionFormModal";
import PromotionDetailsModal from "../components/promotions/PromotionDetailsModal";
import "../components/promotions/promotions.css";
import { Button, PageHeader, StatCard } from "../ui";
import {
  createPromotion,
  deletePromotionImage,
  fetchPromotionsAdmin,
  promotionErrorMessage,
  setPromotionActive,
  updatePromotion,
  uploadPromotionImage,
  type Promotion,
} from "../lib/promotions";

type Tab = "promotions" | "clients";

/**
 * Beneficios › Promociones.
 *
 * Todo el negocio pasa por `lib/promotions.ts`, que habla solo con las RPC
 * admin. Lo único que esta pantalla toca de Storage es a través de esa misma
 * capa, y siempre subiendo antes de borrar.
 */
export default function Promotions() {
  const { toasts, toast, dismiss } = useToasts();

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("promotions");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ promotion: Promotion; mode: "details" | "qr" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setPromotions(await fetchPromotionsAdmin());
    } catch (err) {
      setPromotions([]);
      setError(promotionErrorMessage(err, "No pude cargar las promociones."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Métricas reales: se agregan sobre lo que ya devolvió la RPC. */
  const stats = useMemo(() => ({
    activePromotions: promotions.filter((promotion) => promotion.active).length,
    grantedBenefits: promotions.reduce((acc, promotion) => acc + promotion.totalGranted, 0),
    usedBenefits: promotions.reduce((acc, promotion) => acc + promotion.usedCount, 0),
  }), [promotions]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (promotion: Promotion) => {
    setViewing(null);
    setEditing(promotion);
    setFormOpen(true);
  };

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditing(null);
  }, []);

  /**
   * Alta. El path de la imagen necesita el id, así que primero se crea la
   * promoción sin imagen y después se sube. Si el upload falla, la promoción
   * queda creada (no se borra) y se avisa para editarla más tarde.
   */
  const createFlow = async (draft: PromotionDraft) => {
    const promotionId = await createPromotion({
      name: draft.name,
      description: draft.description,
      imagePath: null,
      active: draft.active,
    });

    if (!draft.file) {
      toast("success", "Promoción creada.");
      return;
    }

    try {
      const imagePath = await uploadPromotionImage(promotionId, draft.file);
      // Actualización PARCIAL: solo el path. `name` y `description` quedan
      // fuera a propósito para que viajen como null y no se reescriban con lo
      // que ya guardó `create_promotion`.
      await updatePromotion({ promotionId, imagePath });
      toast("success", "Promoción creada.");
    } catch (err) {
      toast("error", `La promoción se creó, pero la imagen no se pudo guardar: ${promotionErrorMessage(err, "error al subir la imagen")}. Editala para reintentar.`);
    }
  };

  /**
   * Edición. Si hay imagen nueva se sube PRIMERO con un path nuevo; la vieja
   * se borra recién después de que `update_promotion` confirmó. Si ese borrado
   * falla, no se revierte nada: solo se avisa.
   */
  const editFlow = async (promotion: Promotion, draft: PromotionDraft) => {
    const previousPath = promotion.imagePath;

    /*
      `update_promotion` lee null como "no modificar" y "" como "blanquear".
      Por eso sin cambios de imagen se manda null (y no el path anterior), y
      "Quitar imagen" manda "", que es lo único que vacía el campo.
    */
    let imagePath: string | null = null;

    if (draft.file) imagePath = await uploadPromotionImage(promotion.id, draft.file);
    else if (draft.removeExistingImage) imagePath = "";

    await updatePromotion({
      promotionId: promotion.id,
      name: draft.name,
      description: draft.description,
      imagePath,
    });

    if (draft.active !== promotion.active) {
      await setPromotionActive(promotion.id, draft.active);
    }

    toast("success", "Promoción actualizada.");

    // Solo se borra el archivo viejo si la DB realmente cambió de path:
    // reemplazo (path nuevo) o blanqueo (""). Con null no se tocó nada.
    if (previousPath && imagePath !== null && previousPath !== imagePath) {
      try {
        await deletePromotionImage(previousPath);
      } catch (err) {
        toast("warning", `La promoción se guardó, pero no pude borrar la imagen anterior del bucket: ${promotionErrorMessage(err, "error de Storage")}.`);
      }
    }
  };

  const submitForm = async (draft: PromotionDraft) => {
    if (saving) return;
    setSaving(true);

    try {
      if (editing) await editFlow(editing, draft);
      else await createFlow(draft);

      closeForm();
      await load();
    } catch (err) {
      toast("error", promotionErrorMessage(err, "No pude guardar la promoción."));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (promotion: Promotion) => {
    if (busyId) return;
    setBusyId(promotion.id);

    try {
      await setPromotionActive(promotion.id, !promotion.active);
      toast("success", `${promotion.name} ${promotion.active ? "desactivada" : "activada"}.`);
      await load();
    } catch (err) {
      toast("error", promotionErrorMessage(err, "No pude cambiar el estado de la promoción."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="eg-promo-page">
      <PageHeader
        title="Promociones"
        subtitle="Gestioná las promociones disponibles y los beneficios otorgados a clientes."
        action={<Button variant="primary" icon="plus" onClick={openCreate}>Nueva promoción</Button>}
      />

      <div className="eg-promo-stats">
        <StatCard value={stats.activePromotions} label="Promociones activas" tone="success" icon="ticket" loading={loading} />
        <StatCard value={stats.grantedBenefits} label="Beneficios otorgados" tone="accent" icon="users" loading={loading} />
        <StatCard value={stats.usedBenefits} label="Beneficios utilizados" icon="qr" loading={loading} />
      </div>

      {/* Mismas clases de pestañas que ya usa el panel. */}
      <div className="eg-golden-tabs eg-promo-tabs" role="tablist" aria-label="Vistas de promociones">
        {([
          ["promotions", "Promociones creadas"],
          ["clients", "Clientes"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`eg-golden-tab${tab === key ? " is-active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="eg-promo-view" role="tabpanel">
        {tab === "promotions" ? (
          <PromotionsTable
            promotions={promotions}
            loading={loading}
            error={error}
            busyId={busyId}
            onRetry={() => void load()}
            onView={(promotion) => setViewing({ promotion, mode: "details" })}
            onEdit={openEdit}
            onViewQr={(promotion) => setViewing({ promotion, mode: "qr" })}
            onToggleActive={(promotion) => void toggleActive(promotion)}
            onCreate={openCreate}
          />
        ) : (
          <PromotionClientsTable promotions={promotions} />
        )}
      </div>

      {formOpen && (
        <PromotionFormModal
          key={editing?.id ?? "new"}
          open
          promotion={editing}
          saving={saving}
          onClose={closeForm}
          onSubmit={(draft) => void submitForm(draft)}
        />
      )}

      {viewing && (
        <PromotionDetailsModal
          key={`${viewing.promotion.id}:${viewing.mode}`}
          promotion={viewing.promotion}
          mode={viewing.mode}
          onClose={() => setViewing(null)}
          onEdit={openEdit}
          toast={toast}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

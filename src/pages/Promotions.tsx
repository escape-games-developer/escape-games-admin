import { useCallback, useEffect, useMemo, useState } from "react";

import { useToasts, ToastStack } from "../components/Toast";
import PromotionsTable from "../components/promotions/PromotionsTable";
import PromotionClientsTable from "../components/promotions/PromotionClientsTable";
import PromotionFormModal, { type PromotionDraft } from "../components/promotions/PromotionFormModal";
import PromotionDetailsModal from "../components/promotions/PromotionDetailsModal";
import "../components/promotions/promotions.css";
import { Button, PageHeader, StatCard } from "../ui";
import { useSectionPermissions } from "../lib/sectionPermissionsStore";
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
 *
 * Tres perfiles conviven acá, y la diferencia se decide ANTES de renderizar —
 * nunca con un try/catch sobre una llamada rechazada:
 *
 *   · ADMIN_GENERAL / ADMIN → todo, exactamente como siempre.
 *   · GM con `promotions`   → tab "Promociones creadas" en SOLO LECTURA. No se
 *     monta ni se ejecuta nada administrativo: sin alta, sin edición, sin
 *     activar/desactivar y sin el modal de detalle, que es el único que llama
 *     `get_promotion_admin` (la RPC que expone los tokens).
 *   · GM con `promotions_clients` → tab "Clientes".
 */
export default function Promotions() {
  const { toasts, toast, dismiss } = useToasts();
  /**
   * Permisos ya resueltos por el boot de AdminLayout. La ruta pasa por
   * `SectionGuard`, que no dibuja nada mientras `loading`: acá los valores ya
   * son definitivos, así que la tab inicial no puede parpadear.
   */
  const { promotions: acceso } = useSectionPermissions();

  /** Tabs habilitadas, en su orden de siempre. Nunca queda vacío: si no hubiera
   *  ninguna, el guard de la ruta ya habría frenado la pantalla. */
  const tabsDisponibles = useMemo(() => {
    const disponibles: [Tab, string][] = [];
    if (acceso.canRead) disponibles.push(["promotions", "Promociones creadas"]);
    if (acceso.canReadClients) disponibles.push(["clients", "Clientes"]);
    return disponibles;
  }, [acceso.canRead, acceso.canReadClients]);

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Default de la tab. Se calcula en el inicializador (no en un efecto) para
   * que el primer render ya sea el correcto: con ambas habilitadas queda el
   * default de siempre, y si solo hay una, esa. No hay tab persistida en
   * localStorage ni en la URL, así que no hay nada más que corregir.
   */
  const [tab, setTab] = useState<Tab>(() => tabsDisponibles[0]?.[0] ?? "promotions");
  /** Red de seguridad: si los permisos cambiaran en caliente, nunca se
   *  renderiza una tab prohibida, ni por un frame. */
  const tabActiva: Tab = tabsDisponibles.some(([key]) => key === tab)
    ? tab
    : tabsDisponibles[0]?.[0] ?? "promotions";
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ promotion: Promotion; mode: "details" | "qr" } | null>(null);

  /**
   * Listado. `get_promotions_admin` está gateada por `can_read_promotions()`:
   * sin el permiso ni se intenta. Un GM que solo tiene Clientes no dispara la
   * llamada (y la tab Clientes no la necesita: se abastece de sus propias RPC).
   */
  const load = useCallback(async () => {
    if (!acceso.canRead) {
      setPromotions([]);
      setError(null);
      setLoading(false);
      return;
    }

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
  }, [acceso.canRead]);

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
        subtitle={acceso.isAdmin
          ? "Gestioná las promociones disponibles y los beneficios otorgados a clientes."
          : "Consultá las promociones disponibles y los beneficios otorgados a clientes."}
        action={acceso.isAdmin
          ? <Button variant="primary" icon="plus" onClick={openCreate}>Nueva promoción</Button>
          : undefined}
      />

      {/* Las métricas se calculan sobre el listado: sin permiso de lectura no
          hay de dónde sacarlas, y mostrar tres ceros sería mentir. */}
      {acceso.canRead && (
        <div className="eg-promo-stats">
          <StatCard value={stats.activePromotions} label="Promociones activas" tone="success" icon="ticket" loading={loading} />
          <StatCard value={stats.grantedBenefits} label="Beneficios otorgados" tone="accent" icon="users" loading={loading} />
          <StatCard value={stats.usedBenefits} label="Beneficios utilizados" icon="qr" loading={loading} />
        </div>
      )}

      {/* Mismas clases de pestañas que ya usa el panel. Con una sola tab
          disponible no se dibuja la barra: no hay nada entre qué elegir. */}
      {tabsDisponibles.length > 1 && (
        <div className="eg-golden-tabs eg-promo-tabs" role="tablist" aria-label="Vistas de promociones">
          {tabsDisponibles.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tabActiva === key}
              className={`eg-golden-tab${tabActiva === key ? " is-active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="eg-promo-view" role="tabpanel">
        {tabActiva === "promotions" ? (
          <PromotionsTable
            promotions={promotions}
            loading={loading}
            error={error}
            busyId={busyId}
            onRetry={() => void load()}
            /*
              Sin permisos de administración no se pasa NINGÚN callback
              administrativo: la tabla no dibuja el menú de acciones ni hace
              clickeable la fila, así que no hay forma de abrir el detalle —el
              único camino a `get_promotion_admin`— ni de tocar una promoción.
            */
            onView={acceso.isAdmin ? (promotion) => setViewing({ promotion, mode: "details" }) : undefined}
            onEdit={acceso.isAdmin ? openEdit : undefined}
            onViewQr={acceso.isAdmin ? (promotion) => setViewing({ promotion, mode: "qr" }) : undefined}
            onToggleActive={acceso.isAdmin ? (promotion) => void toggleActive(promotion) : undefined}
            onCreate={acceso.isAdmin ? openCreate : undefined}
          />
        ) : (
          /*
            `promotions` solo alimenta el cartel "Inhabilitado" de los otorgados
            de promociones apagadas. Para un GM sin `promotions` llega vacío y
            esa marca no aparece; el filtro de promoción NO sale de acá, la tabla
            lo pide con su propia RPC.
          */
          <PromotionClientsTable promotions={promotions} toast={toast} />
        )}
      </div>

      {acceso.isAdmin && formOpen && (
        <PromotionFormModal
          key={editing?.id ?? "new"}
          open
          promotion={editing}
          saving={saving}
          onClose={closeForm}
          onSubmit={(draft) => void submitForm(draft)}
        />
      )}

      {acceso.isAdmin && viewing && (
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

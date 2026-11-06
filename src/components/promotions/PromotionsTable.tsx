import { useMemo, useState } from "react";

import { ActionMenu, Badge, Button, Card, DataTable, EmptyState, Icon, SearchInput, Select, type DataTableColumn } from "../../ui";
import { formatPromotionDate, type Promotion, type PromotionStatusFilter } from "../../lib/promotions";

type Props = {
  promotions: Promotion[];
  loading: boolean;
  error: string | null;
  busyId: string | null;
  onRetry: () => void;
  /*
    Los cinco callbacks administrativos son OPCIONALES. Sin ellos la tabla queda
    en solo lectura: es el modo de un GM con el permiso `promotions`, que puede
    ver el listado pero no administrarlo. No se trata de deshabilitar botones —
    directamente no se dibujan, así que no hay ningún camino a las RPC de admin.
  */
  onView?: (promotion: Promotion) => void;
  onEdit?: (promotion: Promotion) => void;
  onViewQr?: (promotion: Promotion) => void;
  onToggleActive?: (promotion: Promotion) => void;
  onDelete?: (promotion: Promotion) => void;
  onCreate?: () => void;
};

/**
 * Tab "Promociones creadas". Los contadores salen tal cual de
 * `get_promotions_admin`: acá no se calcula ninguna métrica.
 */
export default function PromotionsTable({
  promotions,
  loading,
  error,
  busyId,
  onRetry,
  onView,
  onEdit,
  onViewQr,
  onToggleActive,
  onDelete,
  onCreate,
}: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<PromotionStatusFilter>("all");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return promotions.filter((promotion) => {
      if (status === "active" && !promotion.active) return false;
      if (status === "inactive" && promotion.active) return false;
      if (!term) return true;
      return `${promotion.name} ${promotion.description}`.toLowerCase().includes(term);
    });
  }, [promotions, q, status]);

  const hasFilters = q.trim().length > 0 || status !== "all";

  /**
   * Solo lectura: nadie pasó acciones administrativas. El detalle entra en la
   * cuenta porque abrirlo dispara `get_promotion_admin`, que expone los tokens
   * y solo acepta ADMIN_GENERAL / ADMIN.
   */
  const readOnly = !onView && !onEdit && !onViewQr && !onToggleActive && !onDelete;

  const columns: DataTableColumn<Promotion>[] = [
    {
      key: "image",
      header: "Imagen",
      className: "eg-promo-table__image-col",
      render: (promotion) => (
        <span className="eg-promo-thumb">
          {promotion.imageUrl ? <img src={promotion.imageUrl} alt="" /> : <Icon name="image" size={18} />}
        </span>
      ),
    },
    {
      key: "name",
      header: "Promoción",
      className: "eg-promo-table__name-col",
      render: (promotion) => (
        <div className="eg-promo-name-cell">
          <strong>{promotion.name}</strong>
          <span title={promotion.description}>{promotion.description || "Sin descripción"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Estado",
      align: "center",
      render: (promotion) => <Badge tone={promotion.active ? "success" : "neutral"} dot small>{promotion.active ? "Activa" : "Inactiva"}</Badge>,
    },
    { key: "granted", header: "Otorgados", align: "center", render: (promotion) => <span className="eg-promo-number">{promotion.totalGranted}</span> },
    { key: "available", header: "Disponibles", align: "center", render: (promotion) => <span className="eg-promo-number">{promotion.availableCount}</span> },
    { key: "used", header: "Usados", align: "center", render: (promotion) => <span className="eg-promo-number">{promotion.usedCount}</span> },
    { key: "created", header: "Creada", render: (promotion) => <span className="eg-promo-muted">{formatPromotionDate(promotion.createdAt)}</span> },
  ];

  // La columna de acciones existe solo si hay acciones. En solo lectura la
  // tabla termina en "Creada".
  if (!readOnly) {
    columns.push({
      key: "actions",
      header: "Acciones",
      align: "center",
      render: (promotion) => (
        <div onClick={(event) => event.stopPropagation()}>
          <ActionMenu items={[
            ...(onView ? [{ key: "view", label: "Ver", icon: "eye" as const, onSelect: () => onView(promotion) }] : []),
            ...(onEdit ? [{ key: "edit", label: "Editar", icon: "edit" as const, onSelect: () => onEdit(promotion) }] : []),
            ...(onViewQr ? [{ key: "qr", label: "Ver QR", icon: "qr" as const, onSelect: () => onViewQr(promotion) }] : []),
            ...(onToggleActive ? [{
              key: "toggle",
              label: promotion.active ? "Desactivar" : "Activar",
              icon: "toggle" as const,
              separatorBefore: true,
              disabled: busyId === promotion.id,
              onSelect: () => onToggleActive(promotion),
            }] : []),
            ...(onDelete ? [{
              key: "delete",
              label: "Eliminar promoción",
              icon: "trash" as const,
              danger: true,
              separatorBefore: !onToggleActive,
              disabled: busyId === promotion.id,
              onSelect: () => onDelete(promotion),
            }] : []),
          ]} />
        </div>
      ),
    });
  }

  return (
    <>
      <Card padding="sm" className="eg-promo-filters">
        <SearchInput value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar promoción..." aria-label="Buscar promoción" />
        <Select value={status} onChange={(event) => setStatus(event.target.value as PromotionStatusFilter)} aria-label="Filtrar por estado">
          <option value="all">Todos</option>
          <option value="active">Activa</option>
          <option value="inactive">Inactiva</option>
        </Select>
      </Card>

      {error && (
        <div className="eg-promo-error" role="alert">
          <span>{error}</span>
          <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>Reintentar</Button>
        </div>
      )}

      <Card padding="none" className="eg-promo-table-card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(promotion) => promotion.id}
          loading={loading}
          loadingLabel="Cargando promociones..."
          onRowClick={onView}
          empty={hasFilters ? (
            <EmptyState icon="ticket" title="No hay promociones con esos filtros" description="Probá modificando la búsqueda o el estado." />
          ) : (
            <EmptyState
              icon="ticket"
              title="Todavía no hay promociones"
              description={onCreate
                ? "Creá la primera para empezar a otorgar beneficios."
                : "Cuando se cree la primera, va a aparecer acá."}
              action={onCreate
                ? <Button variant="primary" icon="plus" onClick={onCreate}>Nueva promoción</Button>
                : undefined}
            />
          )}
        />
      </Card>
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";

import { ActionMenu, Badge, Button, Card, DataTable, EmptyState, SearchInput, Select, type DataTableColumn } from "../../ui";
import type { ToastKind } from "../Toast";
import PromotionConfirmDialog from "./PromotionConfirmDialog";
import {
  PROMOTION_CLIENTS_PAGE_SIZE,
  buildPromotionClientsCsv,
  deleteUserPromotion,
  fetchAllPromotionClients,
  fetchPromotionClients,
  fetchPromotionsForClientsFilter,
  formatPromotionDate,
  promotionClientStatusLabel,
  promotionClientsCsvFilename,
  promotionErrorMessage,
  type Promotion,
  type PromotionClient,
  type PromotionClientStatus,
  type PromotionFilterOption,
} from "../../lib/promotions";

type Props = {
  /**
   * Listado de `get_promotions_admin`, cuando quien mira tiene permiso para
   * leerlo. Se usa SOLO para marcar como "Inhabilitado" los otorgados de
   * promociones apagadas; el filtro de promoción no sale de acá. Llega vacío
   * para un GM que solo tiene Clientes, y en ese caso esa marca no aparece.
   */
  promotions: Promotion[];
  toast: (kind: ToastKind, text: string) => void;
  /** Solo ADMIN_GENERAL / ADMIN. Sin esto la columna de acciones no se dibuja. */
  canDelete?: boolean;
  /** Avisa al padre para refrescar los contadores de promociones. */
  onDeleted?: () => void;
};

/**
 * Tab "Clientes". Los filtros y la paginación se resuelven en el servidor con
 * `get_promotion_clients_admin`: acá no se filtra ni se cuenta a mano.
 *
 * Las dos RPC que usa (`get_promotion_clients_admin` y
 * `get_promotions_for_clients_filter`) comparten el gate
 * `can_read_promotion_clients()`, así que ADMIN y GM autorizado recorren
 * exactamente el mismo camino: no hay un listado paralelo para nadie.
 */
export default function PromotionClientsTable({ promotions, toast, canDelete = false, onDeleted }: Props) {
  const [deleting, setDeleting] = useState<PromotionClient | null>(null);
  const [deleteWorking, setDeleteWorking] = useState(false);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [promotionId, setPromotionId] = useState("all");
  const [status, setStatus] = useState<"all" | PromotionClientStatus>("all");
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<PromotionClient[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  /**
   * Opciones del filtro de promoción. Tienen su propia RPC y no el listado del
   * padre: este panel es HISTÓRICO, así que necesita también las promociones
   * inactivas, y además `get_promotions_for_clients_filter` la puede llamar un
   * GM que tenga Clientes pero no Promociones.
   */
  const [filterOptions, setFilterOptions] = useState<PromotionFilterOption[]>([]);

  useEffect(() => {
    let mounted = true;

    fetchPromotionsForClientsFilter()
      .then((options) => { if (mounted) setFilterOptions(options); })
      // Si el filtro no carga, la tabla sigue sirviendo: queda "Todas" y nada
      // más. No se pisa el error del listado, que es el que importa.
      .catch(() => { if (mounted) setFilterOptions([]); });

    return () => { mounted = false; };
  }, []);

  /** La búsqueda espera a que el usuario deje de tipear. */
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(q);
      setOffset(0);
    }, 350);
    return () => window.clearTimeout(id);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const page = await fetchPromotionClients({
        promotionId: promotionId === "all" ? null : promotionId,
        status: status === "all" ? null : status,
        search,
        limit: PROMOTION_CLIENTS_PAGE_SIZE,
        offset,
      });
      setRows(page.rows);
      setTotal(page.total);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(promotionErrorMessage(err, "No pude cargar los clientes."));
    } finally {
      setLoading(false);
    }
  }, [promotionId, status, search, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Dónde se escaneó el QR. Sale del QR mismo, así que no está en los
   * registros del sistema anterior (QR globales, sin sucursal) ni en un
   * beneficio todavía no usado. En esos casos se muestra una raya: ni "null",
   * ni "undefined", ni "Sin sucursal", que se leería como un dato y no como
   * un vacío.
   *
   * Si el QR era de un punto específico gana el nombre del punto —
   * "Hell Experiment"— y NO se aclara la sucursal que lo contiene. La base
   * sigue guardando esa relación, pero para quien lee la tabla Hell Experiment
   * es una ubicación como cualquier otra, igual que en la pantalla de QR.
   */
  const placeCell = (branchName: string | null, venueName: string | null) => {
    const name = venueName ?? branchName;
    return name
      ? <span className="eg-promo-strong">{name}</span>
      : <span className="eg-promo-muted">—</span>;
  };

  /** Para marcar visualmente los otorgados de promociones apagadas. */
  const inactiveById = useMemo(
    () => new Set(promotions.filter((promotion) => !promotion.active).map((promotion) => promotion.id)),
    [promotions]
  );

  const columns: DataTableColumn<PromotionClient>[] = [
    { key: "promotion", header: "Promoción", render: (client) => <strong className="eg-promo-strong">{client.promotionName || "—"}</strong> },
    { key: "nombre", header: "Nombre", render: (client) => client.nombre || "—" },
    { key: "apellido", header: "Apellido", render: (client) => client.apellido || "—" },
    { key: "mail", header: "Mail", className: "eg-promo-table__mail-col", render: (client) => <span className="eg-promo-mail" title={client.mail}>{client.mail || "—"}</span> },
    { key: "alias", header: "Alias", render: (client) => client.alias ? `@${client.alias}` : <span className="eg-promo-muted">—</span> },
    {
      key: "status",
      header: "Estado",
      align: "center",
      render: (client) => {
        // El status persistido no cambia: si la promoción está inactiva, el
        // otorgado solo se MUESTRA como inhabilitado.
        const label = promotionClientStatusLabel(client, inactiveById.has(client.promotionId));
        const tone = label === "Inhabilitado" ? "warning" : client.status === "granted" ? "success" : "neutral";
        return <Badge tone={tone} dot small>{label}</Badge>;
      },
    },
    { key: "granted_at", header: "Otorgado", render: (client) => <span className="eg-promo-muted">{formatPromotionDate(client.grantedAt)}</span> },
    { key: "grant_branch", header: "Sucursal otorgado", render: (client) => placeCell(client.grantBranchName, client.grantVenueName) },
    { key: "used_at", header: "Usado", render: (client) => <span className="eg-promo-muted">{formatPromotionDate(client.usedAt)}</span> },
    { key: "use_branch", header: "Sucursal uso", render: (client) => placeCell(client.useBranchName, client.useVenueName) },
  ];

  // Sin id de `user_promotions` no hay qué borrar: esa fila no muestra menú.
  if (canDelete) {
    columns.push({
      key: "actions",
      header: "Acciones",
      align: "center",
      render: (client) => client.userPromotionId ? (
        <div onClick={(event) => event.stopPropagation()}>
          <ActionMenu items={[{
            key: "delete",
            label: "Eliminar",
            icon: "trash",
            danger: true,
            disabled: deleteWorking,
            onSelect: () => setDeleting(client),
          }]} />
        </div>
      ) : <span className="eg-promo-muted">—</span>,
    });
  }

  const confirmDelete = async () => {
    const client = deleting;
    if (!client?.userPromotionId || deleteWorking) return;
    setDeleteWorking(true);

    try {
      await deleteUserPromotion(client.userPromotionId);
      setDeleting(null);
      toast("success", "Beneficio eliminado.");
      // Si era el último de la página, se vuelve a la anterior.
      if (rows.length === 1 && offset > 0) setOffset((prev) => Math.max(0, prev - PROMOTION_CLIENTS_PAGE_SIZE));
      else await load();
      onDeleted?.();
    } catch (err) {
      toast("error", promotionErrorMessage(err, "No pude borrar el beneficio."));
    } finally {
      setDeleteWorking(false);
    }
  };

  /**
   * Exporta TODO lo que coincide con los filtros aplicados (los mismos que ve
   * la tabla), no solo la página cargada. Si falla alguna página no se baja
   * nada: un archivo incompleto se confundiría con el listado real.
   */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const selectedId = promotionId === "all" ? null : promotionId;
      const clients = await fetchAllPromotionClients({
        promotionId: selectedId,
        status: status === "all" ? null : status,
        search,
      });

      if (clients.length === 0) {
        toast("warning", "No hay clientes para exportar.");
        return;
      }

      const promotionName = selectedId
        ? filterOptions.find((option) => option.id === selectedId)?.name ?? clients[0].promotionName ?? ""
        : null;

      const blob = new Blob([buildPromotionClientsCsv(clients, inactiveById)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = promotionClientsCsvFilename(promotionName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast("error", "No se pudo exportar el listado de clientes.");
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = search.trim().length > 0 || promotionId !== "all" || status !== "all";
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + rows.length, total);

  return (
    <>
      <Card padding="sm" className="eg-promo-filters eg-promo-filters--clients">
        <SearchInput value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar cliente..." aria-label="Buscar cliente" />
        <Select
          value={promotionId}
          onChange={(event) => { setPromotionId(event.target.value); setOffset(0); }}
          aria-label="Filtrar por promoción"
        >
          <option value="all">Todas</option>
          {filterOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </Select>
        <Select
          value={status}
          onChange={(event) => { setStatus(event.target.value as "all" | PromotionClientStatus); setOffset(0); }}
          aria-label="Filtrar por estado"
        >
          <option value="all">Todos</option>
          <option value="granted">Otorgado</option>
          <option value="used">Usado</option>
        </Select>
        <Button variant="secondary" loading={exporting} onClick={() => void exportCsv()}>
          {exporting ? "Exportando..." : "Exportar CSV"}
        </Button>
      </Card>

      {error && (
        <div className="eg-promo-error" role="alert">
          <span>{error}</span>
          <Button size="sm" variant="secondary" icon="refresh" onClick={() => void load()}>Reintentar</Button>
        </div>
      )}

      <Card padding="none" className="eg-promo-table-card eg-promo-table-card--clients">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(client) => client.userPromotionId ?? `${client.promotionId}:${client.userId}`}
          loading={loading}
          loadingLabel="Cargando clientes..."
          empty={hasFilters ? (
            <EmptyState icon="users" title="No hay clientes con esos filtros" description="Probá modificando la búsqueda o los filtros." />
          ) : (
            <EmptyState icon="users" title="Todavía no hay beneficios otorgados" description="Cuando un cliente escanee el QR de otorgar, aparecerá acá." />
          )}
        />
      </Card>

      {total > 0 && (
        <div className="eg-promo-pagination">
          <span>Mostrando {from}–{to} de {total}</span>
          <div className="eg-promo-pagination__actions">
            <Button
              size="sm"
              variant="secondary"
              icon="chevronLeft"
              disabled={loading || offset === 0}
              onClick={() => setOffset((prev) => Math.max(0, prev - PROMOTION_CLIENTS_PAGE_SIZE))}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="secondary"
              iconRight="chevronRight"
              disabled={loading || to >= total}
              onClick={() => setOffset((prev) => prev + PROMOTION_CLIENTS_PAGE_SIZE)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {deleting && (
        <PromotionConfirmDialog
          title="Eliminar beneficio"
          message={`Se va a borrar el beneficio "${deleting.promotionName || "promoción"}" de ${[deleting.nombre, deleting.apellido].filter(Boolean).join(" ") || deleting.mail || "este cliente"}${deleting.status === "used" ? " (ya usado)" : ""}. El cliente deja de verlo en la app. No se puede deshacer.`}
          confirmLabel="Eliminar"
          working={deleteWorking}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

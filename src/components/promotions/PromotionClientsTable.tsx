import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge, Button, Card, DataTable, EmptyState, SearchInput, Select, type DataTableColumn } from "../../ui";
import {
  PROMOTION_CLIENTS_PAGE_SIZE,
  fetchPromotionClients,
  formatPromotionDate,
  promotionErrorMessage,
  type Promotion,
  type PromotionClient,
  type PromotionClientStatus,
} from "../../lib/promotions";

type Props = {
  promotions: Promotion[];
};

/**
 * Tab "Clientes". Los filtros y la paginación se resuelven en el servidor con
 * `get_promotion_clients_admin`: acá no se filtra ni se cuenta a mano.
 */
export default function PromotionClientsTable({ promotions }: Props) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [promotionId, setPromotionId] = useState("all");
  const [status, setStatus] = useState<"all" | PromotionClientStatus>("all");
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<PromotionClient[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        if (client.status === "granted" && inactiveById.has(client.promotionId)) {
          return <Badge tone="warning" dot small>Inhabilitado</Badge>;
        }
        return <Badge tone={client.status === "granted" ? "success" : "neutral"} dot small>{client.status === "granted" ? "Otorgado" : "Usado"}</Badge>;
      },
    },
    { key: "granted_at", header: "Otorgado", render: (client) => <span className="eg-promo-muted">{formatPromotionDate(client.grantedAt)}</span> },
    { key: "used_at", header: "Usado", render: (client) => <span className="eg-promo-muted">{formatPromotionDate(client.usedAt)}</span> },
  ];

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
          {promotions.map((promotion) => <option key={promotion.id} value={promotion.id}>{promotion.name}</option>)}
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
      </Card>

      {error && (
        <div className="eg-promo-error" role="alert">
          <span>{error}</span>
          <Button size="sm" variant="secondary" icon="refresh" onClick={() => void load()}>Reintentar</Button>
        </div>
      )}

      <Card padding="none" className="eg-promo-table-card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(client) => `${client.promotionId}:${client.userId}`}
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
    </>
  );
}

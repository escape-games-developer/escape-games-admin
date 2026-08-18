import { useCallback, useEffect, useMemo, useState } from "react";

import GoldenTicketReviewModal from "../components/GoldenTicketReviewModal";
import { useToasts, ToastStack } from "../components/Toast";
import { Badge, Button, Card, EmptyState, PageHeader, SearchInput, StatCard } from "../ui";
import {
  countByStatus,
  describeGrantedTicketStatus,
  describeStatusBreakdown,
  fetchApprovalTickets,
  fetchPendingRequests,
  fetchQrTickets,
  formatDateDDMMYYYY,
  formatRelative,
  fullName,
  goldenTicketStatus,
  goldenTicketsAvailable,
  GOLDEN_TICKET_LIMIT,
  type GrantedTicket,
  type PendingRequest,
} from "../lib/goldenTickets";

type Tab = "pending" | "approved" | "qr";

/**
 * Revisión de solicitudes de Golden Ticket.
 *
 * El QR que se imprime para las salas NO vive acá: está en el modal que abre la
 * fila fija de /salas (GoldenTicketManagementModal).
 */
export default function GoldenTicketAdmin() {
  const { toasts, toast, dismiss } = useToasts();

  const [approved, setApproved] = useState<GrantedTicket[] | null>(null);
  const [qr, setQr] = useState<GrantedTicket[] | null>(null);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [tab, setTab] = useState<Tab>("pending");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<PendingRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrMsg("");

    try {
      const [approvalTickets, qrTickets, rows] = await Promise.all([
        fetchApprovalTickets(),
        fetchQrTickets(),
        fetchPendingRequests(),
      ]);

      setApproved(approvalTickets);
      setQr(qrTickets);
      setPending(rows);
    } catch (err: any) {
      console.error(err);
      setErrMsg(err?.message || "No pude cargar los Golden Tickets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* El cupo de 100 lo consume SOLO la vía de aprobación: los del QR en sala
     no tienen tope y no entran en esta cuenta. */
  const approvedCount = approved?.length ?? null;
  const qrCount = qr?.length ?? null;
  const exhausted = approvedCount != null && approvedCount >= GOLDEN_TICKET_LIMIT;

  const breakdownText = useMemo(
    () => (approved ? describeStatusBreakdown(countByStatus(approved)) : ""),
    [approved]
  );

  const matchesSearch = useCallback((person: { nombre?: string | null; apellido?: string | null; alias?: string | null; mail?: string | null }) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return `${person.nombre || ""} ${person.apellido || ""} ${person.alias || ""} ${person.mail || ""}`.toLowerCase().includes(term);
  }, [q]);

  const visiblePending = useMemo(() => pending.filter(matchesSearch), [pending, matchesSearch]);
  const visibleApproved = useMemo(() => (approved ?? []).filter(matchesSearch), [approved, matchesSearch]);
  const visibleQr = useMemo(() => (qr ?? []).filter(matchesSearch), [qr, matchesSearch]);

  return (
    <div className="eg-golden-page">
      <PageHeader
        title="Golden Ticket"
        subtitle="Revisá las solicitudes enviadas por los usuarios."
        action={<Button variant="secondary" icon="refresh" onClick={load} loading={loading}>Actualizar</Button>}
      />

      <div className="eg-golden-stats">
        <StatCard value={approvedCount == null ? "—" : `${approvedCount} / ${GOLDEN_TICKET_LIMIT}`} label="Otorgados" tone={exhausted ? "danger" : "warning"} loading={loading} />
        <StatCard value={pending.length} label="Pendientes de revisión" tone="accent" loading={loading} />
        <StatCard value={approvedCount == null ? "—" : goldenTicketsAvailable(approvedCount)} label="Disponibles" loading={loading} />
        <StatCard value={qrCount ?? "—"} label="QR en sala · sin tope" loading={loading} />
      </div>

      {breakdownText && <p className="eg-golden-breakdown">Otorgados por captura: {breakdownText}.</p>}
      {exhausted && <Card padding="sm" className="eg-golden-warning">Se agotaron los {GOLDEN_TICKET_LIMIT} Golden Tickets disponibles para aprobación por captura.</Card>}

      <Card padding="none" className="eg-golden-list-card">
        <div className="eg-golden-list-head">
          <div className="eg-golden-tabs" role="tablist" aria-label="Tipos de Golden Ticket">
            {([
              ["pending", `Solicitudes pendientes (${loading ? "…" : pending.length})`],
              ["approved", `Aprobados (${approvedCount == null ? "…" : approvedCount})`],
              ["qr", `QR en sala (${qrCount == null ? "…" : qrCount})`],
            ] as [Tab, string][]).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`eg-golden-tab${tab === key ? " is-active" : ""}`} onClick={() => setTab(key)}>{label}</button>)}
          </div>
          <SearchInput value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar usuario..." aria-label="Buscar usuario" />
        </div>

        <div className="eg-golden-list">
          {loading ? (
            <div className="eg-golden-state">Cargando Golden Tickets...</div>
          ) : errMsg ? (
            <div className="eg-golden-state eg-golden-state--error">{errMsg}</div>
          ) : tab === "pending" ? (
            visiblePending.length === 0 ? <EmptyState icon="ticket" title={pending.length === 0 ? "No hay solicitudes pendientes" : "No encontramos solicitudes"} description={pending.length === 0 ? "Las nuevas solicitudes aparecerán acá para su revisión." : "Probá con otra búsqueda."} /> :
            visiblePending.map((request) => {
              const name = fullName(request);
              return <button key={request.id} type="button" className="eg-golden-row" onClick={() => setSelected(request)}>
                <GoldenAvatar src={request.photo_url} name={name} />
                <span className="eg-golden-row__user"><strong>{name}</strong><small>{request.alias ? `@${request.alias}` : "sin alias"} · {request.mail ?? "sin mail"}</small></span>
                <span className="eg-golden-row__right"><small>Subido {formatRelative(request.rating_screenshot_uploaded_at)}</small><span>Revisar captura →</span></span>
              </button>;
            })
          ) : tab === "approved" ? (
            visibleApproved.length === 0 ? <EmptyState icon="ticket" title={(approved?.length ?? 0) === 0 ? "Todavía no hay tickets aprobados" : "No encontramos tickets"} description={(approved?.length ?? 0) === 0 ? "Los tickets aprobados aparecerán acá." : "Probá con otra búsqueda."} /> :
            visibleApproved.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} showNumber showStatus />)
          ) : (
            visibleQr.length === 0 ? <EmptyState icon="qr" title={(qr?.length ?? 0) === 0 ? "Todavía no hay tickets por QR" : "No encontramos tickets"} description={(qr?.length ?? 0) === 0 ? "Los tickets obtenidos en sala aparecerán acá." : "Probá con otra búsqueda."} /> :
            visibleQr.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)
          )}
        </div>
      </Card>

      <GoldenTicketReviewModal open={!!selected} request={selected} onClose={() => setSelected(null)} onDone={load} toast={toast} />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
/**
 * Fila de un ticket ya otorgado.
 *
 * Los del QR en sala no llevan número (`golden_ticket_number` es NULL en todos)
 * ni badge de estado: se listan sólo con usuario, alias, mail y fecha.
 */
function TicketRow({
  ticket,
  showNumber = false,
  showStatus = false,
}: {
  ticket: GrantedTicket;
  showNumber?: boolean;
  showStatus?: boolean;
}) {
  const name = fullName(ticket);
  const status = goldenTicketStatus(ticket);
  const tone = status === "ACTIVE" ? "warning" : status === "REDEEMED" ? "success" : status === "REVOKED" ? "danger" : "neutral";

  return (
    <div className="eg-golden-row eg-golden-row--static">
      {showNumber ? <span className="eg-golden-ticket-number" style={{ width: 44, flex: "0 0 44px", textAlign: "center" }}>#{ticket.number ?? "—"}</span> : null}
      <GoldenAvatar src={ticket.photo_url} name={name} />
      <div className="eg-golden-row__user">
        <strong>
          {name}
        </strong>
        <small>
          {ticket.alias ? `@${ticket.alias}` : "sin alias"} ·{" "}
          {ticket.mail ?? "sin mail"}
        </small>
      </div>

      <div className="eg-golden-row__right">
        {showStatus ? (
          <Badge tone={tone} small>{describeGrantedTicketStatus(status)}</Badge>
        ) : null}
        <small>
          Otorgado {formatDateDDMMYYYY(ticket.grantedAt) || "—"}
          {ticket.redeemedAt
            ? ` · canjeado ${formatDateDDMMYYYY(ticket.redeemedAt)}`
            : ticket.expiresAt
            ? ` · vence ${formatDateDDMMYYYY(ticket.expiresAt)}`
            : ""}
        </small>
      </div>
    </div>
  );
}

function GoldenAvatar({ src, name }: { src?: string | null; name: string }) {
  return <span className="eg-golden-avatar">{src ? <img src={src} alt="" /> : (name.charAt(0) || "U").toUpperCase()}</span>;
}

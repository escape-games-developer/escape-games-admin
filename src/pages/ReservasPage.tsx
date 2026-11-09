import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, DataTable, EmptyState, Input, Modal, PageHeader, SearchInput, Select, StatCard } from "../ui";
import type { DataTableColumn } from "../ui";
import { ToastStack, useToasts } from "../components/Toast";
import {
  fetchActiveBranches,
  fetchActiveRooms,
  fetchDayReservations,
  searchClients,
  timeArgentina,
  todayArgentina,
  validateRoom,
  type BranchOption,
  type ClientHit,
  type DayReservation,
  type RoomOption,
} from "../lib/reservations";

/**
 * Reservas del día: el GM ve las reservas web de su sucursal y, al terminar
 * cada juego, valida la sala de los jugadores que tienen la app. Reemplaza que
 * cada cliente tenga que escanear el QR y poner el código GM por su cuenta.
 *
 * Los datos vienen de la hoja VENTAS ONLINE (sincronizada cada 15 minutos).
 * Las reservas por teléfono o WhatsApp no figuran: para esas está "Validar sin
 * reserva".
 */

type ValidateTarget = { reservation: DayReservation | null };

const KEY_OPTIONS = Array.from({ length: 11 }, (_, i) => i);

export default function ReservasPage() {
  const isSuper = localStorage.getItem("eg_admin_is_super") === "true";
  const ownBranchId = localStorage.getItem("eg_admin_branch_id") || null;

  const [date, setDate] = useState(todayArgentina());
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchId, setBranchId] = useState<string>(isSuper ? "" : ownBranchId ?? "");
  const [rows, setRows] = useState<DayReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [target, setTarget] = useState<ValidateTarget | null>(null);
  const { toasts, toast, dismiss } = useToasts();

  useEffect(() => {
    if (!isSuper) return;
    fetchActiveBranches().then(setBranches).catch(() => setBranches([]));
  }, [isSuper]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setRows(await fetchDayReservations(date, isSuper ? branchId || null : null));
    } catch (err) {
      setRows([]);
      setLoadError(err instanceof Error ? err.message : "No se pudieron cargar las reservas.");
    } finally {
      setLoading(false);
    }
  }, [date, branchId, isSuper]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const jugadores = rows.reduce((sum, r) => sum + (r.participantes ?? 0), 0);
    const validados = rows.reduce((sum, r) => sum + r.validados.length, 0);
    const juegosConValidacion = rows.filter((r) => r.validados.length > 0).length;
    return { juegos: rows.length, jugadores, validados, juegosConValidacion };
  }, [rows]);

  const columns: DataTableColumn<DayReservation>[] = [
    {
      key: "hora",
      header: "Hora",
      render: (r) => <strong className="eg-res-time">{timeArgentina(r.visit_at)}</strong>,
    },
    {
      key: "sala",
      header: "Sala",
      render: (r) => (
        <span className="eg-res-stack">
          <strong>{r.room_name ?? r.sala_texto ?? "Sin sala"}</strong>
          {!r.room_id && <small className="eg-res-warn">{r.sala_texto ? "No coincide con una sala de la app" : "La reserva no indica sala"}</small>}
          {isSuper && !branchId && r.branch_name && <small>{r.branch_name}</small>}
        </span>
      ),
    },
    {
      key: "reserva",
      header: "Reservó",
      render: (r) => (
        <span className="eg-res-stack">
          <strong>{r.nombre ?? "—"}</strong>
          <small>
            {r.referencia}
            {r.cupon ? ` · ${r.cupon}` : ""}
            {r.buyer_user_id ? ` · tiene la app${r.buyer_alias ? ` (@${r.buyer_alias})` : ""}` : ""}
          </small>
        </span>
      ),
    },
    {
      key: "validados",
      header: "Validados",
      align: "center",
      render: (r) => {
        const n = r.validados.length;
        const total = r.participantes;
        const tone = n === 0 ? "neutral" : total && n >= total ? "success" : "info";
        return (
          <span title={r.validados.map((v) => v.alias ? `@${v.alias}` : v.nombre).join(", ") || "Nadie validó todavía"}>
            <Badge tone={tone} small dot>{total ? `${n} de ${total}` : String(n)}</Badge>
          </span>
        );
      },
    },
    {
      key: "accion",
      header: "",
      align: "right",
      render: (r) => (
        <Button size="sm" variant={r.validados.length ? "secondary" : "primary"} icon="qr" onClick={() => setTarget({ reservation: r })}>
          Validar jugadores
        </Button>
      ),
    },
  ];

  const pct = totals.jugadores ? Math.round((totals.validados / totals.jugadores) * 100) : 0;

  return (
    <div className="eg-res-page">
      <PageHeader
        title="Reservas del día"
        subtitle="Al terminar cada juego, validá la sala de los jugadores que tienen la app."
        action={<Button icon="plus" onClick={() => setTarget({ reservation: null })}>Validar sin reserva</Button>}
      />

      <Card padding="sm" className="eg-res-filters">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value || todayArgentina())} aria-label="Fecha" />
        {isSuper && (
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} aria-label="Sucursal">
            <option value="">Todas las sucursales</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <Button icon="refresh" onClick={() => void load()} loading={loading}>Actualizar</Button>
      </Card>

      <div className="eg-res-stats">
        <StatCard value={totals.juegos} label="Juegos con reserva web" loading={loading} />
        <StatCard value={totals.jugadores} label="Jugadores" loading={loading} />
        <StatCard value={totals.validados} label="Salas validadas" tone="success" loading={loading} />
        <StatCard value={`${pct}%`} label="Jugadores con la sala validada" tone={pct >= 20 ? "success" : "warning"} loading={loading} />
      </div>

      <Card padding="none" className="eg-res-table-card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.referencia}
          loading={loading}
          loadingLabel="Cargando reservas…"
          empty={
            <EmptyState
              icon="calendar"
              title={loadError ? "No se pudieron cargar las reservas" : "No hay reservas web para este día"}
              description={loadError || "Las reservas por teléfono o WhatsApp no aparecen acá: validalas con «Validar sin reserva»."}
            />
          }
        />
      </Card>

      {target && (
        <ValidateModal
          reservation={target.reservation}
          defaultBranchId={target.reservation?.branch_id ?? (isSuper ? branchId || null : ownBranchId)}
          onClose={() => setTarget(null)}
          onValidated={(message) => {
            toast("success", message);
            void load();
          }}
          onError={(message) => toast("error", message)}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/* ===================== Modal de validación ===================== */

function ValidateModal({
  reservation,
  defaultBranchId,
  onClose,
  onValidated,
  onError,
}: {
  reservation: DayReservation | null;
  defaultBranchId: string | null;
  onClose: () => void;
  onValidated: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [roomId, setRoomId] = useState(reservation?.room_id ?? "");
  const [keys, setKeys] = useState<string>("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>(reservation?.validados.map((v) => v.user_id) ?? []);

  useEffect(() => {
    fetchActiveRooms(defaultBranchId).then(setRooms).catch(() => setRooms([]));
  }, [defaultBranchId]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      setHits([]);
      return;
    }
    let cancel = false;
    setSearching(true);
    const t = window.setTimeout(() => {
      searchClients(term)
        .then((r) => { if (!cancel) setHits(r); })
        .catch((err) => { if (!cancel) onError(err instanceof Error ? err.message : "No se pudo buscar."); })
        .finally(() => { if (!cancel) setSearching(false); });
    }, 300);
    return () => {
      cancel = true;
      window.clearTimeout(t);
    };
  }, [q, onError]);

  const full = reservation?.participantes != null && done.length >= reservation.participantes;
  const ready = Boolean(roomId) && keys !== "" && !full;

  const validate = async (userId: string, label: string) => {
    if (!roomId) return onError("Elegí la sala que jugaron.");
    if (keys === "") return onError("Elegí cuántas llaves consiguieron.");
    setBusyId(userId);
    try {
      const out = await validateRoom({ userId, roomId, keys: Number(keys), reservationRef: reservation?.referencia ?? null });
      setDone((prev) => [...prev, userId]);
      onValidated(`Sala validada para ${label}: ${out.room}, ${out.keys} ${out.keys === 1 ? "llave" : "llaves"}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo validar.");
    } finally {
      setBusyId(null);
    }
  };

  const buyerPending = reservation?.buyer_user_id && !done.includes(reservation.buyer_user_id);
  const title = reservation ? `Validar sala · ${timeArgentina(reservation.visit_at)}` : "Validar sin reserva";
  const description = reservation
    ? `${reservation.nombre ?? "Reserva"} · ${reservation.referencia}${reservation.participantes ? ` · ${reservation.participantes} jugadores` : ""}`
    : "Para juegos reservados por teléfono o WhatsApp.";

  return (
    <Modal open title={title} description={description} size="md" onClose={onClose}
      footer={<Button onClick={onClose}>Listo</Button>}>
      <div className="eg-res-modal">
        <div className="eg-res-modal__grid">
          <Select id="res-room" label="Sala que jugaron" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Elegí la sala</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Select id="res-keys" label="Llaves que consiguieron" value={keys} onChange={(e) => setKeys(e.target.value)}>
            <option value="">Elegí</option>
            {KEY_OPTIONS.map((n) => <option key={n} value={String(n)}>{n}</option>)}
          </Select>
        </div>

        {reservation && (
          <p className="eg-res-modal__count">
            {reservation.participantes
              ? `${done.length} de ${reservation.participantes} jugadores validados.`
              : `${done.length} jugadores validados.`}
            {full && " La reserva está completa."}
          </p>
        )}

        {buyerPending && (
          <div className="eg-res-hit is-buyer">
            <span className="eg-res-stack">
              <strong>{reservation?.nombre}</strong>
              <small>Hizo la reserva y tiene la app{reservation?.buyer_alias ? ` · @${reservation.buyer_alias}` : ""}</small>
            </span>
            <Button size="sm" variant="primary" disabled={!ready} loading={busyId === reservation?.buyer_user_id}
              onClick={() => void validate(reservation!.buyer_user_id!, reservation?.nombre ?? "el cliente")}>
              Validar
            </Button>
          </div>
        )}

        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar jugador por mail, alias o nombre…" aria-label="Buscar jugador" />

        <div className="eg-res-hits">
          {q.trim().length > 0 && q.trim().length < 3 && <p className="eg-res-hint">Escribí al menos 3 letras.</p>}
          {searching && <p className="eg-res-hint">Buscando…</p>}
          {!searching && q.trim().length >= 3 && hits.length === 0 && <p className="eg-res-hint">No hay clientes con ese dato. Pedile que se registre en la app.</p>}
          {hits.map((h) => {
            const name = [h.nombre, h.apellido].filter(Boolean).join(" ") || h.mail || "Cliente";
            const already = done.includes(h.id);
            return (
              <div key={h.id} className="eg-res-hit">
                <span className="eg-res-avatar">{h.photo_url ? <img src={h.photo_url} alt="" /> : name[0]?.toUpperCase()}</span>
                <span className="eg-res-stack">
                  <strong>{name}</strong>
                  <small>{h.alias ? `@${h.alias} · ` : ""}{h.mail}</small>
                </span>
                {already
                  ? <Badge tone="success" small dot>Validado</Badge>
                  : <Button size="sm" disabled={!ready} loading={busyId === h.id} onClick={() => void validate(h.id, name)}>Validar</Button>}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

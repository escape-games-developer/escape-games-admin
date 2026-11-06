import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Badge, Button, EmptyState, Icon } from "../../ui";
import {
  describeGoldenTicketSource,
  fetchGoldenTicketInfo,
  formatDateDDMMYYYY,
  type GoldenTicketInfo,
} from "../../lib/goldenTickets";
import { fetchAllPromotionClients, type PromotionClient } from "../../lib/promotions";
import "./clientDetail.css";

/**
 * Panel lateral con la ficha de un cliente.
 *
 * Junta datos que ya existen en distintas partes del panel, cada uno con su
 * propia carga y su propio error: si una fuente falla (por ejemplo un GM sin
 * acceso a promociones), el resto de la ficha se muestra igual.
 *   · profiles          → handicap, llaves, alta (mismo origen que Progreso usuarios)
 *   · goldenTickets     → estado del Golden Ticket
 *   · room_completions  → historial de salas (+ rooms_v2 / rooms para el nombre)
 *   · get_promotion_clients_admin → promociones otorgadas / usadas
 */

export type ClientSummary = {
  id: string;
  firstName: string;
  lastName: string;
  alias: string;
  email: string;
  avatarUrl?: string;
  active: boolean;
};

type Load<T> = { loading: boolean; error: string; data: T };

type ProfileExtra = {
  handicap: number;
  keys: number;
  createdAt: string | null;
  phone: string;
  birthday: string | null;
};

type RoomVisit = {
  id: string;
  name: string;
  branch: string;
  photo: string;
  completedAt: string | null;
  points: number | null;
  verified: boolean | null;
};

const initial = <T,>(data: T): Load<T> => ({ loading: true, error: "", data });

function handicapLabel(value: number) {
  if (value <= 0) return "Hall of Fame";
  if (value <= 30) return "Avanzado";
  if (value <= 70) return "Intermedio";
  return "Inicial";
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function errText(err: any, fallback: string) {
  return String(err?.message || err || fallback);
}

async function loadProfile(userId: string): Promise<ProfileExtra> {
  // `*` a propósito: teléfono y cumpleaños no son columnas confirmadas; si
  // existen se muestran, si no, la ficha no se rompe.
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  const p: any = data ?? {};
  return {
    handicap: Number(p.handicap ?? 100),
    keys: Number(p.keys ?? 0),
    createdAt: p.created_at ?? null,
    phone: String(p.phone ?? p.telefono ?? p.celular ?? "").trim(),
    birthday: p.birthday ?? p.fecha_nacimiento ?? p.birth_date ?? null,
  };
}

async function loadRooms(userId: string): Promise<RoomVisit[]> {
  const { data: completions, error } = await supabase
    .from("room_completions")
    .select("id,room_id,completed_at,points,verified")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false });
  if (error) throw error;

  const rows = (completions ?? []) as any[];
  const roomIds = Array.from(new Set(rows.map((c) => c.room_id).filter(Boolean).map(String)));
  const rooms = new Map<string, { name: string; branch: string; photo: string }>();

  const absorb = (list: any[] | null) =>
    (list ?? []).forEach((r) =>
      rooms.set(String(r.id), {
        name: String(r.name || "Sala"),
        branch: String(r.branch || "").trim(),
        photo: String(r.card_photo_url || r.photo_url || ""),
      })
    );

  if (roomIds.length > 0) {
    const { data: v2 } = await supabase.from("rooms_v2").select("*").in("id", roomIds);
    absorb(v2 as any[]);
    const missing = roomIds.filter((id) => !rooms.has(id));
    if (missing.length > 0) {
      const { data: legacy } = await supabase.from("rooms").select("*").in("id", missing);
      absorb(legacy as any[]);
    }
  }

  return rows.map((c) => {
    const room = rooms.get(String(c.room_id));
    return {
      id: String(c.id),
      name: room?.name || "Sala",
      branch: room?.branch || "",
      photo: room?.photo || "",
      completedAt: c.completed_at ?? null,
      points: typeof c.points === "number" ? c.points : null,
      verified: typeof c.verified === "boolean" ? c.verified : null,
    };
  });
}

async function loadPromotions(client: ClientSummary): Promise<PromotionClient[]> {
  // La RPC busca por texto; se busca por mail (o alias) y se corta por id
  // para no mezclar clientes con mails parecidos.
  const search = client.email.trim() || client.alias.trim();
  if (!search) return [];
  const rows = await fetchAllPromotionClients({ search });
  return rows
    .filter((r) => r.userId === client.id)
    .sort((a, b) => String(b.grantedAt ?? "").localeCompare(String(a.grantedAt ?? "")));
}

function placeLabel(branch: string | null, venue: string | null) {
  if (venue && branch) return `${venue} (${branch})`;
  return venue || branch || "";
}

export default function ClientDetailPanel({ client, onClose }: { client: ClientSummary | null; onClose: () => void }) {
  const [profile, setProfile] = useState<Load<ProfileExtra | null>>(initial(null));
  const [golden, setGolden] = useState<Load<GoldenTicketInfo | null>>(initial(null));
  const [rooms, setRooms] = useState<Load<RoomVisit[]>>(initial([]));
  const [promos, setPromos] = useState<Load<PromotionClient[]>>(initial([]));
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);

  const open = Boolean(client);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    setProfile(initial(null));
    setGolden(initial(null));
    setRooms(initial([]));
    setPromos(initial([]));
    setPreview(null);

    const run = <T,>(promise: Promise<T>, set: (v: Load<T>) => void, empty: T, fallback: string) =>
      promise
        .then((data) => alive && set({ loading: false, error: "", data }))
        .catch((err) => {
          console.warn(fallback, err);
          if (alive) set({ loading: false, error: errText(err, fallback), data: empty });
        });

    run(loadProfile(client.id), setProfile, null, "No pude leer el perfil.");
    run(fetchGoldenTicketInfo(client.id), setGolden, null, "No pude leer el Golden Ticket.");
    run(loadRooms(client.id), setRooms, [], "No pude leer las salas.");
    run(loadPromotions(client), setPromos, [], "No pude leer las promociones.");

    return () => {
      alive = false;
    };
  }, [client]);

  // Esc cierra primero la imagen ampliada y después el panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (preview) setPreview(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, preview, onClose]);

  if (!client) return null;

  const name = [client.firstName, client.lastName].filter(Boolean).join(" ") || "Sin nombre";
  const avatarInitial = (client.firstName?.[0] || client.alias?.[0] || client.email?.[0] || "U").toUpperCase();
  const p = profile.data;
  const usedPromos = promos.data.filter((r) => r.status === "used").length;

  return (
    <>
      <div className="eg-client-panel__overlay" onClick={onClose} aria-hidden="true" />
      <aside className="eg-client-panel" role="dialog" aria-modal="true" aria-label={`Ficha de ${name}`}>
        <header className="eg-client-panel__header">
          <span className="eg-client-panel__title">Información del cliente</span>
          <button type="button" className="eg-client-panel__close" onClick={onClose} aria-label="Cerrar panel">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="eg-client-panel__body">
          {/* ---------------- Identidad ---------------- */}
          <section className="eg-client-panel__identity">
            {client.avatarUrl ? (
              <button
                type="button"
                className="eg-client-panel__avatar is-clickable"
                onClick={() => setPreview({ src: client.avatarUrl!, alt: `Foto de ${name}` })}
                title="Ver foto"
              >
                <img src={client.avatarUrl} alt="" />
              </button>
            ) : (
              <span className="eg-client-panel__avatar">{avatarInitial}</span>
            )}
            <div className="eg-client-panel__identity-copy">
              <strong>{name}</strong>
              <span>{client.alias ? `@${client.alias}` : "Sin alias"}</span>
              <div className="eg-client-panel__badges">
                <Badge tone={client.active ? "success" : "neutral"} dot small>{client.active ? "Activo" : "Inactivo"}</Badge>
                {p && <Badge tone={p.handicap <= 0 ? "warning" : "neutral"} small>{handicapLabel(p.handicap)}</Badge>}
              </div>
            </div>
          </section>

          {/* ---------------- Datos ---------------- */}
          <section className="eg-client-panel__section">
            <h3>Datos de contacto</h3>
            <dl className="eg-client-panel__fields">
              <div><dt>Mail</dt><dd>{client.email || "—"}</dd></div>
              <div><dt>Alias</dt><dd>{client.alias || "—"}</dd></div>
              {p?.phone && <div><dt>Teléfono</dt><dd>{p.phone}</dd></div>}
              {p?.birthday && <div><dt>Cumpleaños</dt><dd>{formatDateDDMMYYYY(p.birthday) || "—"}</dd></div>}
              <div><dt>Cliente desde</dt><dd>{profile.loading ? "…" : formatDateDDMMYYYY(p?.createdAt) || "—"}</dd></div>
            </dl>
          </section>

          {/* ---------------- Progreso ---------------- */}
          <section className="eg-client-panel__section">
            <h3>Progreso</h3>
            {profile.error ? (
              <p className="eg-client-panel__error">{profile.error}</p>
            ) : (
              <div className="eg-client-panel__stats">
                <div><strong>{profile.loading ? "…" : p?.handicap ?? "—"}</strong><span>Handicap</span></div>
                <div><strong>{profile.loading ? "…" : p?.keys ?? "—"}</strong><span>Llaves</span></div>
                <div><strong>{rooms.loading ? "…" : rooms.error ? "—" : rooms.data.length}</strong><span>Salas</span></div>
                <div><strong>{promos.loading ? "…" : promos.error ? "—" : promos.data.length}</strong><span>Promos</span></div>
              </div>
            )}
          </section>

          {/* ---------------- Golden Ticket ---------------- */}
          <section className="eg-client-panel__section">
            <h3>Golden Ticket</h3>
            {golden.loading ? (
              <p className="eg-client-panel__muted">Cargando…</p>
            ) : golden.error ? (
              <p className="eg-client-panel__error">{golden.error}</p>
            ) : golden.data?.active ? (
              <div className="eg-client-panel__golden">
                <div className="eg-client-panel__golden-head">
                  <Icon name="ticket" size={16} />
                  <strong>{golden.data.number ? `Golden Ticket #${golden.data.number}` : "Golden Ticket activo"}</strong>
                  <Badge tone={golden.data.redeemedAt ? "neutral" : "warning"} small>{golden.data.redeemedAt ? "Redimido" : "Activo"}</Badge>
                </div>
                <dl className="eg-client-panel__fields eg-client-panel__fields--compact">
                  <div><dt>Origen</dt><dd>{describeGoldenTicketSource(golden.data.source)}</dd></div>
                  <div><dt>Otorgado</dt><dd>{formatDateDDMMYYYY(golden.data.grantedAt) || "—"}</dd></div>
                  <div><dt>Vence</dt><dd>{formatDateDDMMYYYY(golden.data.expiresAt) || "—"}</dd></div>
                  <div><dt>Redimido</dt><dd>{golden.data.redeemedAt ? formatDateDDMMYYYY(golden.data.redeemedAt) : "No"}</dd></div>
                </dl>
              </div>
            ) : golden.data?.screenshotStatus === "PENDING" ? (
              <p className="eg-client-panel__muted">Tiene una captura esperando revisión.</p>
            ) : golden.data?.screenshotStatus === "REJECTED" ? (
              <p className="eg-client-panel__muted">Última captura rechazada: {golden.data.rejectionReason || "sin motivo registrado"}.</p>
            ) : (
              <p className="eg-client-panel__muted">Sin Golden Ticket.</p>
            )}
          </section>

          {/* ---------------- Historial de salas ---------------- */}
          <section className="eg-client-panel__section">
            <div className="eg-client-panel__section-head">
              <h3>Historial de salas</h3>
              {!rooms.loading && !rooms.error && <span>{rooms.data.length} registradas</span>}
            </div>
            {rooms.loading ? (
              <p className="eg-client-panel__muted">Cargando…</p>
            ) : rooms.error ? (
              <p className="eg-client-panel__error">{rooms.error}</p>
            ) : rooms.data.length === 0 ? (
              <EmptyState icon="rooms" title="Sin salas registradas" description="Las salas que complete van a aparecer acá." />
            ) : (
              <ul className="eg-client-panel__timeline">
                {rooms.data.map((room) => (
                  <li key={room.id}>
                    {room.photo ? (
                      <button type="button" className="eg-client-panel__thumb is-clickable" onClick={() => setPreview({ src: room.photo, alt: room.name })} title="Ver imagen">
                        <img src={room.photo} alt="" />
                      </button>
                    ) : (
                      <span className="eg-client-panel__thumb"><Icon name="rooms" size={16} /></span>
                    )}
                    <span className="eg-client-panel__item-copy">
                      <strong>{room.name}</strong>
                      <small>{[room.branch, formatDateTime(room.completedAt)].filter(Boolean).join(" · ")}</small>
                    </span>
                    {room.points !== null && <Badge tone="accent" small>{room.points} pts</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------------- Promociones ---------------- */}
          <section className="eg-client-panel__section">
            <div className="eg-client-panel__section-head">
              <h3>Promociones</h3>
              {!promos.loading && !promos.error && <span>{promos.data.length} otorgadas · {usedPromos} usadas</span>}
            </div>
            {promos.loading ? (
              <p className="eg-client-panel__muted">Cargando…</p>
            ) : promos.error ? (
              <p className="eg-client-panel__error">No se pudieron leer las promociones ({promos.error}).</p>
            ) : promos.data.length === 0 ? (
              <EmptyState icon="ticket" title="Sin promociones" description="Las promociones que reciba van a aparecer acá." />
            ) : (
              <ul className="eg-client-panel__timeline">
                {promos.data.map((promo) => {
                  const grantPlace = placeLabel(promo.grantBranchName, promo.grantVenueName);
                  const usePlace = placeLabel(promo.useBranchName, promo.useVenueName);
                  return (
                    <li key={promo.userPromotionId ?? `${promo.promotionId}-${promo.grantedAt}`}>
                      <span className="eg-client-panel__thumb"><Icon name="ticket" size={16} /></span>
                      <span className="eg-client-panel__item-copy">
                        <strong>{promo.promotionName || "Promoción"}</strong>
                        <small>Otorgada {formatDateTime(promo.grantedAt)}{grantPlace ? ` · ${grantPlace}` : ""}</small>
                        {promo.status === "used" && <small>Usada {formatDateTime(promo.usedAt)}{usePlace ? ` · ${usePlace}` : ""}</small>}
                      </span>
                      <Badge tone={promo.status === "used" ? "success" : "info"} small>{promo.status === "used" ? "Usada" : "Otorgada"}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <footer className="eg-client-panel__footer">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </footer>
      </aside>

      {/* ---------------- Imagen ampliada ---------------- */}
      {preview && (
        <div className="eg-client-preview" onClick={() => setPreview(null)} role="dialog" aria-modal="true" aria-label={preview.alt}>
          <figure className="eg-client-preview__box" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="eg-client-preview__close" onClick={() => setPreview(null)} aria-label="Cerrar imagen">
              <Icon name="close" size={16} />
            </button>
            <img src={preview.src} alt={preview.alt} />
            <figcaption>{preview.alt}</figcaption>
          </figure>
        </div>
      )}
    </>
  );
}

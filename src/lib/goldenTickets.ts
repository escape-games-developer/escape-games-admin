import { supabase } from "./supabase";

/**
 * Capa de datos de Golden Tickets.
 * Usa el MISMO cliente de supabase que el resto del panel (./supabase).
 *
 * Los campos golden_ticket_* NO se escriben con UPDATE directo: van por RPC
 * (grant/revoke/reject), que son atómicas y validan el cupo de 100.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const RATING_SCREENSHOTS_BUCKET = "rating_screenshots";
export const GOLDEN_TICKET_LIMIT = 100;
export const SIGNED_URL_TTL_SECONDS = 3600;

export type RatingScreenshotStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

/** Cómo obtuvo el usuario el Golden Ticket. Lo setea el backend. */
export type GoldenTicketSource = "RATING_APPROVAL" | "IN_ROOM_QR" | null;

export function normalizeGoldenTicketSource(raw: any): GoldenTicketSource {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "RATING_APPROVAL" || v === "IN_ROOM_QR") return v;
  return null;
}

export function describeGoldenTicketSource(source: GoldenTicketSource): string {
  if (source === "RATING_APPROVAL") return "Aprobación admin";
  if (source === "IN_ROOM_QR") return "QR en sala";
  return "—";
}

export type PendingRequest = {
  id: string;
  alias: string | null;
  nombre: string | null;
  apellido: string | null;
  mail: string | null;
  photo_url: string | null;
  rating_screenshot_url: string | null;
  rating_screenshot_uploaded_at: string | null;
};

export type GoldenTicketInfo = {
  active: boolean;
  number: number | null;
  source: GoldenTicketSource;
  grantedAt: string | null;
  expiresAt: string | null;
  redeemedAt: string | null;
  screenshotStatus: RatingScreenshotStatus;
  rejectionReason: string | null;
  screenshotUrl: string | null;
  screenshotUploadedAt: string | null;
};

/* =======================
   FORMATO
======================= */

export function formatDateDDMMYYYY(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** "hace 3 horas", "hace 2 días", etc. */
export function formatRelative(iso?: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";

  const secs = Math.max(0, Math.floor((Date.now() - t) / 1000));

  if (secs < 60) return "hace unos segundos";

  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} ${mins === 1 ? "minuto" : "minutos"}`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} ${days === 1 ? "día" : "días"}`;

  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? "mes" : "meses"}`;

  const years = Math.floor(months / 12);
  return `hace ${years} ${years === 1 ? "año" : "años"}`;
}

export function fullName(p: {
  nombre?: string | null;
  apellido?: string | null;
  alias?: string | null;
  mail?: string | null;
}): string {
  const name = [p.nombre, p.apellido]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" ");

  return name || (p.alias ?? "").trim() || (p.mail ?? "").trim() || "Sin nombre";
}

/* =======================
   LECTURAS
======================= */

export async function fetchGrantedCount(): Promise<number> {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("golden_ticket_active", true);

  if (error) throw error;
  return count ?? 0;
}

export async function fetchPendingRequests(): Promise<PendingRequest[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, alias, nombre, apellido, mail, photo_url, rating_screenshot_url, rating_screenshot_uploaded_at"
    )
    .eq("rating_screenshot_status", "PENDING")
    .order("rating_screenshot_uploaded_at", { ascending: true });

  if (error) throw error;
  return (data as PendingRequest[]) ?? [];
}

function normalizeStatus(raw: any): RatingScreenshotStatus {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "PENDING" || v === "APPROVED" || v === "REJECTED") return v;
  return "NONE";
}

export async function fetchGoldenTicketInfo(
  userId: string
): Promise<GoldenTicketInfo | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "golden_ticket_active, golden_ticket_number, golden_ticket_source, golden_ticket_granted_at, golden_ticket_expires_at, golden_ticket_redeemed_at, rating_screenshot_status, rating_screenshot_rejection_reason, rating_screenshot_url, rating_screenshot_uploaded_at"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as any;

  return {
    active: row.golden_ticket_active === true,
    number:
      typeof row.golden_ticket_number === "number" ? row.golden_ticket_number : null,
    source: normalizeGoldenTicketSource(row.golden_ticket_source),
    grantedAt: row.golden_ticket_granted_at ?? null,
    expiresAt: row.golden_ticket_expires_at ?? null,
    redeemedAt: row.golden_ticket_redeemed_at ?? null,
    screenshotStatus: normalizeStatus(row.rating_screenshot_status),
    rejectionReason: row.rating_screenshot_rejection_reason ?? null,
    screenshotUrl: row.rating_screenshot_url ?? null,
    screenshotUploadedAt: row.rating_screenshot_uploaded_at ?? null,
  };
}

/**
 * El bucket es privado: la columna guarda el path (`${uid}/${ts}.jpg`),
 * así que hay que firmarlo para poder mostrarlo.
 */
export async function createScreenshotSignedUrl(
  path: string | null
): Promise<string | null> {
  const clean = String(path ?? "").trim();
  if (!clean) return null;

  // Tolera que alguna fila vieja haya guardado una URL completa.
  if (/^https?:\/\//i.test(clean)) return clean;

  const marker = `/${RATING_SCREENSHOTS_BUCKET}/`;
  const relative = clean.includes(marker)
    ? clean.slice(clean.indexOf(marker) + marker.length).split("?")[0]
    : clean;

  const { data, error } = await supabase.storage
    .from(RATING_SCREENSHOTS_BUCKET)
    .createSignedUrl(relative, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error("createSignedUrl error:", error);
    return null;
  }

  return data?.signedUrl ?? null;
}

/* =======================
   RPCs
======================= */

export type GrantError =
  | "GOLDEN_TICKETS_EXHAUSTED"
  | "NO_VALID_SCREENSHOT"
  | "ALREADY_GRANTED"
  | (string & {});

export type GrantResult =
  | { success: true; number: number | null; expires_at: string | null }
  | { success: false; error: GrantError };

export function describeGrantError(error: GrantError): string {
  switch (error) {
    case "GOLDEN_TICKETS_EXHAUSTED":
      return "Ya se otorgaron los 100 Golden Tickets";
    case "NO_VALID_SCREENSHOT":
      return "El usuario no tiene screenshot válido";
    case "ALREADY_GRANTED":
      return "Ya tiene golden ticket";
    default:
      return error ? `No se pudo otorgar: ${error}` : "No se pudo otorgar el Golden Ticket";
  }
}

export async function grantGoldenTicket(userId: string): Promise<GrantResult> {
  const { data, error } = await supabase.rpc("grant_golden_ticket", {
    target_user_id: userId,
  });

  if (error) return { success: false, error: error.message };

  const res = data as any;
  if (!res || res.success !== true) {
    return { success: false, error: String(res?.error ?? "UNKNOWN_ERROR") };
  }

  return {
    success: true,
    number: typeof res.number === "number" ? res.number : null,
    expires_at: res.expires_at ?? null,
  };
}

export async function revokeGoldenTicket(userId: string): Promise<void> {
  const { data, error } = await supabase.rpc("revoke_golden_ticket", {
    target_user_id: userId,
  });

  if (error) throw error;

  const res = data as any;
  if (res && res.success === false) {
    throw new Error(String(res.error ?? "No se pudo deshabilitar el Golden Ticket"));
  }
}

export async function rejectRatingScreenshot(
  userId: string,
  reason: string
): Promise<void> {
  const { data, error } = await supabase.rpc("reject_rating_screenshot", {
    target_user_id: userId,
    reason,
  });

  if (error) throw error;

  const res = data as any;
  if (res && res.success === false) {
    throw new Error(String(res.error ?? "No se pudo rechazar la captura"));
  }
}

/* =========================================================
   PUSH (Edge Function send-push-notification)
   Mismo patrón de token que Users.tsx: refresh con leeway.
========================================================= */

async function getValidAccessToken(): Promise<string> {
  const { data: s1, error: e1 } = await supabase.auth.getSession();
  if (e1) console.warn("getSession error:", e1);

  let session = s1.session;
  if (!session) throw new Error("Unauthorized (sin sesión).");

  const expiresAt = (session.expires_at ?? 0) * 1000;
  const leeway = 60_000;

  if (expiresAt && Date.now() > expiresAt - leeway) {
    const { data: s2, error: e2 } = await supabase.auth.refreshSession();
    if (e2) throw e2;
    if (!s2.session?.access_token) throw new Error("No pude refrescar sesión.");
    session = s2.session;
  }

  if (!session.access_token) throw new Error("Unauthorized (sin token).");
  return session.access_token;
}

export type PushResult = { ok: true } | { ok: false; error: string };

/**
 * Nunca lanza: el grant/reject ya se hizo y no se revierte porque falle el push.
 * El usuario ve el cambio igual al abrir la app.
 */
export async function sendPushNotification(params: {
  userId: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}): Promise<PushResult> {
  try {
    if (!SUPABASE_URL || !ANON_KEY) {
      return { ok: false, error: "Faltan envs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY" };
    }

    const token = await getValidAccessToken();

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id: params.userId,
        title: params.title,
        body: params.body,
        data: params.data,
      }),
    });

    const text = await res.text();

    if (!res.ok) {
      let detail = text || `HTTP ${res.status}`;
      try {
        const j = JSON.parse(text);
        detail = j?.error || j?.message || detail;
      } catch {
        // el body no era JSON, nos quedamos con el texto crudo
      }
      return { ok: false, error: `HTTP ${res.status}: ${detail}` };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

export const PUSH_GRANTED = {
  title: "¡Golden Ticket habilitado!",
  body: "Tu Golden Ticket ya está disponible en la app. Presentate en cualquier sucursal para validarlo.",
  type: "golden_ticket_granted",
} as const;

export const PUSH_REJECTED_TYPE = "rating_screenshot_rejected";

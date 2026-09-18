import { supabase } from "./supabase";

/**
 * Beneficios › Promociones — capa de datos.
 *
 * Reglas de esta capa:
 *   · Todo el negocio pasa por las RPC admin. No hay un solo
 *     `.from("promotions")` ni `.from("user_promotions")`: esas tablas no se
 *     leen desde el cliente y las RPC ya validan que quien llama sea
 *     ADMIN_GENERAL o ADMIN.
 *   · La única excepción son las imágenes, que van por `supabase.storage`.
 *   · Los tokens de QR se guardan PUROS. El prefijo `EG-PROMO-…` es solo
 *     presentación: se agrega al codificar el QR, nunca se persiste.
 */

/* =======================
   TIPOS
======================= */

export type PromotionClientStatus = "granted" | "used";
export type PromotionStatusFilter = "all" | "active" | "inactive";

export type Promotion = {
  id: string;
  name: string;
  description: string;
  /** Path dentro del bucket `promotions`. Es lo que vive en la base. */
  imagePath: string | null;
  /** URL pública derivada de `imagePath`. Solo para mostrar. */
  imageUrl: string | null;
  active: boolean;
  totalGranted: number;
  availableCount: number;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
};

/** Promoción con sus tokens. Solo la devuelve `get_promotion_admin`. */
export type PromotionDetail = Promotion & {
  grantToken: string | null;
  useToken: string | null;
};

export type PromotionClient = {
  promotionId: string;
  promotionName: string;
  userId: string;
  nombre: string;
  apellido: string;
  mail: string;
  alias: string | null;
  status: PromotionClientStatus;
  grantedAt: string | null;
  usedAt: string | null;
};

export type PromotionClientsPage = {
  rows: PromotionClient[];
  /** `total_count` de la RPC: total de la consulta, no de la página. */
  total: number;
};

/* =======================
   IMAGEN / STORAGE
======================= */

export const PROMOTIONS_BUCKET = "promotions";
export const PROMOTION_IMAGE_RATIO = 16 / 9;
export const PROMOTION_IMAGE_SIZE_LABEL = "1200 × 675 px · 16:9";
export const PROMOTION_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const PROMOTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Devuelve el motivo del rechazo, o null si el archivo sirve. */
export function validatePromotionImage(file: File): string | null {
  if (!EXTENSION_BY_MIME[file.type]) return "Formato no admitido. Usá JPG, PNG o WEBP.";
  if (file.size > PROMOTION_IMAGE_MAX_BYTES) {
    return `La imagen pesa ${(file.size / (1024 * 1024)).toFixed(1)} MB y el máximo es 5 MB.`;
  }
  return null;
}

/** URL pública para mostrar la imagen. En la base solo se guarda el path. */
export function promotionImageUrl(imagePath: string | null | undefined): string | null {
  const path = String(imagePath ?? "").trim();
  if (!path) return null;
  const { data } = supabase.storage.from(PROMOTIONS_BUCKET).getPublicUrl(path);
  return data.publicUrl || null;
}

/**
 * Sube la imagen al bucket con el path que exige el backend:
 * `<promotion_id>/<timestamp>.<ext>`. Devuelve ese path.
 */
export async function uploadPromotionImage(promotionId: string, file: File): Promise<string> {
  const problem = validatePromotionImage(file);
  if (problem) throw new Error(problem);

  const path = `${promotionId}/${Date.now()}.${EXTENSION_BY_MIME[file.type]}`;
  const { error } = await supabase.storage
    .from(PROMOTIONS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw error;
  return path;
}

/**
 * Borra una imagen del bucket. Se llama SIEMPRE después de confirmar que la
 * nueva quedó guardada: nunca se borra primero.
 */
export async function deletePromotionImage(imagePath: string): Promise<void> {
  const path = String(imagePath ?? "").trim();
  if (!path) return;

  const { error } = await supabase.storage.from(PROMOTIONS_BUCKET).remove([path]);
  if (error) throw error;
}

/* =======================
   QR (solo presentación)
======================= */

export const PROMOTION_QR_GRANT_PREFIX = "EG-PROMO-GRANT-";
export const PROMOTION_QR_USE_PREFIX = "EG-PROMO-USE-";

export function promotionGrantQrValue(token: string | null | undefined): string {
  const value = String(token ?? "").trim();
  return value ? `${PROMOTION_QR_GRANT_PREFIX}${value}` : "";
}

export function promotionUseQrValue(token: string | null | undefined): string {
  const value = String(token ?? "").trim();
  return value ? `${PROMOTION_QR_USE_PREFIX}${value}` : "";
}

/* =======================
   NORMALIZACIÓN
======================= */

type RpcRow = Record<string, unknown>;

function asRows(data: unknown): RpcRow[] {
  if (Array.isArray(data)) return data.filter((row): row is RpcRow => !!row && typeof row === "object");
  if (data && typeof data === "object") return [data as RpcRow];
  return [];
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  const out = text(value).trim();
  return out || null;
}

function count(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toPromotion(row: RpcRow): Promotion {
  const imagePath = optionalText(row.image_path);
  return {
    id: text(row.id),
    name: text(row.name),
    description: text(row.description),
    imagePath,
    imageUrl: promotionImageUrl(imagePath),
    active: row.active === true,
    totalGranted: count(row.total_granted),
    availableCount: count(row.available_count),
    usedCount: count(row.used_count),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function toPromotionDetail(row: RpcRow): PromotionDetail {
  return {
    ...toPromotion(row),
    grantToken: optionalText(row.grant_token),
    useToken: optionalText(row.use_token),
  };
}

function toClient(row: RpcRow): PromotionClient {
  return {
    promotionId: text(row.promotion_id),
    promotionName: text(row.promotion_name),
    userId: text(row.user_id),
    nombre: text(row.nombre),
    apellido: text(row.apellido),
    mail: text(row.mail),
    alias: optionalText(row.alias),
    status: row.status === "used" ? "used" : "granted",
    grantedAt: optionalText(row.granted_at),
    usedAt: optionalText(row.used_at),
  };
}

/** El id puede llegar como texto plano o dentro de la fila devuelta. */
function readPromotionId(data: unknown): string {
  if (typeof data === "string" && data.trim()) return data.trim();

  const row = asRows(data)[0];
  const id = optionalText(row?.id) ?? optionalText(row?.promotion_id);
  if (id) return id;

  throw new Error("La promoción se creó pero no pude leer su id.");
}

/**
 * Varias RPC admin no devuelven la fila suelta sino un sobre:
 *
 *   { success: true, promotion: { …, grant_token, use_token } }
 *
 * Esto devuelve la fila de adentro, tolerando también la forma plana. Un
 * `success: false` se convierte en error: si se dejara pasar como "sin datos",
 * la pantalla mostraría un QR vacío sin explicar por qué.
 */
function unwrapPromotionPayload(data: unknown): RpcRow | null {
  const envelope = asRows(data)[0];
  if (!envelope) return null;

  if (envelope.success === false) {
    throw new Error(
      optionalText(envelope.error) ?? optionalText(envelope.message) ?? "La operación no se pudo completar."
    );
  }

  const nested = envelope.promotion;
  return nested && typeof nested === "object" ? (nested as RpcRow) : envelope;
}

/** Igual que arriba, para el token nuevo que devuelve una rotación. */
function readToken(data: unknown, keys: string[]): string {
  if (typeof data === "string" && data.trim()) return data.trim();

  const row = unwrapPromotionPayload(data);
  for (const key of keys) {
    const value = optionalText(row?.[key]);
    if (value) return value;
  }

  throw new Error("La rotación no devolvió un token nuevo.");
}

/** Mensaje presentable para la UI, sin tragarse el detalle de Supabase. */
export function promotionErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

/* =======================
   LECTURA
======================= */

export async function fetchPromotionsAdmin(): Promise<Promotion[]> {
  const { data, error } = await supabase.rpc("get_promotions_admin");
  if (error) throw error;
  return asRows(data).map(toPromotion);
}

/**
 * Detalle con tokens. La RPC responde `{ success, promotion: { … } }`, así que
 * los tokens viven un nivel más adentro del sobre.
 *
 * Los contadores no vienen en este payload: el encabezado y las métricas del
 * modal siguen saliendo de la fila del listado, que sí los trae.
 */
export async function fetchPromotionAdmin(promotionId: string): Promise<PromotionDetail | null> {
  const { data, error } = await supabase.rpc("get_promotion_admin", {
    p_promotion_id: promotionId,
  });
  if (error) throw error;

  const row = unwrapPromotionPayload(data);
  return row ? toPromotionDetail(row) : null;
}

export const PROMOTION_CLIENTS_PAGE_SIZE = 100;

export async function fetchPromotionClients({
  promotionId = null,
  status = null,
  search = "",
  limit = PROMOTION_CLIENTS_PAGE_SIZE,
  offset = 0,
}: {
  /** null = todas las promociones. */
  promotionId?: string | null;
  status?: PromotionClientStatus | null;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<PromotionClientsPage> {
  const { data, error } = await supabase.rpc("get_promotion_clients_admin", {
    p_promotion_id: promotionId,
    p_status: status,
    p_search: search.trim(),
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;

  const rows = asRows(data);
  return {
    rows: rows.map(toClient),
    // `total_count` viene repetido en cada fila: alcanza con la primera.
    total: rows.length ? count(rows[0].total_count) : 0,
  };
}

/* =======================
   ESCRITURA
======================= */

export async function createPromotion({
  name,
  description,
  imagePath = null,
  active,
}: {
  name: string;
  description: string;
  imagePath?: string | null;
  active: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_promotion", {
    p_name: name,
    p_description: description,
    p_image_path: imagePath,
    p_active: active,
  });
  if (error) throw error;

  return readPromotionId(data);
}

/**
 * Semántica de `update_promotion` para los campos opcionales:
 *   · null (o ausente) → NO modificar el valor actual.
 *   · ""               → blanquear el valor actual.
 *
 * La capa NO normaliza nada: pasa los tres campos tal cual para que una
 * actualización parcial (por ejemplo, guardar solo `image_path`) no pise el
 * nombre ni la descripción que ya tiene la promoción.
 */
export async function updatePromotion({
  promotionId,
  name = null,
  description = null,
  imagePath = null,
}: {
  promotionId: string;
  /** null = no modificar. */
  name?: string | null;
  /** null = no modificar · "" = blanquear la descripción. */
  description?: string | null;
  /** null = no modificar · "" = quitar la imagen · path = imagen nueva. */
  imagePath?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("update_promotion", {
    p_promotion_id: promotionId,
    p_name: name,
    p_description: description,
    p_image_path: imagePath,
  });
  if (error) throw error;
}

export async function setPromotionActive(promotionId: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_promotion_active", {
    p_promotion_id: promotionId,
    p_active: active,
  });
  if (error) throw error;
}

/** Devuelve el token NUEVO, puro (sin prefijo de QR). */
export async function rotatePromotionGrantToken(promotionId: string): Promise<string> {
  const { data, error } = await supabase.rpc("rotate_promotion_grant_token", {
    p_promotion_id: promotionId,
  });
  if (error) throw error;

  return readToken(data, ["grant_token", "new_grant_token", "token", "new_token"]);
}

export async function rotatePromotionUseToken(promotionId: string): Promise<string> {
  const { data, error } = await supabase.rpc("rotate_promotion_use_token", {
    p_promotion_id: promotionId,
  });
  if (error) throw error;

  return readToken(data, ["use_token", "new_use_token", "token", "new_token"]);
}

/* =======================
   PRESENTACIÓN
======================= */

export function formatPromotionDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

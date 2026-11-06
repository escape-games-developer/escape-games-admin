import { supabase } from "./supabase";

/**
 * Beneficios › Promociones — capa de datos.
 *
 * Reglas de esta capa:
 *   · Todo el negocio pasa por las RPC admin. No hay un solo
 *     `.from("promotions")` ni `.from("user_promotions")`: esas tablas no se
 *     leen desde el cliente y las RPC ya validan quién puede llamarlas.
 *   · Las de ESCRITURA (`create_promotion`, `update_promotion`,
 *     `set_promotion_active`, `rotate_*`) y `get_promotion_admin` exigen
 *     `is_promo_admin()`: ADMIN_GENERAL o ADMIN, nunca un GM.
 *   · Las de LECTURA para la sección tienen su propio gate:
 *     `get_promotions_admin` → `can_read_promotions()`;
 *     `get_promotion_clients_admin` y `get_promotions_for_clients_filter` →
 *     `can_read_promotion_clients()`. Un GM habilitado desde Ajustes llega a
 *     estas tres y a ninguna más.
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
  /** Id de la fila de `user_promotions`. Clave estable para la tabla. */
  userPromotionId: string | null;
  nombre: string;
  apellido: string;
  mail: string;
  alias: string | null;
  status: PromotionClientStatus;
  grantedAt: string | null;
  usedAt: string | null;
  /**
   * Sucursal donde se escaneó cada QR. Es null para los beneficios otorgados
   * o usados con los QR globales del sistema anterior, que no tenían sucursal.
   */
  grantBranchId: string | null;
  grantBranchName: string | null;
  useBranchId: string | null;
  useBranchName: string | null;
  /**
   * Punto específico del QR escaneado, cuando el QR era de un VENUE y no de
   * una sucursal entera. Null si el escaneo fue en una sucursal.
   *
   * Cuando hay venue, la sucursal NO se pierde: `grantBranchName` sigue siendo
   * la sucursal que lo contiene, y la tabla muestra las dos cosas
   * ("Hell Experiment (Studios)").
   */
  grantVenueId: string | null;
  grantVenueName: string | null;
  useVenueId: string | null;
  useVenueName: string | null;
};

/* =======================
   QR POR SUCURSAL
======================= */

/**
 * Las dos acciones de un QR. Se mandan en mayúsculas porque es lo que esperan
 * las RPC (`p_action`).
 */
export type PromotionBranchAction = "GRANT" | "USE";

/**
 * Una celda de la matriz promoción × sucursal × acción.
 *
 * Qué filas devuelve `get_promotion_branch_qrs`:
 *   · sucursal activa, con o sin QR              → aparece;
 *   · sucursal inactiva SIN QR                   → no aparece;
 *   · sucursal inactiva CON QR                   → aparece con
 *     `branchActive: false` y `enabled: true`, para no esconder un QR que
 *     sigue funcionando y que alguien puede tener impreso.
 */
export type PromotionBranchQr = {
  branchId: string;
  branchName: string;
  branchActive: boolean;
  action: PromotionBranchAction;
  /** Token PURO, sin el prefijo del QR. Null si la combinación no está habilitada. */
  token: string | null;
  enabled: boolean;
  createdAt: string | null;
};

/* =======================
   QR POR TARGET (BRANCH · ROOM · VENUE)
======================= */

/**
 * Dónde vive un QR. El backend generalizó `promotion_branch_qrs` a
 * `promotion_qr_targets`, que además de sucursales admite salas y puntos
 * específicos (por ejemplo "Hell Experiment", que está DENTRO de Studios pero
 * tiene su propio QR).
 *
 * ROOM existe en la base y se mapea acá, pero la pantalla de Promociones no lo
 * lista: son 58 salas y la UI no está pensada para eso. Se filtra en la vista,
 * no en esta capa, para no perder el dato si mañana se decide mostrarlo.
 */
export type PromotionQrTargetKind = "BRANCH" | "ROOM" | "VENUE";

/** Las dos acciones, iguales que siempre. Alias del tipo por sucursal. */
export type PromotionQrTargetAction = PromotionBranchAction;

/**
 * Una celda de la matriz promoción × target × acción.
 *
 * Los campos vienen en dos capas:
 *
 *   · `targetKind` + `targetId` + `targetName` + `targetActive` son lo ÚNICO
 *     que necesita la UI para pintar la fila y para llamar a las RPC. Salen
 *     resueltos según el kind, así que la pantalla no hace `if (BRANCH) … `.
 *   · `branch*` / `room*` / `venue*` se conservan crudos porque un target no
 *     siempre es autosuficiente: un VENUE necesita decir en qué sucursal está
 *     ("Hell Experiment · Studios") y eso solo sale de `branchName`.
 *
 * Para un target BRANCH, `targetId === branchId` y los campos de room/venue
 * llegan en null.
 */
export type PromotionQrTarget = {
  targetKind: PromotionQrTargetKind;
  /** BRANCH → branchId · ROOM → roomId · VENUE → venueId. */
  targetId: string;
  /** Nombre a mostrar, ya resuelto según el kind. */
  targetName: string;
  /** Si el target está operativo. Un target apagado no puede habilitar QR. */
  targetActive: boolean;

  branchId: string | null;
  branchName: string | null;
  branchActive: boolean;

  roomId: string | null;
  roomName: string | null;
  roomActive: boolean;

  venueId: string | null;
  venueName: string | null;
  venueActive: boolean;

  action: PromotionQrTargetAction;
  /** Token PURO, sin el prefijo del QR. Null si no está habilitado. */
  token: string | null;
  enabled: boolean;
  createdAt: string | null;
};

/**
 * Opción del filtro de promoción de la tab Clientes. Solo id y nombre: es lo
 * único que devuelve `get_promotions_for_clients_filter`.
 */
export type PromotionFilterOption = {
  id: string;
  name: string;
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

/**
 * Valor a codificar en un QR por sucursal. Es el MISMO contrato de siempre —
 * `EG-PROMO-GRANT-<token>` / `EG-PROMO-USE-<token>`— porque la app móvil ya lo
 * entiende y no se toca. Lo único nuevo es de dónde sale el token.
 */
export function promotionBranchQrValue(
  action: PromotionBranchAction,
  token: string | null | undefined
): string {
  return action === "GRANT" ? promotionGrantQrValue(token) : promotionUseQrValue(token);
}

/**
 * Valor a codificar en el QR de CUALQUIER target: sucursal, sala o punto.
 *
 * Es deliberadamente el mismo contrato que el QR por sucursal —
 * `EG-PROMO-GRANT-<token>` / `EG-PROMO-USE-<token>`— y NO lleva el kind ni el
 * id del target adentro. El token ya identifica la combinación entera del lado
 * del backend, así que meter "VENUE" o un uuid en el código impreso solo
 * obligaría a tocar el scanner de la app móvil, que no se toca.
 */
export function promotionQrTargetValue(
  action: PromotionQrTargetAction,
  token: string | null | undefined
): string {
  return promotionBranchQrValue(action, token);
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
    userPromotionId: optionalText(row.user_promotion_id),
    nombre: text(row.nombre),
    apellido: text(row.apellido),
    mail: text(row.mail),
    alias: optionalText(row.alias),
    status: row.status === "used" ? "used" : "granted",
    grantedAt: optionalText(row.granted_at),
    usedAt: optionalText(row.used_at),
    // Null en los registros del sistema anterior (QR globales, sin sucursal).
    grantBranchId: optionalText(row.grant_branch_id),
    grantBranchName: optionalText(row.grant_branch_name),
    useBranchId: optionalText(row.use_branch_id),
    useBranchName: optionalText(row.use_branch_name),
    // Solo cuando el QR escaneado era de un punto específico, no de la
    // sucursal entera. `optionalText` sobre una columna ausente da null, así
    // que esto es inocuo si la RPC todavía no las devuelve.
    grantVenueId: optionalText(row.grant_venue_id),
    grantVenueName: optionalText(row.grant_venue_name),
    useVenueId: optionalText(row.use_venue_id),
    useVenueName: optionalText(row.use_venue_name),
  };
}

/** Normaliza `action` venga como venga de la base. */
function toBranchAction(value: unknown): PromotionBranchAction {
  return text(value).trim().toUpperCase() === "USE" ? "USE" : "GRANT";
}

function toBranchQr(row: RpcRow): PromotionBranchQr {
  return {
    branchId: text(row.branch_id),
    branchName: text(row.branch_name),
    branchActive: row.branch_active === true,
    action: toBranchAction(row.action),
    token: optionalText(row.token),
    enabled: row.enabled === true,
    createdAt: optionalText(row.created_at),
  };
}

/**
 * Normaliza el kind. Lo desconocido cae en BRANCH a propósito: es el caso que
 * ya existía y el que la pantalla sabe mostrar. Un kind nuevo que aparezca sin
 * avisar se va a ver mal ubicado, pero se va a VER — esconderlo sería peor.
 */
function toTargetKind(value: unknown): PromotionQrTargetKind {
  const raw = text(value).trim().toUpperCase();
  return raw === "VENUE" || raw === "ROOM" ? raw : "BRANCH";
}

/** Primer valor de texto no vacío entre varias claves candidatas. */
function firstText(row: RpcRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = optionalText(row[key]);
    if (value) return value;
  }
  return null;
}

/**
 * Primer booleano entre varias claves. Corta en la PRIMERA que exista en la
 * fila, aunque valga false: si el backend mandó la columna, es la respuesta.
 */
function flag(row: RpcRow, ...keys: string[]): boolean {
  for (const key of keys) {
    if (key in row) return row[key] === true;
  }
  return false;
}

/** Qué columnas describen al target según su kind. */
const CAMPOS_POR_KIND: Record<PromotionQrTargetKind, { id: string; name: string; active: string }> = {
  BRANCH: { id: "branch_id", name: "branch_name", active: "branch_active" },
  ROOM: { id: "room_id", name: "room_name", active: "room_active" },
  VENUE: { id: "venue_id", name: "venue_name", active: "venue_active" },
};

/**
 * Fila de `get_promotion_qr_targets`.
 *
 * Resuelve `targetId` / `targetName` / `targetActive` a partir del kind, con
 * las columnas genéricas (`target_id`, `target_name`, `target_active`) como
 * segunda opción: así la pantalla no depende de qué familia de nombres use la
 * RPC, y una fila BRANCH sigue leyéndose igual que antes.
 */
function toQrTarget(row: RpcRow): PromotionQrTarget {
  const targetKind = toTargetKind(row.target_kind);
  const campos = CAMPOS_POR_KIND[targetKind];

  return {
    targetKind,
    targetId: firstText(row, campos.id, "target_id") ?? "",
    targetName: firstText(row, campos.name, "target_name") ?? "",
    targetActive: flag(row, campos.active, "target_active"),

    // Crudos. Un VENUE los necesita para decir en qué sucursal está.
    branchId: firstText(row, "branch_id"),
    branchName: firstText(row, "branch_name"),
    branchActive: flag(row, "branch_active"),

    roomId: firstText(row, "room_id"),
    roomName: firstText(row, "room_name"),
    roomActive: flag(row, "room_active"),

    venueId: firstText(row, "venue_id"),
    venueName: firstText(row, "venue_name"),
    venueActive: flag(row, "venue_active"),

    action: toBranchAction(row.action),
    token: optionalText(row.token),
    enabled: row.enabled === true,
    createdAt: optionalText(row.created_at),
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
   ERRORES DE LOS QR POR SUCURSAL
======================= */

/**
 * Los códigos que devuelven las RPC de QR por sucursal, traducidos.
 *
 * Se traduce ACÁ, en la capa de datos, y no en cada pantalla: así los wrappers
 * de abajo tiran un `Error` que ya se puede mostrar tal cual, y la UI sigue
 * usando `promotionErrorMessage` como con todo lo demás.
 */
const BRANCH_QR_ERRORS: Record<string, string> = {
  INVALID_ACTION: "La acción del QR no es válida.",
  PROMOTION_NOT_FOUND: "La promoción ya no existe. Actualizá el listado.",
  INVALID_BRANCH: "La sucursal no está disponible.",
  INVALID_VENUE: "El punto específico no está disponible.",
  INVALID_ROOM: "La sala no está disponible.",
  // `INVALID_TARGET_KIND` va ANTES que `INVALID_TARGET`: el match por mensaje
  // es por substring y el más corto se comería al más largo.
  INVALID_TARGET_KIND: "El tipo de destino del QR no es válido.",
  INVALID_TARGET: "El destino del QR no está disponible.",
  NOT_FOUND: "El QR ya no existe o fue deshabilitado.",
  // Código de Postgres para "insufficient privilege". Llega cuando la RPC
  // rechaza a quien llama: es el backend haciendo cumplir `is_promo_admin()`.
  "42501": "No tenés permisos para administrar estos QR.",
};

/** Un corte de red se ve así en supabase-js; conviene decirlo con todas las letras. */
function isNetworkFailure(message: string): boolean {
  return /failed to fetch|networkerror|load failed|fetch failed/i.test(message);
}

/**
 * Convierte cualquier cosa que haya fallado en un Error con mensaje humano.
 * Acepta tanto un código suelto (`"INVALID_BRANCH"`) como el objeto de error
 * de supabase-js, que trae `code` y `message` por separado.
 */
function branchQrError(raw: unknown, fallback: string): Error {
  if (typeof raw === "string") {
    return new Error(BRANCH_QR_ERRORS[raw.trim().toUpperCase()] ?? raw.trim() ?? fallback);
  }

  const detalle = raw as { code?: unknown; message?: unknown; details?: unknown } | null;
  const code = text(detalle?.code).trim().toUpperCase();
  if (code && BRANCH_QR_ERRORS[code]) return new Error(BRANCH_QR_ERRORS[code]);

  const message = text(detalle?.message).trim();
  if (message) {
    // Algunos códigos viajan adentro del mensaje (`RAISE EXCEPTION 'NOT_FOUND'`).
    for (const [clave, texto] of Object.entries(BRANCH_QR_ERRORS)) {
      if (message.toUpperCase().includes(clave)) return new Error(texto);
    }
    if (isNetworkFailure(message)) {
      return new Error("No pude conectarme con el servidor. Revisá la conexión e intentá de nuevo.");
    }
    return new Error(message);
  }

  return new Error(fallback);
}

/**
 * Desarma el sobre `{ success, ... }` de las RPC de QR por sucursal. Un
 * `success: false` se convierte en error con el código ya traducido: dejarlo
 * pasar como "sin datos" mostraría un QR vacío sin explicar por qué.
 */
function unwrapBranchPayload(data: unknown, fallback: string): RpcRow {
  const envelope = asRows(data)[0];
  if (!envelope) throw new Error(fallback);

  if (envelope.success === false) {
    throw branchQrError(
      optionalText(envelope.error) ?? optionalText(envelope.message) ?? null,
      fallback
    );
  }

  return envelope;
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

/**
 * Promociones para el filtro de la tab Clientes.
 *
 * Es su propia RPC y NO `get_promotions_admin`: el listado de clientes es
 * histórico, así que el filtro necesita también las promociones inactivas, y
 * además esta RPC está gateada por `can_read_promotion_clients()` — o sea que
 * la puede usar un GM con `promotions_clients` aunque no tenga `promotions`.
 * Devuelve solo id y nombre, ya ordenadas por fecha de creación descendente.
 */
export async function fetchPromotionsForClientsFilter(): Promise<PromotionFilterOption[]> {
  const { data, error } = await supabase.rpc("get_promotions_for_clients_filter");
  if (error) throw error;

  return asRows(data).map((row) => ({ id: text(row.id), name: text(row.name) }));
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

/**
 * TODOS los clientes que coinciden con los filtros, no solo la página visible.
 * Recorre `get_promotion_clients_admin` con los mismos filtros, página por
 * página, hasta juntar `total_count`. Si falla cualquier página se propaga el
 * error: quien llama no recibe un listado a medias.
 */
export async function fetchAllPromotionClients(filters: {
  promotionId?: string | null;
  status?: PromotionClientStatus | null;
  search?: string;
}): Promise<PromotionClient[]> {
  const all: PromotionClient[] = [];
  let total = Infinity;

  while (all.length < total) {
    const page = await fetchPromotionClients({
      ...filters,
      limit: PROMOTION_CLIENTS_PAGE_SIZE,
      offset: all.length,
    });
    all.push(...page.rows);
    total = page.total;
    // Si el listado se achicó mientras exportábamos, una página corta o vacía
    // es el final: no se sigue pidiendo para siempre.
    if (page.rows.length < PROMOTION_CLIENTS_PAGE_SIZE) break;
  }

  return all;
}

/* =======================
   QR POR TARGET — RPC GENÉRICAS
======================= */

/**
 * Matriz completa de una promoción: una fila por target y acción.
 *
 * Es la ÚNICA fuente de verdad de la pantalla de QR. Después de habilitar,
 * rotar o deshabilitar se vuelve a pedir esto entero en vez de parchear el
 * array: el backend decide qué targets existen y cuáles siguen apareciendo.
 *
 * Devuelve los tres kinds. Quién se muestra y quién no lo decide la vista.
 */
export async function fetchPromotionQrTargets(promotionId: string): Promise<PromotionQrTarget[]> {
  const { data, error } = await supabase.rpc("get_promotion_qr_targets", {
    p_promotion_id: promotionId,
  });
  if (error) throw branchQrError(error, "No pude cargar los QR de la promoción.");

  return asRows(data).map(toQrTarget);
}

/**
 * Habilita una combinación promoción + target + acción.
 *
 * Idempotente del lado del backend: llamarla de nuevo sobre algo ya habilitado
 * NO rota el token, devuelve el mismo con `already_enabled: true`. Eso se
 * expone tal cual para que la UI pueda avisarlo en vez de mentir que generó un
 * código nuevo.
 */
export async function enablePromotionQrTarget(
  promotionId: string,
  targetKind: PromotionQrTargetKind,
  targetId: string,
  action: PromotionQrTargetAction
): Promise<{ token: string | null; alreadyEnabled: boolean }> {
  const { data, error } = await supabase.rpc("enable_promotion_qr_target", {
    p_promotion_id: promotionId,
    p_target_kind: targetKind,
    p_target_id: targetId,
    p_action: action,
  });
  if (error) throw branchQrError(error, "No pude habilitar el QR.");

  const row = unwrapBranchPayload(data, "No pude habilitar el QR.");
  return {
    token: optionalText(row.token),
    alreadyEnabled: row.already_enabled === true,
  };
}

/**
 * Deshabilita una combinación. La fila se ELIMINA: el QR físico que ya esté
 * impreso deja de funcionar. Por eso la pantalla pide confirmación antes.
 */
export async function disablePromotionQrTarget(
  promotionId: string,
  targetKind: PromotionQrTargetKind,
  targetId: string,
  action: PromotionQrTargetAction
): Promise<void> {
  const { data, error } = await supabase.rpc("disable_promotion_qr_target", {
    p_promotion_id: promotionId,
    p_target_kind: targetKind,
    p_target_id: targetId,
    p_action: action,
  });
  if (error) throw branchQrError(error, "No pude deshabilitar el QR.");

  unwrapBranchPayload(data, "No pude deshabilitar el QR.");
}

/**
 * Rota el token de UN solo target. No toca la otra acción del mismo target, ni
 * la misma acción en otros targets, ni otras promociones. Devuelve el token
 * nuevo, puro.
 */
export async function rotatePromotionQrTargetToken(
  promotionId: string,
  targetKind: PromotionQrTargetKind,
  targetId: string,
  action: PromotionQrTargetAction
): Promise<string | null> {
  const { data, error } = await supabase.rpc("rotate_promotion_qr_target_token", {
    p_promotion_id: promotionId,
    p_target_kind: targetKind,
    p_target_id: targetId,
    p_action: action,
  });
  if (error) throw branchQrError(error, "No pude regenerar el QR.");

  return optionalText(unwrapBranchPayload(data, "No pude regenerar el QR.").token);
}

/**
 * Token puntual de una combinación. Hoy la pantalla se abastece de
 * `fetchPromotionQrTargets`, así que esto queda como camino directo para
 * recuperar un token sin volver a traer la matriz entera.
 */
export async function fetchPromotionQrTarget(
  promotionId: string,
  targetKind: PromotionQrTargetKind,
  targetId: string,
  action: PromotionQrTargetAction
): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_promotion_qr_target", {
    p_promotion_id: promotionId,
    p_target_kind: targetKind,
    p_target_id: targetId,
    p_action: action,
  });
  if (error) throw branchQrError(error, "No pude obtener el QR.");

  return optionalText(unwrapBranchPayload(data, "No pude obtener el QR.").token);
}

/* =========================================================
   QR POR SUCURSAL — RPC ANTERIORES
   Las reemplazaron las genéricas de arriba. Ya NO las llama
   ninguna pantalla; quedan por compatibilidad y rollback.
========================================================= */

/**
 * Matriz completa de una promoción: una fila por sucursal y acción.
 *
 * Es la ÚNICA fuente de verdad de la pantalla. Después de habilitar, rotar o
 * deshabilitar se vuelve a pedir esto en vez de parchear el array a mano: el
 * backend decide qué sucursales existen y cuáles siguen apareciendo.
 */
export async function fetchPromotionBranchQrs(promotionId: string): Promise<PromotionBranchQr[]> {
  const { data, error } = await supabase.rpc("get_promotion_branch_qrs", {
    p_promotion_id: promotionId,
  });
  if (error) throw branchQrError(error, "No pude cargar los QR por sucursal.");

  return asRows(data).map(toBranchQr);
}

/**
 * Habilita una combinación promoción + sucursal + acción.
 *
 * Es idempotente del lado del backend: llamarla de nuevo sobre algo ya
 * habilitado NO rota el token, devuelve el mismo con `already_enabled: true`.
 * Eso se expone tal cual para que la UI pueda avisarlo en vez de mentir que
 * generó algo nuevo.
 */
export async function enablePromotionBranch(
  promotionId: string,
  branchId: string,
  action: PromotionBranchAction
): Promise<{ token: string | null; alreadyEnabled: boolean }> {
  const { data, error } = await supabase.rpc("enable_promotion_branch", {
    p_promotion_id: promotionId,
    p_branch_id: branchId,
    p_action: action,
  });
  if (error) throw branchQrError(error, "No pude habilitar el QR.");

  const row = unwrapBranchPayload(data, "No pude habilitar el QR.");
  return {
    token: optionalText(row.token),
    alreadyEnabled: row.already_enabled === true,
  };
}

/**
 * Deshabilita una combinación. La fila se ELIMINA: el QR físico que ya esté
 * impreso deja de funcionar. Por eso la pantalla pide confirmación antes.
 */
export async function disablePromotionBranch(
  promotionId: string,
  branchId: string,
  action: PromotionBranchAction
): Promise<void> {
  const { data, error } = await supabase.rpc("disable_promotion_branch", {
    p_promotion_id: promotionId,
    p_branch_id: branchId,
    p_action: action,
  });
  if (error) throw branchQrError(error, "No pude deshabilitar el QR.");

  unwrapBranchPayload(data, "No pude deshabilitar el QR.");
}

/**
 * Rota el token de UNA sola combinación. No toca la otra acción de la misma
 * sucursal, ni la misma acción en otras sucursales, ni otras promociones.
 * Devuelve el token nuevo, puro.
 */
export async function rotatePromotionBranchToken(
  promotionId: string,
  branchId: string,
  action: PromotionBranchAction
): Promise<string | null> {
  const { data, error } = await supabase.rpc("rotate_promotion_branch_token", {
    p_promotion_id: promotionId,
    p_branch_id: branchId,
    p_action: action,
  });
  if (error) throw branchQrError(error, "No pude regenerar el QR.");

  return optionalText(unwrapBranchPayload(data, "No pude regenerar el QR.").token);
}

/**
 * Token puntual de una combinación. Hoy la pantalla se abastece de
 * `fetchPromotionBranchQrs`, así que esto queda como camino directo para
 * recuperar un token sin volver a traer la matriz entera.
 */
export async function fetchPromotionBranchQr(
  promotionId: string,
  branchId: string,
  action: PromotionBranchAction
): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_promotion_branch_qr", {
    p_promotion_id: promotionId,
    p_branch_id: branchId,
    p_action: action,
  });
  if (error) throw branchQrError(error, "No pude obtener el QR.");

  return optionalText(unwrapBranchPayload(data, "No pude obtener el QR.").token);
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

/** Igual que `formatPromotionDate` (hora local del navegador) más HH:mm. */
export function formatPromotionDateTime(iso: string | null | undefined): string {
  const day = formatPromotionDate(iso);
  if (!day) return "";
  const date = new Date(iso as string);
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${hh}:${min}`;
}

/**
 * Texto del estado, el mismo que muestra la tabla de Clientes. El status
 * persistido no cambia: un otorgado de una promoción apagada solo se MUESTRA
 * como inhabilitado.
 */
export function promotionClientStatusLabel(client: PromotionClient, promotionInactive: boolean): string {
  if (client.status === "granted" && promotionInactive) return "Inhabilitado";
  return client.status === "granted" ? "Otorgado" : "Usado";
}

/**
 * Lugar del escaneo tal como lo muestra la tabla: gana el punto específico
 * (venue) y si no, la sucursal. Null en ambos → raya.
 */
function promotionClientPlace(branchName: string | null, venueName: string | null): string {
  return venueName ?? branchName ?? "—";
}

const CSV_SEPARATOR = ";";

/**
 * Una celda CSV. Se entrecomilla si trae separador, comillas o saltos de
 * línea. Los textos que carga el cliente (nombre, mail, alias) y empiezan con
 * = + - @ se prefijan con ' para que Excel no los ejecute como fórmula.
 */
function csvCell(value: string, userText = false): string {
  let out = value;
  if (userText && /^[=+\-@\t\r]/.test(out)) out = `'${out}`;
  if (/[";\r\n]/.test(out)) out = `"${out.replace(/"/g, '""')}"`;
  return out;
}

/**
 * CSV de Clientes listo para Excel en configuración regional argentina:
 * separador `;`, BOM UTF-8 (tildes y ñ) y CRLF entre filas.
 */
export function buildPromotionClientsCsv(
  clients: PromotionClient[],
  inactivePromotionIds: ReadonlySet<string>
): string {
  const header = [
    "Promoción", "Nombre", "Apellido", "Mail", "Alias", "Estado",
    "Fecha otorgado", "Sucursal otorgado", "Fecha utilizado", "Sucursal utilizado",
  ];
  const dash = (value: string | null | undefined) => (value ? value : "—");

  const lines = clients.map((client) => [
    csvCell(dash(client.promotionName)),
    csvCell(dash(client.nombre), true),
    csvCell(dash(client.apellido), true),
    csvCell(dash(client.mail), true),
    csvCell(dash(client.alias), true),
    csvCell(promotionClientStatusLabel(client, inactivePromotionIds.has(client.promotionId))),
    csvCell(dash(formatPromotionDateTime(client.grantedAt))),
    csvCell(promotionClientPlace(client.grantBranchName, client.grantVenueName)),
    csvCell(dash(formatPromotionDateTime(client.usedAt))),
    csvCell(promotionClientPlace(client.useBranchName, client.useVenueName)),
  ].join(CSV_SEPARATOR));

  return "﻿" + [header.map((cell) => csvCell(cell)).join(CSV_SEPARATOR), ...lines].join("\r\n");
}

/**
 * `clientes-promocion-{nombre}-{YYYY-MM-DD}.csv` con una promoción elegida,
 * `clientes-promociones-{YYYY-MM-DD}.csv` con "Todas". El nombre pierde tildes
 * y todo lo que no sea letra o número.
 */
export function promotionClientsCsvFilename(promotionName: string | null, now = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const slug = (promotionName ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return promotionName !== null
    ? `clientes-promocion-${slug || "sin-nombre"}-${day}.csv`
    : `clientes-promociones-${day}.csv`;
}

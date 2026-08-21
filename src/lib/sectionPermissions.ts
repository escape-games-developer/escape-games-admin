import { supabase } from "./supabase";

/**
 * Habilitación de secciones del admin por rol.
 *
 * Los datos viven en `admin_section_permissions` (una fila por rol + sección).
 * Acá está el catálogo de secciones, la lectura/escritura y el caché.
 *
 * Reglas de negocio, en un solo lugar:
 *   · Admin General ve todo, siempre. Los switches no lo afectan.
 *   · Hoy el filtro aplica únicamente a GM (ver `SECTION_FILTERED_ROLES`).
 *   · Intranet es padre: si está apagada, ninguna de sus hijas se ve.
 */

export type SectionKey =
  | "rooms"
  | "news"
  | "users"
  | "golden_ticket"
  | "user_progress"
  | "intranet"
  | "intranet_quote"
  | "intranet_messages"
  | "intranet_objections"
  | "intranet_respond_io"
  | "calendar"
  | "chat";

/**
 * Mismos códigos que ya usa el front. `admins` no tiene columna `role`: se
 * deriva de `is_super` y `gm_code` en AdminLayout. CLIENT no llega al panel,
 * pero se incluye para que el tipo calce con el `UserRole` de ahí.
 */
export type SectionRole = "ADMIN_GENERAL" | "ADMIN" | "GM" | "CLIENT";

/**
 * Roles con acceso total, sin depender de los switches. Se define por lista
 * blanca a propósito: cualquier rol nuevo queda filtrado por defecto, que es
 * el lado seguro para equivocarse.
 */
export const SECTION_UNRESTRICTED_ROLES: readonly SectionRole[] = ["ADMIN_GENERAL", "ADMIN"];

export type SectionDef = {
  key: SectionKey;
  label: string;
  /** Sección padre. Si está apagada, la hija no se muestra. */
  parent?: SectionKey;
  /** Ruta real de `routes.tsx`. Los grupos (Intranet) no tienen. */
  path?: string;
};

/**
 * Catálogo. Cada entrada corresponde a una ruta real de `routes.tsx` (salvo
 * `intranet`, que es el grupo del sidebar y no tiene pantalla propia).
 */
export const SECTION_DEFS: readonly SectionDef[] = [
  { key: "rooms", label: "Salas", path: "/salas" },
  { key: "news", label: "Novedades", path: "/novedades" },
  { key: "users", label: "Usuarios", path: "/usuarios" },
  { key: "golden_ticket", label: "Golden Ticket", path: "/golden-tickets" },
  { key: "user_progress", label: "Progreso usuarios", path: "/usuarios/progreso" },
  { key: "intranet", label: "Intranet" },
  { key: "intranet_quote", label: "Cotizador", parent: "intranet", path: "/admin/intranet/cotizador" },
  { key: "intranet_messages", label: "Mensajes", parent: "intranet", path: "/admin/intranet/mensajes" },
  { key: "intranet_objections", label: "Menú de Objeciones", parent: "intranet", path: "/admin/intranet/objeciones" },
  { key: "intranet_respond_io", label: "Instructivo Respond IO", parent: "intranet", path: "/admin/intranet/respond-io" },
  { key: "calendar", label: "Calendario", path: "/admin/calendario" },
  { key: "chat", label: "Chat interno", path: "/chat" },
];

export type SectionPermissions = Partial<Record<SectionKey, boolean>>;

const SECTION_KEYS = new Set<string>(SECTION_DEFS.map((def) => def.key));
const CACHE_KEY = "eg_admin_section_permissions_v1";

/**
 * Mínimo conocido para GM si no hay ni servidor ni caché. NO es "todo
 * habilitado": es lo imprescindible para que un asesor pueda cotizar, que es
 * el uso que esta publicación garantiza.
 */
const GM_MINIMO: SectionPermissions = { intranet: true, intranet_quote: true };

/* =======================
   LECTURA
======================= */

export async function fetchSectionPermissions(role: SectionRole): Promise<SectionPermissions> {
  const { data, error } = await supabase
    .from("admin_section_permissions")
    .select("section_key, enabled")
    .eq("role", role);

  if (error) throw error;

  const out: SectionPermissions = {};
  for (const fila of data ?? []) {
    const key = String((fila as { section_key?: unknown }).section_key ?? "");
    if (SECTION_KEYS.has(key)) {
      out[key as SectionKey] = (fila as { enabled?: unknown }).enabled === true;
    }
  }
  return out;
}

/* =======================
   ESCRITURA (solo Admin General; lo hace cumplir la RLS)
======================= */

export async function saveSectionPermission(
  role: SectionRole,
  sectionKey: SectionKey,
  enabled: boolean
): Promise<void> {
  const { error } = await supabase
    .from("admin_section_permissions")
    .upsert({ role, section_key: sectionKey, enabled, updated_at: new Date().toISOString() },
      { onConflict: "role,section_key" });

  if (error) throw error;
}

/* =======================
   CACHÉ
======================= */

/**
 * El caché es el plan B cuando la lectura falla (red caída, migración sin
 * aplicar). Guarda el rol junto a los permisos para no reusar los de otro
 * usuario si cambia la sesión en la misma máquina.
 */
export function cacheSectionPermissions(role: SectionRole, permissions: SectionPermissions): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ role, permissions }));
  } catch {
    // Storage bloqueado: se pierde el plan B, nada más.
  }
}

export function readCachedSectionPermissions(role: SectionRole): SectionPermissions | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const guardado = parsed as { role?: unknown; permissions?: unknown };
    if (guardado.role !== role) return null;
    if (typeof guardado.permissions !== "object" || guardado.permissions === null) return null;

    const out: SectionPermissions = {};
    for (const [key, value] of Object.entries(guardado.permissions)) {
      if (SECTION_KEYS.has(key)) out[key as SectionKey] = value === true;
    }
    return out;
  } catch {
    return null;
  }
}

/** Qué usar cuando el servidor no responde. Nunca "todo en true" para GM. */
export function fallbackSectionPermissions(role: SectionRole): SectionPermissions {
  return readCachedSectionPermissions(role) ?? { ...GM_MINIMO };
}

/* =======================
   REGLA DE ACCESO
======================= */

const PARENT_OF = new Map<SectionKey, SectionKey | undefined>(
  SECTION_DEFS.map((def) => [def.key, def.parent])
);

/**
 * Única fuente de verdad del acceso. La usan el sidebar, el guard de rutas y
 * cualquier pantalla que lo necesite: no hay condiciones sueltas por ahí.
 */
export function canAccessSection(
  sectionKey: SectionKey,
  role: SectionRole,
  permissions: SectionPermissions
): boolean {
  // Admin General (y ADMIN) ven todo, siempre. Los switches no los tocan.
  if (SECTION_UNRESTRICTED_ROLES.includes(role)) return true;

  const parent = PARENT_OF.get(sectionKey);
  // El padre apagado gana sobre la hija encendida.
  if (parent && permissions[parent] !== true) return false;

  return permissions[sectionKey] === true;
}

/** Hijas visibles de un grupo. Sirve para no dibujar un menú vacío. */
export function visibleChildren(
  parentKey: SectionKey,
  role: SectionRole,
  permissions: SectionPermissions
): SectionDef[] {
  return SECTION_DEFS.filter(
    (def) => def.parent === parentKey && canAccessSection(def.key, role, permissions)
  );
}

/**
 * Primera sección con pantalla propia a la que el usuario sí puede entrar.
 * Sirve para ofrecer una salida desde "Acceso restringido" sin inventar
 * redirecciones automáticas (que con varias secciones apagadas terminan en
 * un loop /users → /rooms → /users).
 */
export function firstAccessiblePath(
  role: SectionRole,
  permissions: SectionPermissions
): string | null {
  const def = SECTION_DEFS.find(
    (item) => item.path && canAccessSection(item.key, role, permissions)
  );
  return def?.path ?? null;
}

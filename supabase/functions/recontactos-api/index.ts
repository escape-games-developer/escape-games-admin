import { authenticatedUser, corsHeaders, getAccessToken, json, serviceClient } from "../_shared/recontactosGoogle.ts";

const aliases: Record<string, string[]> = {
  nombre: ["nombre"], whatsapp: ["whatsapp", "telefono", "teléfono"], fechaContacto: ["fecha contacto"], asesorAsignado: ["asesor asignado"], fechaFestejo: ["fecha del festejo", "fecha festejo"], edad: ["edad festejado", "edad"], invitados: ["cantidad invitados", "invitados"], salas: ["sala interes", "sala interés", "salas"], presupuesto: ["presupuesto ($)", "presupuesto"], fechaReserva: ["fecha de reserva"], intento1: ["intento 1"], intento2: ["intento 2"], intento3: ["intento 3"], estado: ["estado"], notas: ["notas del asesor", "notas"], proximoRecontacto: ["proximo recontacto", "próximo recontacto"], ultimaGestion: ["ultima gestion", "última gestión"], resultadoUltimaGestion: ["resultado ultima gestion", "resultado última gestión"],
};
const normalized = (v: unknown) => String(v ?? "").trim().toLocaleLowerCase("es");
function indexHeaders(headers: unknown[]) { const result: Record<string, number> = {}; Object.entries(aliases).forEach(([field, names]) => { const index = headers.findIndex((h) => names.includes(normalized(h))); if (index >= 0) result[field] = index; }); return result; }
function mapRows(values: unknown[][]) { const indexes = indexHeaders(values[0] ?? []); const missing = ["nombre", "whatsapp"].filter((key) => indexes[key] == null); if (missing.length) throw new Error(`COLUMNAS_INCOMPATIBLES: faltan ${missing.join(", ")}`); return values.slice(1).filter((r) => r.some(Boolean)).map((row, i) => { const get = (key: string) => indexes[key] == null ? null : row[indexes[key]] ?? null; return { id: String(i + 2), nombre: get("nombre"), whatsapp: get("whatsapp"), fechaContacto: get("fechaContacto"), asesorAsignado: get("asesorAsignado"), fechaFestejo: get("fechaFestejo"), edad: get("edad"), invitados: get("invitados"), salas: String(get("salas") ?? "").split(/[,;|]/).map((v) => v.trim()).filter(Boolean), presupuesto: get("presupuesto"), fechaReserva: get("fechaReserva"), intentos: [get("intento1"), get("intento2"), get("intento3")], estado: get("estado") || "Pendiente", notas: get("notas"), proximoRecontacto: get("proximoRecontacto"), ultimaGestion: get("ultimaGestion"), resultadoUltimaGestion: get("resultadoUltimaGestion") }; }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await authenticatedUser(req); if (!user) return json({ error: "Sesión inválida" }, 401);
    const parts = new URL(req.url).pathname.split("/").filter(Boolean); const branchesIndex = parts.indexOf("branches"); const branchId = parts[branchesIndex + 1];
    const db = serviceClient(); const { data: admin } = await db.from("admins").select("is_super,branch_id").eq("user_id", user.id).maybeSingle();
    if (!admin || (!admin.is_super && String(admin.branch_id) !== branchId)) return json({ error: "No tenés acceso a esa sucursal" }, 403);
    const validating = parts.at(-1) === "validate";
    const { data: config } = await db.from("recontactos_config").select("enabled").eq("id", "default").single(); if (!config?.enabled && !(validating && admin.is_super)) return json({ error: "Recontactos está deshabilitado" }, 403);
    const { data: mapping } = await db.from("recontactos_branch_sheets").select("*,google_oauth_connections(*)").eq("branch_id", branchId).maybeSingle();
    if (!mapping) return json({ error: "La sucursal no tiene Google Sheet vinculado", code: "SHEET_NOT_CONFIGURED" }, 409);
    if (!mapping.active) return json({ error: "La sucursal está deshabilitada para Recontactos", code: "BRANCH_DISABLED" }, 403);
    const connection = mapping.google_oauth_connections; if (!connection || connection.revoked_at) return json({ error: "Google no está conectado", code: "GOOGLE_DISCONNECTED" }, 409);
    const token = await getAccessToken(connection); const range = encodeURIComponent(`'${String(mapping.sheet_tab).replaceAll("'", "''")}'!A:ZZ`);
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(mapping.spreadsheet_id)}/values/${range}`, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json(); if (!response.ok) return json({ error: payload.error?.message ?? "Google Sheets rechazó la lectura", code: "GOOGLE_API_ERROR" }, response.status);
    const rows = mapRows(payload.values ?? []);
    if (validating) return json({ accessible: true, tabFound: true, recordCount: rows.length, structureRecognized: true });
    if (req.method !== "GET") return json({ error: "La escritura se habilitará en la siguiente etapa" }, 405);
    return json(rows);
  } catch (error) { const message = error instanceof Error ? error.message : "No se pudo leer Google Sheets"; return json({ error: message, code: message.startsWith("COLUMNAS_INCOMPATIBLES") ? "INCOMPATIBLE_COLUMNS" : "INTERNAL_ERROR" }, 500); }
});

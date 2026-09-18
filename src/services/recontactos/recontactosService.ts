import { supabase } from "../../lib/supabase";
import type { BranchSheet, Recontacto, RecontactoChanges, RecontactosConfig } from "./types";
import { normalizeRecontacto, normalizeRecontactos } from "./recontactosMapper";

export const DEFAULT_WHATSAPP_TEMPLATE = `Hola [NOMBRE] 👋
Te contactamos desde Escape Games [SUCURSAL].
El [FECHA_CONTACTO] nos consultaste por un festejo para el [FECHA_CUMPLE] para aproximadamente [INVITADOS] invitados.
Queríamos saber si seguías evaluando la propuesta o si podemos ayudarte con alguna consulta.`;

const endpoint = String(import.meta.env.VITE_RECONTACTOS_API_URL || `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, "")}/functions/v1/recontactos-api`).replace(/\/$/, "");

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
  };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${endpoint}${path}`, { ...init, headers: { ...(await authHeaders()), ...init?.headers } });
  if (!response.ok) throw new Error((await response.text()) || `Error de sincronización (${response.status})`);
  return response.json() as Promise<T>;
}

export async function getRecontactos(branchId: string, signal?: AbortSignal): Promise<Recontacto[]> {
  return normalizeRecontactos(await api<unknown>(`/branches/${encodeURIComponent(branchId)}/recontactos`, { signal }));
}

export async function updateRecontacto(branchId: string, rowId: string, changes: RecontactoChanges): Promise<Recontacto> {
  return normalizeRecontacto(await api<unknown>(`/branches/${encodeURIComponent(branchId)}/recontactos/${encodeURIComponent(rowId)}`, {
    method: "PATCH", body: JSON.stringify(changes),
  }));
}

export async function registerAttempt(branchId: string, item: Recontacto, nextContact: string | null): Promise<Recontacto> {
  const now = new Date().toISOString();
  const attempts = [...item.intentos];
  const slot = attempts.findIndex((value) => !value);
  if (slot < 0) throw new Error("El registro ya tiene los tres intentos completos.");
  attempts[slot] = now;
  return updateRecontacto(branchId, item.id, {
    intentos: attempts,
    ultimaGestion: now,
    resultadoUltimaGestion: "Sin respuesta",
    proximoRecontacto: slot === 2 ? null : nextContact,
    estado: slot === 2 ? "Cerrado sin respuesta" : "Sin respuesta",
  });
}

export async function registerResult(branchId: string, rowId: string, changes: RecontactoChanges): Promise<Recontacto> {
  return updateRecontacto(branchId, rowId, changes);
}

export async function getRecontactosConfig(): Promise<RecontactosConfig> {
  const { data, error } = await supabase.from("recontactos_config").select("enabled, whatsapp_template").eq("id", "default").maybeSingle();
  if (error) throw error;
  return { enabled: data?.enabled === true, whatsappTemplate: String(data?.whatsapp_template || DEFAULT_WHATSAPP_TEMPLATE) };
}

export async function updateRecontactosConfig(changes: Partial<RecontactosConfig>): Promise<void> {
  const row: Record<string, unknown> = { id: "default", updated_at: new Date().toISOString() };
  if (typeof changes.enabled === "boolean") row.enabled = changes.enabled;
  if (typeof changes.whatsappTemplate === "string") row.whatsapp_template = changes.whatsappTemplate;
  const { error } = await supabase.from("recontactos_config").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

export async function getBranchSheets(): Promise<BranchSheet[]> {
  const { data: branches, error: branchError } = await supabase.from("branches").select("id,name,active").order("name");
  if (branchError) throw branchError;
  const { data: mappings, error: mappingError } = await supabase.from("recontactos_branch_sheets").select("branch_id,spreadsheet_id,spreadsheet_name,sheet_tab,active");
  if (mappingError) throw mappingError;
  const byBranch = new Map((mappings ?? []).map((row) => [String(row.branch_id), row]));
  return (branches ?? []).filter((b) => b.active !== false).map((branch) => {
    const mapping = byBranch.get(String(branch.id));
    return { branchId: String(branch.id), branchName: String(branch.name), sheetId: mapping?.spreadsheet_id ? String(mapping.spreadsheet_id) : null, sheetName: String(mapping?.spreadsheet_name || ""), sheetTab: String(mapping?.sheet_tab || "Recontactos"), active: mapping?.active === true };
  });
}

export async function saveBranchSheet(mapping: BranchSheet): Promise<void> {
  const { error } = await supabase.from("recontactos_branch_sheets").upsert({
    branch_id: mapping.branchId,
    spreadsheet_id: mapping.sheetId,
    spreadsheet_name: mapping.sheetName || "Google Sheet",
    sheet_tab: mapping.sheetTab || "Recontactos",
    active: mapping.active,
    updated_at: new Date().toISOString(),
  }, { onConflict: "branch_id" });
  if (error) throw error;
}

export function renderWhatsappTemplate(template: string, item: Recontacto, branchName: string): string {
  const values: Record<string, string> = {
    NOMBRE: item.nombre, FECHA_CONTACTO: item.fechaContacto || "—", FECHA_CUMPLE: item.fechaFestejo || "—",
    INVITADOS: item.invitados == null ? "—" : String(item.invitados), SUCURSAL: branchName,
  };
  return template.replace(/\[(NOMBRE|FECHA_CONTACTO|FECHA_CUMPLE|INVITADOS|SUCURSAL)\]/g, (_, key: string) => values[key]);
}

export function whatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

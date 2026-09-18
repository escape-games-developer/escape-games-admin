import { supabase } from "../../lib/supabase";

export type GoogleStatus = { connected: boolean; id?: string; email?: string };
type PickerCredentials = { accessToken: string; developerKey: string; appId: string };
export type SpreadsheetSelection = { spreadsheetId: string; spreadsheetName: string };
export type ValidationResult = { accessible: boolean; tabFound: boolean; recordCount: number; structureRecognized: boolean };

const functionsUrl = `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, "")}/functions/v1`;
const recontactosUrl = String(import.meta.env.VITE_RECONTACTOS_API_URL || `${functionsUrl}/recontactos-api`).replace(/\/$/, "");

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}`, ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.error || `Error ${response.status}`));
  return payload as T;
}

export const getGoogleStatus = () => call<GoogleStatus>(`${functionsUrl}/google-oauth/status`);
export const startGoogleOAuth = async () => {
  const result = await call<{ authorizationUrl: string }>(`${functionsUrl}/google-oauth/start`, { method: "POST", body: JSON.stringify({ returnTo: `${window.location.origin}/ajustes` }) });
  window.location.assign(result.authorizationUrl);
};
export const disconnectGoogle = () => call<{ disconnected: boolean }>(`${functionsUrl}/google-oauth/disconnect`, { method: "DELETE" });
export const assignSpreadsheet = (branchId: string, selection: SpreadsheetSelection, sheetTab: string, enabled: boolean) => call<{ saved: boolean }>(`${functionsUrl}/google-oauth/assign-sheet`, { method: "POST", body: JSON.stringify({ branchId, ...selection, sheetTab, enabled }) });
export const validateSpreadsheet = (branchId: string) => call<ValidationResult>(`${recontactosUrl}/branches/${encodeURIComponent(branchId)}/recontactos/validate`);

declare global {
  interface Window {
    gapi?: { load: (name: string, callback: () => void) => void };
    google?: { picker: {
      ViewId: { SPREADSHEETS: string };
      Action: { PICKED: string; CANCEL: string };
      Response: { ACTION: string; DOCUMENTS: string };
      Document: { ID: string; NAME: string };
      DocsView: new (id: string) => { setMimeTypes: (types: string) => unknown };
      PickerBuilder: new () => { addView: (view: unknown) => unknown; setOAuthToken: (token: string) => unknown; setDeveloperKey: (key: string) => unknown; setAppId: (id: string) => unknown; setCallback: (callback: (data: Record<string, unknown>) => void) => unknown; build: () => { setVisible: (visible: boolean) => void } };
    } };
  }
}

let pickerScript: Promise<void> | null = null;
function loadPicker() {
  if (window.google?.picker) return Promise.resolve();
  if (pickerScript) return pickerScript;
  pickerScript = new Promise((resolve, reject) => {
    const script = document.createElement("script"); script.src = "https://apis.google.com/js/api.js"; script.async = true; script.onerror = () => reject(new Error("No se pudo cargar Google Picker")); script.onload = () => window.gapi?.load("picker", resolve); document.head.appendChild(script);
  });
  return pickerScript;
}

export async function pickSpreadsheet(): Promise<SpreadsheetSelection> {
  const credentials = await call<PickerCredentials>(`${functionsUrl}/google-oauth/picker-token`);
  await loadPicker();
  return new Promise((resolve, reject) => {
    const picker = window.google?.picker; if (!picker) return reject(new Error("Google Picker no está disponible"));
    const view = new picker.DocsView(picker.ViewId.SPREADSHEETS); view.setMimeTypes("application/vnd.google-apps.spreadsheet");
    const builder = new picker.PickerBuilder(); builder.addView(view); builder.setOAuthToken(credentials.accessToken); builder.setDeveloperKey(credentials.developerKey); builder.setAppId(credentials.appId);
    builder.setCallback((data) => { const action = data[picker.Response.ACTION]; if (action === picker.Action.CANCEL) { reject(new Error("Selección cancelada")); return; } if (action !== picker.Action.PICKED) return; const docs = data[picker.Response.DOCUMENTS] as Array<Record<string, unknown>>; const doc = docs?.[0]; if (doc) resolve({ spreadsheetId: String(doc[picker.Document.ID]), spreadsheetName: String(doc[picker.Document.NAME]) }); });
    builder.build().setVisible(true);
  });
}

import { supabase } from "./supabase";

/**
 * Config global de la app: tabla `app_config`, fila única id = 'default'.
 *
 * La lectura es directa (RLS deja leer a cualquier `authenticated`), pero las
 * escrituras van por RPC (`set_rating_upload_enabled` / `rotate_golden_qr_secret`),
 * que validan que el que llama esté en `admins`.
 *
 * El secret del Golden Ticket NO se lee más desde acá: `golden_qr_secret` dejó
 * de ser legible en `app_config` y solo se obtiene por el RPC
 * `get_golden_qr_secret`, que exige que quien llama esté en `admins`.
 */

export const APP_CONFIG_ID = "default";

/** Prefijo del QR de Golden Ticket que escanea la app cliente. */
export const GOLDEN_QR_PREFIX = "EG-GOLDENQR-";

export type AppConfig = {
  ratingUploadEnabled: boolean;
};

export function goldenQrValue(secret: string | null | undefined): string {
  const s = String(secret ?? "").trim();
  return s ? `${GOLDEN_QR_PREFIX}${s}` : "";
}

/* =======================
   LECTURA
======================= */

export async function fetchAppConfig(): Promise<AppConfig> {
  const { data, error } = await supabase
    .from("app_config")
    .select("rating_upload_enabled")
    .eq("id", APP_CONFIG_ID)
    .maybeSingle();

  if (error) throw error;

  const row = data as any;

  return {
    // Sin fila o sin valor asumimos habilitado: es el default de la app cliente.
    ratingUploadEnabled: row?.rating_upload_enabled !== false,
  };
}

/**
 * Secret actual del Golden Ticket.
 *
 * Único camino disponible: el RPC `get_golden_qr_secret` (SECURITY DEFINER),
 * que devuelve el texto solo si `auth.uid()` está en `admins`. El valor es
 * sensible: no se loguea, no se cachea y quien lo pide lo mantiene únicamente
 * en el estado que necesita para dibujar el QR.
 */
export async function fetchGoldenQrSecret(): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_golden_qr_secret");

  if (error) throw error;

  const secret = String(data ?? "").trim();
  return secret || null;
}

/* =======================
   RPCs
======================= */

/** Kill switch del FAB del clip en la app cliente. */
export async function setRatingUploadEnabled(enabled: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_rating_upload_enabled", {
    enabled,
  });

  if (error) throw error;

  const res = data as any;
  if (res && res.success === false) {
    throw new Error(String(res.error ?? "No se pudo cambiar la configuración"));
  }

  return typeof res?.rating_upload_enabled === "boolean"
    ? res.rating_upload_enabled
    : enabled;
}

/**
 * Genera un secret nuevo: todos los QR impresos con el anterior dejan de
 * validar. Devuelve el secret nuevo.
 */
export async function rotateGoldenQrSecret(): Promise<string> {
  const { data, error } = await supabase.rpc("rotate_golden_qr_secret");

  if (error) throw error;

  const res = data as any;
  if (!res || res.success !== true) {
    throw new Error(String(res?.error ?? "No se pudo rotar el secret"));
  }

  return String(res.new_secret ?? "");
}

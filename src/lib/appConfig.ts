import { supabase } from "./supabase";

/**
 * Config global de la app: tabla `app_config`, fila única id = 'default'.
 *
 * La lectura es directa (RLS deja leer a cualquier `authenticated`), pero las
 * escrituras van por RPC (`set_rating_upload_enabled` / `rotate_golden_qr_secret`),
 * que validan que el que llama esté en `admins`.
 */

export const APP_CONFIG_ID = "default";

/** Prefijo del QR de Golden Ticket que escanea la app cliente. */
export const GOLDEN_QR_PREFIX = "EG-GOLDENQR-";

export type AppConfig = {
  ratingUploadEnabled: boolean;
  goldenQrSecret: string | null;
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
    .select("rating_upload_enabled, golden_qr_secret")
    .eq("id", APP_CONFIG_ID)
    .maybeSingle();

  if (error) throw error;

  const row = data as any;

  return {
    // Sin fila o sin valor asumimos habilitado: es el default de la app cliente.
    ratingUploadEnabled: row?.rating_upload_enabled !== false,
    goldenQrSecret: row?.golden_qr_secret ? String(row.golden_qr_secret) : null,
  };
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

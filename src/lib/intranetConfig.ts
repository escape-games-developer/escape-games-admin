import { supabase } from "./supabase";
import {
  normalizeCotizadorConfig,
  serializeCotizadorConfig,
  type CotizadorConfig,
} from "./cotizador";
import {
  normalizeQuoteResponseTemplates,
  type QuoteResponseTemplates,
} from "./quoteResponseTemplates";

/**
 * Config de la Intranet: tabla `intranet_config`, fila única id = 'default'.
 *
 * Sigue el mismo patrón que `appConfig.ts`: lectura directa (la RLS deja leer
 * a cualquier fila de `admins`), escritura por RPC `SECURITY DEFINER`. La
 * diferencia con `app_config` es que acá la escritura exige `is_super`, tanto
 * en la política como adentro de la RPC.
 *
 * NO se cachea en LocalStorage a propósito: los valores base son del equipo,
 * así que un cambio del Admin General lo tiene que ver el asesor al recargar.
 *
 * Las reglas de precio no viven acá — están en `cotizador.ts`.
 */

export const INTRANET_CONFIG_ID = "default";

export type IntranetConfig = {
  cotizador: CotizadorConfig;
  responseTemplates: QuoteResponseTemplates;
  preciosConfirmados: boolean;
  updatedAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/* =======================
   LECTURA
======================= */

/** Columnas que existen desde la primera migración de la Intranet. */
const COLUMNAS_BASE = "cotizador, precios_confirmados, updated_at";

/**
 * `response_templates` la agrega una migración posterior
 * (20260820020000_intranet_response_templates.sql). Mientras no esté aplicada,
 * PostgREST rechaza la lectura entera y el cotizador se quedaba sin config: sin
 * config no se podían editar los valores base ni se armaba la respuesta. Las
 * plantillas son un extra, así que su ausencia no puede voltear la lectura.
 */
function esColumnaFaltante(error: unknown): boolean {
  const row = asRecord(error);
  const code = typeof row.code === "string" ? row.code : "";
  const message = (typeof row.message === "string" ? row.message : "").toLowerCase();

  return (
    code === "42703" || // undefined_column
    code.startsWith("PGRST") || // PostgREST no conoce la columna en su cache de esquema
    message.includes("response_templates") ||
    message.includes("does not exist")
  );
}

export async function fetchIntranetConfig(): Promise<IntranetConfig> {
  const leer = (columnas: string) =>
    supabase
      .from("intranet_config")
      .select(columnas)
      .eq("id", INTRANET_CONFIG_ID)
      .maybeSingle();

  let { data, error } = await leer(`${COLUMNAS_BASE}, response_templates`);

  // Migración sin aplicar: se relee sin la columna nueva. El cotizador queda
  // usable igual; lo único que no habrá son plantillas guardadas.
  if (error && esColumnaFaltante(error)) {
    ({ data, error } = await leer(COLUMNAS_BASE));
  }

  if (error) throw error;

  const row = asRecord(data);

  return {
    cotizador: normalizeCotizadorConfig(row.cotizador),
    responseTemplates: normalizeQuoteResponseTemplates(row.response_templates),
    // Sin fila asumimos NO confirmado: el default seguro es mostrar el aviso.
    preciosConfirmados: row.precios_confirmados === true,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

/* =======================
   ESCRITURA (solo is_super)
======================= */

export async function saveCotizadorConfig(
  cotizador: CotizadorConfig,
  preciosConfirmados: boolean
): Promise<IntranetConfig> {
  const { data, error } = await supabase.rpc("set_intranet_cotizador_config", {
    p_cotizador: serializeCotizadorConfig(cotizador),
    p_precios_confirmados: preciosConfirmados,
  });

  if (error) throw error;

  const res = asRecord(data);
  if (res.success !== true) {
    throw new Error(String(res.error ?? "No se pudo guardar la configuración"));
  }

  return {
    cotizador: normalizeCotizadorConfig(res.cotizador),
    responseTemplates: normalizeQuoteResponseTemplates(res.response_templates),
    preciosConfirmados: res.precios_confirmados === true,
    updatedAt: typeof res.updated_at === "string" ? res.updated_at : null,
  };
}

export async function saveQuoteResponseTemplates(
  templates: QuoteResponseTemplates
): Promise<QuoteResponseTemplates> {
  const { data, error } = await supabase.rpc("set_intranet_response_templates", {
    p_response_templates: templates,
  });
  if (error) throw error;
  const res = asRecord(data);
  if (res.success !== true) throw new Error(String(res.error ?? "No se pudo guardar la plantilla"));
  return normalizeQuoteResponseTemplates(res.response_templates);
}

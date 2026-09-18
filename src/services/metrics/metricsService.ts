import type { MetricsOverview, MetricsQuery, MetricsResponse } from "./types";

/**
 * Métricas — el único punto que habla con ORIGEN.
 *
 * Endpoint de solo lectura del Apps Script de la planilla ORIGEN
 * ESCAPE. Ver `docs/apps-script/README.md` para el contrato y para la
 * lista de métricas que todavía llegan en `null`.
 *
 * El filtrado se hace SIEMPRE del lado de ORIGEN: se le mandan `from`
 * y `to` y se muestra lo que devuelve. No se baja todo para recortar
 * acá — la planilla es la fuente de verdad y el panel no puede tener
 * su propia opinión sobre qué entra en un período.
 *
 * ────────────────────────────────────────────────────────────────
 * TODO (seguridad): el token viaja como parámetro de la URL, así que
 * termina en el historial del navegador y en cualquier log intermedio.
 * Es aceptable para esta etapa interna, no para producción abierta.
 *
 * Cuando se cierre esta etapa hay que moverlo a una Edge Function de
 * Supabase que lo guarde del lado del servidor y haga de proxy —el
 * mismo patrón que ya usa `recontactos-api`—. El día que eso exista,
 * lo único que cambia es `METRICS_URL` y se borra el token del `.env`;
 * el resto del archivo queda igual.
 *
 * No va como header `Authorization` a propósito: eso dispara un
 * preflight OPTIONS que Apps Script no sabe contestar (no existe
 * `doOptions`) y el fetch fallaría desde el navegador aunque con curl
 * funcione.
 * ────────────────────────────────────────────────────────────────
 */

const METRICS_URL = (import.meta.env.VITE_METRICS_API_URL as string | undefined)?.trim();
const METRICS_TOKEN = (import.meta.env.VITE_METRICS_TOKEN as string | undefined)?.trim();

/** Error con un mensaje pensado para mostrarse en pantalla. */
export class MetricsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricsError";
  }
}

/** ¿Está configurado? Sirve para explicar la falta en vez de tirar un fetch a la nada. */
export function metricsConfigurado(): boolean {
  return Boolean(METRICS_URL && METRICS_TOKEN);
}

/**
 * Trae todo lo que necesita la sección Métricas en una sola lectura.
 *
 * Los cinco parámetros van solo si tienen valor. Lo que no se manda,
 * no filtra: sin fechas ORIGEN usa su ventana por defecto —la misma
 * que la hoja PANEL— y sin `branch`/`channel`/`campaign` devuelve el
 * universo entero.
 *
 * Un solo request con todos los filtros activos. Nada se recorta acá:
 * si el panel filtrara arrays por su cuenta, `summary` —que se calcula
 * del otro lado— dejaría de cerrar con las tablas.
 */
export async function getMetrics(query: MetricsQuery = {}): Promise<MetricsOverview> {
  if (!METRICS_URL || !METRICS_TOKEN) {
    throw new MetricsError(
      "Faltan VITE_METRICS_API_URL y VITE_METRICS_TOKEN en el archivo .env."
    );
  }

  const url = new URL(METRICS_URL);
  const params: URLSearchParams = url.searchParams;
  params.set("action", "metrics");
  params.set("token", METRICS_TOKEN);

  // Un valor vacío se omite en vez de mandarse: `branch=` significaría
  // lo mismo que no mandarlo, pero ensucia la URL y la caché del otro
  // lado. "Todas las sucursales" es la ausencia del parámetro.
  (["from", "to", "branch", "channel", "campaign"] as const).forEach((clave) => {
    const valor = query[clave];
    if (valor) params.set(clave, valor);
  });

  let respuesta: Response;
  try {
    // Apps Script contesta con un redirect a googleusercontent.com;
    // `follow` es el default pero se deja explícito porque sin eso el
    // endpoint no funciona y no es obvio por qué.
    respuesta = await fetch(url.toString(), { method: "GET", redirect: "follow" });
  } catch {
    throw new MetricsError("No se pudo contactar al servidor de métricas.");
  }

  if (!respuesta.ok) {
    throw new MetricsError(`El servidor de métricas respondió ${respuesta.status}.`);
  }

  let cuerpo: MetricsResponse;
  try {
    cuerpo = (await respuesta.json()) as MetricsResponse;
  } catch {
    // Pasa cuando el deployment pide login: Apps Script devuelve HTML
    // en vez de JSON. El mensaje apunta a la causa real.
    throw new MetricsError(
      "La respuesta no es JSON. Revisá que el deployment esté publicado con acceso a cualquier persona."
    );
  }

  if (!cuerpo || cuerpo.ok !== true) {
    const detalle = (cuerpo && "error" in cuerpo && cuerpo.error) || "error desconocido";
    throw new MetricsError(`ORIGEN rechazó la consulta: ${detalle}`);
  }

  // Se arma el objeto campo por campo en vez de sacarle el `ok` con un
  // rest: así queda a la vista qué bloques consume el panel, y si
  // ORIGEN agrega uno nuevo hay que venir acá a habilitarlo.
  return {
    period: cuerpo.period,
    filters: cuerpo.filters,
    filter_options: cuerpo.filter_options,
    summary: cuerpo.summary,
    sources: cuerpo.sources,
    branches: cuerpo.branches,
    campaigns: cuerpo.campaigns,
    ads_detail: cuerpo.ads_detail,
    daily: cuerpo.daily,
    diagnostico: cuerpo.diagnostico,
  };
}

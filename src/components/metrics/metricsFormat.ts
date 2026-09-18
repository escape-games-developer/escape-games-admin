/**
 * Formato de números y fechas del módulo Métricas.
 *
 * Vive del lado de la vista a propósito: ORIGEN devuelve números
 * crudos y el formato es una decisión de presentación. Todo en es-AR,
 * que es como el equipo lee los reportes: punto para miles, coma para
 * decimales.
 */

/** Lo que se dibuja cuando ORIGEN no puede calcular una métrica. */
export const SIN_DATO = "—";

const numberFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/** 1041 → "1.041" */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/**
 * 1801800 → "$1.801.800"
 *
 * `Intl` con currency ARS devuelve "$ 1.801.800" (con espacio duro) y
 * en algunos entornos "ARS 1.801.800". Se normaliza a mano para que la
 * tabla y las cards se vean iguales en cualquier navegador.
 */
export function formatCurrency(value: number): string {
  return currencyFormatter
    .format(value)
    .replace(/^ARS\s*/, "$")
    .replace(/^\$\s+/, "$");
}

/**
 * 35.6 → "35,6%"
 *
 * Recibe el porcentaje YA multiplicado, que es como lo manda ORIGEN en
 * `sources.*.share`. Sin decimales innecesarios: 21 sale "21%", no
 * "21,0%".
 */
export function formatPercent(value: number, decimals = 1): string {
  const redondeado = Math.round(value * 10 ** decimals) / 10 ** decimals;
  return `${new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: decimals,
  }).format(redondeado)}%`;
}

/** 6.81 → "6,81x" */
export function formatRoas(value: number, decimals = 2): string {
  return `${new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: decimals,
  }).format(value)}x`;
}

/**
 * EL GUARDIÁN DEL null.
 *
 * `null` significa "ORIGEN no lo puede calcular" y `0` significa "lo
 * calculó y da cero". Son cosas distintas y no se muestran igual.
 *
 * Todo lo que pueda venir en `null` pasa por acá. Es lo que evita el
 * `valor || 0` de siempre, que convertiría "no lo sabemos" en "es
 * cero" — justo el error que haría que el panel mienta.
 */
export function orDash(
  value: number | null | undefined,
  format: (n: number) => string = formatNumber
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return SIN_DATO;
  return format(value);
}

/**
 * Parseo de "yyyy-mm-dd" a mano.
 *
 * `new Date("2026-09-01")` se interpreta como UTC y en Argentina
 * (UTC-3) cae el 31/08: el eje del gráfico quedaría corrido un día
 * entero. Construyendo la fecha con sus partes queda en hora local y
 * eso no pasa.
 */
function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** "2026-09-01" → "01/09" — etiqueta del eje X. */
export function formatDayLabel(iso: string): string {
  const date = parseIsoDate(iso);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-09-01" → "01/09/2026" */
export function formatFullDate(iso: string): string {
  const date = parseIsoDate(iso);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

/** "2026-09-17T21:40:00.000Z" → "17/09/2026 18:40" */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return SIN_DATO;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()} ${hh}:${mi}`;
}

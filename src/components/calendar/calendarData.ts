import type { CSSProperties } from "react";
import type { RangeReservation } from "../../lib/reservations";

/**
 * Utilidades del Calendario de reservas. Las fechas se manejan como día de
 * trabajo (YYYY-MM-DD, de 6:00 a 6:00): la base ya devuelve cada reserva con
 * su `dia`, así que acá no se convierte ninguna hora.
 */

export type ViewMode = "month" | "week" | "day";

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

/** Lunes de la semana de `date`. */
export function startOfWeek(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}

/** Días que muestra cada vista. Mes: las semanas completas (lunes a domingo) que toca el mes, 4 a 6. */
export function visibleDays(date: Date, view: ViewMode): Date[] {
  if (view === "day") return [new Date(date.getFullYear(), date.getMonth(), date.getDate())];
  if (view === "week") {
    const first = startOfWeek(date);
    return Array.from({ length: 7 }, (_, i) => addDays(first, i));
  }
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const lastOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const first = startOfWeek(firstOfMonth);
  const weeks = Math.ceil((((firstOfMonth.getDay() + 6) % 7) + lastOfMonth.getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(first, i));
}

// ------------------------------------------------------------------
// Colores por sucursal
// ------------------------------------------------------------------

/**
 * Un color fijo por sucursal, el mismo para todos los usuarios y en las tres
 * vistas. Las sucursales conocidas tienen su color asignado a mano (tonos bien
 * separados sobre fondo oscuro); una nueva toma uno de la paleta según su
 * nombre. Sin sucursal (Hell Experiment): gris.
 */
const BRANCH_COLORS: Record<string, string> = {
  almagro: "#4d94ff",
  bariloche: "#22c3d6",
  caballito: "#3ecf8e",
  "la plata": "#b07cff",
  nunez: "#ff5c5c",
  palermo: "#f2d14b",
  saavedra: "#ff7ac6",
  salta: "#c9a27a",
  "san telmo": "#ff8a3d",
  studios: "#a8d94a",
  urquiza: "#7f9cc0",
};
const FALLBACK_COLORS = ["#4d94ff", "#22c3d6", "#3ecf8e", "#a8d94a", "#f2d14b", "#ff8a3d", "#ff5c5c", "#ff7ac6", "#b07cff", "#7f9cc0", "#c9a27a"];
export const NO_BRANCH_COLOR = "#8a94a6";

const normName = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^\s*eg\s+/, "").replace(/\s+/g, " ").trim();

export function branchColor(name: string | null | undefined): string {
  if (!name) return NO_BRANCH_COLOR;
  const key = normName(name);
  if (BRANCH_COLORS[key]) return BRANCH_COLORS[key];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

/** Color de una reserva: por su sucursal de la app; si no tiene, gris. */
export function itemColor(item: RangeReservation): string {
  return item.branch_id ? branchColor(item.branch_name) : NO_BRANCH_COLOR;
}

/** Variable CSS --eg-branch para pintar con el color de la sucursal. */
export function branchStyle(color: string, extra?: CSSProperties): CSSProperties {
  return { ...extra, ["--eg-branch" as string]: color } as CSSProperties;
}

/** Cuántos elementos de alto fijo entran en `available` px (con `gap` entre ellos). */
export function fitCount(available: number, itemHeight: number, gap: number): number {
  if (!Number.isFinite(available) || available <= 0) return 0;
  return Math.max(0, Math.floor((available + gap) / (itemHeight + gap)));
}

export function groupByDay(items: RangeReservation[]): Map<string, RangeReservation[]> {
  const map = new Map<string, RangeReservation[]>();
  for (const item of items) {
    const list = map.get(item.dia);
    if (list) list.push(item);
    else map.set(item.dia, [item]);
  }
  return map;
}

/** pending: nadie validó · partial: algunos · done: todos los jugadores. */
export type ValidationState = "pending" | "partial" | "done";

export function validationState(r: RangeReservation): ValidationState {
  if (!r.validados) return "pending";
  if (r.participantes && r.validados >= r.participantes) return "done";
  return "partial";
}

export const validationLabel: Record<ValidationState, string> = {
  pending: "Sin validar",
  partial: "Validada en parte",
  done: "Validada",
};

export function summarize(items: RangeReservation[]) {
  let jugadores = 0;
  let validados = 0;
  for (const r of items) {
    jugadores += r.participantes ?? 0;
    validados += r.validados;
  }
  return { reservas: items.length, jugadores, validados };
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("es-AR")} ${n === 1 ? one : many}`;
}

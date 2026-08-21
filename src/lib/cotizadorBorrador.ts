import type { PromoKey } from "./cotizador";

/**
 * Borrador del asesor: lo que está cargando en el cotizador ahora mismo.
 *
 * OJO con la regla de "no usar LocalStorage": esa vale para los VALORES BASE,
 * que son del equipo y tienen que salir siempre del servidor. Esto es otra
 * cosa — es estado de pantalla, personal, que no se comparte con nadie.
 * Guardarlo acá es lo que hace que cambiar de sección o de solapa no le borre
 * el trabajo al asesor. Ningún precio se cachea: `intranetConfig.ts` sigue
 * pidiendo la config en cada carga.
 *
 * Se limpia al cerrar sesión (ver la lista de claves en AdminLayout), así un
 * cambio de usuario en la misma máquina no hereda el borrador del anterior.
 */

export const BORRADOR_KEY = "eg_cotizador_borrador_v1";

export type TipoEvento = "escaparty" | "social";
export type Modalidad = "infantil" | "adulto";
export type RangoEdad = "10-12" | "13-16";

export type Borrador = {
  tipo: TipoEvento;
  modalidad: Modalidad;
  edad: RangoEdad;
  invitados: string;
  sinGastronomia: string;
  conGastronomia: string;
  promo: PromoKey;
  participantes: string;
};

export const esTipo = (v: unknown): v is TipoEvento => v === "escaparty" || v === "social";
export const esModalidad = (v: unknown): v is Modalidad => v === "infantil" || v === "adulto";
export const esEdad = (v: unknown): v is RangoEdad => v === "10-12" || v === "13-16";
export const esPromo = (v: unknown): v is PromoKey =>
  v === "pack_familiar" || v === "promo_amigos" || v === "sin_descuento";

/** Un campo vacío cuenta como "sin guardar": así vuelve al default de config. */
export const tieneTexto = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "";

export function leerBorrador(): Partial<Borrador> {
  try {
    const raw = localStorage.getItem(BORRADOR_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Partial<Borrador>)
      : {};
  } catch {
    // JSON roto o storage bloqueado (modo privado): se arranca de cero.
    return {};
  }
}

export function guardarBorrador(borrador: Borrador): void {
  try {
    localStorage.setItem(BORRADOR_KEY, JSON.stringify(borrador));
  } catch {
    // Storage lleno o bloqueado: el cotizador funciona igual, sin memoria.
  }
}

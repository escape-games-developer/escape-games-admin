import { supabase } from "./supabase";

/**
 * Reservas web (WooCommerce → hoja VENTAS ONLINE → Supabase) para el
 * Calendario. Todo pasa por funciones SECURITY DEFINER de la base: un GM solo
 * ve su propia sucursal, y eso lo hace cumplir la base, no esta pantalla.
 *
 * La validación de salas por el GM (admin_validate_room, admin_search_clients,
 * admin_reservations_for_day) sigue en la base pero no tiene pantalla: la
 * sección "Reservas del día" se quitó del panel el 09/11/2026.
 */

/** Fila liviana del calendario (admin_reservations_range). Sin datos de contacto. */
export type RangeReservation = {
  /** Clave única: sucursal + pedido ("nunez|WC-4702"). Cada sucursal numera sus pedidos por su cuenta. */
  reserva_id: string;
  /** Número de pedido de WooCommerce, para mostrar. Se repite entre sucursales. */
  referencia: string;
  /** Día de trabajo (6:00 a 6:00), YYYY-MM-DD. */
  dia: string;
  visit_at: string | null;
  branch_id: string | null;
  branch_name: string | null;
  room_id: string | null;
  sala: string | null;
  participantes: number | null;
  nombre: string | null;
  validados: number;
};

export type BranchOption = { id: string; name: string };

/**
 * Día de trabajo en Argentina como YYYY-MM-DD. Va de 6:00 a 6:00: los turnos
 * de trasnoche (00:15, 01:30) son del día anterior. La base usa el mismo corte
 * (admin_reservations_range). El panel puede abrirse con otra zona horaria.
 */
export function todayArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - 6 * 3600 * 1000));
}

export function timeArgentina(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** Reservas pagadas entre dos días de trabajo (inclusive, máximo 62 días). */
export async function fetchRangeReservations(from: string, to: string, branchId: string | null): Promise<RangeReservation[]> {
  const { data, error } = await supabase.rpc("admin_reservations_range", {
    p_from: from,
    p_to: to,
    p_branch_id: branchId,
  });
  if (error) throw new Error(describeError(error.message));
  return Array.isArray(data) ? (data as RangeReservation[]) : [];
}

export async function fetchActiveBranches(): Promise<BranchOption[]> {
  const { data, error } = await supabase.from("branches").select("id,name").eq("active", true).order("name");
  if (error) throw error;
  return (data ?? []) as BranchOption[];
}

/** Los códigos de error de la base, en palabras. */
const MENSAJES: Record<string, string> = {
  no_autorizado: "Tu usuario no tiene permiso para esto.",
  gm_sin_sucursal: "Tu usuario de GM no tiene sucursal asignada. Pedile a un administrador que la cargue.",
  rango_invalido: "El rango de fechas no es válido.",
  rango_demasiado_largo: "El rango de fechas es demasiado largo.",
};

function describeError(message: string): string {
  for (const [code, text] of Object.entries(MENSAJES)) {
    if (message.includes(code)) return text;
  }
  if (/function .* does not exist|Could not find the function/i.test(message)) {
    return "Falta aplicar la migración de reservas en Supabase.";
  }
  return message || "No se pudo completar la operación.";
}

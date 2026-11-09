import { supabase } from "./supabase";

/**
 * Reservas web (WooCommerce → hoja VENTAS ONLINE → Supabase) y validación de
 * salas por el GM. Todo pasa por funciones SECURITY DEFINER de la base
 * (migración 20261109180000_web_reservations.sql): un GM solo ve y valida su
 * propia sucursal, y eso lo hace cumplir la base, no esta pantalla.
 */

export type ValidatedPlayer = {
  user_id: string;
  nombre: string;
  alias: string | null;
  room_id: string;
  completed_at: string;
};

export type DayReservation = {
  referencia: string;
  estado: string;
  visit_date: string;
  visit_at: string | null;
  servicio: string | null;
  sala_texto: string | null;
  room_id: string | null;
  room_name: string | null;
  participantes: number | null;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  cupon: string | null;
  branch_id: string | null;
  branch_name: string | null;
  buyer_user_id: string | null;
  buyer_alias: string | null;
  validados: ValidatedPlayer[];
};

export type ClientHit = {
  id: string;
  nombre: string | null;
  apellido: string | null;
  alias: string | null;
  mail: string | null;
  photo_url: string | null;
};

export type BranchOption = { id: string; name: string };
export type RoomOption = { id: string; name: string; branch_id: string | null };

/**
 * Día de trabajo en Argentina como YYYY-MM-DD. Va de 6:00 a 6:00: los turnos
 * de trasnoche (00:15, 01:30) son del día anterior. La base usa el mismo corte
 * (admin_reservations_for_day). El panel puede abrirse con otra zona horaria.
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
  }).format(new Date(iso));
}

export async function fetchDayReservations(date: string, branchId: string | null): Promise<DayReservation[]> {
  const { data, error } = await supabase.rpc("admin_reservations_for_day", {
    p_date: date,
    p_branch_id: branchId,
  });
  if (error) throw new Error(describeError(error.message));
  return Array.isArray(data) ? (data as DayReservation[]) : [];
}

export async function searchClients(q: string): Promise<ClientHit[]> {
  const { data, error } = await supabase.rpc("admin_search_clients", { p_q: q });
  if (error) throw new Error(describeError(error.message));
  return (data ?? []) as ClientHit[];
}

export async function validateRoom(args: {
  userId: string;
  roomId: string;
  keys: number;
  reservationRef: string | null;
}): Promise<{ room: string; keys: number }> {
  const { data, error } = await supabase.rpc("admin_validate_room", {
    p_user_id: args.userId,
    p_room_id: args.roomId,
    p_keys: args.keys,
    p_reservation_ref: args.reservationRef,
  });
  if (error) throw new Error(describeError(error.message));
  const out = (data ?? {}) as { room?: string; keys?: number };
  return { room: out.room ?? "", keys: out.keys ?? args.keys };
}

export async function fetchActiveBranches(): Promise<BranchOption[]> {
  const { data, error } = await supabase.from("branches").select("id,name").eq("active", true).order("name");
  if (error) throw error;
  return (data ?? []) as BranchOption[];
}

export async function fetchActiveRooms(branchId: string | null): Promise<RoomOption[]> {
  let query = supabase.from("rooms_v2").select("id,name,branch_id").eq("active", true).order("name");
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as RoomOption[];
}

/** Los códigos de error de la base, en palabras para el GM. */
const MENSAJES: Record<string, string> = {
  no_autorizado: "Tu usuario no tiene permiso para esto.",
  gm_sin_sucursal: "Tu usuario de GM no tiene sucursal asignada. Pedile a un administrador que la cargue.",
  sala_invalida: "Esa sala no existe o está inactiva.",
  sala_de_otra_sucursal: "Esa sala es de otra sucursal.",
  reserva_inexistente: "No se encontró la reserva.",
  reserva_no_pagada: "La reserva no está pagada.",
  reserva_de_otra_sucursal: "La sala elegida no es de la sucursal de la reserva.",
  reserva_fuera_de_fecha: "Solo se pueden validar reservas de hoy o de los últimos 7 días.",
  reserva_completa: "Ya se validaron todos los jugadores de esta reserva.",
  cliente_inexistente: "No se encontró el cliente.",
  no_es_cliente: "Ese usuario no es un cliente.",
  sala_ya_validada: "Este cliente ya tenía esta sala validada.",
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

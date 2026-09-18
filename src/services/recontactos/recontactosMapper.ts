import { RECONTACTO_ESTADOS, type Recontacto, type RecontactoEstado } from "./types";

type UnknownRecord = Record<string, unknown>;
const text = (value: unknown) => value == null ? "" : String(value).trim();
const nullable = (value: unknown) => text(value) || null;
const numberOrNull = (value: unknown) => { const valueNumber = Number(String(value ?? "").replace(/[^0-9.,-]/g, "").replace(",", ".")); return Number.isFinite(valueNumber) ? valueNumber : null; };

/** Última defensa del cliente: normaliza el contrato del backend sin depender del orden de columnas. */
export function normalizeRecontacto(value: unknown): Recontacto {
  const row = (value && typeof value === "object" ? value : {}) as UnknownRecord;
  const rawStatus = text(row.estado);
  const estado: RecontactoEstado = RECONTACTO_ESTADOS.includes(rawStatus as RecontactoEstado) ? rawStatus as RecontactoEstado : "Pendiente";
  return {
    id: text(row.id), nombre: text(row.nombre) || "Sin nombre", whatsapp: text(row.whatsapp),
    fechaContacto: nullable(row.fechaContacto), asesorAsignado: nullable(row.asesorAsignado), fechaFestejo: nullable(row.fechaFestejo),
    edad: numberOrNull(row.edad), invitados: numberOrNull(row.invitados), salas: Array.isArray(row.salas) ? row.salas.map(text).filter(Boolean) : text(row.salas).split(/[,;|]/).map((v) => v.trim()).filter(Boolean),
    presupuesto: nullable(row.presupuesto), fechaReserva: nullable(row.fechaReserva),
    intentos: Array.isArray(row.intentos) ? row.intentos.slice(0, 3).map(nullable).concat([null, null, null]).slice(0, 3) : [null, null, null],
    estado, notas: nullable(row.notas), proximoRecontacto: nullable(row.proximoRecontacto), ultimaGestion: nullable(row.ultimaGestion), resultadoUltimaGestion: nullable(row.resultadoUltimaGestion),
  };
}

export function normalizeRecontactos(payload: unknown): Recontacto[] {
  if (!Array.isArray(payload)) throw new Error("La respuesta del servicio de Recontactos no es válida.");
  return payload.map(normalizeRecontacto).filter((row) => row.id);
}

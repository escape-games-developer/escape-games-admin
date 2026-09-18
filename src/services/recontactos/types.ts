export const RECONTACTO_ESTADOS = [
  "Pendiente", "Seguimiento", "Sin respuesta", "Respondió", "Interesado",
  "Recontactar", "Reservó", "No interesado", "Otra propuesta",
  "Sin disponibilidad", "Número inválido", "Cerrado sin respuesta",
] as const;

export type RecontactoEstado = (typeof RECONTACTO_ESTADOS)[number];

export type Recontacto = {
  id: string;
  nombre: string;
  whatsapp: string;
  fechaContacto: string | null;
  asesorAsignado: string | null;
  fechaFestejo: string | null;
  edad: number | null;
  invitados: number | null;
  salas: string[];
  presupuesto: string | null;
  fechaReserva: string | null;
  intentos: Array<string | null>;
  estado: RecontactoEstado;
  notas: string | null;
  proximoRecontacto: string | null;
  ultimaGestion: string | null;
  resultadoUltimaGestion: string | null;
};

export type RecontactosConfig = {
  enabled: boolean;
  whatsappTemplate: string;
};

export type BranchSheet = {
  branchId: string;
  branchName: string;
  sheetId: string | null;
  sheetName: string;
  sheetTab: string;
  active: boolean;
};

export type RecontactoChanges = Partial<Omit<Recontacto, "id" | "intentos">> & {
  intentos?: Array<string | null>;
};

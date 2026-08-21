import type {
  ChatConversation,
  ChatMessagesByConversation,
  ChatUser,
} from "./chatTypes";

/**
 * Datos simulados del chat interno.
 *
 * Todo lo de acá es descartable: cuando haya backend, este archivo se reemplaza
 * por las queries y ni los componentes ni el store cambian. Por eso no hay
 * ningún objeto suelto dentro del JSX.
 *
 * Las horas se generan relativas al arranque de la sesión para que el listado
 * se vea siempre reciente, no clavado en una fecha del pasado.
 */

/** Minutos hacia atrás desde ahora, en ISO. */
function haceMinutos(minutos: number): string {
  return new Date(Date.now() - minutos * 60_000).toISOString();
}

/** El usuario en sesión. En esta etapa es mock: no se lee la sesión real. */
export const mockChatMe: ChatUser = {
  id: "me",
  name: "Vos",
  role: "Admin General",
  online: true,
};

export const mockChatUsers: ChatUser[] = [
  { id: "u-pablo", name: "Pablo Fernández", role: "GM", branch: "Palermo", online: true },
  { id: "u-laura", name: "Laura Gómez", role: "GM", branch: "Belgrano", online: true },
  { id: "u-martin", name: "Martín Ruiz", role: "Admin", online: false },
  { id: "u-sofia", name: "Sofía Aguirre", role: "GM", branch: "Palermo", online: true },
  { id: "u-diego", name: "Diego Molina", role: "GM", branch: "Belgrano", online: false },
];

export const mockChatChannels: ChatConversation[] = [
  { id: "c-general", kind: "channel", name: "General", unread: 0 },
  { id: "c-palermo", kind: "channel", name: "Palermo", branch: "Palermo", unread: 3 },
  { id: "c-belgrano", kind: "channel", name: "Belgrano", branch: "Belgrano", unread: 0 },
  { id: "c-admin", kind: "channel", name: "Administración", unread: 0 },
];

export const mockChatDirects: ChatConversation[] = [
  { id: "d-pablo", kind: "direct", name: "Pablo Fernández", userId: "u-pablo", unread: 2 },
  { id: "d-laura", kind: "direct", name: "Laura Gómez", userId: "u-laura", unread: 1 },
  { id: "d-martin", kind: "direct", name: "Martín Ruiz", userId: "u-martin", unread: 0 },
  { id: "d-sofia", kind: "direct", name: "Sofía Aguirre", userId: "u-sofia", unread: 0 },
  { id: "d-diego", kind: "direct", name: "Diego Molina", userId: "u-diego", unread: 0 },
];

export const mockChatConversations: ChatConversation[] = [
  ...mockChatChannels,
  ...mockChatDirects,
];

export const mockChatMessages: ChatMessagesByConversation = {
  "d-pablo": [
    { id: "m1", conversationId: "d-pablo", authorId: "u-pablo", text: "¿Confirmamos el cumpleaños de las 20:00?", sentAt: haceMinutos(42) },
    { id: "m2", conversationId: "d-pablo", authorId: "me", text: "Sí, ya quedó confirmado. La familia pagó el anticipo esta mañana.", sentAt: haceMinutos(39) },
    { id: "m3", conversationId: "d-pablo", authorId: "u-pablo", text: "Perfecto 👍", sentAt: haceMinutos(38) },
    { id: "m4", conversationId: "d-pablo", authorId: "u-pablo", text: "¿Confirmamos entonces la reserva del sábado?", sentAt: haceMinutos(6) },
  ],
  "d-laura": [
    { id: "m5", conversationId: "d-laura", authorId: "me", text: "Laura, ¿podés mover el turno de las 18 a las 19?", sentAt: haceMinutos(95) },
    { id: "m6", conversationId: "d-laura", authorId: "u-laura", text: "Perfecto, ya lo modifico.", sentAt: haceMinutos(21) },
  ],
  "d-martin": [
    { id: "m7", conversationId: "d-martin", authorId: "u-martin", text: "Te dejé el informe de la semana en Novedades.", sentAt: haceMinutos(200) },
    { id: "m8", conversationId: "d-martin", authorId: "me", text: "Genial, lo miro en un rato.", sentAt: haceMinutos(190) },
    { id: "m9", conversationId: "d-martin", authorId: "u-martin", text: "Dale, mañana lo revisamos.", sentAt: haceMinutos(185) },
  ],
  "d-sofia": [
    { id: "m10", conversationId: "d-sofia", authorId: "u-sofia", text: "Quedó lista la sala 3 para el evento.", sentAt: haceMinutos(320) },
  ],
  "d-diego": [
    { id: "m11", conversationId: "d-diego", authorId: "me", text: "Diego, acordate de cargar el cierre de caja.", sentAt: haceMinutos(410) },
  ],
  "c-general": [
    { id: "m12", conversationId: "c-general", authorId: "u-martin", text: "Recordatorio: mañana hay reunión de equipo a las 10.", sentAt: haceMinutos(150) },
    { id: "m13", conversationId: "c-general", authorId: "u-laura", text: "Anotado 🙌", sentAt: haceMinutos(140) },
  ],
  "c-palermo": [
    { id: "m14", conversationId: "c-palermo", authorId: "u-pablo", text: "Se trabó la cerradura de la sala 2, ya avisé a mantenimiento.", sentAt: haceMinutos(60) },
    { id: "m15", conversationId: "c-palermo", authorId: "u-sofia", text: "La reemplazamos con la sala 4 mientras tanto.", sentAt: haceMinutos(55) },
    { id: "m16", conversationId: "c-palermo", authorId: "u-pablo", text: "Listo, quedó resuelto para el turno de la tarde.", sentAt: haceMinutos(12) },
  ],
  "c-belgrano": [
    { id: "m17", conversationId: "c-belgrano", authorId: "u-diego", text: "Turno de las 21 completo para el viernes.", sentAt: haceMinutos(260) },
  ],
  "c-admin": [
    { id: "m18", conversationId: "c-admin", authorId: "u-martin", text: "Actualicé los valores base del cotizador.", sentAt: haceMinutos(480) },
  ],
};

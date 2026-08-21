import { createContext, useContext } from "react";
import type { ChatConversation, ChatMessage, ChatUser } from "./chatTypes";

/**
 * Store del chat interno. Solo el contrato y los helpers puros: el provider
 * (que sí es un componente) vive en `ChatProvider.tsx`.
 *
 * Es la única fuente de verdad de la sección, así que la pantalla completa y
 * las ventanas flotantes muestran siempre lo mismo sin sincronizar nada a mano.
 */

/** Cuántas ventanas se muestran abiertas antes de agrupar el resto en “+N”. */
export const MAX_VENTANAS_VISIBLES = 3;

export type ChatConversationView = ChatConversation & {
  /** Último mensaje, para el listado. `null` si la conversación está vacía. */
  lastMessage: ChatMessage | null;
  /** El otro participante, en los directos. */
  user: ChatUser | null;
};

export type ChatStore = {
  me: ChatUser;
  users: ChatUser[];
  /** Ordenadas por actividad, con último mensaje y usuario ya resueltos. */
  conversations: ChatConversationView[];
  getConversation: (id: string) => ChatConversationView | null;
  getMessages: (id: string) => ChatMessage[];
  totalUnread: number;

  sendMessage: (conversationId: string, text: string) => void;
  markRead: (conversationId: string) => void;

  /** Ventanas flotantes: ids en orden de apertura (la última, más a la derecha). */
  openWindowIds: string[];
  minimizedIds: string[];
  openWindow: (conversationId: string) => void;
  closeWindow: (conversationId: string) => void;
  toggleMinimized: (conversationId: string) => void;
};

export const ChatContext = createContext<ChatStore | null>(null);

/** Dentro del árbol del panel. Falla fuerte si falta el provider. */
export function useChat(): ChatStore {
  const store = useContext(ChatContext);
  if (!store) throw new Error("useChat necesita <ChatProvider> arriba en el árbol.");
  return store;
}

/**
 * Para componentes que también se montan fuera del panel (la topbar la usa la
 * vitrina de UI). Sin provider devuelve null y el componente no dibuja nada.
 */
export function useChatOptional(): ChatStore | null {
  return useContext(ChatContext);
}

/* =======================
   Helpers de presentación
======================= */

/** Iniciales para el avatar: "Pablo Fernández" → "PF". */
export function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).slice(0, 2);
  const iniciales = partes.map((parte) => parte[0] ?? "").join("");
  return (iniciales || "?").toUpperCase();
}

/** Hora corta del mensaje: 20:31. */
export function horaDe(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Línea secundaria de una conversación: "GM · Palermo". */
export function subtituloDe(conversacion: ChatConversationView): string {
  if (conversacion.kind === "channel") {
    return conversacion.branch ? `Canal · ${conversacion.branch}` : "Canal";
  }
  const user = conversacion.user;
  if (!user) return "Mensaje directo";
  return user.branch ? `${user.role} · ${user.branch}` : user.role;
}

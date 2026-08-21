import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  mockChatConversations,
  mockChatMe,
  mockChatMessages,
  mockChatUsers,
} from "./chatMockData";
import { ChatContext, type ChatConversationView, type ChatStore } from "./chatStore";
import type { ChatConversation, ChatMessage, ChatMessagesByConversation } from "./chatTypes";
import "./chat.css";

/**
 * Estado del chat interno para toda la sesión del panel.
 *
 * Se monta arriba del router (en AdminLayout), así las ventanas flotantes
 * sobreviven al cambio de ruta: navegar de Calendario a Cotizador no desmonta
 * nada de acá. Es 100% memoria: no hay fetch, ni storage, ni backend.
 */
export default function ChatProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<ChatConversation[]>(mockChatConversations);
  const [messages, setMessages] = useState<ChatMessagesByConversation>(mockChatMessages);
  const [openWindowIds, setOpenWindowIds] = useState<string[]>([]);
  const [minimizedIds, setMinimizedIds] = useState<string[]>([]);

  const usersById = useMemo(() => {
    const mapa = new Map(mockChatUsers.map((user) => [user.id, user]));
    mapa.set(mockChatMe.id, mockChatMe);
    return mapa;
  }, []);

  /** Vista de listado: último mensaje + usuario resueltos, ordenada por actividad. */
  const conversationViews = useMemo<ChatConversationView[]>(() => {
    const vistas = conversations.map((conversacion) => {
      const historial = messages[conversacion.id] ?? [];
      return {
        ...conversacion,
        lastMessage: historial.length ? historial[historial.length - 1] : null,
        user: conversacion.userId ? usersById.get(conversacion.userId) ?? null : null,
      };
    });

    return vistas.sort((a, b) => {
      const fechaA = a.lastMessage ? Date.parse(a.lastMessage.sentAt) : 0;
      const fechaB = b.lastMessage ? Date.parse(b.lastMessage.sentAt) : 0;
      return fechaB - fechaA;
    });
  }, [conversations, messages, usersById]);

  const getConversation = useCallback(
    (id: string) => conversationViews.find((conversacion) => conversacion.id === id) ?? null,
    [conversationViews]
  );

  const getMessages = useCallback((id: string) => messages[id] ?? [], [messages]);

  const totalUnread = useMemo(
    () => conversations.reduce((suma, conversacion) => suma + conversacion.unread, 0),
    [conversations]
  );

  const markRead = useCallback((conversationId: string) => {
    setConversations((actuales) =>
      actuales.some((c) => c.id === conversationId && c.unread > 0)
        ? actuales.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c))
        : actuales
    );
  }, []);

  const sendMessage = useCallback((conversationId: string, text: string) => {
    const limpio = text.trim();
    if (!limpio) return;

    const nuevo: ChatMessage = {
      // Sin backend no hay id de servidor: alcanza con algo único en memoria.
      id: `local-${conversationId}-${Date.now()}`,
      conversationId,
      authorId: mockChatMe.id,
      text: limpio,
      sentAt: new Date().toISOString(),
    };

    setMessages((actuales) => ({
      ...actuales,
      [conversationId]: [...(actuales[conversationId] ?? []), nuevo],
    }));
    // Escribir en una conversación implica haberla leído.
    markRead(conversationId);
  }, [markRead]);

  const openWindow = useCallback((conversationId: string) => {
    setOpenWindowIds((actuales) => {
      // Ya abierta: se trae al frente en vez de duplicarla.
      const resto = actuales.filter((id) => id !== conversationId);
      // No se descarta ninguna: las que no entran se agrupan en el “+N”.
      return [...resto, conversationId];
    });
    setMinimizedIds((actuales) => actuales.filter((id) => id !== conversationId));
    markRead(conversationId);
  }, [markRead]);

  const closeWindow = useCallback((conversationId: string) => {
    // Cerrar es solo dejar de mostrar la ventana: la conversación sigue
    // existiendo en el listado de Chat interno, con todos sus mensajes.
    setOpenWindowIds((actuales) => actuales.filter((id) => id !== conversationId));
    setMinimizedIds((actuales) => actuales.filter((id) => id !== conversationId));
  }, []);

  const toggleMinimized = useCallback((conversationId: string) => {
    setMinimizedIds((actuales) =>
      actuales.includes(conversationId)
        ? actuales.filter((id) => id !== conversationId)
        : [...actuales, conversationId]
    );
    markRead(conversationId);
  }, [markRead]);

  const store = useMemo<ChatStore>(() => ({
    me: mockChatMe,
    users: mockChatUsers,
    conversations: conversationViews,
    getConversation,
    getMessages,
    totalUnread,
    sendMessage,
    markRead,
    openWindowIds,
    minimizedIds,
    openWindow,
    closeWindow,
    toggleMinimized,
  }), [
    conversationViews, getConversation, getMessages, totalUnread, sendMessage,
    markRead, openWindowIds, minimizedIds, openWindow, closeWindow, toggleMinimized,
  ]);

  return <ChatContext.Provider value={store}>{children}</ChatContext.Provider>;
}

/**
 * Contratos del chat interno.
 *
 * Esta etapa es solo UI: los datos salen de `chatMockData.ts` y viven en
 * estado de React. Los tipos están pensados para que, cuando exista backend,
 * alcance con reemplazar el origen de los datos sin tocar los componentes:
 * las fechas son ISO (nunca texto ya formateado) y todo se referencia por id.
 */

export type ChatUserId = string;
export type ChatConversationId = string;

export type ChatUser = {
  id: ChatUserId;
  name: string;
  /** Rol tal como se muestra: "GM", "Admin", "Admin General". */
  role: string;
  /** Sucursal, cuando aplica. Los administradores generales no tienen. */
  branch?: string;
  online: boolean;
};

export type ChatConversation = {
  id: ChatConversationId;
  kind: "channel" | "direct";
  /** Canales: el nombre del canal. Directos: el del otro participante. */
  name: string;
  /** Solo en directos: con quién es la conversación. */
  userId?: ChatUserId;
  /** Solo en canales: a qué sucursal pertenece, si es de una. */
  branch?: string;
  unread: number;
};

export type ChatMessage = {
  id: string;
  conversationId: ChatConversationId;
  authorId: ChatUserId;
  text: string;
  /** ISO 8601. El formato de hora se resuelve al renderizar. */
  sentAt: string;
};

/** Mensajes agrupados por conversación, como los devolvería una query. */
export type ChatMessagesByConversation = Record<ChatConversationId, ChatMessage[]>;

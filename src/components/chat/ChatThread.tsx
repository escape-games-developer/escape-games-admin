import { useEffect, useMemo, useRef } from "react";
import ChatAvatar from "./ChatAvatar";
import ChatComposer from "./ChatComposer";
import ChatMessage from "./ChatMessage";
import { subtituloDe, useChat, type ChatConversationView } from "./chatStore";
import type { ChatUser } from "./chatTypes";

type Props = {
  conversation: ChatConversationView;
  /** Variante para la ventana flotante: sin cabecera propia y más compacto. */
  compact?: boolean;
  /** Acciones extra de la cabecera (minimizar/cerrar en la ventana flotante). */
  headerActions?: React.ReactNode;
  showHeader?: boolean;
};

/**
 * Hilo de conversación: cabecera, mensajes y campo de escritura.
 *
 * Lo usan la pantalla completa y la ventana flotante, así que las dos leen y
 * escriben el mismo estado y nunca se desincronizan.
 */
export default function ChatThread({ conversation, compact = false, headerActions, showHeader = true }: Props) {
  const chat = useChat();
  const mensajes = chat.getMessages(conversation.id);
  const finRef = useRef<HTMLDivElement>(null);

  const usuariosPorId = useMemo(() => {
    const mapa = new Map<string, ChatUser>(chat.users.map((user) => [user.id, user]));
    mapa.set(chat.me.id, chat.me);
    return mapa;
  }, [chat.users, chat.me]);

  // Al abrir y al llegar un mensaje, el hilo queda abajo de todo.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes.length, conversation.id]);

  const presencia = conversation.user
    ? conversation.user.online ? "En línea" : "Desconectado"
    : null;

  return (
    <div className={`eg-chat-thread${compact ? " is-compact" : ""}`}>
      {showHeader && (
        <header className="eg-chat-thread__head">
          <ChatAvatar user={conversation.user} name={conversation.name} size={compact ? "sm" : "md"} />
          <div className="eg-chat-thread__id">
            <strong>{conversation.name}</strong>
            <span>
              {subtituloDe(conversation)}
              {presencia && (
                <>
                  {" · "}
                  <em className={conversation.user?.online ? "is-online" : ""}>{presencia}</em>
                </>
              )}
            </span>
          </div>
          {headerActions && <div className="eg-chat-thread__actions">{headerActions}</div>}
        </header>
      )}

      <div className="eg-chat-thread__messages" role="log" aria-label={`Mensajes con ${conversation.name}`}>
        {mensajes.length === 0 && (
          <p className="eg-chat-thread__empty">Todavía no hay mensajes en esta conversación.</p>
        )}

        {mensajes.map((mensaje, indice) => {
          const anterior = mensajes[indice - 1];
          return (
            <ChatMessage
              key={mensaje.id}
              message={mensaje}
              author={usuariosPorId.get(mensaje.authorId) ?? null}
              mine={mensaje.authorId === chat.me.id}
              showAuthor={!anterior || anterior.authorId !== mensaje.authorId}
            />
          );
        })}
        <div ref={finRef} />
      </div>

      <ChatComposer compact={compact} onSend={(texto) => chat.sendMessage(conversation.id, texto)} />
    </div>
  );
}

import ChatAvatar from "./ChatAvatar";
import ChatThread from "./ChatThread";
import Icon from "../../ui/icons";
import { subtituloDe, useChat, type ChatConversationView } from "./chatStore";

type Props = {
  conversation: ChatConversationView;
  minimized: boolean;
};

/**
 * Ventana de conversación anclada abajo a la derecha.
 *
 * Minimizada queda como una barra con el contador; expandida muestra el mismo
 * `ChatThread` que la pantalla completa, así lo que se escribe en una aparece
 * en la otra sin sincronizar nada.
 */
export default function ChatFloatingWindow({ conversation, minimized }: Props) {
  const chat = useChat();

  const cabecera = (
    <>
      <ChatAvatar user={conversation.user} name={conversation.name} size="sm" />
      <span className="eg-chat-float__id">
        <strong>{conversation.name}</strong>
        <span>{subtituloDe(conversation)}</span>
      </span>
    </>
  );

  if (minimized) {
    return (
      <div className="eg-chat-float is-minimized">
        <button
          type="button"
          className="eg-chat-float__head"
          onClick={() => chat.toggleMinimized(conversation.id)}
          aria-label={`Expandir conversación con ${conversation.name}`}
        >
          {cabecera}
          {conversation.unread > 0 && <span className="eg-chat-badge">{conversation.unread}</span>}
        </button>
        <button
          type="button"
          className="eg-chat-iconbtn eg-chat-float__close"
          onClick={() => chat.closeWindow(conversation.id)}
          aria-label={`Cerrar ventana de ${conversation.name}`}
          title="Cerrar"
        >
          <Icon name="close" size={15} />
        </button>
      </div>
    );
  }

  return (
    <section className="eg-chat-float" aria-label={`Conversación con ${conversation.name}`}>
      <ChatThread
        conversation={conversation}
        compact
        headerActions={
          <>
            <button
              type="button"
              className="eg-chat-iconbtn"
              onClick={() => chat.toggleMinimized(conversation.id)}
              aria-label="Minimizar conversación"
              title="Minimizar"
            >
              <Icon name="minimize" size={15} />
            </button>
            <button
              type="button"
              className="eg-chat-iconbtn"
              onClick={() => chat.closeWindow(conversation.id)}
              aria-label="Cerrar conversación"
              title="Cerrar"
            >
              <Icon name="close" size={15} />
            </button>
          </>
        }
      />
    </section>
  );
}

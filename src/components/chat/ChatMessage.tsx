import { horaDe } from "./chatStore";
import type { ChatMessage as ChatMessageType, ChatUser } from "./chatTypes";

type Props = {
  message: ChatMessageType;
  /** Autor ya resuelto. Null si el mock no lo tiene. */
  author: ChatUser | null;
  mine: boolean;
  /** Se muestra el nombre solo cuando cambia de autor dentro del hilo. */
  showAuthor: boolean;
};

/**
 * Burbuja de mensaje. Propios y ajenos se distinguen por posición y por un
 * fondo apenas distinto — sin colores fuertes, que en un panel oscuro gritan.
 */
export default function ChatMessage({ message, author, mine, showAuthor }: Props) {
  return (
    <div className={`eg-chat-msg${mine ? " is-mine" : ""}`}>
      {showAuthor && !mine && (
        <span className="eg-chat-msg__author">{author?.name ?? "Alguien"}</span>
      )}
      <div className="eg-chat-msg__bubble">
        <p>{message.text}</p>
        <time className="eg-chat-msg__time" dateTime={message.sentAt}>
          {horaDe(message.sentAt)}
        </time>
      </div>
    </div>
  );
}

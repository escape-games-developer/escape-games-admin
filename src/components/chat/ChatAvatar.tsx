import { inicialesDe } from "./chatStore";
import type { ChatUser } from "./chatTypes";

type Props = {
  /** Directos: el usuario. Canales: null y se usa `name`. */
  user?: ChatUser | null;
  name: string;
  size?: "sm" | "md";
  /** Punto de presencia. En canales no aplica. */
  showPresence?: boolean;
};

/**
 * Avatar con iniciales. Usa el mismo molde que `.eg-avatar` del sidebar para
 * que se lea como parte del panel y no como un widget aparte.
 */
export default function ChatAvatar({ user, name, size = "md", showPresence = true }: Props) {
  const esCanal = !user;
  const clase = `eg-chat-avatar eg-chat-avatar--${size}${esCanal ? " eg-chat-avatar--channel" : ""}`;

  return (
    <span className={clase}>
      <span aria-hidden="true">{esCanal ? "#" : inicialesDe(name)}</span>
      {showPresence && user && (
        <span
          className={`eg-chat-presence${user.online ? " is-online" : ""}`}
          title={user.online ? "En línea" : "Desconectado"}
        >
          <span className="eg-sr-only">{user.online ? "En línea" : "Desconectado"}</span>
        </span>
      )}
    </span>
  );
}

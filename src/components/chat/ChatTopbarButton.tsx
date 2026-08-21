import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../ui/icons";
import ChatAvatar from "./ChatAvatar";
import { subtituloDe, useChatOptional } from "./chatStore";

const MAX_EN_DROPDOWN = 4;

/**
 * Indicador de mensajes de la topbar, con su desplegable.
 *
 * Elegir una conversación NO navega: abre la ventana flotante, que es lo que
 * permite seguir trabajando en la sección actual. Solo “Ver todos los mensajes”
 * lleva a la pantalla completa.
 *
 * Usa el hook opcional porque la topbar también se monta fuera del provider:
 * en la vitrina de UI, y en un GM que tenga la sección `chat` apagada (ahí
 * AdminLayout no monta `ChatProvider`). En los dos casos no se dibuja nada,
 * ni el globo ni el contador.
 */
export default function ChatTopbarButton() {
  const chat = useChatOptional();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;

    const alClickear = (evento: MouseEvent) => {
      if (!contenedorRef.current?.contains(evento.target as Node)) setAbierto(false);
    };
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAbierto(false);
    };

    document.addEventListener("mousedown", alClickear);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alClickear);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  if (!chat) return null;

  const conSinLeer = chat.conversations.filter((conversacion) => conversacion.unread > 0);
  const listado = [...conSinLeer, ...chat.conversations.filter((c) => c.unread === 0)].slice(0, MAX_EN_DROPDOWN);

  return (
    <div className="eg-chat-topbar" ref={contenedorRef}>
      <button
        type="button"
        className={`eg-topbar__action${abierto ? " is-active" : ""}`}
        onClick={() => setAbierto((valor) => !valor)}
        aria-expanded={abierto}
        aria-label={
          chat.totalUnread > 0
            ? `Mensajes: ${chat.totalUnread} sin leer`
            : "Mensajes"
        }
        title="Chat interno"
      >
        <Icon name="chat" size={18} />
        {chat.totalUnread > 0 && <span className="eg-chat-topbar__count">{chat.totalUnread}</span>}
      </button>

      {abierto && (
        <div className="eg-chat-dropdown" role="menu">
          <p className="eg-chat-dropdown__title">Mensajes</p>

          <div className="eg-chat-dropdown__list">
            {listado.map((conversacion) => (
              <button
                type="button"
                key={conversacion.id}
                className="eg-chat-dropdown__item"
                onClick={() => {
                  chat.openWindow(conversacion.id);
                  setAbierto(false);
                }}
              >
                <ChatAvatar user={conversacion.user} name={conversacion.name} size="sm" />
                <span className="eg-chat-dropdown__body">
                  <span className="eg-chat-dropdown__top">
                    <strong>{conversacion.name}</strong>
                    <em>{subtituloDe(conversacion)}</em>
                  </span>
                  <span className="eg-chat-dropdown__last">
                    {conversacion.lastMessage?.text ?? "Sin mensajes todavía"}
                  </span>
                </span>
                {conversacion.unread > 0 && <span className="eg-chat-badge">{conversacion.unread}</span>}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="eg-chat-dropdown__all"
            onClick={() => {
              setAbierto(false);
              navigate("/chat");
            }}
          >
            Ver todos los mensajes
          </button>
        </div>
      )}
    </div>
  );
}

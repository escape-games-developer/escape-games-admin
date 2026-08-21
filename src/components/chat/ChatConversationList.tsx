import { useMemo, useState } from "react";
import SearchInput from "../../ui/SearchInput";
import ChatAvatar from "./ChatAvatar";
import { horaDe, subtituloDe, useChat, type ChatConversationView } from "./chatStore";

type Props = {
  activeId: string | null;
  onSelect: (conversationId: string) => void;
};

function coincide(conversacion: ChatConversationView, consulta: string): boolean {
  if (!consulta) return true;
  const texto = [
    conversacion.name,
    conversacion.user?.role ?? "",
    conversacion.user?.branch ?? conversacion.branch ?? "",
    conversacion.lastMessage?.text ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return texto.includes(consulta.trim().toLowerCase());
}

/** Fila del listado. Se reutiliza para canales y directos. */
function Fila({
  conversacion,
  activa,
  onSelect,
}: {
  conversacion: ChatConversationView;
  activa: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`eg-chat-row${activa ? " is-active" : ""}`}
      onClick={() => onSelect(conversacion.id)}
      aria-current={activa ? "true" : undefined}
    >
      <ChatAvatar user={conversacion.user} name={conversacion.name} size="md" />

      <span className="eg-chat-row__body">
        <span className="eg-chat-row__top">
          <strong>{conversacion.name}</strong>
          {conversacion.lastMessage && (
            <time dateTime={conversacion.lastMessage.sentAt}>{horaDe(conversacion.lastMessage.sentAt)}</time>
          )}
        </span>
        <span className="eg-chat-row__role">{subtituloDe(conversacion)}</span>
        <span className="eg-chat-row__last">
          {conversacion.lastMessage?.text ?? "Sin mensajes todavía"}
        </span>
      </span>

      {conversacion.unread > 0 && (
        <span className="eg-chat-badge" title={`${conversacion.unread} sin leer`}>
          {conversacion.unread}
        </span>
      )}
    </button>
  );
}

/**
 * Columna izquierda de la pantalla completa: búsqueda, canales y directos.
 * Solo presenta lo que le da el store; no decide nada de datos.
 */
export default function ChatConversationList({ activeId, onSelect }: Props) {
  const chat = useChat();
  const [consulta, setConsulta] = useState("");

  const { canales, directos } = useMemo(() => {
    const visibles = chat.conversations.filter((conversacion) => coincide(conversacion, consulta));
    return {
      canales: visibles.filter((conversacion) => conversacion.kind === "channel"),
      directos: visibles.filter((conversacion) => conversacion.kind === "direct"),
    };
  }, [chat.conversations, consulta]);

  const vacio = canales.length === 0 && directos.length === 0;

  return (
    <div className="eg-chat-list">
      <div className="eg-chat-list__search">
        <SearchInput
          value={consulta}
          onChange={(event) => setConsulta(event.target.value)}
          placeholder="Buscar conversación..."
          aria-label="Buscar conversación"
        />
      </div>

      <div className="eg-chat-list__scroll">
        {canales.length > 0 && (
          <>
            <p className="eg-chat-list__title">Canales</p>
            {canales.map((conversacion) => (
              <Fila
                key={conversacion.id}
                conversacion={conversacion}
                activa={conversacion.id === activeId}
                onSelect={onSelect}
              />
            ))}
          </>
        )}

        {directos.length > 0 && (
          <>
            <p className="eg-chat-list__title">Mensajes directos</p>
            {directos.map((conversacion) => (
              <Fila
                key={conversacion.id}
                conversacion={conversacion}
                activa={conversacion.id === activeId}
                onSelect={onSelect}
              />
            ))}
          </>
        )}

        {vacio && <p className="eg-chat-list__empty">No hay conversaciones que coincidan.</p>}
      </div>
    </div>
  );
}

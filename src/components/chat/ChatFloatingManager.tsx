import { useEffect, useRef, useState } from "react";
import ChatAvatar from "./ChatAvatar";
import ChatFloatingWindow from "./ChatFloatingWindow";
import { MAX_VENTANAS_VISIBLES, useChat } from "./chatStore";

/**
 * Barra de ventanas flotantes.
 *
 * Vive en el layout, no en una página: por eso sobrevive a cambiar de sección.
 * Muestra hasta `MAX_VENTANAS_VISIBLES` conversaciones; el resto se agrupa en
 * un “+N” que las trae al frente al elegirlas.
 */
export default function ChatFloatingManager() {
  const chat = useChat();
  const [grupoAbierto, setGrupoAbierto] = useState(false);
  const grupoRef = useRef<HTMLDivElement>(null);

  const abiertas = chat.openWindowIds
    .map((id) => chat.getConversation(id))
    .filter((conversacion): conversacion is NonNullable<typeof conversacion> => conversacion !== null);

  // Las últimas abiertas son las visibles; las anteriores caen al “+N”.
  const visibles = abiertas.slice(-MAX_VENTANAS_VISIBLES);
  const agrupadas = abiertas.slice(0, Math.max(0, abiertas.length - MAX_VENTANAS_VISIBLES));

  useEffect(() => {
    if (!grupoAbierto) return;

    const alClickear = (evento: MouseEvent) => {
      if (!grupoRef.current?.contains(evento.target as Node)) setGrupoAbierto(false);
    };
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setGrupoAbierto(false);
    };

    document.addEventListener("mousedown", alClickear);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alClickear);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [grupoAbierto]);

  // Sin ventanas abiertas no se dibuja nada: cero interferencia con la página.
  if (abiertas.length === 0) return null;

  const sinLeerAgrupadas = agrupadas.reduce((suma, conversacion) => suma + conversacion.unread, 0);

  return (
    // `row-reverse` en el CSS: el primero del DOM queda pegado a la esquina.
    // Por eso se dibuja de la más reciente a la más vieja, y el “+N” al final.
    <div className="eg-chat-dock" aria-label="Conversaciones abiertas">
      {[...visibles].reverse().map((conversacion) => (
        <ChatFloatingWindow
          key={conversacion.id}
          conversation={conversacion}
          minimized={chat.minimizedIds.includes(conversacion.id)}
        />
      ))}

      {agrupadas.length > 0 && (
        <div className="eg-chat-dock__group" ref={grupoRef}>
          {grupoAbierto && (
            <div className="eg-chat-dock__menu" role="menu">
              {agrupadas.map((conversacion) => (
                <button
                  type="button"
                  key={conversacion.id}
                  onClick={() => {
                    chat.openWindow(conversacion.id);
                    setGrupoAbierto(false);
                  }}
                >
                  <ChatAvatar user={conversacion.user} name={conversacion.name} size="sm" showPresence={false} />
                  <span>{conversacion.name}</span>
                  {conversacion.unread > 0 && <span className="eg-chat-badge">{conversacion.unread}</span>}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="eg-chat-dock__more"
            onClick={() => setGrupoAbierto((abierto) => !abierto)}
            aria-expanded={grupoAbierto}
            aria-label={`Ver otras ${agrupadas.length} conversaciones abiertas`}
          >
            <span aria-hidden="true">💬</span>
            <strong>+{agrupadas.length}</strong>
            {sinLeerAgrupadas > 0 && <span className="eg-chat-badge">{sinLeerAgrupadas}</span>}
          </button>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Button, Card, EmptyState, PageHeader } from "../ui";
import ChatConversationList from "../components/chat/ChatConversationList";
import ChatThread from "../components/chat/ChatThread";
import { useChat } from "../components/chat/chatStore";

/**
 * Pantalla completa del chat interno: listado a la izquierda, conversación a
 * la derecha. Comparte el store con las ventanas flotantes, así que un mensaje
 * escrito en cualquiera de las dos aparece en la otra.
 */
export default function ChatPage() {
  const chat = useChat();
  // Arranca en la conversación con actividad más reciente. El inicializador
  // corre una sola vez: después manda lo que elija el asesor.
  const [activaId, setActivaId] = useState<string | null>(
    () => chat.conversations[0]?.id ?? null
  );

  const activa = activaId ? chat.getConversation(activaId) : null;

  const seleccionar = (id: string) => {
    setActivaId(id);
    chat.markRead(id);
  };

  return (
    <section className="eg-chat-page">
      <PageHeader
        title="Chat interno"
        subtitle="Conversaciones del equipo por sucursal y mensajes directos."
        action={
          activa ? (
            <Button variant="secondary" icon="chat" onClick={() => chat.openWindow(activa.id)}>
              Abrir en ventana
            </Button>
          ) : undefined
        }
      />

      <Card padding="none" className="eg-chat-card">
        <div className="eg-chat-layout">
          <ChatConversationList activeId={activaId} onSelect={seleccionar} />

          <div className="eg-chat-panel">
            {activa ? (
              <ChatThread conversation={activa} />
            ) : (
              <EmptyState
                icon="chat"
                title="Elegí una conversación"
                description="Seleccioná un canal o un mensaje directo para ver los mensajes."
              />
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}

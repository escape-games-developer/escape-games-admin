import { useRef, useState } from "react";
import Icon from "../../ui/icons";

type Props = {
  onSend: (text: string) => void;
  /** Compacta el alto para la ventana flotante. */
  compact?: boolean;
  placeholder?: string;
};

/** Emojis rápidos. Es un panel simulado: no se instaló ninguna librería. */
const EMOJIS = ["👍", "🎉", "😊", "🙌", "✅", "⚠️", "🔑", "🎂"];

/**
 * Campo de escritura. Enter envía, Shift+Enter hace salto de línea.
 * Adjuntar es visual: en esta etapa no sube nada a ningún lado.
 */
export default function ChatComposer({ onSend, compact = false, placeholder = "Escribí un mensaje..." }: Props) {
  const [texto, setTexto] = useState("");
  const [emojisAbiertos, setEmojisAbiertos] = useState(false);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  const enviar = () => {
    if (!texto.trim()) return;
    onSend(texto);
    setTexto("");
    setEmojisAbiertos(false);
    campoRef.current?.focus();
  };

  const insertarEmoji = (emoji: string) => {
    setTexto((actual) => `${actual}${emoji}`);
    setEmojisAbiertos(false);
    campoRef.current?.focus();
  };

  return (
    <div className={`eg-chat-composer${compact ? " is-compact" : ""}`}>
      {emojisAbiertos && (
        <div className="eg-chat-composer__emojis" role="menu" aria-label="Insertar emoji">
          {EMOJIS.map((emoji) => (
            <button type="button" key={emoji} onClick={() => insertarEmoji(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={campoRef}
        className="eg-chat-composer__field"
        rows={1}
        value={texto}
        placeholder={placeholder}
        aria-label="Escribir mensaje"
        onChange={(event) => setTexto(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            enviar();
          }
        }}
      />

      <div className="eg-chat-composer__actions">
        <button
          type="button"
          className={`eg-chat-iconbtn${emojisAbiertos ? " is-active" : ""}`}
          aria-label="Insertar emoji"
          aria-expanded={emojisAbiertos}
          title="Emoji"
          onClick={() => setEmojisAbiertos((abierto) => !abierto)}
        >
          <Icon name="emoji" size={17} />
        </button>

        {/* Visual por ahora: la subida de archivos llega con el backend. */}
        <button type="button" className="eg-chat-iconbtn" aria-label="Adjuntar archivo" title="Adjuntar (próximamente)">
          <Icon name="attach" size={17} />
        </button>

        <button
          type="button"
          className="eg-chat-iconbtn eg-chat-iconbtn--send"
          aria-label="Enviar mensaje"
          title="Enviar"
          disabled={!texto.trim()}
          onClick={enviar}
        >
          <Icon name="send" size={17} />
        </button>
      </div>
    </div>
  );
}

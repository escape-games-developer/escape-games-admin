import { useEffect, useRef, useState } from "react";
import Icon from "../../ui/icons";
import { useInstall } from "../../lib/pwa";

/**
 * Botón "Instalar" de la barra superior.
 *   · Chrome / Edge / Android: abre el diálogo de instalación del navegador.
 *   · iPhone / iPad (Safari): explica cómo agregarlo a la pantalla de inicio.
 *   · Ya instalada, o el navegador no lo permite: no se muestra.
 */
export default function InstallButton() {
  const { status, install } = useInstall();
  const [help, setHelp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!help) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setHelp(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [help]);

  if (status === "installed" || status === "none") return null;

  return (
    <div ref={ref} className="eg-install">
      <button
        type="button"
        className="eg-install__btn"
        onClick={() => (status === "prompt" ? void install() : setHelp(!help))}
        title="Instalar el panel como app en este equipo"
      >
        <Icon name="download" size={16} />
        <span>Instalar app</span>
      </button>
      {help && (
        <div className="eg-install__help" role="dialog" aria-label="Cómo instalar">
          <strong>Instalar en iPhone / iPad</strong>
          <ol>
            <li>Tocá el botón <b>Compartir</b> de Safari (el cuadrado con la flecha).</li>
            <li>Elegí <b>Agregar a pantalla de inicio</b>.</li>
            <li>Tocá <b>Agregar</b>.</li>
          </ol>
        </div>
      )}
    </div>
  );
}

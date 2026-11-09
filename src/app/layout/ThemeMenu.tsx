import { useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "../../ui/icons";
import { useTheme, type ThemePref } from "../../lib/theme";

const OPTIONS: { value: ThemePref; label: string; icon: IconName }[] = [
  { value: "dark", label: "Oscuro", icon: "moon" },
  { value: "light", label: "Claro", icon: "sun" },
  { value: "system", label: "Del sistema", icon: "monitor" },
];

/** Botón de la barra superior para elegir el tema: oscuro, claro o el del sistema. */
export default function ThemeMenu() {
  const [pref, setPref] = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = OPTIONS.find((o) => o.value === pref) ?? OPTIONS[0];

  return (
    <div ref={ref} className="eg-theme-menu">
      <button
        type="button"
        className="eg-topbar__action"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tema: ${current.label}`}
        title={`Tema: ${current.label}`}
      >
        <Icon name={current.icon} size={18} />
      </button>
      {open && (
        <div className="eg-theme-menu__list" role="menu" aria-label="Tema">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={pref === o.value}
              className={pref === o.value ? "is-active" : ""}
              onClick={() => { setPref(o.value); setOpen(false); }}
            >
              <Icon name={o.icon} size={16} />
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

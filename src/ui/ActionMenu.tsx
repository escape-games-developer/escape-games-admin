import { useEffect, useId, useRef, useState } from "react";
import Icon, { type IconName } from "./icons";

export type ActionMenuItem = {
  key: string;
  label: string;
  icon?: IconName;
  /** Pinta la opción en rojo. Para Borrar / Eliminar. */
  danger?: boolean;
  disabled?: boolean;
  /** Separador por encima de esta opción. */
  separatorBefore?: boolean;
  onSelect: () => void;
};

type Props = {
  items: ActionMenuItem[];
  /** Alineación del panel respecto del botón. */
  align?: "left" | "right";
  label?: string;
};

/**
 * Menú contextual `⋯` compartido por todas las tablas.
 *
 * Es puramente presentacional: no sabe qué hace cada acción, solo llama al
 * `onSelect` que le pasa la vista. Los handlers siguen viviendo en la página.
 */
export default function ActionMenu({ items, align = "right", label = "Acciones" }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const select = (item: ActionMenuItem) => {
    if (item.disabled) return;
    setOpen(false);
    item.onSelect();
  };

  return (
    <div className="eg-actions" ref={rootRef}>
      <button
        type="button"
        className={`eg-actions__trigger${open ? " is-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="dots" size={16} />
      </button>

      {open && (
        <div id={menuId} role="menu" className={`eg-actions__menu eg-actions__menu--${align}`}>
          {items.map((item) => (
            <div key={item.key}>
              {item.separatorBefore && <div className="eg-actions__sep" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className={`eg-actions__item${item.danger ? " is-danger" : ""}`}
                disabled={item.disabled}
                onClick={() => select(item)}
              >
                {item.icon && <Icon name={item.icon} size={15} />}
                <span>{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

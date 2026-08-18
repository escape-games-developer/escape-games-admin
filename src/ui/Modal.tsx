import { useEffect, useId, type ReactNode } from "react";
import Icon from "./icons";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  panelClassName?: string;
  onClose: () => void;
};

export default function Modal({ open, title, description, headerActions, children, footer, size = "md", panelClassName = "", onClose }: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="eg-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`eg-modal__panel eg-modal__panel--${size} ${panelClassName}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="eg-modal__header">
          <div className="eg-modal__heading">
            <h2 id={titleId} className="eg-modal__title">{title}</h2>
            {description && <p className="eg-modal__description">{description}</p>}
          </div>
          {headerActions && <div className="eg-modal__header-actions">{headerActions}</div>}
          <button type="button" className="eg-modal__close" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={17} />
          </button>
        </header>
        <div className="eg-modal__body">{children}</div>
        {footer && <footer className="eg-modal__footer">{footer}</footer>}
      </section>
    </div>
  );
}

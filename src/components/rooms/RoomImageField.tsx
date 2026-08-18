import { Button, Icon } from "../../ui";

type Props = {
  kind: "card" | "banner";
  title: string;
  format: string;
  src?: string;
  disabled?: boolean;
  warning?: string;
  templateUrl?: string;
  onSelect: () => void;
  onEdit: () => void;
  onRemove?: () => void;
};

export default function RoomImageField({ kind, title, format, src, disabled, warning, templateUrl, onSelect, onEdit, onRemove }: Props) {
  const activate = () => {
    if (disabled) return;
    if (src) onEdit();
    else onSelect();
  };

  return (
    <section className="eg-room-image-field">
      <header className="eg-room-image-field__header">
        <div><strong>{title}</strong><span>{format}</span></div>
        {templateUrl && <a href={templateUrl} download target="_blank" rel="noreferrer">Plantilla</a>}
      </header>

      <div
        className={`eg-room-image-field__zone eg-room-image-field__zone--${kind}${src ? " has-image" : ""}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={src ? `Editar ${title.toLowerCase()}` : `Seleccionar ${title.toLowerCase()}`}
        aria-disabled={disabled}
        onClick={activate}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activate();
          }
        }}
      >
        {src ? (
          <>
            <img src={src} alt={`Vista previa de ${title.toLowerCase()}`} />
            <div className="eg-room-image-field__overlay">
              <Button size="sm" variant="secondary" icon="edit" onClick={(event) => { event.stopPropagation(); onEdit(); }}>
                Editar recorte
              </Button>
              <Button size="sm" variant="secondary" icon="image" onClick={(event) => { event.stopPropagation(); onSelect(); }}>
                Cambiar imagen
              </Button>
              {onRemove && (
                <Button size="sm" variant="ghost" icon="trash" title="Quitar imagen" onClick={(event) => { event.stopPropagation(); onRemove(); }} />
              )}
            </div>
          </>
        ) : (
          <div className="eg-room-image-field__empty">
            <span className="eg-room-image-field__icon"><Icon name="image" size={26} /></span>
            <strong>Seleccionar imagen</strong>
            <span>{format.split("·")[0].trim()} · JPG, PNG o WEBP</span>
          </div>
        )}
      </div>

      {warning && <p className="eg-room-image-field__warning">{warning}</p>}
    </section>
  );
}

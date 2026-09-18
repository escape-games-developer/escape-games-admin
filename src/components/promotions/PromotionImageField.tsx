import { Button, Icon } from "../../ui";
import { PROMOTION_IMAGE_SIZE_LABEL } from "../../lib/promotions";

type Props = {
  src: string | null;
  warning?: string;
  onSelect: () => void;
  onRemove: () => void;
};

/**
 * Zona de carga de la imagen 16:9. Misma estructura y clases que
 * RoomImageField, con la zona forzada a 16:9. Solo presentación: el archivo lo
 * maneja el formulario y nunca sale del navegador.
 */
export default function PromotionImageField({ src, warning, onSelect, onRemove }: Props) {
  return (
    <section className="eg-room-image-field eg-promo-image-field">
      <header className="eg-room-image-field__header">
        <div><strong>Imagen de promoción</strong><span>Recomendado {PROMOTION_IMAGE_SIZE_LABEL}</span></div>
      </header>

      <div
        className={`eg-room-image-field__zone eg-promo-image-field__zone${src ? " has-image" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={src ? "Cambiar imagen de promoción" : "Seleccionar imagen de promoción"}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
      >
        {src ? (
          <>
            <img src={src} alt="Vista previa de la promoción" />
            <div className="eg-room-image-field__overlay">
              <Button size="sm" variant="secondary" icon="image" onClick={(event) => { event.stopPropagation(); onSelect(); }}>
                Cambiar imagen
              </Button>
              <Button size="sm" variant="ghost" icon="trash" onClick={(event) => { event.stopPropagation(); onRemove(); }}>
                Quitar
              </Button>
            </div>
          </>
        ) : (
          <div className="eg-room-image-field__empty">
            <span className="eg-room-image-field__icon"><Icon name="image" size={26} /></span>
            <strong>Seleccionar imagen</strong>
            <span>1200 × 675 px · JPG, PNG o WEBP</span>
          </div>
        )}
      </div>

      {warning && <p className="eg-room-image-field__warning">{warning}</p>}
    </section>
  );
}

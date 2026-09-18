import { useEffect, useRef, useState } from "react";

import { Button, Input, Modal, Toggle } from "../../ui";
import { aspectMatches, readImageSize } from "../../lib/imageAspect";
import {
  PROMOTION_IMAGE_ACCEPT,
  PROMOTION_IMAGE_RATIO,
  validatePromotionImage,
  type Promotion,
} from "../../lib/promotions";
import PromotionImageField from "./PromotionImageField";

export type PromotionDraft = {
  name: string;
  description: string;
  active: boolean;
  /** Archivo elegido. La subida al bucket la hace la página, al guardar. */
  file: File | null;
  /** Se quitó la imagen que ya tenía la promoción. */
  removeExistingImage: boolean;
};

type Props = {
  open: boolean;
  /** null = alta. Con valor = edición. */
  promotion: Promotion | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (draft: PromotionDraft) => void;
};

/**
 * Alta / edición de promoción.
 *
 * La imagen se previsualiza local (URL.createObjectURL) y recién se sube al
 * bucket cuando la página guarda: acá no hay ninguna llamada a Supabase.
 * Los tokens de QR no se editan desde el formulario.
 */
export default function PromotionFormModal({ open, promotion, saving = false, onClose, onSubmit }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  /** Object URL de la preview local, para revocarlo cuando corresponde. */
  const previewUrlRef = useRef<string | null>(null);

  // El padre monta el modal con `key` por promoción: el estado nace de las props.
  const [name, setName] = useState(promotion?.name ?? "");
  const [description, setDescription] = useState(promotion?.description ?? "");
  const [active, setActive] = useState(promotion?.active ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(promotion?.imageUrl ?? null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [imageWarning, setImageWarning] = useState("");
  const [nameError, setNameError] = useState("");

  const releasePreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  };

  // Al desmontar se libera la preview local: nunca la URL pública del bucket.
  useEffect(() => releasePreview, []);

  const close = () => {
    if (saving) return;
    releasePreview();
    onClose();
  };

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;

    // Mime y tamaño se validan ANTES de cualquier intento de subida.
    const problem = validatePromotionImage(picked);
    if (problem) {
      setImageWarning(problem);
      return;
    }

    releasePreview();
    const url = URL.createObjectURL(picked);
    previewUrlRef.current = url;
    setFile(picked);
    setPreviewUrl(url);
    setRemoveExistingImage(false);
    setImageWarning("");

    try {
      const { w, h } = await readImageSize(picked);
      if (previewUrlRef.current !== url) return;
      if (!aspectMatches(w / h, PROMOTION_IMAGE_RATIO)) {
        setImageWarning(`La imagen mide ${w} × ${h} px y no es 16:9. Se verá recortada; se recomienda 1200 × 675 px.`);
      }
    } catch {
      // Sin dimensiones no se advierte nada: la preview igual se muestra.
    }
  };

  const removeImage = () => {
    releasePreview();
    setFile(null);
    setPreviewUrl(null);
    setImageWarning("");
    if (promotion?.imagePath) setRemoveExistingImage(true);
  };

  const submit = () => {
    if (saving) return;
    if (!name.trim()) {
      setNameError("Ingresá un nombre para la promoción.");
      return;
    }

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      active,
      file,
      removeExistingImage,
    });
  };

  const isEdit = Boolean(promotion);

  return (
    <Modal
      open={open}
      title={isEdit ? "Editar promoción" : "Nueva promoción"}
      description={isEdit ? "Actualizá la información de la promoción." : "Completá la información de la nueva promoción."}
      size="lg"
      panelClassName="eg-promo-modal"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={saving}>{isEdit ? "Guardar cambios" : "Crear promoción"}</Button>
        </>
      }
    >
      <div className="eg-promo-form">
        <input ref={fileRef} type="file" accept={PROMOTION_IMAGE_ACCEPT} hidden onChange={onFileChange} />

        <section className="eg-promo-form__section">
          <div className="eg-promo-form__heading"><strong>Información</strong><span>Nombre, descripción y estado</span></div>
          <div className="eg-promo-form__fields">
            <Input
              id="promo-name"
              label="Nombre"
              value={name}
              error={nameError || undefined}
              disabled={saving}
              onChange={(event) => { setName(event.target.value); if (nameError) setNameError(""); }}
              placeholder="Ej: 50% Cumpleaños"
            />
            <label className="eg-field" htmlFor="promo-description">
              <span className="eg-field__label">Descripción</span>
              <textarea
                id="promo-description"
                className="eg-input eg-promo-form__textarea"
                rows={3}
                value={description}
                disabled={saving}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Contá en qué consiste el beneficio..."
              />
            </label>
            <Toggle
              label="Promoción activa"
              description="Inactiva no se puede otorgar ni usar."
              checked={active}
              disabled={saving}
              onChange={(event) => setActive(event.target.checked)}
            />
          </div>
        </section>

        <section className="eg-promo-form__section">
          <div className="eg-promo-form__heading"><strong>Imagen</strong><span>Relación 16:9 · máximo 5 MB</span></div>
          <PromotionImageField
            src={previewUrl}
            warning={imageWarning || undefined}
            onSelect={() => { if (!saving) fileRef.current?.click(); }}
            onRemove={removeImage}
          />
        </section>
      </div>
    </Modal>
  );
}

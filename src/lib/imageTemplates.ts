/**
 * Plantillas descargables para las imágenes que sube el admin.
 *
 * Las medidas salen de las cajas reales de la app cliente:
 *   - Novedad  (news_v1.image_url)          -> 2.4:1  -> 1440 x 600
 *   - Sala banner (rooms_v2.banner_photo_url) -> 2.4:1  -> 1440 x 600
 *   - Sala card   (rooms_v2.card_photo_url)   -> 1:1    -> 1200 x 1200
 *
 * ⚠️ PENDIENTE: pegar acá las URLs públicas del bucket `public-assets`.
 * Mientras estén vacías, el link "Descargar plantilla" no se renderiza
 * (no se muestra un link roto).
 */

export const TEMPLATE_BUCKET = "public-assets";

export const TEMPLATE_URLS = {
  /** Plantilla 1440x600 para la imagen de novedad. */
  news: "",
  /** Plantilla 1440x600 para el banner de sala. */
  roomBanner: "",
  /** Plantilla 1200x1200 para la card de sala. */
  roomCard: "",
};

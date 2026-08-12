/**
 * Validación de aspect ratio para las imágenes que sube el admin.
 *
 * La app cliente recorta con `cover` centrado y no puede reencuadrar
 * (no aplica photo_position / image_position), así que lo que se sube
 * tiene que venir ya con el ratio correcto.
 */

/** Tolerancia relativa aceptada al comparar ratios (3%). */
export const ASPECT_TOLERANCE = 0.03;

/** Lee las dimensiones naturales de un File de imagen. */
export function readImageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const size = { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
      URL.revokeObjectURL(url);
      resolve(size);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No pude leer la imagen."));
    };

    img.src = url;
  });
}

/** true si el ratio entra dentro de la tolerancia del target. */
export function aspectMatches(ratio: number, target: number, tolerance = ASPECT_TOLERANCE) {
  return Math.abs(ratio - target) <= tolerance;
}

export type BadgeTone =
  | "neutral"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "accent";

type Props = {
  children: React.ReactNode;
  tone?: BadgeTone;
  /** Punto de color a la izquierda. Útil para estados (Activa / Inactiva). */
  dot?: boolean;
  /** Versión más chica, para meter dentro de celdas densas. */
  small?: boolean;
};

/**
 * Badge único del panel. Un solo componente para estados, categorías y
 * niveles: la diferencia es el `tone`, no un estilo por pantalla.
 *
 * Mapeo sugerido (lo aplica cada vista, no este componente):
 *   Activa/Activo → success   ·   Inactiva/Inactivo → neutral
 *   WOW → accent              ·   Clásico → info
 *   Inicial → neutral         ·   Intermedio → info   ·   Avanzado → warning
 *   Destacado → accent        ·   Golden → warning
 */
export default function Badge({ children, tone = "neutral", dot = false, small = false }: Props) {
  const cls = ["eg-badge", `eg-badge--${tone}`, small ? "eg-badge--sm" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={cls}>
      {dot && <span className="eg-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

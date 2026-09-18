/**
 * Puente entre los design tokens y Recharts.
 *
 * Recharts pinta atributos SVG (`stroke`, `fill`) y ahí `var(--eg-accent)` no
 * resuelve de forma confiable en todos los navegadores. Así que los tokens se
 * leen una vez del `:root` con `getComputedStyle` y se pasan como color
 * concreto. El efecto práctico es el mismo que buscaba `tokens.css`: si mañana
 * cambia el naranja de la marca, los gráficos cambian con él y acá no se toca
 * nada.
 *
 * Se resuelve una sola vez por carga porque el panel tiene un único tema fijo
 * (oscuro). Si algún día hay switch claro/oscuro, esto pasa a ser un hook con
 * suscripción y los componentes no se enteran.
 */

const FALLBACK: Record<string, string> = {
  "--eg-accent": "#ff6a00",
  "--eg-info": "#4d94ff",
  "--eg-success": "#3ecf8e",
  "--eg-warning": "#f5a623",
  "--eg-danger": "#ff4d4f",
  "--eg-text": "#e8edf5",
  "--eg-text-dim": "#8b9ab0",
  "--eg-text-faint": "#5f6d82",
  "--eg-surface": "#131c2b",
  "--eg-surface-2": "#182233",
  "--eg-border": "rgba(255, 255, 255, 0.07)",
  "--eg-border-strong": "rgba(255, 255, 255, 0.12)",
};

let cache: ChartTheme | null = null;

export type ChartTheme = {
  consultas: string;
  ventas: string;
  /** Color por clave de canal, para que donut y barras usen el mismo. */
  channel: Record<string, string>;
  /** Color de reserva para un canal que todavía no tenga asignado uno. */
  channelFallback: string;
  grid: string;
  axis: string;
  text: string;
  surface: string;
  border: string;
};

function token(name: string): string {
  if (typeof window === "undefined") return FALLBACK[name];
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || FALLBACK[name];
}

export function getChartTheme(): ChartTheme {
  if (cache) return cache;

  cache = {
    consultas: token("--eg-accent"),
    ventas: token("--eg-info"),
    channel: {
      // Las claves son las de `sources` en el JSON de ORIGEN. Meta se
      // lleva el naranja de marca porque es la serie que manda en todo
      // el tablero; el resto sigue el orden semántico de los tokens, y
      // "sin atribuir" queda gris: es ausencia de dato, no un canal.
      meta_ads: token("--eg-accent"),
      web: token("--eg-info"),
      organico: token("--eg-success"),
      espontaneas: token("--eg-warning"),
      sin_atribuir: token("--eg-text-faint"),
    },
    channelFallback: token("--eg-text-faint"),
    grid: token("--eg-border"),
    axis: token("--eg-text-faint"),
    text: token("--eg-text-dim"),
    surface: token("--eg-surface-2"),
    border: token("--eg-border-strong"),
  };

  return cache;
}

/** Color de un canal, con reserva para claves nuevas que traiga el dato real. */
export function channelColor(theme: ChartTheme, key: string): string {
  return theme.channel[key] ?? theme.channelFallback;
}

/** Tipografía de ejes: la del panel, no la que trae Recharts por defecto. */
export const AXIS_TICK = { fontSize: 11, fontWeight: 600 } as const;

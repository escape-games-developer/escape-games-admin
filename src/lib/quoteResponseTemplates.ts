import type { PromoKey } from "./cotizador";
import type { Modalidad, RangoEdad, TipoEvento } from "./cotizadorBorrador";

/**
 * Respuestas automáticas del cotizador.
 *
 * Una plantilla es texto con variables entre corchetes. El texto lo edita el
 * Admin General y se guarda en Supabase; los importes NUNCA viven en el texto,
 * siempre los completa el cotizador al renderizar. Por eso `validate` rechaza
 * importes fijos: una plantilla con un número escrito a mano se desactualiza
 * sin que nadie se entere.
 *
 * Para sumar una promoción nueva alcanza con agregar una entrada acá y su rama
 * en `getQuoteResponseTemplateKey`. No hace falta tocar el panel: el editor
 * arma su ficha y sus botones de variable desde esta definición.
 */

export const QUOTE_RESPONSE_TOKENS = [
  // Escaparty (cumpleaños).
  "PRESUPUESTO_TOTAL",
  "VALOR_INVITADO",
  "VALOR_ADULTO",
  "ANTICIPO",
  "SALDO",
  "CANTIDAD_INVITADOS",
  // Juego social (promociones).
  "CANTIDAD",
  "TOTAL",
] as const;

export type QuoteResponseToken = (typeof QUOTE_RESPONSE_TOKENS)[number];

export type QuoteResponseTemplateKey =
  | "escaparty.infantil.10-12"
  | "escaparty.infantil.13-plus"
  | "social.promo_amigos"
  | "social.pack_familiar";

/** Lo que efectivamente se guardó en Supabase: cualquier clave puede faltar. */
export type QuoteResponseTemplates = Partial<Record<QuoteResponseTemplateKey, string>>;

/** Valores con los que se completan las variables. Cada plantilla usa los suyos. */
export type QuoteResponseValues = Partial<Record<QuoteResponseToken, string>>;

export type QuoteResponseTemplateDef = {
  id: QuoteResponseTemplateKey;
  /** Rótulo corto, el que ve el asesor en el panel. */
  name: string;
  category: "escaparty" | "social";
  /** Ficha del editor: mismas tres celdas para todas las plantillas. */
  meta: { label: string; value: string }[];
  defaultTemplate: string;
  /** Únicas variables insertables y aceptadas al guardar. */
  allowedTokens: readonly QuoteResponseToken[];
  /** Sin estas la respuesta pierde el dato que la justifica. */
  requiredTokens: readonly QuoteResponseToken[];
};

const BASE_ESCAPARTY = `¡Perfecto! 😊 El presupuesto para el evento es de $[PRESUPUESTO_TOTAL].

🎟️ Valor por invitado: $[VALOR_INVITADO]
👤 Valor adulto acompañante: $[VALOR_ADULTO]

`;

const TOKENS_ESCAPARTY = [
  "PRESUPUESTO_TOTAL",
  "VALOR_INVITADO",
  "VALOR_ADULTO",
  "ANTICIPO",
  "SALDO",
  "CANTIDAD_INVITADOS",
] as const;

const TOKENS_SOCIAL = ["CANTIDAD", "TOTAL"] as const;

/**
 * El cierre de las dos promos es idéntico salvo el cupón. El código forma parte
 * del texto y el Admin General lo puede editar; el porcentaje que se cobra NO
 * sale de acá — lo calcula `cotizarJuegoSocial` con los valores base.
 */
const cupon = (codigo: string) => `📌 Recordá que, para poder acceder al beneficio, *antes de confirmar la reserva* tienen que ingresar el código:

👉🏼 *${codigo}*

en la sección *“Cupón”* de la reserva.

Una vez aplicado el código, podrán confirmar la reserva con el descuento correspondiente 🎉🔐`;

export const QUOTE_RESPONSE_TEMPLATE_DEFS: Record<
  QuoteResponseTemplateKey,
  QuoteResponseTemplateDef
> = {
  "escaparty.infantil.10-12": {
    id: "escaparty.infantil.10-12",
    name: "Cumpleaños 10 a 12",
    category: "escaparty",
    meta: [
      { label: "Tipo", value: "Escaparty" },
      { label: "Modalidad", value: "Infantil" },
      { label: "Edad", value: "10 a 12 años" },
    ],
    defaultTemplate: `${BASE_ESCAPARTY}📌 Por la edad de los chicos, es requisito que ingrese 1 adulto acompañante por sala.

Si están de acuerdo con el presupuesto, podemos avanzar con la reserva 🎉`,
    allowedTokens: TOKENS_ESCAPARTY,
    requiredTokens: ["PRESUPUESTO_TOTAL", "VALOR_INVITADO", "VALOR_ADULTO"],
  },
  "escaparty.infantil.13-plus": {
    id: "escaparty.infantil.13-plus",
    name: "Cumpleaños 13 en adelante",
    category: "escaparty",
    meta: [
      { label: "Tipo", value: "Escaparty" },
      { label: "Modalidad", value: "Infantil" },
      { label: "Edad", value: "13 años en adelante" },
    ],
    defaultTemplate: `${BASE_ESCAPARTY}📌 Por la edad de los chicos, no es necesario que un adulto ingrese a la sala. Solo deberá permanecer al menos 1 adulto responsable en el local durante todo el evento.

Si están de acuerdo con el presupuesto, podemos avanzar con la reserva 🎉`,
    allowedTokens: TOKENS_ESCAPARTY,
    requiredTokens: ["PRESUPUESTO_TOTAL", "VALOR_INVITADO", "VALOR_ADULTO"],
  },
  "social.promo_amigos": {
    id: "social.promo_amigos",
    name: "Promo amigos",
    category: "social",
    meta: [
      { label: "Tipo", value: "Juego social" },
      { label: "Promoción", value: "Promo amigos" },
      { label: "Cupón", value: "PROMOAMIGOS" },
    ],
    defaultTemplate: `¡Perfecto! 😊 Con la *PROMO AMIGOS* tienen un *20% de descuento*.

👥 Para *[CANTIDAD] personas*, el valor final con la promoción aplicada queda en *$[TOTAL]*.

${cupon("PROMOAMIGOS")}`,
    allowedTokens: TOKENS_SOCIAL,
    requiredTokens: TOKENS_SOCIAL,
  },
  "social.pack_familiar": {
    id: "social.pack_familiar",
    name: "Pack familiar",
    category: "social",
    meta: [
      { label: "Tipo", value: "Juego social" },
      { label: "Promoción", value: "Pack familiar" },
      { label: "Cupón", value: "PACKFAMILIAR" },
    ],
    defaultTemplate: `¡Perfecto! 😊 Con el *PACK FAMILIAR* tienen un *25% de descuento*.

👨‍👩‍👧‍👦 Para *[CANTIDAD] personas*, el valor final con la promoción aplicada queda en *$[TOTAL]*.

${cupon("PACKFAMILIAR")}`,
    allowedTokens: TOKENS_SOCIAL,
    requiredTokens: TOKENS_SOCIAL,
  },
};

export const DEFAULT_QUOTE_RESPONSE_TEMPLATES = Object.fromEntries(
  Object.values(QUOTE_RESPONSE_TEMPLATE_DEFS).map((def) => [def.id, def.defaultTemplate])
) as Record<QuoteResponseTemplateKey, string>;

export function normalizeQuoteResponseTemplates(value: unknown): QuoteResponseTemplates {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, template]) => key in DEFAULT_QUOTE_RESPONSE_TEMPLATES && typeof template === "string"
    )
  ) as QuoteResponseTemplates;
}

/**
 * Normaliza SOLO para elegir plantilla. Los valores que consume el motor de
 * precios (`cotizador.ts`) no se tocan: acá entra una copia y sale una clave.
 * Tolera etiquetas ("Escaparty", "10 a 12 años") además de los enums del
 * borrador, así un cambio de rótulo no deja el panel vacío.
 */
function normalizeKey(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    : "";
}

/** Primer número del rango: 10 en "10-12" y en "10 a 12 años"; 13 en "13+". */
function primerNumero(value: string): number | null {
  const match = value.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

export function getQuoteResponseTemplateKey(input: {
  eventType: TipoEvento | string;
  modality: Modalidad | string;
  ageRange: RangoEdad | string;
  promo?: PromoKey | string;
}): QuoteResponseTemplateKey | null {
  const eventType = normalizeKey(input.eventType);

  if (eventType.includes("escaparty")) {
    const modality = normalizeKey(input.modality);
    if (!modality.includes("infantil") && !modality.includes("menor")) return null;

    const edad = primerNumero(normalizeKey(input.ageRange));

    // Hasta 12 entra un adulto a la sala; de 13 en adelante, no.
    return edad !== null && edad <= 12
      ? "escaparty.infantil.10-12"
      : "escaparty.infantil.13-plus";
  }

  if (eventType.includes("social")) {
    const promo = normalizeKey(input.promo);
    if (promo.includes("amigos")) return "social.promo_amigos";
    if (promo.includes("familiar")) return "social.pack_familiar";
    // "Sin descuento" no tiene respuesta armada: no hay promoción que comunicar.
    return null;
  }

  return null;
}

/**
 * La plantilla local es la fuente por defecto. Supabase solo pisa el texto
 * cuando el Admin General guardó una versión propia: si no hay fila, si la
 * migración no se aplicó o si la lectura falló, se usa igual la local.
 */
export function resolveQuoteResponseTemplate(
  templates: QuoteResponseTemplates | null | undefined,
  key: QuoteResponseTemplateKey
): string {
  const guardada = templates?.[key];
  return typeof guardada === "string" && guardada.trim()
    ? guardada
    : DEFAULT_QUOTE_RESPONSE_TEMPLATES[key];
}

export function renderQuoteResponse(template: string, values: QuoteResponseValues): string {
  return template.replace(/\[([A-Z_]+)\]/g, (match, token: string) => {
    const value = values[token as QuoteResponseToken];
    return typeof value === "string" ? value : match;
  });
}

export function validateQuoteResponseTemplate(
  template: string,
  key: QuoteResponseTemplateKey
): string | null {
  const def = QUOTE_RESPONSE_TEMPLATE_DEFS[key];

  if (!template.trim()) return "La plantilla no puede quedar vacía.";
  if (/\$\s*\d[\d.,]*/.test(template)) {
    return "No se pueden guardar importes fijos. Insertá una variable de precio.";
  }

  const unknown = [...template.matchAll(/\[([^\]]+)\]/g)]
    .map((match) => match[1])
    .find((token) => !def.allowedTokens.includes(token as QuoteResponseToken));
  if (unknown) return `La variable [${unknown}] no está permitida.`;

  const missing = def.requiredTokens.find((token) => !template.includes(`[${token}]`));
  return missing ? `La variable [${missing}] es obligatoria y no se puede eliminar.` : null;
}

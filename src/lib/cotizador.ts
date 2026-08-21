/**
 * Reglas del Cotizador: tipos, normalización del jsonb y motor de precios.
 *
 * Sin dependencias a propósito — no importa `supabase`, así la lógica se
 * puede ejercitar sola, sin sesión ni red. El acceso a datos vive en
 * `intranetConfig.ts`.
 *
 * Las claves del jsonb van en snake_case (son las del manual); acá adentro se
 * trabajan como un objeto tipado en camelCase.
 */

/* =======================
   TIPOS
======================= */

export type ModalidadEscaparty = "menores" | "adultos";

export type PromoKey = "pack_familiar" | "promo_amigos" | "sin_descuento";

export type EscapartyConfig = {
  minimoPersonas: number;
  /**
   * AFORO del local, no tope de descuento. 0 = sin definir.
   * Cuando está definido y se supera, el cotizador avisa pero sigue
   * calculando: no es un límite de cálculo.
   */
  maximoPersonas: number;
  /**
   * Tope de la escalera de DESCUENTO. Desde acá el precio por persona deja de
   * bajar y se queda en el valor de esa fila, pero se sigue facturando por la
   * cantidad real: el invitado 36 entra al precio congelado.
   */
  congelaDesdePersonas: number;
  baseMenores: number;
  /** Campo propio, NO se deriva de baseMenores con un multiplicador: el
   *  manual dice "+15%" pero la tabla publicada dice 52.000, no 51.750. */
  baseAdultos: number;
  /** Plano y en pesos, el mismo para las dos tarifas. Único lugar donde se
   *  toca la escalera. */
  decrementoPorPersona: number;
  anticipo: number;
  /** Porcentajes sobre el precio de invitado DE ESTA cotización, no sobre una
   *  tarifa adulto aparte. */
  pctAcompananteConGastronomia: number;
  pctAcompananteSinGastronomia: number;
};

export type Promo = { descuento: number; minimo: number };

/** Precio TOTAL del grupo para esa cantidad de participantes, no por cabeza. */
export type PrecioSocial = { personas: number; precio: number };

export type JuegoSocialConfig = {
  /**
   * Tabla de precios por tamaño de grupo. Es una lista de precios cerrados,
   * no una escalera calculada: cada fila se carga a mano desde el editor.
   * Lista vacía = todavía no se cargaron los precios.
   */
  precios: PrecioSocial[];
  promos: Record<PromoKey, Promo>;
};

export type CotizadorConfig = {
  escaparty: EscapartyConfig;
  juegoSocial: JuegoSocialConfig;
};

/* =======================
   DEFAULTS
======================= */

export const DEFAULT_COTIZADOR_CONFIG: CotizadorConfig = {
  escaparty: {
    minimoPersonas: 10,
    // Aforo sin definir: pendiente de confirmar el número real del local.
    maximoPersonas: 0,
    congelaDesdePersonas: 35,
    baseMenores: 45000,
    baseAdultos: 52000,
    decrementoPorPersona: 300,
    anticipo: 100000,
    pctAcompananteConGastronomia: 50,
    pctAcompananteSinGastronomia: 0,
  },
  juegoSocial: {
    precios: [
      { personas: 2, precio: 60000 },
      { personas: 3, precio: 84000 },
      { personas: 4, precio: 104000 },
      { personas: 5, precio: 120000 },
      { personas: 6, precio: 132000 },
      { personas: 7, precio: 140000 },
    ],
    promos: {
      pack_familiar: { descuento: 25, minimo: 4 },
      promo_amigos: { descuento: 20, minimo: 3 },
      sin_descuento: { descuento: 0, minimo: 0 },
    },
  },
};

export const PROMO_LABELS: Record<PromoKey, string> = {
  pack_familiar: "Pack familiar",
  promo_amigos: "Promo amigos",
  sin_descuento: "Sin descuento",
};

/* =======================
   NORMALIZACIÓN DEL JSONB
======================= */

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Los porcentajes se acotan al leer, no al escribir: un jsonb editado a mano
 *  con 150 no puede terminar en un total negativo. */
function clampPorcentaje(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * `undefined` cuando la clave no está (jsonb viejo) para poder caer al
 * default; un array vacío es un valor legítimo que significa "sin precios
 * cargados" y se respeta como tal.
 */
function asPreciosSocial(value: unknown): PrecioSocial[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const vistos = new Set<number>();
  return value
    .map((raw) => {
      const row = asRecord(raw);
      return {
        personas: Math.trunc(asNumber(row.personas, 0)),
        precio: Math.max(0, asNumber(row.precio, 0)),
      };
    })
    .filter((fila) => {
      if (fila.personas < 1 || vistos.has(fila.personas)) return false;
      vistos.add(fila.personas);
      return true;
    })
    .sort((a, b) => a.personas - b.personas);
}

function asPromo(value: unknown, fallback: Promo): Promo {
  const row = asRecord(value);
  return {
    descuento: clampPorcentaje(asNumber(row.descuento, fallback.descuento)),
    minimo: Math.max(0, asNumber(row.minimo, fallback.minimo)),
  };
}

export function normalizeCotizadorConfig(value: unknown): CotizadorConfig {
  const root = asRecord(value);
  const esc = asRecord(root.escaparty);
  const soc = asRecord(root.juego_social);
  const promos = asRecord(soc.promos);
  const def = DEFAULT_COTIZADOR_CONFIG;
  const dEsc = def.escaparty;

  const minimoPersonas = Math.max(1, asNumber(esc.minimo_personas, dEsc.minimoPersonas));
  // Aforo: 0 = sin definir. No acota el cálculo ni el tope de escalera.
  const maximoPersonas = Math.max(0, asNumber(esc.maximo_personas, dEsc.maximoPersonas));
  // El tope de escalera no puede quedar por debajo del mínimo: eso produciría
  // un precio que sube con la cantidad.
  const congelaDesdePersonas = Math.max(
    minimoPersonas,
    asNumber(esc.congela_desde_personas, dEsc.congelaDesdePersonas)
  );

  return {
    escaparty: {
      minimoPersonas,
      maximoPersonas,
      congelaDesdePersonas,
      baseMenores: Math.max(0, asNumber(esc.base_menores, dEsc.baseMenores)),
      baseAdultos: Math.max(0, asNumber(esc.base_adultos, dEsc.baseAdultos)),
      decrementoPorPersona: Math.max(0, asNumber(esc.decremento_por_persona, dEsc.decrementoPorPersona)),
      anticipo: Math.max(0, asNumber(esc.anticipo, dEsc.anticipo)),
      pctAcompananteConGastronomia: clampPorcentaje(
        asNumber(esc.pct_acompanante_con_gastronomia, dEsc.pctAcompananteConGastronomia)
      ),
      pctAcompananteSinGastronomia: clampPorcentaje(
        asNumber(esc.pct_acompanante_sin_gastronomia, dEsc.pctAcompananteSinGastronomia)
      ),
    },
    juegoSocial: {
      precios: asPreciosSocial(soc.precios) ?? def.juegoSocial.precios,
      promos: {
        pack_familiar: asPromo(promos.pack_familiar, def.juegoSocial.promos.pack_familiar),
        promo_amigos: asPromo(promos.promo_amigos, def.juegoSocial.promos.promo_amigos),
        sin_descuento: asPromo(promos.sin_descuento, def.juegoSocial.promos.sin_descuento),
      },
    },
  };
}

/** Vuelve al jsonb con las claves del manual. */
export function serializeCotizadorConfig(config: CotizadorConfig): Record<string, unknown> {
  const e = config.escaparty;
  const s = config.juegoSocial;

  return {
    escaparty: {
      minimo_personas: e.minimoPersonas,
      maximo_personas: e.maximoPersonas,
      congela_desde_personas: e.congelaDesdePersonas,
      base_menores: e.baseMenores,
      base_adultos: e.baseAdultos,
      decremento_por_persona: e.decrementoPorPersona,
      anticipo: e.anticipo,
      pct_acompanante_con_gastronomia: e.pctAcompananteConGastronomia,
      pct_acompanante_sin_gastronomia: e.pctAcompananteSinGastronomia,
    },
    juego_social: {
      precios: s.precios.map((fila) => ({ personas: fila.personas, precio: fila.precio })),
      promos: {
        pack_familiar: { ...s.promos.pack_familiar },
        promo_amigos: { ...s.promos.promo_amigos },
        sin_descuento: { ...s.promos.sin_descuento },
      },
    },
  };
}

/* =======================
   MOTOR DE PRECIOS — ESCAPARTY

   nEscalon    = min( max(invitados, minimo), congelaDesde )
   nFacturable = max( invitados, minimo )
   precio      = base[modalidad] - (nEscalon - minimo) * decremento
   total       = precio * nFacturable

   La escalera tiene tope: pasado `congelaDesde` el precio por persona no baja
   más, pero se sigue facturando por la cantidad real.
======================= */

export function escalonDe(invitados: number, cfg: EscapartyConfig): number {
  return Math.min(Math.max(invitados, cfg.minimoPersonas), cfg.congelaDesdePersonas);
}

export function facturableDe(invitados: number, cfg: EscapartyConfig): number {
  return Math.max(invitados, cfg.minimoPersonas);
}

/**
 * ÚNICO lugar donde se decide cuánto sale una persona. Mover la escalera es
 * mover `decrementoPorPersona` en la config, no tocar esta función.
 */
export function precioPorPersona(
  invitados: number,
  modalidad: ModalidadEscaparty,
  cfg: EscapartyConfig
): number {
  const base = modalidad === "adultos" ? cfg.baseAdultos : cfg.baseMenores;
  const bruto = base - (escalonDe(invitados, cfg) - cfg.minimoPersonas) * cfg.decrementoPorPersona;
  // Sin piso configurable: el guardarraíl del editor no deja guardar un
  // decremento que rompa la escalera, y eso pasa mucho antes de llegar a $0.
  // Este max(0) es solo defensa contra un jsonb editado a mano.
  return Math.max(0, bruto);
}

export function totalPorTamano(
  invitados: number,
  modalidad: ModalidadEscaparty,
  cfg: EscapartyConfig
): number {
  return precioPorPersona(invitados, modalidad, cfg) * facturableDe(invitados, cfg);
}

export type LineaAcompanante = {
  cantidad: number;
  /** % del precio de invitado que paga esta línea. */
  pct: number;
  precioUnitario: number;
  subtotal: number;
};

export type CotizacionEscaparty = {
  escalon: number;
  facturable: number;
  /** True cuando la cantidad cargada está por debajo del mínimo y se factura
   *  igual por el mínimo. */
  facturaPorMinimo: boolean;
  /** True cuando ya se pasó el tope de escalera: el precio está congelado
   *  pero se sigue facturando por la cantidad real. */
  precioCongelado: boolean;
  /** True cuando hay aforo definido y la cantidad lo supera. Avisa, no frena:
   *  el cálculo sigue igual. */
  superaAforo: boolean;
  precioPorInvitado: number;
  subtotalInvitados: number;
  sinGastronomia: LineaAcompanante;
  conGastronomia: LineaAcompanante;
  totalAcompanantes: number;
  totalEvento: number;
  anticipo: number;
  saldoEnLocal: number;
};

export function cotizarEscaparty(
  entrada: {
    invitados: number;
    acompanantesSinGastronomia: number;
    acompanantesConGastronomia: number;
    modalidad: ModalidadEscaparty;
  },
  cfg: EscapartyConfig
): CotizacionEscaparty {
  const { invitados, acompanantesSinGastronomia, acompanantesConGastronomia, modalidad } = entrada;

  const escalon = escalonDe(invitados, cfg);
  const facturable = facturableDe(invitados, cfg);

  const precioPorInvitado = precioPorPersona(invitados, modalidad, cfg);
  const subtotalInvitados = precioPorInvitado * facturable;

  // Los acompañantes salen del precio de invitado de ESTA cotización, con su
  // descuento por cantidad ya incluido: si el invitado bajó a $37.500, el
  // acompañante al 50% paga $18.750. No hay tarifa adulto aparte para ellos.
  //
  // El adulto que entra a jugar no es un acompañante: se carga como un
  // invitado más y por eso no tiene línea propia.
  //
  // Se redondea el unitario y después se multiplica, para que lo que muestra
  // el desglose multiplique exacto y el asesor pueda repetir la cuenta.
  const linea = (cantidad: number, pct: number): LineaAcompanante => {
    const precioUnitario = Math.round((precioPorInvitado * pct) / 100);
    return { cantidad, pct, precioUnitario, subtotal: precioUnitario * cantidad };
  };

  const sinGastronomia = linea(acompanantesSinGastronomia, cfg.pctAcompananteSinGastronomia);
  const conGastronomia = linea(acompanantesConGastronomia, cfg.pctAcompananteConGastronomia);

  const totalAcompanantes = sinGastronomia.subtotal + conGastronomia.subtotal;
  const totalEvento = subtotalInvitados + totalAcompanantes;

  return {
    escalon,
    facturable,
    facturaPorMinimo: invitados < cfg.minimoPersonas,
    precioCongelado: invitados > cfg.congelaDesdePersonas,
    superaAforo: cfg.maximoPersonas > 0 && invitados > cfg.maximoPersonas,
    precioPorInvitado,
    subtotalInvitados,
    sinGastronomia,
    conGastronomia,
    totalAcompanantes,
    totalEvento,
    anticipo: cfg.anticipo,
    saldoEnLocal: totalEvento - cfg.anticipo,
  };
}

/* =======================
   GUARDARRAÍL DE LA ESCALERA

   Como el descuento se aplica a TODAS las personas del grupo, pasado cierto
   decremento sumar un invitado baja el total facturado. No hace falta llegar
   a precio negativo para que sea un problema.
======================= */

export type DiagnosticoEscalera = {
  /** Primer tamaño de grupo donde sumar un invitado factura MENOS que el
   *  tamaño anterior. null = la escalera es sana en todo el rango. */
  quiebreMarginal: number | null;
  /** Modalidad donde se detectó el quiebre (la de base más baja quiebra
   *  antes). */
  quiebreEn: ModalidadEscaparty | null;
  /** Tamaño donde la escalera deja de bajar. Es el extremo que se muestra en
   *  el preview, no el aforo. */
  topeEscalera: number;
  precioMinMenores: number;
  precioMaxMenores: number;
  totalMaxMenores: number;
  descuentoEfectivoMenores: number;
  precioMinAdultos: number;
  precioMaxAdultos: number;
  totalMaxAdultos: number;
  descuentoEfectivoAdultos: number;
  /** Problemas de rango que hacen inválida la config (aparte del quiebre). */
  errores: string[];
};

function descuentoEfectivo(precioMin: number, precioMax: number): number {
  if (precioMin <= 0) return 0;
  return ((precioMin - precioMax) / precioMin) * 100;
}

export function diagnosticarEscalera(cfg: EscapartyConfig): DiagnosticoEscalera {
  const errores: string[] = [];

  if (cfg.minimoPersonas < 1) errores.push("El mínimo de personas tiene que ser al menos 1.");
  if (cfg.congelaDesdePersonas < cfg.minimoPersonas) {
    errores.push("El tope de escalera no puede ser menor que el mínimo de personas.");
  }
  // El aforo es independiente del tope de descuento, pero si es menor que el
  // mínimo el evento no se puede vender.
  if (cfg.maximoPersonas > 0 && cfg.maximoPersonas < cfg.minimoPersonas) {
    errores.push("El aforo no puede ser menor que el mínimo de personas.");
  }

  // Se recorre el tramo con escalera activa buscando el primer tamaño donde
  // el total deja de crecer. Pasado el tope el precio está congelado, así que
  // sumar gente siempre suma plata: no hace falta mirar más allá.
  const tope = cfg.congelaDesdePersonas;
  let quiebreMarginal: number | null = null;
  let quiebreEn: ModalidadEscaparty | null = null;

  for (let n = cfg.minimoPersonas; n < tope && quiebreMarginal === null; n++) {
    for (const modalidad of ["menores", "adultos"] as const) {
      if (totalPorTamano(n + 1, modalidad, cfg) < totalPorTamano(n, modalidad, cfg)) {
        quiebreMarginal = n + 1;
        quiebreEn = modalidad;
        break;
      }
    }
  }

  // Los extremos de la escalera son mínimo y tope de congelamiento, NO el
  // aforo: pasado el tope el precio ya no cambia.
  const precioMinMenores = precioPorPersona(cfg.minimoPersonas, "menores", cfg);
  const precioMaxMenores = precioPorPersona(tope, "menores", cfg);
  const precioMinAdultos = precioPorPersona(cfg.minimoPersonas, "adultos", cfg);
  const precioMaxAdultos = precioPorPersona(tope, "adultos", cfg);

  return {
    quiebreMarginal,
    quiebreEn,
    topeEscalera: tope,
    precioMinMenores,
    precioMaxMenores,
    totalMaxMenores: totalPorTamano(tope, "menores", cfg),
    descuentoEfectivoMenores: descuentoEfectivo(precioMinMenores, precioMaxMenores),
    precioMinAdultos,
    precioMaxAdultos,
    totalMaxAdultos: totalPorTamano(tope, "adultos", cfg),
    descuentoEfectivoAdultos: descuentoEfectivo(precioMinAdultos, precioMaxAdultos),
    errores,
  };
}

/* =======================
   JUEGO SOCIAL
======================= */

/** Tamaños de grupo con precio cargado, para armar el desplegable. */
export function tamanosSocial(cfg: JuegoSocialConfig): number[] {
  return cfg.precios.map((fila) => fila.personas);
}

export type CotizacionSocial = {
  personas: number;
  /** False cuando ese tamaño no tiene precio en la tabla. */
  precioCargado: boolean;
  /** Precio de lista del grupo, antes del descuento. */
  subtotal: number;
  /** Solo informativo: el precio de lista es del grupo, no por cabeza. */
  precioPorParticipante: number;
  /** Porcentaje efectivamente aplicado: 0 si no llega al mínimo. */
  descuentoAplicado: number;
  montoDescuento: number;
  total: number;
  /** True cuando la promo elegida existe pero la cantidad no alcanza el mínimo. */
  bajoMinimo: boolean;
  minimoRequerido: number;
};

export function cotizarJuegoSocial(
  personas: number,
  promoKey: PromoKey,
  cfg: JuegoSocialConfig
): CotizacionSocial {
  const promo = cfg.promos[promoKey];

  // El precio es del GRUPO y sale de la tabla; no se multiplica por cabeza ni
  // se interpola entre filas. Un tamaño sin fila no tiene precio.
  const fila = cfg.precios.find((f) => f.personas === personas);
  const subtotal = fila?.precio ?? 0;

  // Por debajo del mínimo NO se aplica el descuento y NO se redondea la
  // cantidad hacia arriba: se cotiza tal cual y se avisa.
  const bajoMinimo = promo.descuento > 0 && personas < promo.minimo;
  const descuentoAplicado = bajoMinimo ? 0 : promo.descuento;
  const montoDescuento = Math.round((subtotal * descuentoAplicado) / 100);

  return {
    personas,
    precioCargado: fila !== undefined && fila.precio > 0,
    subtotal,
    precioPorParticipante: personas > 0 ? Math.round(subtotal / personas) : 0,
    descuentoAplicado,
    montoDescuento,
    total: subtotal - montoDescuento,
    bajoMinimo,
    minimoRequerido: promo.minimo,
  };
}

/* =======================
   FORMATO
======================= */

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function formatARS(value: number): string {
  return currency.format(Number.isFinite(value) ? value : 0);
}

export function formatPct(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

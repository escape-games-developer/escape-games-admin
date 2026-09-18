/**
 * Métricas — contrato del endpoint de ORIGEN.
 *
 * Es el reflejo exacto de lo que devuelve
 * `GET /exec?action=metrics` del Apps Script de ORIGEN ESCAPE
 * (ver `docs/apps-script/README.md`). No se agrega ni se infiere nada:
 * si un campo no está acá, el panel no lo puede mostrar.
 *
 * REGLA QUE ATRAVIESA TODO EL ARCHIVO — `number | null`:
 *
 *   null → ORIGEN no puede calcular esa métrica de forma confiable.
 *   0    → la calculó y da cero.
 *
 * No son lo mismo y el panel no los muestra igual: `null` se dibuja
 * como "—" y `0` como "0". Por eso los tipos dicen `number | null` y
 * no `number`, y por eso nunca se escribe `valor || 0` sobre ellos:
 * eso convertiría "no lo sabemos" en "es cero".
 */

/** Rango en ISO corto (yyyy-mm-dd), que es lo que entiende <input type="date">. */
export type MetricsPeriod = {
  from: string;
  to: string;
  generated_at: string;
  version: string;
};

/** Canales que acepta el filtro. Son los grupos de `grupoMetricsDe()`. */
export type MetricsChannel =
  | "meta_ads"
  | "web"
  | "organico"
  | "espontaneas"
  | "sin_atribuir";

/**
 * Lo que se le manda al endpoint. Todo opcional: lo que no se manda,
 * no filtra. El recorte lo hace ORIGEN, nunca el panel.
 */
export type MetricsQuery = {
  from?: string;
  to?: string;
  branch?: string;
  channel?: MetricsChannel;
  campaign?: string;
};

/** Qué universo devolvió el backend. `null` = ese filtro no se aplicó. */
export type MetricsFilters = {
  branch: string | null;
  channel: MetricsChannel | null;
  campaign: string | null;
};

/**
 * Opciones de los selects.
 *
 * Salen del universo del PERÍODO, no de lo que quedó después de
 * filtrar: elegir una sucursal no borra las demás de la lista.
 */
export type MetricsFilterOptions = {
  branches: string[];
  channels: MetricsChannel[];
  campaigns: string[];
};

/**
 * Totales del período.
 *
 * Las que hoy vienen siempre en `null` —ventas y facturación offline,
 * conversión total, CPA y ROAS— dependen de poder contar las ventas de
 * cumpleaños, y ORIGEN todavía no tiene lector de planillas de
 * reservas. `gasto_meta` y `cpl` sí traen número cuando la hoja
 * GASTO META tiene datos del período.
 */
export type MetricsSummary = {
  consultas: number;
  consultas_de_anuncios: number;
  consultas_de_web: number;
  consultas_organico: number;
  consultas_espontaneas: number;
  consultas_sin_identificar: number;
  consultas_ig_msn_sin_telefono: number;
  repetidas_descartadas: number;

  /**
   * Las tres salen de la hoja VENTAS ONLINE, que NO sabe por qué canal
   * consultó el comprador. Con el filtro por canal puesto vienen en
   * `null`: recortarlas por canal sería inventar esa atribución. Lo
   * que sí responde al canal son las `ventas_online_atribuidas` de
   * `sources`, que salen de ORIGEN.
   */
  ventas_online: number | null;
  facturacion_online: number | null;
  ticket_promedio_online: number | null;

  ventas_offline: number | null;
  facturacion_offline: number | null;
  conversion_total: number | null;

  gasto_meta: number | null;
  cpl: number | null;
  cpa: number | null;
  roas: number | null;
};

/**
 * Un origen de consultas.
 *
 * `share` viene calculado por ORIGEN sobre el total del período, en
 * porcentaje (28.6 = 28,6%). El panel lo muestra tal cual: recalcularlo
 * acá solo abriría la puerta a que los dos números discrepen.
 *
 * `ventas_online_atribuidas` NO es lo mismo que `summary.ventas_online`:
 * son las compras web de gente que ANTES consultó por ese canal, y se
 * cuentan por la fecha de la consulta, no la del pedido. Son dos
 * cohortes distintas y no tienen por qué coincidir.
 */
export type MetricsSource = {
  consultas: number;
  share: number | null;
  ventas_online_atribuidas: number | null;
  facturacion_online_atribuida: number | null;
  definicion: string;
};

/** Las espontáneas vienen partidas en dos, como en la hoja PANEL. */
export type MetricsSourceEspontaneas = MetricsSource & {
  nunca_vino_por_anuncio: number;
  ya_habia_venido_por_anuncio: number;
};

export type MetricsSources = {
  meta_ads: MetricsSource;
  organico: MetricsSource;
  web: MetricsSource;
  espontaneas: MetricsSourceEspontaneas;
  sin_atribuir: MetricsSource;
  /** Las repetidas no entran en el total: son la misma persona dos veces. */
  repetidas: MetricsSource;
};

export type MetricsBranch = {
  marca: string;
  consultas: number;
  de_anuncios: number;
  de_web: number;
  organico: number;
  espontaneas: number;
  sin_identificar: number;
  repetidas: number;
  sin_telefono: number;

  /** `null` con filtro por canal: ver la nota en MetricsSummary. */
  ventas_online: number | null;
  facturacion_online: number | null;
  ticket_promedio_online: number | null;

  ventas_online_atribuidas: number;
  facturacion_online_atribuida: number;

  ventas_offline: number | null;
  facturacion_offline: number | null;

  gasto_meta: number | null;
  cpl: number | null;
  cpa: number | null;
  roas: number | null;
};

export type MetricsCampaign = {
  campana: string;
  consultas: number;
  gasto_meta: number | null;
  cpl: number | null;
  /** La persona consultó por esta campaña y después compró en la web. */
  ventas_online_atribuidas: number;
  facturacion_online_atribuida: number;
  /** El pedido de WooCommerce traía esta campaña en su utm_campaign. */
  ventas_online_utm: number;
  facturacion_online_utm: number;
  ventas_offline: number | null;
  cpa: number | null;
  roas: number | null;
};

export type MetricsAd = {
  campana: string;
  conjunto: string;
  anuncio: string;
  consultas: number;
  gasto_meta: number | null;
  ventas_offline: number | null;
};

/**
 * Un día de la serie.
 *
 * Ojo: `consultas` se cuenta por la fecha en que entró la consulta y
 * `ventas_online` por la fecha del pedido. Son dos relojes distintos,
 * a propósito: una consulta de hoy puede terminar en una compra de la
 * semana que viene.
 */
export type MetricsDay = {
  fecha: string;
  consultas: number;
  de_anuncios: number;
  de_web: number;
  organico: number;
  espontaneas: number;
  sin_identificar: number;
  /** `null` con filtro por canal: ver la nota en MetricsSummary. */
  ventas_online: number | null;
  facturacion_online: number | null;
  gasto_meta: number | null;
};

/**
 * Salud de los datos. Explica buena parte de los `null` de arriba.
 * `avisos` son textos ya redactados por ORIGEN: el panel los muestra
 * tal cual, no los interpreta ni los reescribe.
 */
export type MetricsDiagnostico = {
  /** Qué pudo y qué no pudo responder al filtro pedido. */
  filtros: {
    aplicados: MetricsFilters;
    consultas_excluidas_por_filtro: number;
    /** false = la hoja VENTAS ONLINE no puede responder a este filtro. */
    ventas_online_filtrables: boolean;
    gasto_meta_aplica_al_canal: boolean;
    ventas_online_sin_utm: number;
  };
  ads_detail: {
    anuncios_totales: number;
    devueltos: number;
    truncado: boolean;
  };
  gasto_meta: {
    hoja_con_datos_del_periodo: boolean;
    filas_del_periodo: number;
    ultimo_dia_cargado: string | null;
    dias_de_atraso: number | null;
    marcas_sin_cuenta_publicitaria: string[];
    cuentas_sin_marca: string[];
  };
  consultas: {
    fuera_del_periodo: number;
    repetidas_descartadas: number;
    sin_telefono: number;
  };
  ventas_offline: {
    senal_disponible: boolean;
    vendido_si: number;
    con_etiqueta_respond_io: number;
    lector_de_reservas: boolean;
  };
  ventas_online: {
    filas_leidas: number;
    descartadas: {
      vacias: number;
      repetidas: number;
      estado: number;
      sin_fecha: number;
      fuera_de_periodo: number;
    };
  };
  atribucion: {
    ventas_online_en_el_periodo: number;
    consultas_del_periodo_que_compraron_en_la_web: number;
  };
  avisos: string[];
};

/** La respuesta completa, ya validada (`ok: true`). */
export type MetricsOverview = {
  period: MetricsPeriod;
  filters: MetricsFilters;
  filter_options: MetricsFilterOptions;
  summary: MetricsSummary;
  sources: MetricsSources;
  branches: MetricsBranch[];
  campaigns: MetricsCampaign[];
  ads_detail: MetricsAd[];
  daily: MetricsDay[];
  diagnostico: MetricsDiagnostico;
};

/** Lo que llega por la red, antes de validar. */
export type MetricsResponse =
  | ({ ok: true } & MetricsOverview)
  | { ok: false; error: string };

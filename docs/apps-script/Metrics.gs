/**
 * ORIGEN ESCAPE — MÉTRICAS PARA EL ADMIN   ·   v179
 * ==================================================================
 *
 * Endpoint de SOLO LECTURA para la sección Métricas del panel Admin.
 *
 *     GET /exec?action=metrics&token=...
 *     GET /exec?action=metrics&token=...&from=2026-09-09&to=2026-09-17
 *
 * ARCHIVO SEPARADO A PROPÓSITO. El archivo principal se pega ENTERO
 * cada vez que sale una versión nueva (v179, v180…). Si esto viviera
 * adentro, el próximo pegado lo borraría. Acá sobrevive, y lo único
 * que hay que reaplicar en el archivo grande son las tres líneas de
 * `doGet()` — están al final de este comentario.
 *
 * QUÉ NO TOCA:
 *   · `doPost()` y los webhooks de respond.io y WooCommerce: intactos.
 *   · Las hojas: este archivo NO escribe nada. Ni una celda.
 *   · Las rutinas nocturnas, el gasto de Meta, los paneles: intactos.
 *   · El health check de `doGet()`: sigue contestando igual sin `action`.
 *
 * QUÉ REUSA (nada de esto se reimplementa):
 *   CFG, COL, ENCABEZADOS_ONLINE, ESTADOS_VENDIDO, CFG.CUENTAS_META
 *   responder()        la respuesta JSON, con el mismo Content-Type
 *   libroOrigen()      la planilla central
 *   aFecha()           lee fechas vengan como Date o como texto
 *   aFechaISO()        'AAAA-MM-DD' → Date, o null si no se entiende
 *   aNumero()          montos con $ y separadores
 *   quitarAcentos()    comparar sin acentos ni mayúsculas
 *   textoLimpio()      el "null" literal que manda respond.io
 *   esFilaRepetida()   la columna REPETIDA
 *   diaDe()            clave de fecha sin llamar a Utilities
 *   limpiarMojibake()  los emojis rotos de los nombres de campaña
 *   fechaDesdeComun()  la ventana por defecto, la misma que usa el PANEL
 *
 * LA CLASIFICACIÓN DE CONSULTAS es la de `armarPanel()`, copiada tal
 * cual para que los números del endpoint y los del PANEL no puedan
 * discrepar. Ver `grupoMetricsDe()`.
 *
 * NULL vs 0: `null` significa "el sistema no lo puede calcular de
 * forma confiable", `0` significa "lo calculé y da cero". Nunca se
 * rellena un faltante con cero. Hoy van en null: ventas y facturación
 * offline (Escape no tiene lector de reservas todavía —
 * CFG.PLANILLAS_VENTAS está vacío—), y todo lo que dependa de ellas:
 * conversión total, CPA y ROAS.
 *
 * PRIVACIDAD: solo salen agregados. Nunca teléfono, nombre, email,
 * mensaje inicial, contacto ID, canal ID, ID de Booknetic, referencia
 * de WooCommerce ni código de clic. La lectura de ORIGEN ni siquiera
 * llega a las columnas MENSAJE INICIAL y CODIGO DE CLIC META.
 *
 * ------------------------------------------------------------------
 * PARA CONECTARLO — el único cambio en el archivo principal:
 *
 *   function doGet(e) {
 *     if (e && e.parameter && e.parameter.action === 'metrics') {
 *       return responderMetrics(e);
 *     }
 *     return responder({ ok: true, servicio: 'atribucion origen v178 escape phone safe' });
 *   }
 *
 * Y una vez, desde el editor: correr `configurarTokenMetricas()`.
 * ------------------------------------------------------------------
 */

const METRICS_VERSION   = 'metrics v179';
const METRICS_PROP_TOKEN = 'METRICS_TOKEN';
/** Segundos que se cachea una respuesta. Protege de un frontend que reconsulte. */
const METRICS_CACHE_SEG = 300;
/** Tope de filas de ads_detail. Con más, la respuesta se vuelve impagable. */
const METRICS_TOPE_ADS  = 200;

/**
 * Canales que acepta el filtro. Son exactamente los grupos que
 * devuelve `grupoMetricsDe()`: no se inventa ninguna regla nueva de
 * clasificación, se reusa la que ya cuadra con la hoja PANEL.
 *
 * 'espontaneas' abarca los dos sabores que separa el PANEL —las que
 * nunca vinieron por un anuncio y las que ya habían venido—, porque
 * para filtrar son el mismo canal.
 */
const METRICS_CANALES = ['meta_ads', 'web', 'organico', 'espontaneas', 'sin_atribuir'];

// ==================================================================
// LA CLAVE DEL ENDPOINT
// ==================================================================
//
// Clave PROPIA, distinta de la del webhook. No es burocracia: la del
// webhook es la credencial con la que respond.io ESCRIBE en ORIGEN.
// Si se usara la misma, el Admin la llevaría en la URL —queda en el
// historial del browser, en logs y en cualquier proxy— y el que la
// viera podría inyectar consultas falsas por doPost(). Esta clave es
// de solo lectura: si se filtra, se filtran agregados.
//
// Va como parámetro de la URL y no como header Authorization a
// propósito. Un header dispara un preflight OPTIONS que Apps Script
// no sabe contestar (no existe doOptions), y el fetch desde el
// navegador fallaría aunque con curl funcione.

/** La clave guardada, o '' si todavía no se configuró. */
function metricsTokenActual() {
  return PropertiesService.getScriptProperties()
           .getProperty(METRICS_PROP_TOKEN) || '';
}

/**
 * Se corre UNA vez. Desde la planilla pregunta; desde el editor de
 * Apps Script (sin interfaz) genera una clave sola y la deja en el
 * registro de ejecuciones, que solo ve el dueño del script.
 *
 * No hay ítem de menú a propósito: `onOpen()` vive en el archivo
 * grande y se borraría en el próximo pegado de versión.
 */
function configurarTokenMetricas() {
  const props = PropertiesService.getScriptProperties();

  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }

  if (!ui) {
    const nueva = Utilities.getUuid().replace(/-/g, '');
    props.setProperty(METRICS_PROP_TOKEN, nueva);
    console.log('METRICS_TOKEN generado: ' + nueva +
                '\nGuardalo en el Admin. Queda en Propiedades del proyecto.');
    return nueva;
  }

  const actual = props.getProperty(METRICS_PROP_TOKEN);
  const r = ui.prompt('Clave del endpoint de métricas',
    (actual ? 'Ya hay una clave guardada. ' : '') +
    'Escribí una clave larga y al azar, o dejá vacío para que la genere yo.\n\n' +
    'OJO: tiene que ser DISTINTA de la clave del webhook de respond.io. ' +
    'Esta viaja en la URL que consulta el Admin.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;

  const nueva = r.getResponseText().trim() ||
                Utilities.getUuid().replace(/-/g, '');
  props.setProperty(METRICS_PROP_TOKEN, nueva);
  ui.alert('Clave guardada.\n\n' + nueva + '\n\n' +
           'Probala con:\n/exec?action=metrics&token=' + nueva);
}

// ==================================================================
// LA PUERTA DE ENTRADA
// ==================================================================

/**
 * Lo que llama `doGet()` cuando viene `action=metrics`.
 *
 * Todo error se contesta como `{ ok:false, error:'...' }` con un texto
 * corto. El detalle y el stack quedan en el registro de ejecuciones,
 * que no ve el navegador.
 */
function responderMetrics(e) {
  try {
    const p = (e && e.parameter) ? e.parameter : {};

    const esperado = metricsTokenActual();
    if (!esperado) {
      return responder({ ok: false,
        error: 'metricas sin configurar: falta correr configurarTokenMetricas()' });
    }
    if (String(p.token || '') !== esperado) {
      // Se registra el largo, nunca la clave.
      console.log('METRICS rechazado por token (' +
                  String(p.token || '').length + ' caracteres recibidos)');
      return responder({ ok: false, error: 'token invalido' });
    }

    const rango = rangoMetrics(p);
    const filtros = getMetricsFilters(p);

    // Caché por período Y POR FILTRO. El endpoint lee tres hojas
    // enteras; si el Admin reconsulta al cambiar de pestaña, no hace
    // falta releerlas. Los filtros van en la clave: sin eso, pedir
    // "EG Núñez" devolvería lo cacheado de "todas las sucursales".
    let cache = null;
    const clave = [
      'metrics', METRICS_VERSION, rango.from, rango.to,
      filtros.branchKey || '*', filtros.channel || '*', filtros.campaignKey || '*'
    ].join('|');
    try { cache = CacheService.getScriptCache(); } catch (x) { cache = null; }
    if (cache) {
      try {
        const guardado = cache.get(clave);
        if (guardado) return metricsTexto(guardado);
      } catch (x) { /* caché caída: se calcula igual */ }
    }

    const texto = JSON.stringify(getMetricsPayload(rango, filtros));
    if (cache) {
      // Un payload grande no entra (el tope de CacheService es 100 KB).
      // No es un problema: sin caché el endpoint funciona igual.
      try { cache.put(clave, texto, METRICS_CACHE_SEG); } catch (x) {}
    }
    return metricsTexto(texto);

  } catch (err) {
    console.log('METRICS error: ' + err +
                (err && err.stack ? '\n' + err.stack : ''));
    return responder({ ok: false, error: mensajeMetrics(err) });
  }
}

/**
 * Mismo contrato que `responder()` —ContentService con MimeType JSON—
 * pero recibiendo el JSON ya armado. Es para no serializar dos veces
 * un payload grande cuando viene de la caché.
 */
function metricsTexto(json) {
  return ContentService.createTextOutput(json)
           .setMimeType(ContentService.MimeType.JSON);
}

/** Mensajes de error pensados para el navegador: cortos y sin interna. */
function mensajeMetrics(err) {
  const t = String((err && err.message) || err || '');
  if (t.indexOf('METRICS:') === 0) return t.substring(8).trim();
  return 'no pude armar las metricas';
}

function errorMetrics(texto) {
  return new Error('METRICS: ' + texto);
}

// ==================================================================
// EL PERÍODO
// ==================================================================

/**
 * Resuelve `from` y `to`.
 *
 * Sin fechas: desde `fechaDesdeComun()` —la misma ventana que usa el
 * PANEL, o sea CFG.DESDE— hasta hoy. Así el endpoint y la hoja PANEL
 * hablan del mismo período cuando no se pide nada.
 *
 * Las fechas NUNCA se comparan como texto: se normalizan a los bordes
 * del día en hora local, porque en la hoja conviven fechas reales de
 * Sheets con textos dd/MM/yyyy y con ISO.
 */
function rangoMetrics(p) {
  const hoy = new Date();

  let desde = null;
  if (p.from) {
    desde = aFechaISO(String(p.from).trim());
    if (!desde) throw errorMetrics('from invalido, se espera AAAA-MM-DD');
  } else {
    desde = fechaDesdeComun() || new Date(2020, 0, 1);
  }

  let hasta = null;
  if (p.to) {
    hasta = aFechaISO(String(p.to).trim());
    if (!hasta) throw errorMetrics('to invalido, se espera AAAA-MM-DD');
  } else {
    hasta = hoy;
  }

  const d0 = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const d1 = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate(),
                      23, 59, 59, 999);
  if (d0.getTime() > d1.getTime()) throw errorMetrics('from es posterior a to');

  return {
    desde: d0, hasta: d1,
    desdeMs: d0.getTime(), hastaMs: d1.getTime(),
    from: diaDe(d0), to: diaDe(d1)
  };
}

/** ¿Esta fecha cae adentro del período? `null` nunca entra. */
function enRangoMetrics(fecha, rango) {
  if (!fecha) return false;
  const t = fecha.getTime();
  return t >= rango.desdeMs && t <= rango.hastaMs;
}

// ==================================================================
// LOS FILTROS
// ==================================================================

/**
 * Lee `branch`, `channel` y `campaign` de la URL.
 *
 * Los tres son opcionales. Vacío, ausente o 'all' significan "no
 * filtrar", que es lo mismo que mandaba el panel antes: así una URL
 * vieja sigue devolviendo exactamente lo de siempre.
 *
 * Se guarda el texto tal cual llegó (para poder devolverlo en
 * `filters`) y además su clave normalizada, que es con la que se
 * compara. La comparación es EXACTA sobre esa clave: sin acentos, sin
 * mojibake y en mayúscula, pero sin matching parcial — "EG Núñez" no
 * puede matchear con "EG Núñez Centro".
 */
function getMetricsFilters(p) {
  const leer = function (valor) {
    const t = String(valor == null ? '' : valor).trim();
    if (!t || t.toLowerCase() === 'all') return null;
    return t;
  };

  const branch = leer(p.branch);
  const campaign = leer(p.campaign);
  const channel = leer(p.channel);

  if (channel && METRICS_CANALES.indexOf(channel) === -1) {
    // Un canal mal escrito no se ignora en silencio: ignorarlo
    // devolvería el universo entero y quien lo pidió creería estar
    // viendo un recorte.
    throw errorMetrics('channel invalido, se espera uno de: ' + METRICS_CANALES.join(', '));
  }

  return {
    branch: branch,
    channel: channel,
    campaign: campaign,
    branchKey: branch ? claveMetrics(branch) : null,
    campaignKey: campaign ? claveMetrics(campaign) : null,
    /** ¿Hay algún filtro puesto además del período? */
    activo: Boolean(branch || channel || campaign)
  };
}

/** ¿Este grupo de `grupoMetricsDe()` entra en el canal pedido? */
function canalCoincideMetrics(grupo, canal) {
  if (!canal) return true;
  if (canal === 'espontaneas') {
    return grupo === 'espontaneas' || grupo === 'espontaneas_post_anuncio';
  }
  return grupo === canal;
}

/** Comparación exacta sobre la clave normalizada. */
function coincideClaveMetrics(valor, clave) {
  if (!clave) return true;
  return claveMetrics(valor) === clave;
}

// ==================================================================
// LECTURA DE LAS HOJAS — una sola vez cada una
// ==================================================================

/**
 * ORIGEN, hasta la columna MONTO ONLINE (25).
 *
 * El corte no es casual: las columnas 26 y 27 son MENSAJE INICIAL y
 * CODIGO DE CLIC META. No hacen falta para ningún agregado, así que
 * ni se leen. Lo que no entra en memoria no se puede filtrar por error.
 */
function filasOrigenMetrics() {
  const hoja = libroOrigen().getSheetByName(CFG.HOJA_ORIGEN);
  if (!hoja || hoja.getLastRow() < 2) return [];
  const ancho = Math.min(hoja.getLastColumn(), COL.MONTO_ONLINE);
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, ancho).getValues();
}

/** VENTAS ONLINE. El ancho se acota a lo que la hoja tenga de verdad. */
function filasOnlineMetrics() {
  const hoja = libroOrigen().getSheetByName(CFG.HOJA_ONLINE);
  if (!hoja || hoja.getLastRow() < 2) return [];
  const ancho = Math.min(hoja.getLastColumn(), ENCABEZADOS_ONLINE.length);
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, ancho).getValues();
}

/** GASTO META: FECHA, CUENTA, CAMPAÑA, CONJUNTO, ANUNCIO, GASTO, IMPR, CONV. */
function filasGastoMetrics() {
  const hoja = libroOrigen().getSheetByName(CFG.HOJA_GASTO);
  if (!hoja || hoja.getLastRow() < 2) return [];
  const ancho = Math.min(hoja.getLastColumn(), 8);
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, ancho).getValues();
}

// ==================================================================
// CLASIFICACIÓN — la misma que armarPanel()
// ==================================================================

/**
 * Qué teléfonos llegaron ALGUNA VEZ por un anuncio, y cuándo la
 * primera. Sin filtro de fecha a propósito: sirve para saber si una
 * consulta espontánea de hoy es de alguien que ya había venido por la
 * pauta, y eso puede haber pasado antes del período.
 *
 * Copiado de `armarPanel()`, incluido el descarte de 'PRUEBA'.
 */
function primeraPorAnuncioMetrics(filas) {
  const mapa = {};
  filas.forEach(function (f) {
    const campana = quitarAcentos(String(f[COL.CAMPANA - 1] || '')).trim();
    if (!campana || campana === 'WEB' || campana === 'INSTAGRAM' ||
        campana === 'ORGANICO' || campana === 'SIN CAMPANA' ||
        campana === 'PRUEBA') return;
    const tel = String(f[COL.TELEFONO - 1] || '');
    const rec = aFecha(f[COL.RECIBIDO - 1]);
    if (!tel || !rec) return;
    if (!mapa[tel] || rec.getTime() < mapa[tel]) mapa[tel] = rec.getTime();
  });
  return mapa;
}

/**
 * De dónde vino una consulta. Mismas reglas que `armarPanel()`, con
 * los nombres que usa el JSON:
 *
 *   CAMPAÑA = WEB        → 'web'          botón de WhatsApp del sitio
 *   CAMPAÑA = INSTAGRAM  → 'organico'     bio o historia de IG, sin pauta
 *   CAMPAÑA = ORGANICO   → 'espontaneas'  no matcheó ningún botón
 *   vacía o SIN CAMPAÑA  → 'sin_atribuir'
 *   cualquier otra       → 'meta_ads'     nombre real de campaña
 *
 * OJO con una confusión que vale la pena tener clara: en este sistema
 * ORGÁNICO Y ESPONTÁNEA NO SON LO MISMO aunque el valor de la columna
 * se llame 'ORGANICO'. 'ORGANICO' es el FALLBACK de
 * `clasificarOrigen()`: la consulta no vino de un anuncio y su primer
 * mensaje no coincidió con ningún botón de BOTONES_WEB. Eso es una
 * consulta espontánea. El tráfico orgánico identificado de verdad es
 * el de Instagram (bio/historias), que sí tiene su propio valor.
 *
 * Las espontáneas se devuelven partidas en dos, como en el PANEL: las
 * de gente que YA había llegado antes por un anuncio son mérito de la
 * pauta aunque el último contacto no lo haya sido.
 */
function grupoMetricsDe(f, primeraPorAnuncio) {
  const campana = quitarAcentos(String(f[COL.CAMPANA - 1] || '')).trim();

  if (campana === 'WEB') return 'web';
  if (campana === 'INSTAGRAM') return 'organico';

  if (campana === 'ORGANICO') {
    const tel = String(f[COL.TELEFONO - 1] || '');
    const rec = aFecha(f[COL.RECIBIDO - 1]);
    const antes = tel ? primeraPorAnuncio[tel] : null;
    return (antes && rec && antes < rec.getTime())
      ? 'espontaneas_post_anuncio'
      : 'espontaneas';
  }

  if (!campana || campana === 'SIN CAMPANA') return 'sin_atribuir';
  return 'meta_ads';
}

/** Clave de agrupación: sin acentos, sin mojibake y en mayúscula. */
function claveMetrics(v) {
  return quitarAcentos(limpiarMojibake(v)).trim();
}

// ==================================================================
// ORIGEN — una pasada para todo
// ==================================================================

function recorrerOrigenMetrics(filas, rango, filtros) {
  filtros = filtros || { branchKey: null, channel: null, campaignKey: null };

  // OJO: se calcula sobre TODAS las filas, sin filtrar por fecha ni por
  // nada. Decide si una espontánea de hoy es de alguien que ya había
  // venido por un anuncio, y ese anuncio pudo ser antes del período o
  // en otra sucursal. Recortarlo cambiaría la clasificación.
  const primeraPorAnuncio = primeraPorAnuncioMetrics(filas);

  const r = {
    total: 0, sinTelefono: 0, repetidas: 0, fuera: 0,
    /** Filas del período que quedaron afuera por branch/channel/campaign. */
    excluidosPorFiltro: 0,
    /** Universo para los selects: se junta ANTES de aplicar los filtros. */
    opciones: { marcas: {}, campanas: {} },
    porGrupo: {},          // grupo → consultas
    onlinePorGrupo: {},    // grupo → { ventas, facturacion }
    porMarca: {},
    porCampana: {},
    porAnuncio: {},
    porDia: {},
    comprasWeb: 0,         // consultas del período que después compraron

    // Señal de venta OFFLINE. Hoy no alimenta ninguna métrica —
    // `ventas_offline` sigue en null— pero se cuenta para poder
    // contestar "¿hay con qué?" sin abrir la planilla. Son las dos
    // fuentes que mira `tieneVenta()`:
    //   vendidoSi  → lo escribe el cruce contra las planillas de
    //                reservas, que en Escape todavía no existe.
    //   conEtiqueta→ lo escribe marcarVentaPorEtiqueta() cuando el
    //                workflow de respond.io manda tipo=etiqueta.
    // Si las dos dan 0, no hay ninguna señal de venta offline.
    vendidoSi: 0,
    conEtiqueta: 0
  };

  const marca = function (nombre) {
    if (!r.porMarca[nombre]) {
      r.porMarca[nombre] = {
        consultas: 0, de_anuncios: 0, de_web: 0, organico: 0,
        espontaneas: 0, sin_identificar: 0, repetidas: 0, sin_telefono: 0,
        ventas_online_atribuidas: 0, facturacion_online_atribuida: 0
      };
    }
    return r.porMarca[nombre];
  };

  filas.forEach(function (f) {
    const rec = aFecha(f[COL.RECIBIDO - 1]);

    // Primero el período. `armarPanel()` cuenta las repetidas ANTES de
    // filtrar por fecha, así que su número es de todo el historial;
    // acá se cuentan las del período pedido, que es lo que corresponde
    // a un endpoint con from/to. Ver la nota en el README.
    if (!enRangoMetrics(rec, rango)) { r.fuera++; return; }

    const nombreMarca = String(f[COL.MARCA - 1] || '').trim() || 'sin marca';
    const grupo = grupoMetricsDe(f, primeraPorAnuncio);
    const campanaTexto = limpiarMojibake(f[COL.CAMPANA - 1]);

    // ---- opciones de los selects ----
    // Se juntan ACÁ, antes de filtrar, para que elegir una sucursal no
    // borre a las demás de la lista. El universo de opciones lo define
    // el período; branch/channel/campaign son la selección adentro de
    // ese universo, no lo que lo define.
    r.opciones.marcas[nombreMarca] = true;
    if (grupo === 'meta_ads' && campanaTexto) r.opciones.campanas[campanaTexto] = true;

    // ---- filtros ----
    if (!coincideClaveMetrics(nombreMarca, filtros.branchKey)) { r.excluidosPorFiltro++; return; }
    if (!canalCoincideMetrics(grupo, filtros.channel)) { r.excluidosPorFiltro++; return; }
    // Una consulta que no vino de un anuncio no tiene campaña, así que
    // nunca puede entrar en un filtro por campaña.
    if (filtros.campaignKey &&
        !(grupo === 'meta_ads' && coincideClaveMetrics(campanaTexto, filtros.campaignKey))) {
      r.excluidosPorFiltro++; return;
    }

    if (esFilaRepetida(f)) {
      r.repetidas++;
      marca(nombreMarca).repetidas++;
      return;
    }

    r.total++;
    const m = marca(nombreMarca);
    m.consultas++;

    const sinTel = !String(f[COL.TELEFONO - 1] || '').trim();
    if (sinTel) { r.sinTelefono++; m.sin_telefono++; }

    if (String(f[COL.VENDIDO - 1] || '').toUpperCase() === 'SI') r.vendidoSi++;
    if (String(f[COL.ETIQUETA - 1] || '').trim()) r.conEtiqueta++;

    r.porGrupo[grupo] = (r.porGrupo[grupo] || 0) + 1;

    if (grupo === 'meta_ads') m.de_anuncios++;
    else if (grupo === 'web') m.de_web++;
    else if (grupo === 'organico') m.organico++;
    else if (grupo === 'sin_atribuir') m.sin_identificar++;
    else m.espontaneas++;               // espontaneas y espontaneas_post_anuncio

    // ---- compra web de esta consulta ----
    // Es la columna que llena `cruzarVentasOnline()`: la persona
    // consultó y DESPUÉS compró en la tienda. Se cuenta en el día de
    // la CONSULTA, igual que hacen el PANEL y el HISTORIAL.
    const comproEnLaWeb =
      String(f[COL.VENTA_ONLINE - 1] || '').toUpperCase() === 'SI';
    let montoWeb = 0;
    if (comproEnLaWeb) {
      montoWeb = aNumero(f[COL.MONTO_ONLINE - 1]);
      r.comprasWeb++;
      m.ventas_online_atribuidas++;
      m.facturacion_online_atribuida += montoWeb;
      if (!r.onlinePorGrupo[grupo]) r.onlinePorGrupo[grupo] = { ventas: 0, facturacion: 0 };
      r.onlinePorGrupo[grupo].ventas++;
      r.onlinePorGrupo[grupo].facturacion += montoWeb;
    }

    // ---- campaña, conjunto y anuncio: solo lo que vino de pauta ----
    if (grupo === 'meta_ads') {
      const conjunto = limpiarMojibake(f[COL.CONJUNTO - 1]);
      const anuncio  = limpiarMojibake(f[COL.ANUNCIO - 1]);

      const kc = claveMetrics(campanaTexto);
      if (!r.porCampana[kc]) {
        r.porCampana[kc] = { campana: campanaTexto, consultas: 0,
                             ventas_online_atribuidas: 0,
                             facturacion_online_atribuida: 0 };
      }
      r.porCampana[kc].consultas++;
      if (comproEnLaWeb) {
        r.porCampana[kc].ventas_online_atribuidas++;
        r.porCampana[kc].facturacion_online_atribuida += montoWeb;
      }

      const ka = kc + ' ▸ ' + claveMetrics(conjunto) + ' ▸ ' + claveMetrics(anuncio);
      if (!r.porAnuncio[ka]) {
        r.porAnuncio[ka] = { campana: campanaTexto, conjunto: conjunto,
                             anuncio: anuncio, consultas: 0 };
      }
      r.porAnuncio[ka].consultas++;
    }

    // ---- serie diaria ----
    const dia = diaDe(rec);
    if (!r.porDia[dia]) {
      r.porDia[dia] = { consultas: 0, de_anuncios: 0, de_web: 0,
                        organico: 0, espontaneas: 0, sin_identificar: 0 };
    }
    const d = r.porDia[dia];
    d.consultas++;
    if (grupo === 'meta_ads') d.de_anuncios++;
    else if (grupo === 'web') d.de_web++;
    else if (grupo === 'organico') d.organico++;
    else if (grupo === 'sin_atribuir') d.sin_identificar++;
    else d.espontaneas++;
  });

  return r;
}

// ==================================================================
// VENTAS ONLINE — la fuente confiable
// ==================================================================

/**
 * Lee VENTAS ONLINE con las mismas reglas que `ventasWebPorUnidad()`:
 *
 *   · fila en blanco (alguien borró el contenido en vez de la fila) → afuera;
 *   · REFERENCIA repetida → se cuenta una sola vez. WooCommerce reenvía el
 *     mismo pedido en cada cambio de estado, y antes del candado de la v149
 *     quedaron filas duplicadas en la hoja;
 *   · ESTADO tiene que estar en ESTADOS_VENDIDO ('processing', 'completed')
 *     o venir vacío. 'cancelled' y 'pending' quedan afuera;
 *   · el período se aplica sobre FECHA DEL PEDIDO, con RECIBIDO de reserva.
 *
 * FILTROS — y acá está el límite honesto de esta hoja:
 *
 *   branch   → sí. La hoja trae MARCA.
 *   campaign → sí, por la utm_campaign que escribió WooCommerce. Los
 *              pedidos que vienen sin utm quedan afuera, que es lo
 *              correcto: no se les inventa una campaña.
 *   channel  → NO SE PUEDE. Un pedido de WooCommerce no sabe por qué
 *              canal consultó esa persona, ni si consultó. Filtrar
 *              estas ventas por canal sería inventar la atribución que
 *              justamente no tenemos.
 *
 * Por eso, con `channel` puesto, `disponible` queda en false y todo lo
 * que sale de esta hoja se devuelve como `null`. Lo que sí responde al
 * filtro por canal son las `ventas_online_atribuidas`, que salen de
 * ORIGEN —donde cada consulta sí tiene canal— y por eso viven aparte.
 */
function getOnlineSalesMetrics(filas, rango, filtros) {
  filtros = filtros || { branchKey: null, channel: null, campaignKey: null };

  const r = {
    disponible: !filtros.channel,
    ventas: 0, facturacion: 0,
    porMarca: {}, porCampana: {}, porDia: {},
    opciones: { marcas: {}, campanas: {} },
    descartadas: { vacias: 0, repetidas: 0, estado: 0, sin_fecha: 0,
                   fuera_de_periodo: 0, por_filtro: 0, sin_utm: 0 },
    leidas: 0
  };
  const refs = {};

  filas.forEach(function (f) {
    // Fila en blanco: mismo criterio que la v155.
    if (!textoLimpio(f[3]) && !textoLimpio(f[4]) &&
        !aNumero(f[5]) && !textoLimpio(f[8])) { r.descartadas.vacias++; return; }

    r.leidas++;

    const ref = textoLimpio(f[8]);
    if (ref) {
      if (refs[ref]) { r.descartadas.repetidas++; return; }
      refs[ref] = true;
    }

    const estado = String(f[7] || '').trim().toLowerCase();
    if (estado && ESTADOS_VENDIDO.indexOf(estado) === -1) {
      r.descartadas.estado++; return;
    }

    const fecha = aFecha(f[6]) || aFecha(f[0]);
    if (!fecha) { r.descartadas.sin_fecha++; return; }

    const nombreMarca = textoLimpio(f[3]) || 'sin marca';
    if (!enRangoMetrics(fecha, rango)) { r.descartadas.fuera_de_periodo++; return; }

    // La campaña de la venta es la utm_campaign que escribió
    // WooCommerce. Si viene vacía NO se atribuye a nada: inventar una
    // campaña para que el número cierre sería exactamente lo contrario
    // de lo que tiene que hacer un sistema de atribución.
    const campana = limpiarMojibake(f[18]);

    // ---- opciones: antes de filtrar, igual que en ORIGEN ----
    r.opciones.marcas[nombreMarca] = true;
    if (campana) r.opciones.campanas[campana] = true;

    // ---- filtros ----
    if (!r.disponible) return;              // channel: esta hoja no lo puede responder
    if (!coincideClaveMetrics(nombreMarca, filtros.branchKey)) { r.descartadas.por_filtro++; return; }
    if (filtros.campaignKey) {
      if (!campana) { r.descartadas.sin_utm++; return; }
      if (!coincideClaveMetrics(campana, filtros.campaignKey)) { r.descartadas.por_filtro++; return; }
    }

    const monto = aNumero(f[5]);
    r.ventas++;
    r.facturacion += monto;

    if (!r.porMarca[nombreMarca]) r.porMarca[nombreMarca] = { ventas: 0, facturacion: 0 };
    r.porMarca[nombreMarca].ventas++;
    r.porMarca[nombreMarca].facturacion += monto;

    if (campana) {
      const k = claveMetrics(campana);
      if (!r.porCampana[k]) r.porCampana[k] = { campana: campana, ventas: 0, facturacion: 0 };
      r.porCampana[k].ventas++;
      r.porCampana[k].facturacion += monto;
    }

    const dia = diaDe(fecha);
    if (!r.porDia[dia]) r.porDia[dia] = { ventas: 0, facturacion: 0 };
    r.porDia[dia].ventas++;
    r.porDia[dia].facturacion += monto;
  });

  return r;
}

// ==================================================================
// GASTO DE META
// ==================================================================

/**
 * Gasto del período, por marca y por nivel.
 *
 * NO se reusa `gastoPorNivel()` ni `gastoDeMeta()` porque ninguna de
 * las dos filtra por fecha —leen la hoja entera— y las consume el
 * resumen por anuncio y el panel de marketing. Tocarlas sería cambiar
 * lógica existente. Esta es la misma idea con el filtro puesto, y las
 * originales quedan intactas.
 *
 * `disponible` es falso cuando la hoja no tiene ninguna fila del
 * período. En ese caso el gasto sale `null`, no cero: no es que no se
 * haya gastado, es que no se sabe.
 *
 * FILTROS:
 *
 *   branch   → sí, resolviendo cuenta → marca con CFG.CUENTAS_META.
 *   campaign → sí, por la columna CAMPAÑA.
 *   channel  → solo tiene sentido con `meta_ads`. Esta hoja ES la
 *              pauta de Meta: pedir el gasto de un período filtrado
 *              por "web" u "orgánico" no da cero, da una pregunta mal
 *              hecha. Con cualquier canal que no sea meta_ads el gasto
 *              sale `null`, porque ese gasto existe pero no pertenece
 *              al canal que se está mirando. Cero diría que no se
 *              gastó, y no es verdad.
 */
function getGastoMetrics(filas, rango, filtros) {
  filtros = filtros || { branchKey: null, channel: null, campaignKey: null };

  const aplicaAlCanal = !filtros.channel || filtros.channel === 'meta_ads';

  const r = {
    disponible: false, aplicaAlCanal: aplicaAlCanal, total: 0,
    porMarca: {}, porCampana: {}, porConjunto: {}, porAnuncio: {}, porDia: {},
    cuentasSinMarca: {}, ultimoDia: null, filasPeriodo: 0
  };

  const marcaDeCuenta = {};
  (CFG.CUENTAS_META || []).forEach(function (c) {
    marcaDeCuenta[claveMetrics(c.nombre)] = c.marca;
  });

  filas.forEach(function (f) {
    const fecha = aFecha(f[0]);
    if (!fecha) return;

    if (!r.ultimoDia || fecha.getTime() > r.ultimoDia.getTime()) r.ultimoDia = fecha;
    if (!enRangoMetrics(fecha, rango)) return;
    if (!aplicaAlCanal) return;

    const cuenta = String(f[1] || '').trim();
    const marca = marcaDeCuenta[claveMetrics(cuenta)];

    // ---- filtros ----
    if (filtros.branchKey && claveMetrics(marca || '') !== filtros.branchKey) return;
    if (!coincideClaveMetrics(f[2], filtros.campaignKey)) return;

    const gasto = aNumero(f[5]);
    r.filasPeriodo++;
    r.total += gasto;

    if (marca) r.porMarca[marca] = (r.porMarca[marca] || 0) + gasto;
    else if (cuenta) r.cuentasSinMarca[cuenta] = (r.cuentasSinMarca[cuenta] || 0) + gasto;

    const suma = function (destino, valor) {
      const k = claveMetrics(valor);
      if (!k) return;
      destino[k] = (destino[k] || 0) + gasto;
    };
    suma(r.porCampana, f[2]);
    suma(r.porConjunto, f[3]);
    suma(r.porAnuncio, f[4]);

    const dia = diaDe(fecha);
    r.porDia[dia] = (r.porDia[dia] || 0) + gasto;
  });

  r.disponible = r.filasPeriodo > 0;
  return r;
}

// ==================================================================
// ARMADO DEL PAYLOAD
// ==================================================================

function getMetricsPayload(rango, filtros) {
  filtros = filtros || getMetricsFilters({});

  const origen  = recorrerOrigenMetrics(filasOrigenMetrics(), rango, filtros);
  const online  = getOnlineSalesMetrics(filasOnlineMetrics(), rango, filtros);
  const gasto   = getGastoMetrics(filasGastoMetrics(), rango, filtros);

  return {
    ok: true,
    period: {
      from: rango.from,
      to: rango.to,
      generated_at: new Date().toISOString(),
      version: METRICS_VERSION
    },
    // Qué universo devolvió el backend. El panel lo lee para no tener
    // que adivinar si su pedido se aplicó tal cual.
    filters: {
      branch: filtros.branch,
      channel: filtros.channel,
      campaign: filtros.campaign
    },
    filter_options: getMetricsFilterOptions(origen, online),
    summary:    getMetricsSummary(origen, online, gasto),
    sources:    getMetricsSources(origen, online),
    branches:   getMetricsBranches(origen, online, gasto),
    campaigns:  getMetricsCampaigns(origen, online, gasto),
    ads_detail: getMetricsAdsDetail(origen, gasto),
    daily:      getMetricsDaily(origen, online, gasto),
    diagnostico: getMetricsDiagnostico(origen, online, gasto, filtros)
  };
}

/**
 * Las opciones de los selects.
 *
 * Salen del universo del PERÍODO, no de lo que quedó después de
 * filtrar. Es la diferencia entre un filtro y un embudo: elegir
 * "EG Núñez" no puede borrar a las demás sucursales de la lista, o
 * volver atrás exigiría resetear todo.
 *
 * Las marcas se juntan de las dos hojas: ORIGEN tiene las que reciben
 * consultas y VENTAS ONLINE tiene las que venden por la web, que no
 * son el mismo conjunto.
 */
function getMetricsFilterOptions(origen, online) {
  const juntar = function (a, b) {
    const vistos = {};
    Object.keys(a || {}).forEach(function (k) { vistos[k] = true; });
    Object.keys(b || {}).forEach(function (k) { vistos[k] = true; });
    return Object.keys(vistos).sort();
  };

  return {
    branches: juntar(origen.opciones.marcas, online.opciones.marcas),
    channels: METRICS_CANALES.slice(),
    campaigns: juntar(origen.opciones.campanas, online.opciones.campanas)
  };
}

/**
 * Los totales del período.
 *
 * `consultas_organico` no estaba en el pedido original pero se agrega
 * para que la suma cierre: consultas = anuncios + web + orgánico +
 * espontáneas + sin identificar. Sin ese renglón, las consultas de
 * Instagram (bio/historias) desaparecerían de la cuenta.
 */
function getMetricsSummary(origen, online, gasto) {
  const g = origen.porGrupo;
  const espontaneas = (g['espontaneas'] || 0) + (g['espontaneas_post_anuncio'] || 0);
  const deAnuncios = g['meta_ads'] || 0;

  const gastoMeta = gasto.disponible ? Math.round(gasto.total) : null;

  return {
    consultas: origen.total,
    consultas_de_anuncios: deAnuncios,
    consultas_de_web: g['web'] || 0,
    consultas_organico: g['organico'] || 0,
    consultas_espontaneas: espontaneas,
    consultas_sin_identificar: g['sin_atribuir'] || 0,
    consultas_ig_msn_sin_telefono: origen.sinTelefono,
    repetidas_descartadas: origen.repetidas,

    // Con el filtro por canal puesto, estas tres salen en `null`: la
    // hoja VENTAS ONLINE no sabe por qué canal consultó el comprador,
    // y recortarla por canal sería inventar esa atribución. Ver
    // `getOnlineSalesMetrics()`. Lo que sí responde al canal son las
    // ventas atribuidas, que salen de ORIGEN.
    ventas_online: online.disponible ? online.ventas : null,
    facturacion_online: online.disponible ? Math.round(online.facturacion) : null,
    ticket_promedio_online: !online.disponible
      ? null
      : (online.ventas ? Math.round(online.facturacion / online.ventas) : 0),

    // Escape no tiene todavía lector de planillas de reservas
    // (CFG.PLANILLAS_VENTAS está vacío), así que las ventas de
    // cumpleaños no se pueden contar. Y sin ellas, la conversión
    // total, el CPA y el ROAS serían una fracción del negocio
    // presentada como si fuera el negocio entero.
    ventas_offline: null,
    facturacion_offline: null,
    conversion_total: null,

    gasto_meta: gastoMeta,
    // CPL sobre las consultas DE ANUNCIOS, que es lo que la pauta
    // generó. Es el mismo criterio del PANEL ("costo real por consulta").
    cpl: (gastoMeta !== null && deAnuncios) ? Math.round(gastoMeta / deAnuncios) : null,
    cpa: null,
    roas: null
  };
}

/**
 * De dónde vienen las consultas.
 *
 * `ventas_online_atribuidas` son las compras web de gente que ANTES
 * consultó por ese canal: salen de la columna VENTA ONLINE de ORIGEN.
 * Es un subconjunto de `summary.ventas_online` —que cuenta la hoja
 * VENTAS ONLINE entera, haya consultado o no— y además se cuentan por
 * la fecha de la CONSULTA, no la del pedido. Por eso llevan otro
 * nombre: son dos preguntas distintas y sumarlas no significa nada.
 */
function getMetricsSources(origen, online) {
  const g = origen.porGrupo;
  const o = origen.onlinePorGrupo;
  const total = origen.total;

  const bloque = function (consultas, claves, definicion) {
    let ventas = 0, facturacion = 0;
    claves.forEach(function (k) {
      if (o[k]) { ventas += o[k].ventas; facturacion += o[k].facturacion; }
    });
    return {
      consultas: consultas,
      share: total ? Math.round((consultas / total) * 1000) / 10 : 0,
      ventas_online_atribuidas: ventas,
      facturacion_online_atribuida: Math.round(facturacion),
      definicion: definicion
    };
  };

  return {
    meta_ads: bloque(g['meta_ads'] || 0, ['meta_ads'],
      'CAMPAÑA con nombre real de campaña: la consulta vino de un anuncio de Meta.'),

    organico: bloque(g['organico'] || 0, ['organico'],
      'CAMPAÑA = INSTAGRAM: bio o historia de Instagram. Tráfico orgánico identificado, sin pauta.'),

    web: bloque(g['web'] || 0, ['web'],
      'CAMPAÑA = WEB: botón de WhatsApp del sitio, detectado por el primer mensaje (BOTONES_WEB).'),

    espontaneas: (function () {
      const b = bloque((g['espontaneas'] || 0) + (g['espontaneas_post_anuncio'] || 0),
        ['espontaneas', 'espontaneas_post_anuncio'],
        'CAMPAÑA = ORGANICO: escribió sin venir de un anuncio y sin matchear ningún botón. ' +
        'No es lo mismo que "organico": es el fallback de clasificarOrigen().');
      b.nunca_vino_por_anuncio = g['espontaneas'] || 0;
      b.ya_habia_venido_por_anuncio = g['espontaneas_post_anuncio'] || 0;
      return b;
    })(),

    sin_atribuir: bloque(g['sin_atribuir'] || 0, ['sin_atribuir'],
      'CAMPAÑA vacía o SIN CAMPAÑA: entró antes de que el flujo clasificara, o el workflow no mandó nada.'),

    repetidas: {
      consultas: origen.repetidas,
      share: null,
      ventas_online_atribuidas: null,
      facturacion_online_atribuida: null,
      definicion: 'REPETIDA = SI. No entran en ningún otro bloque ni en el total de consultas: ' +
                  'son la misma persona contada dos veces (incluye los mellizos orgánicos).'
    }
  };
}

/**
 * Una fila por marca/sucursal.
 *
 * Las consultas salen de ORIGEN.MARCA y las ventas online de
 * VENTAS ONLINE.MARCA, así que la lista es la UNIÓN de las dos: una
 * sucursal que vende por la web pero no tiene número propio de
 * WhatsApp en respond.io —EG Bariloche, EG La Plata— aparece igual,
 * con sus ventas y con cero consultas.
 *
 * La unión se arma con los agregados YA FILTRADOS, no con el universo
 * de marcas. Si no, filtrar por una sucursal seguiría devolviendo
 * filas de todas las demás, en cero. Para el select de sucursales
 * está `filter_options.branches`, que sí trae el universo entero.
 */
function getMetricsBranches(origen, online, gasto) {
  const nombres = {};
  Object.keys(origen.porMarca).forEach(function (m) { nombres[m] = true; });
  Object.keys(online.porMarca).forEach(function (m) { nombres[m] = true; });
  Object.keys(gasto.porMarca).forEach(function (m) { nombres[m] = true; });

  return Object.keys(nombres).sort().map(function (nombre) {
    const c = origen.porMarca[nombre] || {
      consultas: 0, de_anuncios: 0, de_web: 0, organico: 0, espontaneas: 0,
      sin_identificar: 0, repetidas: 0, sin_telefono: 0,
      ventas_online_atribuidas: 0, facturacion_online_atribuida: 0
    };
    const v = online.porMarca[nombre] || { ventas: 0, facturacion: 0 };

    // Sin cuenta en CFG.CUENTAS_META no hay forma de saber cuánto
    // gastó esa sucursal. Va null, no cero.
    const tieneCuenta = Object.prototype.hasOwnProperty.call(gasto.porMarca, nombre);
    const g = (gasto.disponible && tieneCuenta) ? Math.round(gasto.porMarca[nombre]) : null;

    return {
      marca: nombre,
      consultas: c.consultas,
      de_anuncios: c.de_anuncios,
      de_web: c.de_web,
      organico: c.organico,
      espontaneas: c.espontaneas,
      sin_identificar: c.sin_identificar,
      repetidas: c.repetidas,
      sin_telefono: c.sin_telefono,

      // Mismo motivo que en `summary`: con filtro por canal, la hoja
      // VENTAS ONLINE no puede responder y estas tres van en null.
      ventas_online: online.disponible ? v.ventas : null,
      facturacion_online: online.disponible ? Math.round(v.facturacion) : null,
      ticket_promedio_online: !online.disponible
        ? null
        : (v.ventas ? Math.round(v.facturacion / v.ventas) : 0),

      ventas_online_atribuidas: c.ventas_online_atribuidas,
      facturacion_online_atribuida: Math.round(c.facturacion_online_atribuida),

      ventas_offline: null,
      facturacion_offline: null,

      gasto_meta: g,
      cpl: (g !== null && c.de_anuncios) ? Math.round(g / c.de_anuncios) : null,
      cpa: null,
      roas: null
    };
  });
}

/**
 * Campañas, ordenadas por consultas.
 *
 * Dos señales distintas de venta, con nombres distintos porque miden
 * cosas distintas:
 *
 *   ventas_online_atribuidas → la persona consultó por esa campaña y
 *     después compró en la web (columna VENTA ONLINE de ORIGEN).
 *   ventas_online_utm → el pedido de WooCommerce traía esa campaña en
 *     la utm_campaign. Cuando viene vacía no se atribuye a ninguna
 *     campaña, así que estas nunca suman de más.
 */
function getMetricsCampaigns(origen, online, gasto) {
  const claves = {};
  Object.keys(origen.porCampana).forEach(function (k) { claves[k] = true; });
  Object.keys(online.porCampana).forEach(function (k) { claves[k] = true; });

  return Object.keys(claves).map(function (k) {
    const c = origen.porCampana[k] || { campana: '', consultas: 0,
      ventas_online_atribuidas: 0, facturacion_online_atribuida: 0 };
    const u = online.porCampana[k] || { campana: '', ventas: 0, facturacion: 0 };

    const tieneGasto = Object.prototype.hasOwnProperty.call(gasto.porCampana, k);
    const g = (gasto.disponible && tieneGasto) ? Math.round(gasto.porCampana[k]) : null;

    return {
      campana: c.campana || u.campana || k,
      consultas: c.consultas,
      gasto_meta: g,
      cpl: (g !== null && c.consultas) ? Math.round(g / c.consultas) : null,
      ventas_online_atribuidas: c.ventas_online_atribuidas,
      facturacion_online_atribuida: Math.round(c.facturacion_online_atribuida),
      ventas_online_utm: u.ventas,
      facturacion_online_utm: Math.round(u.facturacion),
      ventas_offline: null,
      cpa: null,
      roas: null
    };
  }).sort(function (a, b) { return b.consultas - a.consultas; });
}

/**
 * Campaña ▸ conjunto ▸ anuncio.
 *
 * El gasto se cruza por NOMBRE de anuncio, que es lo único que
 * comparten ORIGEN y GASTO META. Los dos lados se normalizan igual
 * (sin acentos, sin mojibake, en mayúscula) porque los nombres que
 * manda respond.io traen los emojis rotos y los de la API de Meta no.
 * Si no hay match el gasto va `null`: puede ser un anuncio que nunca
 * corrió, o un nombre que no coincide. No es cero.
 */
function getMetricsAdsDetail(origen, gasto) {
  const lista = Object.keys(origen.porAnuncio).map(function (k) {
    const a = origen.porAnuncio[k];
    const ka = claveMetrics(a.anuncio);
    const tiene = ka && Object.prototype.hasOwnProperty.call(gasto.porAnuncio, ka);
    return {
      campana: a.campana,
      conjunto: a.conjunto,
      anuncio: a.anuncio,
      consultas: a.consultas,
      gasto_meta: (gasto.disponible && tiene) ? Math.round(gasto.porAnuncio[ka]) : null,
      ventas_offline: null
    };
  }).sort(function (x, y) { return y.consultas - x.consultas; });

  // El recorte se avisa en `diagnostico.ads_detail`, no como propiedad
  // del array: una propiedad suelta en un array no sobrevive a
  // JSON.stringify y el frontend nunca la vería.
  return lista.slice(0, METRICS_TOPE_ADS);
}

/**
 * Serie por día.
 *
 * Las consultas se cuentan por RECIBIDO y las ventas online por
 * FECHA DEL PEDIDO, que son dos relojes distintos: una consulta de
 * hoy puede terminar en una compra de la semana que viene. Cada día
 * dice lo que pasó ESE día en cada fuente, sin mezclarlos.
 *
 * Solo aparecen los días con algo. Un día sin consultas ni ventas no
 * se inventa: si el frontend necesita la serie completa, rellena.
 */
function getMetricsDaily(origen, online, gasto) {
  const dias = {};
  Object.keys(origen.porDia).forEach(function (d) { dias[d] = true; });
  Object.keys(online.porDia).forEach(function (d) { dias[d] = true; });
  if (gasto.disponible) Object.keys(gasto.porDia).forEach(function (d) { dias[d] = true; });

  return Object.keys(dias).sort().map(function (d) {
    const c = origen.porDia[d] || { consultas: 0, de_anuncios: 0, de_web: 0,
                                    organico: 0, espontaneas: 0, sin_identificar: 0 };
    const v = online.porDia[d] || { ventas: 0, facturacion: 0 };
    return {
      fecha: d,
      consultas: c.consultas,
      de_anuncios: c.de_anuncios,
      de_web: c.de_web,
      organico: c.organico,
      espontaneas: c.espontaneas,
      sin_identificar: c.sin_identificar,
      ventas_online: online.disponible ? v.ventas : null,
      facturacion_online: online.disponible ? Math.round(v.facturacion) : null,
      gasto_meta: gasto.disponible ? Math.round(gasto.porDia[d] || 0) : null
    };
  });
}

/**
 * Salud de los datos. No es decoración: buena parte de los `null` de
 * arriba se explican acá, y sin esto el panel no puede distinguir
 * "no pasó nada" de "no lo estamos midiendo".
 */
function getMetricsDiagnostico(origen, online, gasto, filtros) {
  filtros = filtros || { branch: null, channel: null, campaign: null, activo: false };
  const avisos = [];

  // ---- qué pudo y qué no pudo responder al filtro ----
  if (filtros.channel) {
    avisos.push('Filtro por canal "' + filtros.channel + '": las ventas de la hoja VENTAS ONLINE ' +
                'no se pueden recortar por canal —un pedido de WooCommerce no sabe por dónde ' +
                'consultó esa persona—, así que ventas_online, facturacion_online y ' +
                'ticket_promedio_online van en null. Lo que sí responde al filtro son las ' +
                'ventas_online_atribuidas, que salen de ORIGEN.');
    if (!gasto.aplicaAlCanal) {
      avisos.push('El gasto de Meta va en null: la hoja GASTO META es pauta de Meta, y el canal ' +
                  'pedido no es meta_ads. Ese gasto existe, pero no pertenece al canal que se ' +
                  'está mirando; poner cero diría que no se gastó, y no es cierto.');
    }
  }
  if (filtros.campaign && online.descartadas.sin_utm > 0) {
    avisos.push(online.descartadas.sin_utm + ' ventas online del período no traen utm_campaign, ' +
                'así que nunca pueden entrar en un filtro por campaña. No se les inventa una.');
  }

  // ---- gasto de Meta ----
  const hoy = new Date();
  const atraso = gasto.ultimoDia
    ? Math.floor((hoy.getTime() - gasto.ultimoDia.getTime()) / 86400000) : null;

  if (!gasto.disponible) {
    avisos.push('La hoja GASTO META no tiene filas del período: gasto_meta, cpl, cpa y roas van en null.');
  } else if (atraso !== null && atraso > 2) {
    avisos.push('El gasto de Meta está atrasado ' + atraso + ' días (último día cargado: ' +
                diaDe(gasto.ultimoDia) + '). Meta publica con un día de rezago; más de dos ' +
                'suele ser el token vencido.');
  }

  // Marcas con consultas de anuncios pero sin cuenta publicitaria
  // configurada en CFG.CUENTAS_META. Hoy: EG Caballito y Hell
  // Experiment, que figuran como pendientes en el propio CFG.
  const marcasConCuenta = {};
  (CFG.CUENTAS_META || []).forEach(function (c) { marcasConCuenta[c.marca] = true; });
  const sinCuenta = [];
  Object.keys(origen.porMarca).forEach(function (m) {
    if (m === 'sin marca') return;
    if (origen.porMarca[m].de_anuncios > 0 && !marcasConCuenta[m]) sinCuenta.push(m);
  });
  if (sinCuenta.length) {
    avisos.push('Estas marcas tienen consultas de anuncios pero no tienen cuenta en ' +
                'CFG.CUENTAS_META, así que su gasto y su CPL van en null: ' +
                sinCuenta.sort().join(', ') + '.');
  }

  const cuentasSinMarca = Object.keys(gasto.cuentasSinMarca);
  if (cuentasSinMarca.length) {
    avisos.push('Hay gasto cargado con nombres de cuenta que no figuran en CFG.CUENTAS_META ' +
                '(' + cuentasSinMarca.join(', ') + '): suma al total del grupo pero no se ' +
                'asigna a ninguna sucursal.');
  }

  // ---- ventas offline ----
  const haySenal = (origen.vendidoSi + origen.conEtiqueta) > 0;
  avisos.push('Las ventas de cumpleaños (offline) no se pueden contar: CFG.PLANILLAS_VENTAS ' +
              'está vacío para Escape, el lector de planillas de reservas todavía no existe. ' +
              'Por eso ventas_offline, facturacion_offline, conversion_total, cpa y roas son null.');
  if (haySenal) {
    avisos.push('Igual hay señal de venta offline en el período (' + origen.vendidoSi +
                ' con VENDIDO=SI, ' + origen.conEtiqueta + ' con ETIQUETA VENTA). Si la ' +
                'cobertura es buena, ventas_offline y conversion_total se pueden encender ' +
                'sin esperar al lector de reservas. La facturación no: la etiqueta no trae monto.');
  } else {
    avisos.push('No hay NINGUNA señal de venta offline en el período: las columnas VENDIDO y ' +
                'ETIQUETA VENTA están vacías. Si el workflow tipo=etiqueta de respond.io ' +
                'estuviera andando, acá aparecerían las ventas marcadas a mano.');
  }

  if (origen.sinTelefono > 0) {
    avisos.push(origen.sinTelefono + (origen.sinTelefono === 1
        ? ' consulta del período entró' : ' consultas del período entraron') +
      ' por Instagram o Messenger sin teléfono: nunca se van a poder cruzar contra una venta.');
  }

  if (online.descartadas.repetidas > 0) {
    avisos.push(online.descartadas.repetidas + (online.descartadas.repetidas === 1
        ? ' fila de VENTAS ONLINE es el mismo pedido repetido'
        : ' filas de VENTAS ONLINE son el mismo pedido repetido') +
      ' (misma REFERENCIA) y se contó una sola vez.');
  }

  const anunciosTotales = Object.keys(origen.porAnuncio).length;
  if (anunciosTotales > METRICS_TOPE_ADS) {
    avisos.push('ads_detail viene recortado a los ' + METRICS_TOPE_ADS +
                ' anuncios con más consultas, de ' + anunciosTotales + ' en total.');
  }

  return {
    filtros: {
      aplicados: {
        branch: filtros.branch,
        channel: filtros.channel,
        campaign: filtros.campaign
      },
      consultas_excluidas_por_filtro: origen.excluidosPorFiltro,
      /** false = la hoja VENTAS ONLINE no puede responder a este filtro. */
      ventas_online_filtrables: online.disponible,
      gasto_meta_aplica_al_canal: gasto.aplicaAlCanal,
      ventas_online_sin_utm: online.descartadas.sin_utm
    },
    ads_detail: {
      anuncios_totales: anunciosTotales,
      devueltos: Math.min(anunciosTotales, METRICS_TOPE_ADS),
      truncado: anunciosTotales > METRICS_TOPE_ADS
    },
    gasto_meta: {
      hoja_con_datos_del_periodo: gasto.disponible,
      filas_del_periodo: gasto.filasPeriodo,
      ultimo_dia_cargado: gasto.ultimoDia ? diaDe(gasto.ultimoDia) : null,
      dias_de_atraso: atraso,
      marcas_sin_cuenta_publicitaria: sinCuenta.sort(),
      cuentas_sin_marca: cuentasSinMarca.sort()
    },
    consultas: {
      fuera_del_periodo: origen.fuera,
      repetidas_descartadas: origen.repetidas,
      sin_telefono: origen.sinTelefono
    },
    // Qué tan lejos está `ventas_offline` de poder salir de null.
    // Es un indicador de señal, NO una métrica: un conteo parcial
    // publicado como "ventas offline" arrastraría a conversion_total
    // y a cpa a un número sesgado, que es peor que un null.
    ventas_offline: {
      senal_disponible: haySenal,
      vendido_si: origen.vendidoSi,
      con_etiqueta_respond_io: origen.conEtiqueta,
      lector_de_reservas: (CFG.PLANILLAS_VENTAS || []).length > 0
    },
    ventas_online: {
      filas_leidas: online.leidas,
      descartadas: online.descartadas
    },
    atribucion: {
      // Dos cohortes distintas, a propósito separadas: la primera se
      // cuenta por fecha del pedido, la segunda por fecha de la consulta.
      ventas_online_en_el_periodo: online.ventas,
      consultas_del_periodo_que_compraron_en_la_web: origen.comprasWeb
    },
    avisos: avisos
  };
}

// ==================================================================
// PRUEBA DESDE EL EDITOR
// ==================================================================

/**
 * Corre el endpoint sin pasar por la web y deja el resultado en el
 * registro de ejecuciones. Sirve para verificar los números contra la
 * hoja PANEL sin publicar una versión nueva.
 */
function probarMetrics() {
  const salida = responderMetrics({
    parameter: { action: 'metrics', token: metricsTokenActual() }
  });
  const texto = salida.getContent();
  const o = JSON.parse(texto);

  console.log('ok: ' + o.ok);
  if (!o.ok) { console.log('error: ' + o.error); return; }

  console.log('período: ' + o.period.from + ' a ' + o.period.to);
  console.log('consultas: ' + o.summary.consultas +
              '  (anuncios ' + o.summary.consultas_de_anuncios +
              ' · web ' + o.summary.consultas_de_web +
              ' · orgánico ' + o.summary.consultas_organico +
              ' · espontáneas ' + o.summary.consultas_espontaneas +
              ' · sin identificar ' + o.summary.consultas_sin_identificar + ')');
  console.log('suma de las partes: ' +
    (o.summary.consultas_de_anuncios + o.summary.consultas_de_web +
     o.summary.consultas_organico + o.summary.consultas_espontaneas +
     o.summary.consultas_sin_identificar));
  console.log('repetidas descartadas: ' + o.summary.repetidas_descartadas);
  console.log('ventas online: ' + o.summary.ventas_online +
              ' · facturación ' + o.summary.facturacion_online +
              ' · ticket ' + o.summary.ticket_promedio_online);
  console.log('gasto meta: ' + o.summary.gasto_meta + ' · cpl: ' + o.summary.cpl);
  console.log('sucursales: ' + o.branches.length +
              ' · campañas: ' + o.campaigns.length +
              ' · anuncios: ' + o.ads_detail.length +
              ' · días: ' + o.daily.length);
  console.log('tamaño de la respuesta: ' + texto.length + ' caracteres');
  o.diagnostico.avisos.forEach(function (a) { console.log('AVISO · ' + a); });
}

// ==================================================================
// VALIDACIÓN CONTRA LA HOJA PANEL
// ==================================================================

/**
 * Compara, renglón por renglón, lo que devuelve el endpoint contra lo
 * que dice la hoja PANEL. Es la prueba que no se puede hacer con datos
 * sintéticos: acá se ejercita la planilla real.
 *
 * ANTES DE CORRERLA: menú Atribución → "3. Panel — todo junto", para
 * que PANEL esté fresco. Si se compara contra un PANEL de anoche, las
 * consultas de hoy aparecen como diferencia y no es un error.
 *
 * `hastaISO` es opcional, formato AAAA-MM-DD. Sirve justamente para
 * eso: si PANEL se generó anoche, pasando la fecha de ayer las dos
 * puntas miran el mismo período y la comparación cierra exacta.
 *
 *     compararMetricsConPanel()              // hasta hoy
 *     compararMetricsConPanel('2026-09-16')  // hasta el 16, como PANEL de anoche
 *
 * No escribe nada: lee PANEL y lee las hojas de siempre.
 */
function compararMetricsConPanel(hastaISO) {
  const hoja = libroOrigen().getSheetByName('PANEL');
  if (!hoja || hoja.getLastRow() < 2) {
    avisar('No encuentro la hoja PANEL (o está vacía).\n\n' +
           'Corré primero: menú Atribución → "3. Panel — todo junto".');
    return;
  }

  const filas = hoja.getRange(1, 1, hoja.getLastRow(), 5).getValues();
  const rango = rangoMetrics(hastaISO ? { to: hastaISO } : {});
  // Sin filtros a propósito: la hoja PANEL es el consolidado del grupo,
  // así que compararla contra un recorte no diría nada.
  const p = getMetricsPayload(rango, getMetricsFilters({}));

  // PANEL repite etiquetas entre bloques: "Anuncios pagos" está en
  // DE DÓNDE VIENEN y otra vez en COMPRAS EN LA WEB, con otro
  // significado. Por eso cada búsqueda se acota a su sección.
  const dondeEsta = function (etiqueta, desde, hasta) {
    const buscado = quitarAcentos(String(etiqueta)).trim();
    for (let i = desde; i < hasta; i++) {
      if (quitarAcentos(String(filas[i][0] || '')).trim() === buscado) return i;
    }
    return -1;
  };
  const seccion = function (titulo) { return dondeEsta(titulo, 0, filas.length); };

  const iDonde = seccion('DE DÓNDE VIENEN');
  const iQuien = seccion('QUIÉN LAS ATENDIÓ');
  const iPlata = seccion('LA PLATA');

  if (iDonde === -1) {
    avisar('La hoja PANEL no tiene el bloque "DE DÓNDE VIENEN". ' +
           '¿Está generada con una versión vieja del script?');
    return;
  }

  const finDonde = (iQuien !== -1) ? iQuien : filas.length;
  const finPlata = (iPlata !== -1) ? filas.length : 0;

  /** Valor de la columna B de la fila con esa etiqueta, o null si no está. */
  const valor = function (etiqueta, desde, hasta) {
    const i = dondeEsta(etiqueta, desde, hasta);
    return i === -1 ? null : aNumero(filas[i][1]);
  };

  const cmp = [];
  const fila = function (concepto, enPanel, enEndpoint, nota) {
    cmp.push({ concepto: concepto, panel: enPanel, endpoint: enEndpoint,
               nota: nota || '' });
  };

  // ---- cabecera del PANEL ----
  // Las tres últimas solo se escriben si son distintas de cero, así
  // que "no está la fila" hay que leerlo como cero, no como error.
  fila('Consultas del período',
       valor('Consultas del período', 0, iDonde), p.summary.consultas);
  fila('Sin teléfono (IG / Messenger)',
       valor('De Instagram o Messenger, sin teléfono', 0, iDonde) || 0,
       p.summary.consultas_ig_msn_sin_telefono);
  fila('Repetidas descartadas',
       valor('Repetidas descartadas (misma persona, mismo anuncio)', 0, iDonde) || 0,
       p.summary.repetidas_descartadas,
       'DIFERENCIA ESPERADA: armarPanel() las cuenta de todo el historial; ' +
       'el endpoint, solo las del período pedido.');

  // ---- bloque DE DÓNDE VIENEN ----
  fila('Anuncios pagos',
       valor('Anuncios pagos', iDonde, finDonde) || 0, p.summary.consultas_de_anuncios);
  fila('Sitio web',
       valor('Sitio web', iDonde, finDonde) || 0, p.summary.consultas_de_web);
  fila('Instagram (bio / historias)',
       valor('Instagram (bio / historias)', iDonde, finDonde) || 0,
       p.summary.consultas_organico);
  fila('Espontáneas — nunca vinieron por un anuncio',
       valor('Espontáneas — nunca vinieron por un anuncio', iDonde, finDonde) || 0,
       p.sources.espontaneas.nunca_vino_por_anuncio);
  fila('Espontáneas — ya habían venido por un anuncio',
       valor('Espontáneas — ya habían venido por un anuncio', iDonde, finDonde) || 0,
       p.sources.espontaneas.ya_habia_venido_por_anuncio);
  fila('Sin identificar',
       valor('Sin identificar', iDonde, finDonde) || 0,
       p.summary.consultas_sin_identificar);

  // ---- gasto ----
  if (iPlata !== -1) {
    fila('Gasto total', valor('Gasto total', iPlata, finPlata),
         p.summary.gasto_meta,
         'PANEL suma la hoja GASTO META entera; el endpoint solo el período.');
  }

  // ---- informe ----
  const pad = function (s, n) {
    s = String(s === null || s === undefined ? '—' : s);
    while (s.length < n) s += ' ';
    return s.substring(0, n);
  };
  const padIzq = function (s, n) {
    s = String(s === null || s === undefined ? '—' : s);
    while (s.length < n) s = ' ' + s;
    return s;
  };

  const L = [];
  L.push('ENDPOINT vs HOJA PANEL');
  L.push('');
  L.push('Período del endpoint: ' + rango.from + ' a ' + rango.to);
  L.push('PANEL no guarda su fecha de generación. Si no coincide, regeneralo');
  L.push('(menú → 3. Panel) o pasale la fecha: compararMetricsConPanel(\'AAAA-MM-DD\').');
  L.push('');
  L.push(pad('CONCEPTO', 46) + padIzq('PANEL', 9) + padIzq('ENDPOINT', 11) + padIzq('DIF', 8));
  L.push(new Array(75).join('-'));

  let iguales = 0, distintos = 0, esperados = 0, faltantes = 0;

  cmp.forEach(function (c) {
    let dif = '—';
    if (c.panel === null) { faltantes++; }
    else {
      const d = c.endpoint === null ? null : (c.endpoint - c.panel);
      dif = (d === null) ? 'null' : (d > 0 ? '+' + d : String(d));
      if (d === 0) iguales++;
      else if (c.nota) esperados++;
      else distintos++;
    }
    L.push(pad(c.concepto, 46) + padIzq(c.panel, 9) +
           padIzq(c.endpoint, 11) + padIzq(dif, 8));
    if (c.nota) L.push('      ↳ ' + c.nota);
  });

  L.push('');
  L.push('Coinciden: ' + iguales + '   ·   Difieren sin explicación: ' + distintos +
         '   ·   Diferencias esperadas: ' + esperados +
         (faltantes ? '   ·   No estaban en PANEL: ' + faltantes : ''));
  L.push('');

  if (distintos === 0) {
    L.push('VALIDADO: todo lo que tenía que coincidir, coincide.');
  } else {
    L.push('HAY ' + distintos + ' RENGLÓN(ES) QUE NO CIERRAN. Antes de tocar código,');
    L.push('descartá lo obvio: ¿PANEL está generado con el mismo corte de fecha?');
    L.push('Una diferencia chica y positiva en "Consultas del período" casi siempre');
    L.push('son las consultas que entraron después de la última corrida del PANEL.');
  }

  avisarLargo(L.join('\n'), 'Endpoint vs PANEL');
  console.log(L.join('\n'));
  return { iguales: iguales, distintos: distintos, esperados: esperados };
}

/**
 * Busca datos personales en la respuesta. Tiene que decir que no
 * encontró nada. Es el test 7 del pedido, automatizado.
 */
function auditarMetricsSinDatosPersonales() {
  const salida = responderMetrics({
    parameter: { action: 'metrics', token: metricsTokenActual() }
  });
  const texto = salida.getContent();

  const sospechas = [];
  const patron = function (nombre, re) {
    const m = texto.match(re);
    if (m) sospechas.push(nombre + ': ' + String(m[0]).substring(0, 40));
  };

  patron('email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  patron('teléfono de 10+ dígitos', /\b\d{10,}\b/);
  patron('referencia WooCommerce', /WC-\d+/);
  ['telefono', 'phone', 'email', 'nombre', 'mensaje', 'contacto_id',
   'canal_id', 'booknetic', 'referencia', 'codigo_de_clic'].forEach(function (k) {
    if (texto.toLowerCase().indexOf('"' + k + '"') !== -1) {
      sospechas.push('clave "' + k + '" en el JSON');
    }
  });

  if (!sospechas.length) {
    console.log('OK: no encontré datos personales en la respuesta (' +
                texto.length + ' caracteres revisados).');
  } else {
    console.log('REVISAR:\n   ' + sospechas.join('\n   '));
  }
}

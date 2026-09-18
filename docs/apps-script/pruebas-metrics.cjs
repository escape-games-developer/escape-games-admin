/**
 * Banco de pruebas del endpoint de métricas.
 *
 * Carga el Apps Script REAL (origen-escape.js) y encima Metrics.gs, en
 * un contexto con Apps Script stubbeado y tres hojas sintéticas. Así se
 * ejercita la lógica de verdad — aFecha, quitarAcentos, esFilaRepetida,
 * limpiarMojibake, CFG, COL — y no una reimplementación.
 *
 *     node docs/apps-script/pruebas-metrics.cjs
 *
 * Extensión .cjs y no .js porque este repo declara "type": "module" en
 * su package.json, y con .js Node lo cargaría como ESM y `require`
 * fallaría. Nada de esto corre en Apps Script: es solo el banco.
 *
 * SRC_MAIN apunta a una copia del archivo grande del proyecto de Apps
 * Script. Si está en otro lado, cambiar esa constante.
 */
const fs = require('fs');
const vm = require('vm');

const SRC_MAIN = 'C:/Users/magdi/Downloads/origen-escape.js';
const SRC_METRICS = 'C:/Users/magdi/proyectos/escape-admin-panel/docs/apps-script/Metrics.gs';

// ---------------------------------------------------------------- hojas
const f = (y, m, d, h) => new Date(y, m - 1, d, h || 0, 0, 0);
const fila = (n) => new Array(n).fill('');

// ORIGEN: 25 columnas (hasta MONTO ONLINE). Índices 0-based = COL - 1.
function origenRow(o) {
  const r = fila(25);
  r[0] = o.recibido; r[1] = o.tel || ''; r[3] = o.clid || '';
  r[4] = o.campana || ''; r[5] = o.conjunto || ''; r[6] = o.anuncio || '';
  r[9] = o.marca || ''; r[18] = o.contacto || ''; r[19] = o.repetida || '';
  r[10] = o.vendido || '';        // COL.VENDIDO
  r[20] = o.etiqueta || '';       // COL.ETIQUETA
  r[22] = o.ventaOnline || ''; r[24] = o.montoOnline || '';
  return r;
}
const ORIGEN = [
  origenRow({ recibido: f(2026, 9, 10, 10), tel: '1111111111', campana: 'Escape Parejas',
              conjunto: 'Nuñez 5km', anuncio: 'Video sala', marca: 'EG Núñez',
              ventaOnline: 'SI', montoOnline: 25000 }),
  // Lleva VENDIDO=SI a propósito: simula que algún día exista el cruce
  // contra reservas. Sirve para probar que, aun con señal offline
  // fuerte, ventas_offline / conversion_total / cpa / roas SIGUEN en
  // null hasta que la cobertura esté validada.
  origenRow({ recibido: f(2026, 9, 10, 11), tel: '2222222222', campana: 'WEB',
              anuncio: 'boton web', marca: 'EG Palermo', vendido: 'SI' }),
  origenRow({ recibido: f(2026, 9, 11, 9), tel: '3333333333', campana: 'ORGANICO', marca: 'EG Núñez' }),
  origenRow({ recibido: f(2026, 9, 11, 12), tel: '1111111111', campana: 'ORGANICO', marca: 'EG Núñez' }),
  origenRow({ recibido: f(2026, 9, 12, 9), tel: '', contacto: 'ig_1', campana: 'INSTAGRAM',
              anuncio: 'bio instagram', marca: 'EG Urquiza' }),
  origenRow({ recibido: f(2026, 9, 12, 10), tel: '4444444444', campana: 'SIN CAMPAÑA', marca: 'EG Palermo' }),
  origenRow({ recibido: f(2026, 9, 12, 11), tel: '5555555555', campana: 'Cumpleaños',
              conjunto: 'Caballito', anuncio: 'Carrusel', marca: 'EG Caballito',
              etiqueta: 'VENDIDO' }),
  origenRow({ recibido: f(2026, 9, 13, 9), tel: '6666666666', campana: 'Escape Parejas',
              marca: 'EG Núñez', repetida: 'SI' }),
  origenRow({ recibido: f(2026, 8, 1, 9), tel: '7777777777', campana: 'Escape Parejas', marca: 'EG Núñez' })
];

// VENTAS ONLINE: 24 columnas.
function onlineRow(o) {
  const r = fila(24);
  r[0] = o.recibido || o.pedido; r[1] = o.tel || ''; r[3] = o.marca || '';
  r[4] = o.servicio || 'Entrada'; r[5] = o.monto || 0; r[6] = o.pedido;
  r[7] = o.estado || ''; r[8] = o.ref || ''; r[9] = o.email || '';
  r[10] = o.nombre || ''; r[18] = o.campana || '';
  return r;
}
const ONLINE = [
  onlineRow({ pedido: f(2026, 9, 10), marca: 'EG Núñez', monto: 25000, estado: 'completed',
              ref: 'WC-1', campana: 'Escape Parejas', email: 'ana@example.com', nombre: 'Ana', tel: '1111111111' }),
  onlineRow({ pedido: f(2026, 9, 11), marca: 'EG Bariloche', monto: 30000, estado: 'processing', ref: 'WC-2' }),
  onlineRow({ pedido: f(2026, 9, 11), marca: 'EG Núñez', monto: 99999, estado: 'cancelled', ref: 'WC-3' }),
  onlineRow({ pedido: f(2026, 9, 10), marca: 'EG Núñez', monto: 25000, estado: 'completed', ref: 'WC-1' }),
  onlineRow({ pedido: f(2026, 8, 1), marca: 'EG Núñez', monto: 12345, estado: 'completed', ref: 'WC-4' }),
  fila(24)
];

// GASTO META: 8 columnas.
const GASTO = [
  [f(2026, 9, 10), 'EG Nuñez', 'Escape Parejas', 'Nuñez 5km', 'Video sala', 10000, 1000, 5],
  [f(2026, 9, 11), 'EG Palermo', 'Cumpleaños Palermo', 'Palermo', 'Foto', 5000, 500, 2],
  [f(2026, 8, 1), 'EG Nuñez', 'Vieja', 'x', 'y', 77777, 10, 1]
];

// PANEL sintético, con la forma exacta que escribe armarPanel() y con
// los valores que el endpoint tiene que reproducir. La última fila
// repite la etiqueta "Anuncios pagos" en otro bloque a propósito: es
// la trampa que obliga a acotar cada búsqueda a su sección.
const PANEL = [
  ['TODO EL GRUPO — desde el 2026-09-09', '', '', '', ''],
  ['', '', '', '', ''],
  ['Consultas del período', 7, '', '', ''],
  ['Consultas anteriores (no se cuentan)', 1, '', '', ''],
  ['De Instagram o Messenger, sin teléfono', 1, '', '', ''],
  ['Repetidas descartadas (misma persona, mismo anuncio)', 1, '', '', ''],
  ['', '', '', '', ''],
  ['DE DÓNDE VIENEN', '', '', '', ''],
  ['', 'CONSULTAS', 'VENTAS', 'FACTURADO', '% QUE COMPRA'],
  ['Anuncios pagos', 2, 0, 0, 0],
  ['Sitio web', 1, 0, 0, 0],
  ['Instagram (bio / historias)', 1, 0, 0, 0],
  ['Espontáneas — nunca vinieron por un anuncio', 1, 0, 0, 0],
  ['Espontáneas — ya habían venido por un anuncio', 1, 0, 0, 0],
  ['Sin identificar', 1, 0, 0, 0],
  ['', '', '', '', ''],
  ['QUIÉN LAS ATENDIÓ', '', '', '', ''],
  ['', 'CONSULTAS', 'VENTAS', 'FACTURADO', '% QUE COMPRA'],
  ['WhatsApp Núñez', 3, 0, 0, 0],
  ['', '', '', '', ''],
  ['LA PLATA', '', '', '', ''],
  ['', 'GASTO', 'CONVERSACIONES SEGÚN META', 'COSTO POR CONVERSACIÓN', ''],
  ['EG Nuñez', 10000, 5, 2000, ''],
  ['', '', '', '', ''],
  ['Gasto total', 15000, '', '', ''],
  ['', '', '', '', ''],
  ['COMPRAS EN LA WEB', '', '', '', ''],
  ['', 'CONSULTAS QUE COMPRARON', 'FACTURADO', '', ''],
  ['Anuncios pagos', 1, 25000, '', '']
];

const HOJAS = { 'ORIGEN': ORIGEN, 'VENTAS ONLINE': ONLINE, 'GASTO META': GASTO, 'PANEL': PANEL };

/**
 * `primeraFila` es en qué fila de la planilla arranca el array: 2 para
 * las hojas con encabezado (ORIGEN, VENTAS ONLINE, GASTO META) y 1
 * para PANEL, que es un informe y se lee desde arriba de todo.
 */
function hojaStub(filas, primeraFila) {
  primeraFila = primeraFila || 2;
  const ancho = filas.length ? Math.max(...filas.map(r => r.length)) : 0;
  return {
    getLastRow: () => filas.length + primeraFila - 1,
    getLastColumn: () => ancho,
    getRange: (r0, c0, n, w) => ({
      getValues: () => filas.slice(r0 - primeraFila, r0 - primeraFila + n)
                            .map(r => r.slice(c0 - 1, c0 - 1 + w))
    })
  };
}

/** Hojas cuyo array arranca en la fila 1 de la planilla. */
const DESDE_FILA_1 = { 'PANEL': true };

// --------------------------------------------------------------- stubs
const props = new Map([['METRICS_TOKEN', 'CLAVE-DE-PRUEBA']]);
const ctx = {
  console,
  Date, JSON, Math, String, Number, Object, Array, isNaN, parseFloat, parseInt, RegExp, Error,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: (n) => HOJAS[n] ? hojaStub(HOJAS[n], DESDE_FILA_1[n] ? 1 : 2) : null
    }),
    openById: () => { throw new Error('no deberia abrirse otra planilla'); },
    getUi: () => { throw new Error('sin interfaz'); },
    newDataValidation: () => ({}), ProtectionType: {}, MimeType: {}
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => props.set(k, v),
      deleteProperty: (k) => props.delete(k)
    })
  },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput: (t) => ({ getContent: () => t, setMimeType() { return this; } })
  },
  Utilities: {
    getUuid: () => 'uuid-de-prueba',
    formatDate: (d) => d.toISOString(),
    sleep: () => {}
  },
  Session: { getScriptTimeZone: () => 'America/Argentina/Buenos_Aires', getEffectiveUser: () => ({ getEmail: () => '' }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
  UrlFetchApp: {}, MailApp: {}, ScriptApp: { getProjectTriggers: () => [] }, HtmlService: {}, DriveApp: {}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC_MAIN, 'utf8'), ctx, { filename: 'origen-escape.js' });
vm.runInContext(fs.readFileSync(SRC_METRICS, 'utf8'), ctx, { filename: 'Metrics.gs' });

// -------------------------------------------------------------- pruebas
let fallos = 0;
function ok(nombre, cond, extra) {
  console.log((cond ? '  OK   ' : '  FALLA') + '  ' + nombre + (extra ? '   → ' + extra : ''));
  if (!cond) fallos++;
}

const salida = vm.runInContext(
  "responderMetrics({ parameter: { action:'metrics', token:'CLAVE-DE-PRUEBA' } })", ctx);
const texto = salida.getContent();
const o = JSON.parse(texto);

console.log('\n=== 2 · action=metrics devuelve JSON valido ===');
ok('ok:true', o.ok === true);
ok('period.from = CFG.DESDE', o.period.from === '2026-09-09', o.period.from);
ok('period.generated_at presente', !!o.period.generated_at);

console.log('\n=== 6 · consultas coinciden con la clasificacion de armarPanel ===');
const s = o.summary;
ok('consultas = 7', s.consultas === 7, String(s.consultas));
ok('de_anuncios = 2', s.consultas_de_anuncios === 2, String(s.consultas_de_anuncios));
ok('de_web = 1', s.consultas_de_web === 1, String(s.consultas_de_web));
ok('organico (IG bio) = 1', s.consultas_organico === 1, String(s.consultas_organico));
ok('espontaneas = 2', s.consultas_espontaneas === 2, String(s.consultas_espontaneas));
ok('sin_identificar = 1', s.consultas_sin_identificar === 1, String(s.consultas_sin_identificar));
const suma = s.consultas_de_anuncios + s.consultas_de_web + s.consultas_organico +
             s.consultas_espontaneas + s.consultas_sin_identificar;
ok('la suma de las partes cierra', suma === s.consultas, suma + ' vs ' + s.consultas);
ok('sin telefono (IG/MSN) = 1', s.consultas_ig_msn_sin_telefono === 1);
ok('repetidas descartadas = 1', s.repetidas_descartadas === 1);
ok('espontaneas partidas 1 + 1',
   o.sources.espontaneas.nunca_vino_por_anuncio === 1 &&
   o.sources.espontaneas.ya_habia_venido_por_anuncio === 1);

console.log('\n=== 4 y 5 · ventas online por estado y suma de MONTO ===');
ok('ventas_online = 2 (excluye cancelled, repetida y fuera de periodo)', s.ventas_online === 2, String(s.ventas_online));
ok('facturacion_online = 55000', s.facturacion_online === 55000, String(s.facturacion_online));
ok('ticket_promedio_online = 27500', s.ticket_promedio_online === 27500, String(s.ticket_promedio_online));
ok('descarta 1 por estado', o.diagnostico.ventas_online.descartadas.estado === 1);
ok('descarta 1 repetida por REFERENCIA', o.diagnostico.ventas_online.descartadas.repetidas === 1);
ok('descarta 1 fila vacia', o.diagnostico.ventas_online.descartadas.vacias === 1);

console.log('\n=== 8 · null donde no se puede calcular, 0 donde si ===');
ok('ventas_offline null', s.ventas_offline === null);
ok('facturacion_offline null', s.facturacion_offline === null);
ok('conversion_total null', s.conversion_total === null);
ok('cpa null', s.cpa === null);
ok('roas null', s.roas === null);
ok('gasto_meta = 15000 (hay fuente real)', s.gasto_meta === 15000, String(s.gasto_meta));
ok('cpl = 7500 (gasto / consultas de anuncios)', s.cpl === 7500, String(s.cpl));

console.log('\n=== señal de venta offline (indicador, NO metrica) ===');
const vo = o.diagnostico.ventas_offline;
ok('detecta la etiqueta de respond.io', vo.con_etiqueta_respond_io === 1, String(vo.con_etiqueta_respond_io));
ok('detecta VENDIDO=SI', vo.vendido_si === 1, String(vo.vendido_si));
ok('senal_disponible = true', vo.senal_disponible === true);
ok('lector_de_reservas = false (CFG.PLANILLAS_VENTAS vacio)', vo.lector_de_reservas === false);

// Candado explícito: mientras la cobertura de ETIQUETA VENTA no esté
// validada, estas cuatro NO se promueven por más señal que haya.
console.log('\n=== candado: las 4 offline NO se promueven ===');
['ventas_offline', 'facturacion_offline', 'conversion_total', 'cpa', 'roas'].forEach(k =>
  ok('summary.' + k + ' sigue en null pese a la señal', s[k] === null, String(s[k])));
ok('ninguna branch promueve ventas_offline/cpa/roas',
   o.branches.every(b => b.ventas_offline === null && b.facturacion_offline === null &&
                         b.cpa === null && b.roas === null));
ok('ninguna campaign promueve ventas_offline/cpa/roas',
   o.campaigns.every(c => c.ventas_offline === null && c.cpa === null && c.roas === null));
ok('ads_detail no promueve ventas_offline',
   o.ads_detail.every(a => a.ventas_offline === null));

console.log('\n=== branches ===');
const porMarca = {};
o.branches.forEach(b => porMarca[b.marca] = b);
ok('incluye EG Bariloche (solo en VENTAS ONLINE)', !!porMarca['EG Bariloche']);
ok('EG Bariloche: 0 consultas, 1 venta', porMarca['EG Bariloche'] &&
   porMarca['EG Bariloche'].consultas === 0 && porMarca['EG Bariloche'].ventas_online === 1);
ok('EG Núñez gasto = 10000', porMarca['EG Núñez'] && porMarca['EG Núñez'].gasto_meta === 10000,
   porMarca['EG Núñez'] ? String(porMarca['EG Núñez'].gasto_meta) : 'falta');
ok('EG Caballito gasto null (sin cuenta en CUENTAS_META)',
   porMarca['EG Caballito'] && porMarca['EG Caballito'].gasto_meta === null);
ok('EG Caballito cpa/roas null', porMarca['EG Caballito'] &&
   porMarca['EG Caballito'].cpa === null && porMarca['EG Caballito'].roas === null);
ok('todas las branches tienen ventas_offline null',
   o.branches.every(b => b.ventas_offline === null));

console.log('\n=== campaigns y ads_detail ===');
const camp = {};
o.campaigns.forEach(c => camp[c.campana] = c);
ok('Escape Parejas: 1 consulta', camp['Escape Parejas'] && camp['Escape Parejas'].consultas === 1);
ok('Escape Parejas: gasto 10000', camp['Escape Parejas'] && camp['Escape Parejas'].gasto_meta === 10000);
ok('Escape Parejas: venta por utm = 1', camp['Escape Parejas'] && camp['Escape Parejas'].ventas_online_utm === 1);
ok('Escape Parejas: venta atribuida por consulta = 1',
   camp['Escape Parejas'] && camp['Escape Parejas'].ventas_online_atribuidas === 1);
ok('Cumpleaños (sin gasto con ese nombre) → gasto null',
   camp['Cumpleaños'] && camp['Cumpleaños'].gasto_meta === null);
ok('ads_detail tiene 2 anuncios', o.ads_detail.length === 2, String(o.ads_detail.length));
const ad = o.ads_detail.filter(a => a.anuncio === 'Video sala')[0];
ok('Video sala cruza gasto 10000', ad && ad.gasto_meta === 10000);
const ad2 = o.ads_detail.filter(a => a.anuncio === 'Carrusel')[0];
ok('Carrusel sin gasto → null (no 0)', ad2 && ad2.gasto_meta === null);

console.log('\n=== daily ===');
// El 13/09 solo tiene una consulta REPETIDA: no genera día, igual que en
// armarHistorial(), que descarta las repetidas antes de tocar el día.
ok('3 dias con datos (el 13/09 es solo una repetida)', o.daily.length === 3,
   String(o.daily.length) + ' → ' + o.daily.map(d => d.fecha).join(', '));
const d10 = o.daily.filter(d => d.fecha === '2026-09-10')[0];
ok('10/09: 2 consultas', d10 && d10.consultas === 2);
ok('10/09: 1 venta online por FECHA DEL PEDIDO', d10 && d10.ventas_online === 1);
ok('10/09: gasto 10000', d10 && d10.gasto_meta === 10000);

console.log('\n=== 3 · filtro de fechas ===');
const salida2 = vm.runInContext(
  "responderMetrics({ parameter: { action:'metrics', token:'CLAVE-DE-PRUEBA', from:'2026-09-11', to:'2026-09-11' } })", ctx);
const o2 = JSON.parse(salida2.getContent());
ok('rango 11/09: 2 consultas', o2.summary.consultas === 2, String(o2.summary.consultas));
ok('rango 11/09: 1 venta online', o2.summary.ventas_online === 1, String(o2.summary.ventas_online));
ok('rango 11/09: gasto 5000', o2.summary.gasto_meta === 5000, String(o2.summary.gasto_meta));
ok('rango 11/09: period.from correcto', o2.period.from === '2026-09-11');

console.log('\n=== errores controlados ===');
const malo = JSON.parse(vm.runInContext(
  "responderMetrics({ parameter: { action:'metrics', token:'CLAVE-DE-PRUEBA', from:'11/09/2026' } })", ctx).getContent());
ok('from invalido → ok:false con mensaje corto', malo.ok === false && /AAAA-MM-DD/.test(malo.error), malo.error);
const alReves = JSON.parse(vm.runInContext(
  "responderMetrics({ parameter: { action:'metrics', token:'CLAVE-DE-PRUEBA', from:'2026-09-15', to:'2026-09-10' } })", ctx).getContent());
ok('from > to → ok:false', alReves.ok === false, alReves.error);
const sinToken = JSON.parse(vm.runInContext(
  "responderMetrics({ parameter: { action:'metrics' } })", ctx).getContent());
ok('sin token → ok:false', sinToken.ok === false && sinToken.error === 'token invalido');
ok('el error no trae stack trace', !/at |\.gs:|origen-escape/.test(JSON.stringify(malo)));

console.log('\n=== 1 · health check intacto ===');
const salud = JSON.parse(vm.runInContext("responder({ ok: true, servicio: 'atribucion origen v178 escape phone safe' })", ctx).getContent());
ok('responder() sigue devolviendo el health check', salud.ok === true &&
   salud.servicio === 'atribucion origen v178 escape phone safe');

console.log('\n=== 7 · sin datos personales en la respuesta ===');
const pii = [
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['telefono de 10+ digitos', /\b\d{10,}\b/],
  ['referencia WooCommerce', /WC-\d+/],
  ['nombre propio cargado (Ana)', /"[^"]*\bAna\b[^"]*"/]
];
pii.forEach(([n, re]) => ok('no aparece ' + n, !re.test(texto),
  re.test(texto) ? String(texto.match(re)[0]).substring(0, 40) : ''));
['"telefono"', '"phone"', '"email"', '"nombre"', '"mensaje"', '"contacto_id"',
 '"canal_id"', '"booknetic"', '"referencia"', '"codigo_de_clic"'].forEach(k =>
  ok('no expone la clave ' + k, texto.toLowerCase().indexOf(k) === -1));

// ==================================================================
// FILTROS — branch / channel / campaign
// ==================================================================
const pedir = (params) => JSON.parse(vm.runInContext(
  `responderMetrics({ parameter: ${JSON.stringify(
    Object.assign({ action: 'metrics', token: 'CLAVE-DE-PRUEBA' }, params))} })`,
  ctx).getContent());

console.log('\n=== 1 · sin filtros = los mismos numeros de siempre ===');
const sinFiltro = pedir({});
ok('consultas siguen en 7', sinFiltro.summary.consultas === 7, String(sinFiltro.summary.consultas));
ok('ventas online siguen en 2', sinFiltro.summary.ventas_online === 2);
ok('filters viene en null, null, null',
   sinFiltro.filters.branch === null && sinFiltro.filters.channel === null &&
   sinFiltro.filters.campaign === null, JSON.stringify(sinFiltro.filters));

console.log('\n=== opciones de los selects ===');
const op = sinFiltro.filter_options;
ok('branches trae las 5 marcas (ORIGEN + VENTAS ONLINE)', op.branches.length === 5,
   op.branches.join(', '));
ok('incluye EG Bariloche, que solo existe en VENTAS ONLINE',
   op.branches.indexOf('EG Bariloche') !== -1);
ok('channels son los 5 canales', op.channels.join(',') === 'meta_ads,web,organico,espontaneas,sin_atribuir',
   op.channels.join(','));
ok('campaigns trae las 2 campañas reales', op.campaigns.length === 2, op.campaigns.join(', '));

console.log('\n=== 2 · branch filtra una sola sucursal ===');
const nunez = pedir({ branch: 'EG Núñez' });
ok('EG Núñez: 3 consultas', nunez.summary.consultas === 3, String(nunez.summary.consultas));
ok('una sola branch en la respuesta', nunez.branches.length === 1, String(nunez.branches.length));
ok('esa branch es EG Núñez', nunez.branches[0] && nunez.branches[0].marca === 'EG Núñez');
ok('ventas online recortadas a esa sucursal', nunez.summary.ventas_online === 1,
   String(nunez.summary.ventas_online));
ok('gasto recortado a esa sucursal', nunez.summary.gasto_meta === 10000,
   String(nunez.summary.gasto_meta));
ok('filters lo refleja', nunez.filters.branch === 'EG Núñez');
ok('las opciones NO se achican al filtrar', nunez.filter_options.branches.length === 5,
   nunez.filter_options.branches.join(', '));

console.log('\n=== branch sin acentos ni mayusculas ===');
const nunezRaro = pedir({ branch: 'eg nunez' });
ok('"eg nunez" matchea "EG Núñez"', nunezRaro.summary.consultas === 3, String(nunezRaro.summary.consultas));

console.log('\n=== no hay matching parcial ===');
const parcial = pedir({ branch: 'EG' });
ok('"EG" no matchea ninguna sucursal', parcial.summary.consultas === 0, String(parcial.summary.consultas));

console.log('\n=== 3 · channel=meta_ads ===');
const meta = pedir({ channel: 'meta_ads' });
ok('solo las 2 consultas de anuncios', meta.summary.consultas === 2, String(meta.summary.consultas));
ok('consultas_de_anuncios = consultas', meta.summary.consultas_de_anuncios === 2);
ok('de_web pasa a 0', meta.summary.consultas_de_web === 0);
ok('gasto SÍ aplica a meta_ads', meta.summary.gasto_meta === 15000, String(meta.summary.gasto_meta));
ok('ventas_online va en null: la hoja Woo no sabe el canal',
   meta.summary.ventas_online === null, String(meta.summary.ventas_online));
ok('facturacion_online null', meta.summary.facturacion_online === null);
ok('ticket_promedio_online null', meta.summary.ticket_promedio_online === null);
ok('ventas_online_atribuidas SÍ responde al canal (sale de ORIGEN)',
   meta.sources.meta_ads.ventas_online_atribuidas === 1);
ok('diagnostico marca ventas_online como no filtrables',
   meta.diagnostico.filtros.ventas_online_filtrables === false);
ok('branches tambien null en ventas_online',
   meta.branches.every(b => b.ventas_online === null));
ok('daily tambien null en ventas_online',
   meta.daily.every(d => d.ventas_online === null));

console.log('\n=== 4 · channel=web ===');
const web = pedir({ channel: 'web' });
ok('solo la consulta de web', web.summary.consultas === 1, String(web.summary.consultas));
ok('consultas_de_web = 1', web.summary.consultas_de_web === 1);
ok('de_anuncios pasa a 0', web.summary.consultas_de_anuncios === 0);
ok('gasto va en null: la pauta no pertenece al canal web',
   web.summary.gasto_meta === null, String(web.summary.gasto_meta));
ok('diagnostico marca que el gasto no aplica al canal',
   web.diagnostico.filtros.gasto_meta_aplica_al_canal === false);
ok('campaigns queda vacio', web.campaigns.length === 0);
ok('ads_detail queda vacio', web.ads_detail.length === 0);

console.log('\n=== 5 · channel=espontaneas suma los dos sabores ===');
const esp = pedir({ channel: 'espontaneas' });
ok('2 consultas (nunca vino + ya habia venido)', esp.summary.consultas === 2, String(esp.summary.consultas));
ok('consultas_espontaneas = 2', esp.summary.consultas_espontaneas === 2);
ok('sigue partido en 1 + 1',
   esp.sources.espontaneas.nunca_vino_por_anuncio === 1 &&
   esp.sources.espontaneas.ya_habia_venido_por_anuncio === 1);

console.log('\n=== channel=organico y sin_atribuir ===');
ok('organico = 1', pedir({ channel: 'organico' }).summary.consultas === 1);
ok('sin_atribuir = 1', pedir({ channel: 'sin_atribuir' }).summary.consultas === 1);

console.log('\n=== 6 · campaign filtra ===');
const parejas = pedir({ campaign: 'Escape Parejas' });
ok('1 consulta de Escape Parejas', parejas.summary.consultas === 1, String(parejas.summary.consultas));
ok('una sola campaña en la respuesta', parejas.campaigns.length === 1);
ok('gasto recortado a esa campaña', parejas.summary.gasto_meta === 10000,
   String(parejas.summary.gasto_meta));
ok('venta online por utm de esa campaña', parejas.summary.ventas_online === 1,
   String(parejas.summary.ventas_online));
ok('la venta sin utm no entra (no se le inventa campaña)',
   parejas.diagnostico.filtros.ventas_online_sin_utm === 1,
   String(parejas.diagnostico.filtros.ventas_online_sin_utm));

console.log('\n=== 7 · branch + campaign ===');
const combo2 = pedir({ branch: 'EG Núñez', campaign: 'Escape Parejas' });
ok('1 consulta', combo2.summary.consultas === 1, String(combo2.summary.consultas));
ok('gasto 10000', combo2.summary.gasto_meta === 10000);
const comboVacio = pedir({ branch: 'EG Palermo', campaign: 'Escape Parejas' });
ok('combinación sin resultados da 0, no null', comboVacio.summary.consultas === 0,
   String(comboVacio.summary.consultas));
ok('y el gasto de esa combinación da null (no hay filas)',
   comboVacio.summary.gasto_meta === null, String(comboVacio.summary.gasto_meta));

console.log('\n=== 8 · branch + channel + campaign ===');
const combo3 = pedir({ branch: 'EG Núñez', channel: 'meta_ads', campaign: 'Escape Parejas' });
ok('1 consulta', combo3.summary.consultas === 1, String(combo3.summary.consultas));
ok('filters devuelve los tres', combo3.filters.branch === 'EG Núñez' &&
   combo3.filters.channel === 'meta_ads' && combo3.filters.campaign === 'Escape Parejas',
   JSON.stringify(combo3.filters));
ok('ventas_online null por el canal', combo3.summary.ventas_online === null);
ok('opciones intactas', combo3.filter_options.branches.length === 5 &&
   combo3.filter_options.campaigns.length === 2);

console.log('\n=== 11 · cero resultados: 0 donde corresponde, null donde no se sabe ===');
const vacio = pedir({ branch: 'No Existe' });
ok('consultas = 0 (no null)', vacio.summary.consultas === 0);
ok('consultas_de_anuncios = 0', vacio.summary.consultas_de_anuncios === 0);
ok('ventas_online = 0 (la hoja sí pudo responder)', vacio.summary.ventas_online === 0,
   String(vacio.summary.ventas_online));
ok('ticket_promedio_online = 0', vacio.summary.ticket_promedio_online === 0);
ok('gasto_meta = null (no hay filas de esa marca)', vacio.summary.gasto_meta === null);
ok('branches vacio', vacio.branches.length === 0);

console.log('\n=== 12 · las offline siguen en null con cualquier filtro ===');
[sinFiltro, nunez, meta, web, esp, parejas, combo3].forEach((r, i) =>
  ok('caso ' + (i + 1) + ': offline en null',
     r.summary.ventas_offline === null && r.summary.facturacion_offline === null &&
     r.summary.conversion_total === null && r.summary.cpa === null && r.summary.roas === null));

console.log('\n=== 10 · parametros raros no rompen ===');
const raro = pedir({ foo: 'bar', branch: '', channel: '', campaign: 'all' });
ok('vacios y "all" = sin filtro', raro.summary.consultas === 7, String(raro.summary.consultas));
ok('un parametro desconocido se ignora', raro.ok === true);
const canalMalo = pedir({ channel: 'instagram' });
ok('channel invalido → error controlado, no un universo entero',
   canalMalo.ok === false && /channel invalido/.test(canalMalo.error), canalMalo.error);

console.log('\n=== 9 · la cache no mezcla filtros ===');
// Caché real, no el stub: si la clave no incluyera los filtros, la
// segunda consulta devolvería lo de la primera.
const memoria = new Map();
ctx.CacheService = { getScriptCache: () => ({
  get: (k) => (memoria.has(k) ? memoria.get(k) : null),
  put: (k, v) => memoria.set(k, v),
  remove: (k) => memoria.delete(k)
}) };
const cache1 = pedir({});
const cache2 = pedir({ branch: 'EG Núñez' });
const cache3 = pedir({});
ok('sin filtro → 7', cache1.summary.consultas === 7, String(cache1.summary.consultas));
ok('con branch → 3, no el cacheado', cache2.summary.consultas === 3, String(cache2.summary.consultas));
ok('vuelve a sin filtro → 7', cache3.summary.consultas === 7, String(cache3.summary.consultas));
ok('quedaron 2 entradas distintas en la cache', memoria.size === 2, String(memoria.size));
ctx.CacheService = { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) };

console.log('\n=== comparador contra PANEL ===');
const silencio = console.log;
console.log = () => {};                    // el comparador imprime su informe
const r1 = vm.runInContext("compararMetricsConPanel()", ctx);
console.log = silencio;
ok('con un PANEL que coincide: 0 diferencias sin explicar', r1.distintos === 0,
   JSON.stringify(r1));
ok('no confunde "Anuncios pagos" de COMPRAS EN LA WEB con el de DE DÓNDE VIENEN',
   r1.iguales === 10, String(r1.iguales));

// PANEL cuenta las repetidas de TODO el historial; el endpoint, las del
// período. Esa diferencia tiene que quedar clasificada como esperada,
// no como error: si no, cada validación arrancaría con un falso positivo.
PANEL[5][1] = 5;
console.log = () => {};
const r2 = vm.runInContext("compararMetricsConPanel()", ctx);
console.log = silencio;
ok('una diferencia EXPLICADA no cuenta como error',
   r2.distintos === 0 && r2.esperados === 1, JSON.stringify(r2));
PANEL[5][1] = 1;

// Y una diferencia sin explicación sí tiene que saltar.
PANEL[9][1] = 99;
console.log = () => {};
const r3 = vm.runInContext("compararMetricsConPanel()", ctx);
console.log = silencio;
ok('detecta un PANEL que NO coincide', r3.distintos === 1, JSON.stringify(r3));
PANEL[9][1] = 2;

console.log('\n=== tamaño ===');
console.log('  respuesta: ' + texto.length + ' caracteres');

console.log('\n' + (fallos ? 'FALLARON ' + fallos + ' pruebas' : 'TODAS LAS PRUEBAS PASARON'));
process.exit(fallos ? 1 : 0);

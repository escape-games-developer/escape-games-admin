/**
 * SyncReservas.gs — copia las reservas web (hoja VENTAS ONLINE) a Supabase.
 *
 * Archivo independiente: se pega como secuencia de comandos nueva en el
 * proyecto de Apps Script de ORIGEN ESCAPE. No usa ni modifica nada del
 * archivo principal, así que sobrevive a cada versión nueva que se pegue.
 *
 * Instalación (una sola vez):
 *   1. Configuración del proyecto → Propiedades de la secuencia de comandos →
 *      agregar dos propiedades:
 *        · RESERVAS_SYNC_TOKEN  → la clave secreta de la sincronización.
 *        · SUPABASE_ANON_KEY    → la clave pública de Supabase (la misma
 *          VITE_SUPABASE_ANON_KEY del panel). La función exige un JWT de
 *          Supabase además de la clave secreta.
 *        · ORIGEN_SPREADSHEET_ID → el id de la planilla ORIGEN ESCAPE (lo que
 *          va entre /d/ y /edit en su URL). Si el script está dentro de la
 *          planilla, se puede omitir.
 *   2. Ejecutar syncReservasCompleto()  → carga todas las filas.
 *   3. Ejecutar instalarSyncReservas()  → deja corriendo syncReservas() cada 15 minutos.
 *
 * Qué manda: cada fila con sus encabezados tal cual (REFERENCIA, EMAIL, MARCA,
 * SERVICIO, FECHA DE LA VISITA, ESTADO, ...). Supabase deduplica por REFERENCIA,
 * así que mandar dos veces la misma fila no duplica nada.
 */

var SYNC_RESERVAS = {
  // El id de la planilla no va en el repo (es público): se lee de la
  // propiedad ORIGEN_SPREADSHEET_ID, o se usa la planilla del proyecto.
  HOJA: 'VENTAS ONLINE',
  URL: 'https://ajabxbciugxjommeyiyi.supabase.co/functions/v1/reservas-sync',
  LOTE: 500,
  // En cada pasada se reenvían las filas recibidas en los últimos N días:
  // así también viajan los cambios de estado (pending → processing, cancelled).
  DIAS_RECIENTES: 14,
};

/** Pasada periódica (la llama el disparador). */
function syncReservas() {
  var desde = new Date(Date.now() - SYNC_RESERVAS.DIAS_RECIENTES * 24 * 3600 * 1000);
  return enviarReservas_(function (fila, recibido) {
    return !recibido || recibido >= desde;
  });
}

/** Carga completa: todas las filas de la hoja. Para la primera vez o para reparar. */
function syncReservasCompleto() {
  return enviarReservas_(function () { return true; });
}

/** Crea el disparador cada 15 minutos (borra los anteriores de esta función). */
function instalarSyncReservas() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncReservas') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncReservas').timeBased().everyMinutes(15).create();
  Logger.log('Listo: syncReservas() corre cada 15 minutos.');
}

/** Saca el disparador, por si hace falta frenar la sincronización. */
function desinstalarSyncReservas() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncReservas') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Sincronización de reservas detenida.');
}

// ------------------------------------------------------------------

function enviarReservas_(incluir) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('RESERVAS_SYNC_TOKEN');
  var anon = props.getProperty('SUPABASE_ANON_KEY');
  if (!token) throw new Error('Falta la propiedad RESERVAS_SYNC_TOKEN (Configuración del proyecto → Propiedades).');
  if (!anon) throw new Error('Falta la propiedad SUPABASE_ANON_KEY (Configuración del proyecto → Propiedades).');

  var libroId = props.getProperty('ORIGEN_SPREADSHEET_ID');
  var libro = libroId ? SpreadsheetApp.openById(libroId) : SpreadsheetApp.getActiveSpreadsheet();
  if (!libro) throw new Error('Falta la propiedad ORIGEN_SPREADSHEET_ID (el id de la planilla ORIGEN ESCAPE).');
  var hoja = libro.getSheetByName(SYNC_RESERVAS.HOJA);
  if (!hoja || hoja.getLastRow() < 2) return { enviadas: 0 };

  // getDisplayValues: las fechas viajan como se ven ("16/9/2026 11:29:13"),
  // que es el formato que entiende Supabase.
  var datos = hoja.getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn()).getDisplayValues();
  var encabezados = datos[0].map(function (h) { return String(h).trim(); });
  var iRecibido = encabezados.indexOf('RECIBIDO');
  var iReferencia = encabezados.indexOf('REFERENCIA');
  if (iReferencia < 0) throw new Error('La hoja no tiene la columna REFERENCIA.');

  var filas = [];
  for (var r = 1; r < datos.length; r++) {
    var fila = datos[r];
    if (!String(fila[iReferencia] || '').trim()) continue;
    var recibido = iRecibido >= 0 ? fechaReservas_(fila[iRecibido]) : null;
    if (!incluir(fila, recibido)) continue;
    var obj = {};
    for (var c = 0; c < encabezados.length; c++) {
      if (encabezados[c]) obj[encabezados[c]] = fila[c];
    }
    filas.push(obj);
  }

  var guardadas = 0;
  for (var i = 0; i < filas.length; i += SYNC_RESERVAS.LOTE) {
    var lote = filas.slice(i, i + SYNC_RESERVAS.LOTE);
    var resp = UrlFetchApp.fetch(SYNC_RESERVAS.URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-sync-token': token, 'Authorization': 'Bearer ' + anon, 'apikey': anon },
      payload: JSON.stringify({ rows: lote }),
      muteHttpExceptions: true,
    });
    var codigo = resp.getResponseCode();
    var cuerpo = resp.getContentText();
    if (codigo !== 200) throw new Error('reservas-sync respondió ' + codigo + ': ' + cuerpo);
    guardadas += (JSON.parse(cuerpo).guardadas || 0);
  }

  Logger.log('Reservas enviadas: ' + filas.length + ' · guardadas: ' + guardadas);
  return { enviadas: filas.length, guardadas: guardadas };
}

/** "16/9/2026 11:29:13" → Date (hora local del proyecto). */
function fechaReservas_(texto) {
  var m = String(texto || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
}

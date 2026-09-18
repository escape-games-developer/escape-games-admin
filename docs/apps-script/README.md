  # Endpoint de métricas — ORIGEN ESCAPE (Apps Script)

  Endpoint JSON de **solo lectura** que alimenta la sección **Métricas** del Admin.

  ```
  GET /exec?action=metrics&token=...
  GET /exec?action=metrics&token=...&from=2026-09-09&to=2026-09-17
  ```

  Archivos de esta carpeta:

  | Archivo | Qué es |
  |---|---|
  | `Metrics.gs` | El módulo. Se pega como **archivo nuevo** en el proyecto de Apps Script. |
  | `pruebas-metrics.cjs` | Banco de pruebas. Corre en Node, **no** en Apps Script. |

  ---

  ## 1. Qué encontré en el código existente

  Versión inspeccionada: **v178 · ESCAPE · PHONE SAFE** (12.563 líneas, archivo único).

  | Punto | Hallazgo |
  |---|---|
  | `doGet()` | Existía sin parámetro `e` y solo devolvía el health check. Es el único punto del archivo grande que hubo que tocar. |
  | `doPost()` | Gate por `tokenActual()`, tres ramas (`venta` → WooCommerce, `etiqueta` → respond.io, resto → consulta), candado con `LockService`. **No se tocó.** |
  | Clasificación | `clasificarOrigen()` resuelve `WEB` / `INSTAGRAM` / `ORGANICO` mirando el primer mensaje contra `BOTONES_WEB`. `armarPanel()` agrupa a partir de la columna `CAMPAÑA`. |
  | Agrupación por marca | `marcaDeSucursal()` = `CFG.PREFIJO_SUCURSAL` + sucursal, con `MARCA_POR_SUCURSAL` para Hell. |
  | Agrupación campaña/conjunto/anuncio | `resumenPorAnuncio()` y `gastoPorNivel()`. |
  | `VENTAS ONLINE` | La llena `guardarVentaOnline()` desde el webhook de WooCommerce; se deduplica por `REFERENCIA`. `ESTADOS_VENDIDO = ['processing','completed']`. |
  | Gasto Meta | **Sí existe fuente real**: hoja `GASTO META`, alimentada por `actualizarGastoMeta()` desde la Graph API, con granularidad diaria y por anuncio. |
  | Endpoints GET previos | Ninguno además del health check. |

  ### Lo que cambió respecto del pedido original

  > **`gasto_meta` NO va en `null`.** El pedido asumía que no había fuente. Sí la hay, así que **gasto, CPL por sucursal y CPL por campaña se calculan de verdad**.

  > **`ventas_offline` sí va en `null`**, y ahora está confirmado por código, no por suposición: `CFG.PLANILLAS_VENTAS` está vacío para Escape con el comentario *"el lector todavía no existe"*, y `CFG.ID_RESERVAS` también.

  ---

  ## 2. Funciones existentes que reutiliza

  Nada de esto se reimplementó:

  `CFG` · `COL` · `ENCABEZADOS_ONLINE` · `ESTADOS_VENDIDO` · `CFG.CUENTAS_META` ·
  `responder()` · `libroOrigen()` · `aFecha()` · `aFechaISO()` · `aNumero()` ·
  `quitarAcentos()` · `textoLimpio()` · `esFilaRepetida()` · `diaDe()` ·
  `limpiarMojibake()` · `fechaDesdeComun()`

  La clasificación de consultas es la de `armarPanel()`, copiada literalmente, para que los números del endpoint y los de la hoja PANEL no puedan discrepar.

  **Deliberadamente NO reutilizadas:**

  - `armarPanel()`, `armarHistorial()` — regeneran hojas. El endpoint lee y agrupa, no ejecuta mantenimiento.
  - `gastoPorNivel()`, `gastoDeMeta()` — no filtran por fecha y las consumen otros informes. Tocarlas sería cambiar lógica existente; `getGastoMetrics()` es la misma idea con el filtro puesto, y las originales quedan intactas.

  ---

  ## 3. Instalación

  ### Paso 1 — pegar el archivo nuevo

  En el editor de Apps Script: **+ → Secuencia de comandos**, nombrarlo `Metrics`, pegar todo `Metrics.gs`.

  > **Por qué archivo separado:** el archivo principal se pega entero cada vez que sale una versión nueva. Si esto viviera adentro, la v180 lo borraría.

  ### Paso 2 — las tres líneas de `doGet()`

  Buscar `function doGet()` (línea 1349) y reemplazar por:

  ```javascript
  /** Prueba rápida desde el navegador para saber si está publicado. */
  function doGet(e) {
    // v179 — Métricas para el Admin. El health check de siempre queda
    // intacto: solo se desvía cuando piden action=metrics.
    if (e && e.parameter && e.parameter.action === 'metrics') {
      return responderMetrics(e);
    }
    return responder({ ok: true, servicio: 'atribucion origen v178 escape phone safe' });
  }
  ```

  ⚠️ **Este es el único cambio en el archivo grande, y hay que reaplicarlo cada vez que se pegue una versión nueva.** Lo sano a largo plazo es que entre en la v179 oficial y viaje con el archivo.

  ### Paso 3 — la clave

  Desde el editor, seleccionar `configurarTokenMetricas` y **Ejecutar**. Genera una clave y la deja en el registro de ejecuciones (que solo ve el dueño). Queda guardada en Propiedades del proyecto.

  ### Paso 4 — publicar

  **Implementar → Administrar implementaciones → editar (lápiz) → Versión: Nueva → Implementar.**

  Mantiene la **misma URL `/exec`**, así que respond.io y WooCommerce no se enteran.

  ---

  ## 4. URLs de prueba

  Reemplazar `<ID>` por el del deployment actual y `<TOKEN>` por el del paso 3.

  ```
  # 1 · health check — tiene que seguir igual
  https://script.google.com/macros/s/<ID>/exec

  # 2 · métricas, período por defecto (CFG.DESDE → hoy)
  https://script.google.com/macros/s/<ID>/exec?action=metrics&token=<TOKEN>

  # 3 · con rango
  https://script.google.com/macros/s/<ID>/exec?action=metrics&token=<TOKEN>&from=2026-09-09&to=2026-09-17

  # token mal → {"ok":false,"error":"token invalido"}
  https://script.google.com/macros/s/<ID>/exec?action=metrics&token=cualquiera

  # 4 · con filtros (los tres son opcionales e independientes)
  .../exec?action=metrics&token=<TOKEN>&from=2026-09-10&to=2026-09-17&branch=EG%20N%C3%BA%C3%B1ez
  .../exec?action=metrics&token=<TOKEN>&channel=meta_ads
  .../exec?action=metrics&token=<TOKEN>&branch=EG%20N%C3%BA%C3%B1ez&channel=meta_ads&campaign=Escape%20Parejas

  # channel invalido → {"ok":false,"error":"channel invalido, se espera uno de: ..."}
  .../exec?action=metrics&token=<TOKEN>&channel=instagram
  ```

  Sin publicar nada se puede probar desde el editor con `probarMetrics()`, `auditarMetricsSinDatosPersonales()` y `compararMetricsConPanel()` (ver sección 9).

  ---

  ## 5. Autenticación y CORS — leer antes de conectar el frontend

  **Clave propia, distinta de la del webhook.** La del webhook es la credencial con la que respond.io **escribe** en ORIGEN. Si el Admin la llevara en la URL, quien la viera podría inyectar consultas falsas por `doPost()`. `METRICS_TOKEN` es de solo lectura.

  **Va como query param, no como header.** Un header `Authorization` dispara un preflight `OPTIONS` que Apps Script no sabe contestar (no existe `doOptions`), y el fetch desde el navegador fallaría aunque con `curl` funcione.

  **Consecuencia a tener presente:** el token viaja en la URL y queda en el historial del navegador y en logs. Si eso molesta, el camino limpio es que el Admin llame a una Edge Function de Supabase que guarde el token del lado del servidor — el mismo patrón que ya usa `recontactos-api`. El endpoint no cambia.

  ---

  ## 6. Ejemplo REAL de respuesta

  Salida verificada del banco de pruebas, con 9 filas de ORIGEN, 6 de VENTAS ONLINE y 3 de GASTO META. Recortada en los bloques repetitivos.

  ```json
  {
    "ok": true,
    "period": { "from": "2026-09-09", "to": "2026-09-17",
                "generated_at": "2026-09-17T21:40:00.000Z", "version": "metrics v179" },

    "summary": {
      "consultas": 7,
      "consultas_de_anuncios": 2,
      "consultas_de_web": 1,
      "consultas_organico": 1,
      "consultas_espontaneas": 2,
      "consultas_sin_identificar": 1,
      "consultas_ig_msn_sin_telefono": 1,
      "repetidas_descartadas": 1,
      "ventas_online": 2,
      "facturacion_online": 55000,
      "ticket_promedio_online": 27500,
      "ventas_offline": null,
      "facturacion_offline": null,
      "conversion_total": null,
      "gasto_meta": 15000,
      "cpl": 7500,
      "cpa": null,
      "roas": null
    },

    "sources": {
      "meta_ads":     { "consultas": 2, "share": 28.6, "ventas_online_atribuidas": 1,
                        "facturacion_online_atribuida": 25000, "definicion": "..." },
      "organico":     { "consultas": 1, "share": 14.3, "...": "CAMPAÑA = INSTAGRAM" },
      "web":          { "consultas": 1, "share": 14.3, "...": "CAMPAÑA = WEB" },
      "espontaneas":  { "consultas": 2, "share": 28.6,
                        "nunca_vino_por_anuncio": 1, "ya_habia_venido_por_anuncio": 1 },
      "sin_atribuir": { "consultas": 1, "share": 14.3 },
      "repetidas":    { "consultas": 1, "share": null }
    },

    "branches": [
      { "marca": "EG Bariloche", "consultas": 0, "ventas_online": 1, "facturacion_online": 30000,
        "gasto_meta": null, "cpl": null, "cpa": null, "roas": null, "ventas_offline": null },
      { "marca": "EG Caballito", "consultas": 1, "de_anuncios": 1, "ventas_online": 0,
        "gasto_meta": null, "cpl": null, "cpa": null, "roas": null },
      { "marca": "EG Núñez", "consultas": 3, "de_anuncios": 1, "espontaneas": 2, "repetidas": 1,
        "ventas_online": 1, "facturacion_online": 25000, "ticket_promedio_online": 25000,
        "ventas_online_atribuidas": 1, "facturacion_online_atribuida": 25000,
        "gasto_meta": 10000, "cpl": 10000, "cpa": null, "roas": null },
      { "marca": "EG Palermo", "consultas": 2, "de_web": 1, "sin_identificar": 1,
        "gasto_meta": 5000, "cpl": null },
      { "marca": "EG Urquiza", "consultas": 1, "organico": 1, "sin_telefono": 1, "gasto_meta": null }
    ],

    "campaigns": [
      { "campana": "Escape Parejas", "consultas": 1, "gasto_meta": 10000, "cpl": 10000,
        "ventas_online_atribuidas": 1, "facturacion_online_atribuida": 25000,
        "ventas_online_utm": 1, "facturacion_online_utm": 25000,
        "ventas_offline": null, "cpa": null, "roas": null },
      { "campana": "Cumpleaños", "consultas": 1, "gasto_meta": null, "cpl": null }
    ],

    "ads_detail": [
      { "campana": "Escape Parejas", "conjunto": "Nuñez 5km", "anuncio": "Video sala",
        "consultas": 1, "gasto_meta": 10000, "ventas_offline": null },
      { "campana": "Cumpleaños", "conjunto": "Caballito", "anuncio": "Carrusel",
        "consultas": 1, "gasto_meta": null, "ventas_offline": null }
    ],

    "daily": [
      { "fecha": "2026-09-10", "consultas": 2, "de_anuncios": 1, "de_web": 1, "organico": 0,
        "espontaneas": 0, "sin_identificar": 0, "ventas_online": 1,
        "facturacion_online": 25000, "gasto_meta": 10000 },
      { "fecha": "2026-09-11", "consultas": 2, "espontaneas": 2, "ventas_online": 1,
        "facturacion_online": 30000, "gasto_meta": 5000 },
      { "fecha": "2026-09-12", "consultas": 3, "de_anuncios": 1, "organico": 1,
        "sin_identificar": 1, "ventas_online": 0, "facturacion_online": 0, "gasto_meta": 0 }
    ],

    "diagnostico": {
      "gasto_meta": { "hoja_con_datos_del_periodo": true, "ultimo_dia_cargado": "2026-09-11",
                      "dias_de_atraso": 6, "marcas_sin_cuenta_publicitaria": ["EG Caballito"],
                      "cuentas_sin_marca": [] },
      "consultas": { "fuera_del_periodo": 1, "repetidas_descartadas": 1, "sin_telefono": 1 },
      "ventas_online": { "filas_leidas": 5,
        "descartadas": { "vacias": 1, "repetidas": 1, "estado": 1, "sin_fecha": 0, "fuera_de_periodo": 1 } },
      "atribucion": { "ventas_online_en_el_periodo": 2,
                      "consultas_del_periodo_que_compraron_en_la_web": 1 },
      "avisos": [ "..." ]
    }
  }
  ```

  ### Errores

  ```json
  { "ok": false, "error": "token invalido" }
  { "ok": false, "error": "from invalido, se espera AAAA-MM-DD" }
  { "ok": false, "error": "from es posterior a to" }
  { "ok": false, "error": "metricas sin configurar: falta correr configurarTokenMetricas()" }
  ```

  Nunca sale un stack trace: el detalle queda en el registro de ejecuciones.

  ---

  ## 7. Métricas que siguen en `null` y por qué

  | Métrica | Por qué |
  |---|---|
  | `ventas_offline`, `facturacion_offline` | `CFG.PLANILLAS_VENTAS` está vacío para Escape. El lector de planillas de reservas no existe todavía. **Son la mayor parte del negocio.** |
  | `conversion_total` | Necesita las ventas totales. Con solo las online daría una fracción presentada como el todo. |
  | `cpa`, `roas` | Mismo motivo. Un ROAS calculado solo con entradas web, contra el gasto de campañas que venden cumpleaños, sería un número que invita a apagar campañas rentables. |
  | `gasto_meta` / `cpl` **por sucursal** | `null` solo donde falta la cuenta publicitaria: **EG Caballito** y **Hell Experiment** no están en `CFG.CUENTAS_META`. |
  | `gasto_meta` por campaña o anuncio | `null` cuando el nombre no cruza con `GASTO META`. Puede ser un anuncio que nunca corrió, o un nombre que no coincide. No es cero. |

  Lo que **sí** se calcula con datos reales: consultas y toda su apertura, repetidas, ventas y facturación online, ticket promedio online, gasto Meta del grupo y por sucursal con cuenta, y CPL.

### Cómo saber cuánto falta para encender las offline

`diagnostico.ventas_offline` responde eso sin abrir la planilla:

```json
"ventas_offline": {
  "senal_disponible": true,
  "vendido_si": 0,                  // lo escribiría el cruce contra reservas (no existe)
  "con_etiqueta_respond_io": 1,     // lo escribe marcarVentaPorEtiqueta()
  "lector_de_reservas": false       // CFG.PLANILLAS_VENTAS está vacío
}
```

Es un **indicador de señal, no una métrica**: aunque dé números, `ventas_offline` sigue en `null`. Un conteo parcial publicado como "ventas offline" arrastraría a `conversion_total` y a `cpa` a un número sesgado, que es peor que un null.

  ---

  ## 8. Problemas de calidad de datos detectados

  1. **`CUENTAS_META` incompleta.** Faltan EG Caballito y Hell Experiment (figura como pendiente en el propio `CFG`). El endpoint lo reporta solo en `diagnostico.gasto_meta.marcas_sin_cuenta_publicitaria`.

  2. **El gasto de Meta puede quedar clavado sin avisar.** Hay un comentario de la v171 sobre el gasto parado cuatro noches. `diagnostico.gasto_meta.dias_de_atraso` lo expone: más de 2 días suele ser el token vencido.

  3. **`GASTO META` se reescribe entera** en cada corrida desde `CFG.DESDE`. No hay histórico anterior al 09/09/2026.

  4. **Consultas sin teléfono** (Instagram/Messenger) nunca se pueden cruzar contra una venta. Su conversión siempre va a dar más baja de lo real.

  5. **Ventas online duplicadas en la hoja.** WooCommerce reenvía el pedido en cada cambio de estado; antes del candado de la v149 quedaron filas repetidas. Se deduplican por `REFERENCIA` y se informa cuántas.

  6. **Dos relojes distintos.** Las consultas se filtran por `RECIBIDO` y las ventas online por `FECHA DEL PEDIDO`. Una consulta de hoy puede terminar en una compra de la semana que viene. Por eso `sources.*.ventas_online_atribuidas` (por fecha de consulta) y `summary.ventas_online` (por fecha de pedido) **no tienen por qué coincidir**, y llevan nombres distintos a propósito.

  7. **`repetidas_descartadas` no coincide con la hoja PANEL.** `armarPanel()` cuenta las repetidas *antes* de filtrar por fecha, así que su número es de todo el historial. El endpoint cuenta las del período pedido, que es lo que corresponde con `from`/`to`.

  8. **Ojo con `espontáneas` vs `orgánico`.** En este sistema `CAMPAÑA = 'ORGANICO'` es el **fallback** de `clasificarOrigen()`: no vino de un anuncio y su primer mensaje no matcheó ningún botón. Eso es una consulta **espontánea**. El orgánico identificado de verdad es Instagram (bio/historias), que tiene su propio valor. El JSON los separa.

  ---

  ## 9. Pruebas

### Banco automático (datos sintéticos)

`pruebas-metrics.cjs` carga el Apps Script **real** en un sandbox de Node con hojas sintéticas y verifica **155 aserciones**: los 8 tests del pedido más los invariantes de `null` vs `0`.

```bash
node docs/apps-script/pruebas-metrics.cjs
```

Ajustar `SRC_MAIN` arriba del archivo si el `.gs` principal está en otra ruta.

Resultado actual: **TODAS LAS PRUEBAS PASARON**.

Cubre: health check intacto · `action=metrics` devuelve JSON válido · el filtro de fechas recorta · `ventas_online` coincide con los estados válidos · `facturacion_online` es la suma de `MONTO` · las consultas cierran con la clasificación de `armarPanel()` (y la suma de las partes da el total) · **ninguna aparición de teléfono, email, nombre, referencia ni ID de Booknetic** · las métricas no disponibles llegan como `null` y nunca como `0` · **las cuatro offline no se promueven aunque haya señal** · el comparador contra PANEL detecta una diferencia real y no confunde etiquetas repetidas entre bloques.

### Validación contra la planilla real — `compararMetricsConPanel()`

El banco prueba la lógica; esto prueba **los datos de verdad**. Es el paso que cierra la etapa.

1. Menú Atribución → **"3. Panel — todo junto"**. PANEL tiene que estar fresco.
2. En el editor, seleccionar `compararMetricsConPanel` y **Ejecutar**.
3. Leer el informe.

```
ENDPOINT vs HOJA PANEL

Período del endpoint: 2026-09-09 a 2026-09-17

CONCEPTO                                          PANEL   ENDPOINT     DIF
--------------------------------------------------------------------------
Consultas del período                                 7          7       0
Sin teléfono (IG / Messenger)                         1          1       0
Repetidas descartadas                                 1          1       0
      ↳ DIFERENCIA ESPERADA: armarPanel() las cuenta de todo el historial;
        el endpoint, solo las del período pedido.
Anuncios pagos                                        2          2       0
Sitio web                                             1          1       0
Instagram (bio / historias)                           1          1       0
Espontáneas — nunca vinieron por un anuncio           1          1       0
Espontáneas — ya habían venido por un anuncio         1          1       0
Sin identificar                                       1          1       0
Gasto total                                       15000      15000       0
      ↳ PANEL suma la hoja GASTO META entera; el endpoint solo el período.

Coinciden: 10   ·   Difieren sin explicación: 0   ·   Diferencias esperadas: 0

VALIDADO: todo lo que tenía que coincidir, coincide.
```

**Si algo no cierra, descartá primero lo obvio.** PANEL no guarda su fecha de generación y no tiene tope superior: incluye todo desde `CFG.DESDE` hasta el momento en que se generó. Una diferencia chica y **positiva** en "Consultas del período" casi siempre son las consultas que entraron después de la última corrida. Para alinear las dos puntas:

```javascript
compararMetricsConPanel('2026-09-16')   // si PANEL se generó anoche
```

Dos diferencias están previstas y el informe las marca solas, no son errores:

- **Repetidas descartadas** — `armarPanel()` las cuenta antes de filtrar por fecha, así que su número es de todo el historial.
- **Gasto total** — `armarPanel()` suma la hoja `GASTO META` entera; el endpoint solo el período pedido. Coinciden solo si el período cubre toda la hoja.

  ---

  ## 10. Compatibilidad — qué NO se tocó

  Confirmado explícitamente:

  - ✅ **`doPost()` sin una sola modificación.** El webhook de respond.io y el de WooCommerce funcionan igual.
  - ✅ El payload de entrada, el `TOKEN` del webhook y la configuración de Meta, intactos.
  - ✅ Ninguna columna de ninguna hoja cambió. **El endpoint no escribe: no hay un solo `setValue` en `Metrics.gs`.**
  - ✅ Las rutinas nocturnas, el gasto de Meta, los paneles y los resúmenes, intactos.
  - ✅ La URL `/exec` no cambia. Publicar una versión nueva sobre el mismo deployment no toca a los que ya le pegan.
  - ✅ El health check sin `action` responde exactamente lo mismo que antes.

  ---

  ## 11. Notas de operación

  - **Caché de 5 minutos** por período (`METRICS_CACHE_SEG`). Protege de un frontend que reconsulte, al precio de que un dato recién cargado puede tardar hasta 5 minutos en verse. Bajar a 0 si molesta.
  - **`ads_detail` viene recortado** a los 200 anuncios con más consultas (`METRICS_TOPE_ADS`). `diagnostico.ads_detail.truncado` lo avisa.
  - **Una lectura por hoja**, en memoria. El endpoint no ejecuta procesos de mantenimiento ni regenera PANEL.
  - ORIGEN se lee **solo hasta la columna 25** (`MONTO ONLINE`). `MENSAJE INICIAL` y `CODIGO DE CLIC META` ni se cargan en memoria.

---

## 12. Filtros — `branch`, `channel`, `campaign`

Los tres son **opcionales e independientes**. Sin ellos, o con `all`, el endpoint devuelve el universo entero: una URL vieja sigue funcionando igual.

Se resuelven **en la planilla**, nunca en el panel. Si el frontend recortara arrays por su cuenta, `summary` —que se calcula del otro lado— dejaría de cerrar con las tablas y no habría forma de saber cuál de los dos miente.

### Qué filtra cada uno

| Filtro | ORIGEN | VENTAS ONLINE | GASTO META |
|---|---|---|---|
| `branch` | `MARCA` | `MARCA` | cuenta → marca vía `CFG.CUENTAS_META` |
| `channel` | grupo de `grupoMetricsDe()` | **no puede** | solo `meta_ads` |
| `campaign` | `CAMPAÑA` | `utm_campaign` | `CAMPAÑA` |

Comparación **exacta** sobre la clave normalizada (`claveMetrics`: sin acentos, sin mojibake, en mayúscula). Nada de matching parcial: `branch=EG` no matchea ninguna sucursal.

Canales admitidos: `meta_ads` · `web` · `organico` · `espontaneas` · `sin_atribuir`. `espontaneas` incluye los dos sabores que separa el PANEL. **No se crea ninguna regla nueva de clasificación**: es la de `grupoMetricsDe()`, la misma que cuadra con la hoja PANEL. Un canal mal escrito devuelve error controlado — ignorarlo entregaría el universo entero y quien lo pidió creería estar viendo un recorte.

### Lo que NO se puede filtrar, y por qué

> **`channel` no puede recortar la hoja VENTAS ONLINE.** Un pedido de WooCommerce no sabe por qué canal consultó esa persona, ni si consultó. Con `channel` puesto, `ventas_online`, `facturacion_online` y `ticket_promedio_online` vienen en **`null`** — en `summary`, en `branches` y en `daily`.
>
> Lo que **sí** responde al canal son las `ventas_online_atribuidas`, que salen de ORIGEN, donde cada consulta sí tiene canal. Por eso las dos señales viven separadas y con nombres distintos.

> **`gasto_meta` va en `null` con cualquier canal que no sea `meta_ads`.** La hoja GASTO META *es* la pauta de Meta. Ese gasto existe, pero no pertenece al canal que se está mirando; poner cero diría que no se gastó, y no es cierto.

> **Las ventas sin `utm_campaign` nunca entran en un filtro por campaña.** No se les inventa una. `diagnostico.filtros.ventas_online_sin_utm` dice cuántas son.

Todo esto queda explícito en `diagnostico.filtros` y en `diagnostico.avisos`.

### Bloques nuevos en la respuesta

```json
"filters": { "branch": "EG Núñez", "channel": "meta_ads", "campaign": null },

"filter_options": {
  "branches":  ["EG Bariloche", "EG Caballito", "EG Núñez", "EG Palermo", "EG Urquiza"],
  "channels":  ["meta_ads", "web", "organico", "espontaneas", "sin_atribuir"],
  "campaigns": ["Cumpleaños", "Escape Parejas"]
},

"diagnostico": {
  "filtros": {
    "aplicados": { "branch": "EG Núñez", "channel": "meta_ads", "campaign": null },
    "consultas_excluidas_por_filtro": 5,
    "ventas_online_filtrables": false,
    "gasto_meta_aplica_al_canal": true,
    "ventas_online_sin_utm": 1
  }
}
```

**`filter_options` sale del universo del PERÍODO, no de lo que quedó después de filtrar.** Elegir una sucursal no borra las demás de la lista: es un filtro, no un embudo, y hay que poder cambiar de opción sin resetear todo. Las marcas se juntan de las dos hojas, porque las que reciben consultas y las que venden por la web no son el mismo conjunto.

### Caché

La clave pasó de `metrics|version|from|to` a incluir los tres filtros:

```
metrics|version|from|to|branch|channel|campaign
```

Sin eso, pedir "EG Núñez" devolvería lo cacheado de "todas las sucursales".

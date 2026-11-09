# Pendientes — panel admin

Última actualización: 09/11/2026. Dónde retomar el trabajo.

## 1. Reservas web en el panel (Calendario)

**Estado:** funcionando en Supabase, con sincronización automática cada 15 minutos. Se ven en el Calendario. Falta publicar el panel.

### Hecho

- **Supabase** (aplicado en producción):
  - Tabla `web_reservations` con las reservas web de la hoja VENTAS ONLINE de ORIGEN ESCAPE. Un trigger calcula sucursal, sala, jugadores y hora de visita.
  - Funciones `admin_reservations_for_day`, `admin_search_clients` y `admin_validate_room`. Cada GM ve y valida solo su sucursal.
  - El día de trabajo va de 6:00 a 6:00, para que los turnos de trasnoche (00:15, 01:30) cuenten en el día anterior.
  - Edge function `reservas-sync` (con verificación JWT) y secreto `RESERVAS_SYNC_TOKEN`.
  - Carga inicial: 2.682 filas de la hoja (09/11/2026).
  - Migraciones: `supabase/migrations/20261109180000_web_reservations.sql`, `…190000_web_reservations_room_match.sql`, `…200000_reservations_business_day.sql` y `…210000_web_reservations_clave_por_sucursal.sql`.
  - **Clave por sucursal (09/11/2026):** cada sucursal tiene su propio WooCommerce y numera los pedidos por su cuenta (710 números de pedido se repetían entre sucursales). La clave pasó de `referencia` a `reserva_id` = sucursal + pedido (`nunez|WC-4702`). Antes del cambio la tabla tenía 1.896 reservas; después de `syncReservasCompleto()` quedó en 2.687 (se recuperaron 791). `reservas-sync` v4 usa la clave nueva.
- **Sincronización automática (09/11/2026):** `docs/apps-script/SyncReservas.gs` está instalado en el proyecto de Apps Script **"Respond IO"** (el que está dentro de la planilla ORIGEN ESCAPE: Extensiones → Apps Script), con las propiedades `RESERVAS_SYNC_TOKEN` y `SUPABASE_ANON_KEY`. `instalarSyncReservas()` dejó `syncReservas()` corriendo cada 15 minutos en Google. No depende de ninguna PC. Si hay que cambiar la clave: generar una nueva y reemplazarla en el secreto `RESERVAS_SYNC_TOKEN` de Supabase y en la propiedad del Apps Script.
- **"Reservas del día" quitada del panel (09/11/2026), a pedido.** Era la pantalla donde el GM validaba la sala de cada jugador. Las funciones de la base (`admin_reservations_for_day`, `admin_search_clients`, `admin_validate_room`) siguen en Supabase sin pantalla que las use; la pantalla se puede recuperar del historial de git (`src/pages/ReservasPage.tsx`).
- **Calendario (09/11/2026):** la sección Calendario (`/admin/calendario`) muestra las reservas web pagadas en vista Mes, Semana y Día, con un color fijo por sucursal (`calendarData.ts`). Ocupa el alto de la ventana sin que la página scrollee: Mes muestra lo que entra y "+N más"; Semana y Día tienen un solo scroll con los títulos de los días fijos. Usa `admin_reservations_range` (migración `…220000_reservations_range_calendar.sql`, aplicada por el SQL Editor). Se quitaron los eventos de ejemplo y el botón "Nuevo", que no guardaban nada.

- **Tema e instalación (09/11/2026):**
  - Selector de tema en la barra superior: oscuro, claro o del sistema (`src/lib/theme.ts`, `ThemeMenu.tsx`). Se guarda por equipo. Los colores del tema claro están en `src/styles/tokens.css` (`:root[data-theme="light"]`).
  - Panel instalable (PWA): `public/manifest.webmanifest`, `public/sw.js` (sin caché, a propósito) e íconos en `public/icons/`. Botón "Instalar app" en la barra superior (`InstallButton.tsx`); en iPhone explica cómo agregarlo. **Requiere que el servidor sirva el panel por HTTPS.**
  - **App instalada del GM:** si un GM abre el panel como app instalada, ve solo las reservas de su sucursal día por día (`GmAppShell.tsx`). Desde el navegador ve el panel normal. En desarrollo se puede ver con `?gmapp`.

### Falta

- [ ] **Publicar el panel** con la sección nueva: `npm run build` (el `dist/` anterior al cambio de clave ya no sirve) y subir `dist/` a Cloudflare Pages.
- [ ] **Piloto de webhook directo de WooCommerce en Núñez** (`woo-webhook`): reservas al instante, sin pasar por la hoja. Núñez ya tiene dos webhooks de WooCommerce hacia ORIGEN (`order.created` y `order.updated`); los nuevos irían a Supabase y se validan por la firma de WooCommerce. Booknetic Pro no tiene la acción de Webhook instalada (solo Email). Verificar en el piloto si una reprogramación hecha en Booknetic cambia el pedido de WooCommerce.
- [ ] **Definir cómo valida el GM** ahora que no está "Reservas del día" (solo queda el QR + código GM desde la app).
- [ ] Una reserva de la hoja tiene un teléfono en la columna MARCA en lugar de la sucursal. Buscarla en la hoja y corregirla.
- [ ] Las reservas de Hell Experiment (274) no tienen sucursal ni sala en la app. Definir si se suman.

## 2. Validación de salas — reporte por sucursal

- **Reporte para los dueños de cada sucursal:** doc "Validación de salas por sucursal" (Claude Docs, privado). Falta compartirlo desde el menú Compartir.
- **Situación al 09/11/2026:** de 2.029 juegos web desde el 16/09, se validaron 85 salas (4%). San Telmo y La Plata no validan nada desde el 24/08 y el 05/09.
- **Ideas pendientes:**
  - [ ] Bloquear en la app validar dos salas a menos de 45 minutos. El 19% de las validaciones fueron en ráfaga.
  - [ ] Que el panel pueda regenerar el código GM de una sucursal. Hoy no existe.
  - [ ] Hacer que el cruce con las reservas se vea cada semana en el panel, por sucursal.
  - [ ] Push a clientes con reserva pasada y sin sala validada.

## 3. App móvil — alias repetido

- **Hecho en Supabase:** `handle_new_user()` ya no rechaza el registro si el alias está ocupado. Crea la cuenta con el alias vacío.
- **Falta en la app** (repo `escape-games-app`):
  - [ ] `app/completar-perfil.tsx`: no precargar el alias ocupado y avisar "Ese alias ya está en uso". Hoy dice "Revisá tu conexión".
  - [ ] `app/callback.tsx`: si el alias choca, guardar el resto del perfil y subir la selfie igual.
  - Se publica con `eas update --channel production`.
- [ ] iOS: la 1.1.2 se subió a la App Store el 09/11. Los registros de iPhone anteriores usaron la 1.1.1.
- [ ] Generar la clave de API de App Store Connect (`.p8`) para publicar iOS con EAS sin pedir códigos al dueño de la cuenta.

## 4. Mail validado

- **Hecho:** columna "Mail validado" en Clientes y Usuarios de sistema. El trigger `on_auth_user_email_confirmed` mantiene `profiles.email_verified_at` (migración `20261109150000_profiles_email_verified_sync.sql`).

## 5. Métricas y datos de ORIGEN

- [ ] Instalar `docs/apps-script/Metrics.gs` (ver `docs/apps-script/README.md`) para activar la sección Métricas.
- [ ] Usar los cupones (PROMOAMIGOS, PACKFAMILIAR) para medir las promociones por sucursal.
- [ ] Sumar las reservas a la ficha del cliente.

## 6. Avisos

- **Supabase:** el dashboard muestra "Grace period is over". Revisar Billing: si se agota la cuota, la app deja de responder.
- **Local:** el panel necesita `.env`. Ver `.env.example`.

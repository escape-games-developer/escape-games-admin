# Pendientes — panel admin

Última actualización: 09/11/2026. Dónde retomar el trabajo.

## 1. Reservas del día y validación de salas por el GM

**Estado:** funcionando en Supabase y en el panel local. Falta instalar la sincronización automática y publicar el panel.

### Hecho

- **Supabase** (aplicado en producción):
  - Tabla `web_reservations` con las reservas web de la hoja VENTAS ONLINE de ORIGEN ESCAPE. Un trigger calcula sucursal, sala, jugadores y hora de visita.
  - Funciones `admin_reservations_for_day`, `admin_search_clients` y `admin_validate_room`. Cada GM ve y valida solo su sucursal.
  - El día de trabajo va de 6:00 a 6:00, para que los turnos de trasnoche (00:15, 01:30) cuenten en el día anterior.
  - Edge function `reservas-sync` (con verificación JWT) y secreto `RESERVAS_SYNC_TOKEN`.
  - Carga inicial: 2.682 filas de la hoja (09/11/2026).
  - Migraciones: `supabase/migrations/20261109180000_web_reservations.sql`, `…190000_web_reservations_room_match.sql` y `…200000_reservations_business_day.sql`.
- **Panel:** sección "Reservas del día" (`/reservas`, `src/pages/ReservasPage.tsx`), habilitada para GM.

### Falta

- [ ] **Instalar `docs/apps-script/SyncReservas.gs`** en el proyecto de Apps Script de ORIGEN ESCAPE:
  1. Crear una secuencia de comandos nueva y pegar el archivo.
  2. En Propiedades de la secuencia de comandos, cargar `RESERVAS_SYNC_TOKEN` (la clave que se creó el 09/11; no está en el repo), `SUPABASE_ANON_KEY` (el mismo valor de `VITE_SUPABASE_ANON_KEY`) y `ORIGEN_SPREADSHEET_ID` (el id de la planilla, de su URL).
  3. Ejecutar `instalarSyncReservas()`.

  Hasta que esto se haga, las reservas nuevas no llegan al panel.
- [ ] **Publicar el panel** con la sección nueva.
- [ ] **Primera validación real** con un GM y un cliente presente. Ninguna se probó con datos reales.
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

---
name: project-reservas-validacion
description: Estado del proyecto de validación de salas por el GM con reservas web (al 09/11/2026)
metadata:
  node_type: memory
  type: project
  originSessionId: b4ddbd40-ba2e-427a-9d66-5e21da7b632c
  modified: 2026-11-09T18:45:13.609Z
---

Problema: casi nadie valida la sala en la app (4% de juegos web del 16/09 al 09/11/2026); validar dependía de que el cliente escaneara el QR + código GM. Solución en curso: tabla `web_reservations` + sección "Reservas del día" donde el GM valida a cada jugador (`admin_validate_room`, mismas inserciones que la app: room_completions + room_runs con llaves).

**Why:** el dueño quiere que cada sucursal valide; el reporte por sucursal (doc "Validación de salas por sucursal" en Claude Docs) se pasa a los dueños de cada sucursal.

**How to apply:** al 09/11/2026 todo está aplicado en Supabase y cargado (2.682 filas), pero falta que el usuario instale `docs/apps-script/SyncReservas.gs` (propiedades RESERVAS_SYNC_TOKEN y SUPABASE_ANON_KEY) y publique el panel. Antes de asumir que las reservas están al día, verificar `max(recibido_at)` en `web_reservations`. Ver `docs/pendientes.md`.

Relacionado: [[reference-escape-games]], [[feedback-supabase-por-chrome]].

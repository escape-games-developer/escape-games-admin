---
name: reference-escape-games
description: "Repos, proyecto Supabase y planilla ORIGEN de Escape Games (ids y para qué sirve cada uno)"
metadata:
  node_type: memory
  type: reference
  originSessionId: b4ddbd40-ba2e-427a-9d66-5e21da7b632c
  modified: 2026-11-09T18:45:08.960Z
---

- Panel admin: `C:\Users\magdi\proyectos\escape-games-admin` → github.com/escape-games-developer/escape-games-admin. Vite + React; `npm run dev` en localhost:5173, necesita `.env`.
- App móvil (Expo): `C:\Users\magdi\proyectos\escape-games-app` → github.com/escape-games-developer/escape-games-app. Publica JS con EAS Update (canal production) desde la 1.1.2.
- Supabase producción: proyecto `ajabxbciugxjommeyiyi` ("escape-games-app"), conector `claude_ai_Supabase`. El MCP `supabase-inbox` apunta a OTRO proyecto (rxpyibbgyvbrrztxtpsy), no usarlo para Escape Games.
- Planilla "ORIGEN ESCAPE - Base de Atribución": id en la propiedad ORIGEN_SPREADSHEET_ID del Apps Script (no se versiona). Hoja VENTAS ONLINE = reservas web WooCommerce desde el 16/09/2026 (mail, teléfono, MARCA, SERVICIO "N Participantes · Sala", FECHA DE LA VISITA, CUPÓN). Se lee desde Chrome con `/gviz/tq?tqx=out:csv&gid=776401110` (el export CSV falla por CORS).
- Pendientes y dónde retomar: `docs/pendientes.md` del panel.

Relacionado: [[project-reservas-validacion]].

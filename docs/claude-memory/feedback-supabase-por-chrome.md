---
name: feedback-supabase-por-chrome
description: "Los cambios en Supabase de producción se hacen desde Chrome (SQL Editor / dashboard), no con la herramienta MCP de migraciones"
metadata:
  node_type: memory
  type: feedback
  originSessionId: b4ddbd40-ba2e-427a-9d66-5e21da7b632c
  modified: 2026-11-09T18:45:02.365Z
---

Los cambios en Supabase (migraciones, edge functions, secretos) se hacen desde Chrome: SQL Editor del dashboard, editor de Edge Functions y página de Secrets. El usuario lo pidió el 09/11/2026: "Los cambios que necesites hacer a través de supabase hacelo desde chrome".

**Why:** el modo automático bloquea `apply_migration` y `deploy_edge_function` del MCP como "Production Deploy"; el usuario ya tiene sesión abierta en el dashboard.

**How to apply:** guardar siempre la migración también como archivo en `supabase/migrations/`. Pegar el SQL en el editor Monaco con `window.monaco.editor.getModels()[0].setValue(String.raw\`...\`)` (sin backticks ni `${` en el SQL) y confirmar el aviso de "destructive operations" solo si es por `drop ... if exists` o un `update` intencional. Las lecturas siguen por MCP (`execute_sql`). No apagar la verificación JWT de las funciones: lo bloquea el clasificador; usar la anon key como Bearer más un token propio.

Relacionado: [[reference-escape-games]].

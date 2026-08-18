# Pendientes y reglas operativas — panel admin

## Bug cerrado: invitación de GM caía en /salas en vez de /set-password

**Causa real: el build desplegado estaba desalineado con `src/`.**

La ruta `/set-password` existía en el código (`src/app/routes.tsx`) y la página
`src/pages/SetPassword.tsx` estaba completa, pero el bundle publicado en
Cloudflare Pages se había generado **antes** de que se agregara esa ruta. Sin la
ruta registrada, el catch-all `<Route path="*">` se comía la URL:

```
/set-password → no existe en el bundle desplegado
              → catch-all → /salas
              → AdminLayout: ¿hay sesión?
                   sí → se queda en /salas    (lo que veía el admin logueado)
                   no → /login                (lo que veía el GM invitado)
```

### Hipótesis que se descartaron por el camino

Cada una costó una ronda de debugging. Ninguna era el problema:

- La edge function `create-user` (mandaba bien el invite).
- El `redirect_to` del invite (terminaba correctamente en `/set-password`).
- La configuración de SMTP.
- Un guard por sesión dentro de `SetPassword.tsx` — **no existe**, el componente
  nunca redirige por sesión.
- Un `onAuthStateChange` global que navegara a `/salas` al detectar `SIGNED_IN`
  — **no existe**. `SIGNED_IN` no aparece en todo `src/`; los únicos tres
  `onAuthStateChange` (AdminLayout, Drawer, SetPassword) no navegan a `/salas`.
- `src/lib/adminSession.ts` — no redirige, y además nadie lo importa (código
  muerto, candidato a borrar).

El dato que cerró el caso: la URL rebotaba **incluso sin sesión activa**
(`localStorage` sin ninguna key `sb-*`). Sin sesión no hay evento de auth, así
que ningún watcher podía ser el culpable. La prueba directa fue greppear el
bundle de producción: el string `"Configurá tu contraseña"` aparecía **0 veces**.

### Qué se cambió al arreglarlo

- `src/pages/SetPassword.tsx`: tras `updateUser({ password })` exitoso ahora
  hace `signOut()` y manda a `/login` con un aviso, en vez de hidratar la sesión
  y entrar directo a `/salas`. Evita el estado ambiguo "logueado sin haber
  pasado nunca por el login". Se eliminó `hydrateAdminSession()`, ya sin uso.
- `src/pages/Login.tsx`: muestra el aviso que llega por `location.state.notice`.
  No se usó el toast del panel porque vive en el componente que se desmonta al
  navegar.
- `src/app/routes.tsx`: el catch-all ya no redirige a `/salas`, muestra un 404
  real. Ver regla operativa nueva.

---

## Reglas operativas

### NUEVA — verificar el bundle antes de dar por bueno un deploy

Después de cada `npm run build`, y **antes** de subir `dist/` al dashboard de
Cloudflare Pages, greppear el bundle por strings de las rutas o pantallas
nuevas. Que el código esté en `src/` no garantiza que esté en lo que se publica.

```bash
# la página tiene que estar compilada adentro del bundle
grep -c "Configurá tu contraseña" dist/assets/index-*.js   # >= 1

# la ruta + el redirect_to de Users.tsx
grep -o "set-password" dist/assets/index-*.js | wc -l       # >= 2

# el index.html tiene que apuntar al bundle recién generado
grep -o "assets/index-[A-Za-z0-9_-]*\.js" dist/index.html
```

Si alguno falla, no subir: el deploy va a quedar desalineado otra vez.

El 404 real en el catch-all es la otra mitad de esta regla. Antes, una ruta
faltante se veía idéntica a un rebote por permisos y mandaba el debugging para
cualquier lado. Ahora una ruta desconocida se ve como lo que es.

### VIGENTE — no resetear contraseñas preventivamente desde el panel

Sigue en pie. No resetear passwords "por las dudas" mientras se debuggea: enmascara
el estado real de la cuenta y hace irreproducible el problema que se está
investigando.

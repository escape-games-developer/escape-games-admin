/*
 * Service worker del panel (necesario para que sea instalable).
 *
 * A propósito NO guarda nada en caché: cada vez que se sube un dist/ nuevo, la
 * app instalada lo ve al instante (un panel desactualizado ya causó problemas,
 * ver .claude/pendientes-golden-ticket.md). Lo único que hace es mostrar un
 * aviso claro si se abre sin conexión.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title>
<style>html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#0b111b;color:#e8edf5;
font:15px system-ui,sans-serif;text-align:center;padding:24px}button{margin-top:16px;padding:10px 18px;border:0;
border-radius:10px;background:#ff6a00;color:#fff;font:inherit;font-weight:700}</style></head>
<body><div><h1 style="font-size:20px">Sin conexión</h1><p>El panel necesita internet para mostrar las reservas.</p>
<button onclick="location.reload()">Reintentar</button></div></body></html>`;

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});

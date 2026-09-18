/**
 * Imprime SOLO un QR de promoción. Mismo patrón que Salas y Golden Ticket
 * (iframe oculto + window.print() adentro), copiado acá para no tocar esos
 * módulos.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printPromotionQr(
  canvas: HTMLCanvasElement | null,
  { title, subtitle, note }: { title: string; subtitle: string; note?: string },
  onError: (msg: string) => void
) {
  if (!canvas) {
    onError("No encontré el QR para imprimir.");
    return;
  }

  const dataUrl = canvas.toDataURL("image/png");

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    onError("No pude abrir el frame de impresión.");
    return;
  }

  doc.open();
  doc.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: system-ui, sans-serif; margin: 0; padding: 40px; }
          .wrap { display:flex; flex-direction:column; align-items:center; gap:18px; }
          h1 { margin:0; font-size:24px; letter-spacing:1px; text-align:center; }
          h2 { margin:0; font-size:16px; font-weight:600; text-align:center; }
          p { margin:0; font-size:12px; color:#555; text-align:center; }
          img { width: 340px; height: 340px; image-rendering: pixelated; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1>${escapeHtml(title)}</h1>
          <h2>${escapeHtml(subtitle)}</h2>
          <img id="qrimg" src="${dataUrl}" alt="" />
          ${note ? `<p>${escapeHtml(note)}</p>` : ""}
        </div>
        <script>
          const img = document.getElementById("qrimg");
          img.onload = () => setTimeout(() => window.print(), 120);
        </script>
      </body>
    </html>
  `);
  doc.close();

  const remove = () => {
    try {
      document.body.removeChild(iframe);
    } catch {
      // ya se sacó
    }
  };

  iframe.contentWindow?.addEventListener("afterprint", remove);
  setTimeout(remove, 15000);
}

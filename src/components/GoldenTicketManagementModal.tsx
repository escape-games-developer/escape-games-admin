import { useCallback, useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

import type { ToastKind } from "./Toast";
import {
  fetchAppConfig,
  goldenQrValue,
  rotateGoldenQrSecret,
} from "../lib/appConfig";
import { GOLDEN_TICKET_IMAGE_URL } from "../lib/goldenTickets";

const GOLDEN_QR_CANVAS_ID = "golden-qr-canvas";
const GOLDEN_QR_SIZE = 220;
const GOLDEN_QR_PRINT_TITLE = "GOLDEN TICKET · Escape Games";

/* El modal se monta sobre el modalCenter normal del panel (z-index 80), así que
   se fuerza una capa propia. */
const Z_BACKDROP = 10000;
const Z_MODAL = 10001;

const ROTATE_CONFIRM_TEXT =
  "¿Rotar el secret? Los QR impresos actuales dejarán de funcionar.";

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Imprime SOLO el QR (mismo patrón que Salas): se arma un iframe oculto con el
 * título arriba y se dispara window.print() ahí adentro, así no se imprime el
 * resto del panel.
 */
function printGoldenQr(onError: (msg: string) => void) {
  const canvas = document.getElementById(
    GOLDEN_QR_CANVAS_ID
  ) as HTMLCanvasElement | null;

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
        <title>${GOLDEN_QR_PRINT_TITLE}</title>
        <style>
          body { font-family: system-ui, sans-serif; margin: 0; padding: 40px; }
          .wrap { display:flex; flex-direction:column; align-items:center; gap:24px; }
          h1 { margin:0; font-size:24px; letter-spacing:1px; text-align:center; }
          img { width: 340px; height: 340px; image-rendering: pixelated; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1>${GOLDEN_QR_PRINT_TITLE}</h1>
          <img id="qrimg" src="${dataUrl}" alt="" />
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

/**
 * Sólo el QR del Golden Ticket en sala. El cupo y las solicitudes pendientes
 * viven en la página /golden-tickets, no acá.
 */
export default function GoldenTicketManagementModal({
  open,
  onClose,
  toast,
}: {
  open: boolean;
  onClose: () => void;
  toast: (kind: ToastKind, text: string) => void;
}) {
  const [secret, setSecret] = useState<string | null>(null);
  const [secretLoading, setSecretLoading] = useState(true);
  const [rotating, setRotating] = useState(false);

  // El PNG todavía no está subido a public-assets: si falta, mostramos un
  // placeholder en vez del ícono de imagen rota.
  const [ticketImgFailed, setTicketImgFailed] = useState(false);

  const loadSecret = useCallback(async () => {
    setSecretLoading(true);

    try {
      const cfg = await fetchAppConfig();
      setSecret(cfg.goldenQrSecret);
    } catch (err: any) {
      console.error(err);
      setSecret(null);
    } finally {
      setSecretLoading(false);
    }
  }, []);

  /* Lazy: la query recién sale cuando se abre el modal, no al montar Salas. */
  useEffect(() => {
    if (!open) return;

    loadSecret();
  }, [open, loadSecret]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (rotating) return;

      onClose();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, rotating]);

  if (!open) return null;

  const handleRotate = async () => {
    if (rotating) return;
    if (!window.confirm(ROTATE_CONFIRM_TEXT)) return;

    setRotating(true);

    try {
      const next = await rotateGoldenQrSecret();

      /* El RPC devuelve el secret nuevo, pero la fuente de verdad es
         `app_config`: se relee para que el QR de abajo salga del valor
         realmente persistido y no de una copia optimista. */
      let persisted: string | null = null;
      try {
        const cfg = await fetchAppConfig();
        persisted = cfg.goldenQrSecret;
      } catch (err) {
        // Si la relectura falla nos quedamos con lo que devolvió el RPC.
        console.error(err);
      }

      const applied = persisted || next;
      if (!applied) throw new Error("El secret nuevo llegó vacío.");

      setSecret(applied);
      toast("success", "Secret rotado. Los QR anteriores dejaron de funcionar.");
    } catch (err: any) {
      console.error(err);
      toast("error", err?.message || "No pude rotar el secret.");
    } finally {
      setRotating(false);
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    const ok = await copyToClipboard(secret);
    toast(ok ? "success" : "error", ok ? "Secret copiado" : "No pude copiar el secret.");
  };

  const qrValue = goldenQrValue(secret);

  return (
    <>
      <div
        className="backdrop show"
        style={{ zIndex: Z_BACKDROP }}
        onMouseDown={onClose}
      />

      <div className="modalCenter" style={{ zIndex: Z_MODAL }} onMouseDown={onClose}>
        <div
          className="modalBox"
          onMouseDown={(e) => e.stopPropagation()}
          style={styles.box}
        >
          <div className="modalHead">
            <div className="modalTitle">Golden Ticket</div>

            <button
              className="iconBtn"
              onClick={onClose}
              aria-label="Cerrar"
              type="button"
            >
              ✕
            </button>
          </div>

          {/* Sin scroll interno: el alto lo acota el QR, que se encoge por vh
              en pantallas bajas (el canvas sigue renderizando a 280px, así que
              la impresión no pierde resolución). */}
          <div className="modalBody" style={styles.body}>
            <p style={styles.subtitle}>
              QR para otorgar el Golden Ticket en sala. Las solicitudes se revisan en la
              sección <b>Golden Ticket</b> del menú.
            </p>

            <div style={styles.grid}>
              <div style={styles.leftCol}>
                {ticketImgFailed ? (
                  <div style={{ ...styles.ticketImg, ...styles.ticketImgFallback }}>
                    Falta subir <code>golden-ticket.png</code> al bucket{" "}
                    <code>public-assets</code>.
                  </div>
                ) : (
                  <img
                    src={GOLDEN_TICKET_IMAGE_URL}
                    alt="Golden Ticket"
                    style={styles.ticketImg}
                    loading="lazy"
                    onError={() => setTicketImgFailed(true)}
                  />
                )}
              </div>

              <div style={styles.rightCol}>
                {qrValue ? (
                  <div style={styles.qrFrame}>
                    <QRCodeCanvas
                      id={GOLDEN_QR_CANVAS_ID}
                      value={qrValue}
                      size={GOLDEN_QR_SIZE}
                      bgColor="#ffffff"
                      fgColor="#000000"
                      level="M"
                      style={styles.qrCanvas}
                    />
                  </div>
                ) : (
                  <div style={styles.qrPlaceholder}>
                    {secretLoading
                      ? "Cargando…"
                      : "No hay secret configurado todavía. Rotá el secret para generar uno."}
                  </div>
                )}

                <div style={styles.secretBlock}>
                  <div style={styles.fieldLabel}>Secret actual</div>
                  <div style={styles.secretValue}>
                    {secretLoading ? "Cargando…" : secret ?? "sin secret configurado"}
                  </div>

                  <button
                    type="button"
                    className="ghostBtn"
                    onClick={copySecret}
                    disabled={!secret || secretLoading}
                    style={styles.actionBtn}
                  >
                    Copiar
                  </button>
                </div>

                <div style={styles.actions}>
                  <button
                    type="button"
                    className="ghostBtn"
                    onClick={() => printGoldenQr((msg) => toast("error", msg))}
                    disabled={!qrValue}
                    style={styles.actionBtn}
                  >
                    Imprimir QR
                  </button>

                  <button
                    type="button"
                    onClick={handleRotate}
                    disabled={rotating || secretLoading}
                    style={{
                      ...styles.dangerBtn,
                      ...styles.actionBtn,
                      ...(rotating || secretLoading ? styles.btnBusy : null),
                    }}
                    title="Invalida todos los QR ya impresos"
                  >
                    {rotating ? (
                      <>
                        <span className="egSpinner" aria-hidden="true" />
                        Rotando…
                      </>
                    ) : (
                      "Rotar secret"
                    )}
                  </button>
                </div>
              </div>
            </div>

            <p style={styles.note}>
              Imprimí este QR y ponelo visible en la sala. El cliente lo escanea desde
              Handicap y recibe el ticket.
            </p>
          </div>
        </div>
      </div>

    </>
  );
}

const styles: Record<string, any> = {
  /* .modalBox trae width min(820px,94vw) y max-height calc(100vh - 28px): las
     dos se pisan acá. */
  box: {
    width: "min(780px, 80vw)",
    maxWidth: 780,
    maxHeight: "92vh",
    overflow: "hidden",
  },

  /* .modalBody viene con overflow-y:auto + max-height; se anulan para que no
     haya scroll interno. */
  body: {
    padding: "10px 14px",
    overflow: "hidden",
    maxHeight: "none",
    minHeight: 0,
  },

  subtitle: {
    margin: "0 0 14px 0",
    fontSize: 13.5,
    color: "#94a3b8",
    lineHeight: 1.5,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 320px) minmax(0, 1fr)",
    gap: 20,
    alignItems: "center",
  },

  leftCol: {
    minWidth: 0,
  },

  rightCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 14,
    minWidth: 0,
  },

  // La imagen ya viene 1.8:1, así que sólo fijamos el ancho.
  ticketImg: {
    width: "100%",
    maxWidth: 320,
    aspectRatio: "1.8 / 1",
    objectFit: "cover",
    borderRadius: 14,
    border: "1px solid #1f2937",
    display: "block",
  },

  ticketImgFallback: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 16,
    background: "#0b1220",
    color: "#94a3b8",
    fontSize: 12.5,
    lineHeight: 1.5,
  },

  qrFrame: {
    background: "#ffffff",
    padding: 12,
    borderRadius: 8,
    lineHeight: 0,
    flexShrink: 0,
  },

  /* El canvas se sigue renderizando a 280px (impresión intacta) pero se
     muestra más chico si la pantalla es baja, para no forzar scroll. */
  qrCanvas: {
    width: "min(220px, 28vh)",
    height: "min(220px, 28vh)",
    display: "block",
  },

  qrPlaceholder: {
    border: "1px solid #1f2937",
    borderRadius: 14,
    background: "#0b1220",
    padding: 18,
    color: "#cbd5e1",
    fontSize: 13.5,
    maxWidth: 320,
  },

  secretBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
    width: "100%",
    minWidth: 0,
  },

  fieldLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94a3b8",
    fontWeight: 700,
  },

  secretValue: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    color: "#cbd5e1",
    wordBreak: "break-all",
    width: "100%",
  },

  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },

  actionBtn: {
    whiteSpace: "nowrap",
  },

  dangerBtn: {
    background: "linear-gradient(180deg, #7f1d1d 0%, #601414 100%)",
    border: "1px solid #991b1b",
    color: "#fecaca",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
    fontSize: 13.5,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },

  btnBusy: {
    opacity: 0.65,
    cursor: "not-allowed",
  },

  note: {
    margin: "14px 0 0 0",
    fontSize: 13,
    color: "#94a3b8",
    lineHeight: 1.55,
  },
};

import { useCallback, useEffect, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

import { ToastStack, useToasts } from "../components/Toast";
import {
  fetchAppConfig,
  goldenQrValue,
  rotateGoldenQrSecret,
  setRatingUploadEnabled,
} from "../lib/appConfig";

const GOLDEN_QR_CANVAS_ID = "golden-qr-canvas";
const GOLDEN_QR_SIZE = 300;
const GOLDEN_QR_PRINT_TITLE = "GOLDEN TICKET · Escape Games";

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

export default function Config() {
  const { toasts, toast, dismiss } = useToasts();

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [uploadEnabled, setUploadEnabled] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);

  const [secret, setSecret] = useState<string | null>(null);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotating, setRotating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrMsg("");

    try {
      const cfg = await fetchAppConfig();
      setUploadEnabled(cfg.ratingUploadEnabled);
      setSecret(cfg.goldenQrSecret);
    } catch (err: any) {
      console.error(err);
      setErrMsg(err?.message || "No pude cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleUpload = async () => {
    if (savingToggle || loading) return;

    const next = !uploadEnabled;
    setSavingToggle(true);

    try {
      const applied = await setRatingUploadEnabled(next);
      setUploadEnabled(applied);

      toast(
        "success",
        applied
          ? "Subida de capturas activada"
          : "Subida de capturas desactivada"
      );
    } catch (err: any) {
      console.error(err);
      toast("error", err?.message || "No pude cambiar la configuración.");
    } finally {
      setSavingToggle(false);
    }
  };

  const doRotate = async () => {
    if (rotating) return;
    setRotating(true);

    try {
      const next = await rotateGoldenQrSecret();
      setSecret(next);
      setRotateOpen(false);
      toast("success", "Secret rotado — imprimí y distribuí los nuevos QR");
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
    <div style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerWrap}>
          <div style={styles.headerText}>
            <h1 style={styles.title}>Configuración</h1>
            <p style={styles.subtitle}>
              Ajustes globales de la app cliente. Los cambios impactan a todos los
              usuarios apenas se guardan.
            </p>
          </div>

          <div style={styles.headerActions}>
            <button type="button" className="ghostBtn" onClick={load} disabled={loading}>
              {loading ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
        </div>

        {errMsg ? <div style={styles.errorBanner}>{errMsg}</div> : null}

        {/* ============ BLOQUE 1 ============ */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Subida de valoraciones (kill switch)</h2>

          <div style={styles.toggleRow}>
            <button
              type="button"
              role="switch"
              aria-checked={uploadEnabled}
              aria-label="Botón de subir captura"
              onClick={toggleUpload}
              disabled={loading || savingToggle}
              style={{
                ...styles.switch,
                ...(uploadEnabled ? styles.switchOn : styles.switchOff),
                ...(loading || savingToggle ? styles.switchBusy : null),
              }}
            >
              <span
                style={{
                  ...styles.switchKnob,
                  transform: uploadEnabled ? "translateX(34px)" : "translateX(0)",
                }}
              />
            </button>

            <div style={styles.toggleTextWrap}>
              <div style={styles.toggleLabel}>
                Botón de subir captura{" "}
                <b style={{ color: uploadEnabled ? "#4ade80" : "#f87171" }}>
                  {loading ? "…" : uploadEnabled ? "ACTIVADO" : "DESACTIVADO"}
                </b>
              </div>

              {savingToggle ? <div style={styles.toggleBusy}>Guardando…</div> : null}
            </div>
          </div>

          <p style={styles.note}>
            Cuando está desactivado, el botón flotante del clip desaparece de la app
            cliente para todos los usuarios.
          </p>
        </section>

        {/* ============ BLOQUE 2 ============ */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>QR para Golden Ticket en sala</h2>

          <p style={styles.cardSubtitle}>
            Imprimí este QR y escondelo en la sala. El cliente que lo escanea con el
            scanner de Handicap recibe un Golden Ticket al instante.
          </p>

          <label style={styles.fieldLabel} htmlFor="golden-qr-secret">
            Secret actual
          </label>

          <div style={styles.secretRow}>
            <input
              id="golden-qr-secret"
              readOnly
              value={loading ? "Cargando…" : secret ?? "sin secret configurado"}
              style={styles.secretInput}
              onFocus={(e) => e.currentTarget.select()}
            />

            <button
              type="button"
              className="ghostBtn"
              onClick={copySecret}
              disabled={!secret || loading}
            >
              Copiar
            </button>
          </div>

          {qrValue ? (
            <>
              <div style={styles.qrRow}>
                <div style={styles.qrFrame}>
                  <QRCodeCanvas
                    id={GOLDEN_QR_CANVAS_ID}
                    value={qrValue}
                    size={GOLDEN_QR_SIZE}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="M"
                  />
                </div>

                <div style={styles.qrSide}>
                  <div style={styles.qrValueLabel}>Contenido del QR</div>
                  <div style={styles.qrValue}>{qrValue}</div>

                  <button
                    type="button"
                    className="ghostBtn"
                    onClick={() => printGoldenQr((msg) => toast("error", msg))}
                    style={{ marginTop: 14 }}
                  >
                    Imprimir QR
                  </button>

                  <button
                    type="button"
                    onClick={() => setRotateOpen(true)}
                    disabled={rotating}
                    style={styles.dangerBtn}
                  >
                    Rotar secret (invalida todos los QR impresos)
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={styles.panel}>
              {loading
                ? "Cargando…"
                : "No hay secret configurado todavía. Rotá el secret para generar uno."}
            </div>
          )}
        </section>
      </div>

      {rotateOpen ? (
        <>
          <div className="backdrop show" onMouseDown={() => !rotating && setRotateOpen(false)} />

          <div className="modalCenter" onMouseDown={() => !rotating && setRotateOpen(false)}>
            <div
              className="modalBox"
              onMouseDown={(e) => e.stopPropagation()}
              style={{ maxWidth: 460 }}
            >
              <div className="modalHead">
                <div className="modalTitle">Rotar secret</div>

                <button
                  className="iconBtn"
                  onClick={() => setRotateOpen(false)}
                  disabled={rotating}
                  aria-label="Cerrar"
                  type="button"
                >
                  ✕
                </button>
              </div>

              <div className="modalBody">
                <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                  ¿Rotar? Todos los QR impresos van a dejar de funcionar.
                </div>
              </div>

              <div className="modalFoot">
                <button
                  type="button"
                  className="ghostBtn"
                  onClick={() => setRotateOpen(false)}
                  disabled={rotating}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={doRotate}
                  disabled={rotating}
                  style={styles.dangerBtn}
                >
                  {rotating ? "Rotando…" : "Rotar secret"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

const styles: Record<string, any> = {
  page: {
    width: "100%",
    minHeight: "100%",
    height: "100%",
    background: "#0f172a",
    color: "#e5e7eb",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxSizing: "border-box",
  },

  pageInner: {
    width: "100%",
    maxWidth: "100%",
    minHeight: "100%",
    margin: 0,
    padding: "14px 18px 18px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  headerWrap: {
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },

  headerText: {
    flex: "1 1 420px",
    minWidth: 280,
  },

  title: {
    margin: 0,
    fontSize: 32,
    fontWeight: 800,
    color: "#ffffff",
    lineHeight: 1.1,
  },

  subtitle: {
    margin: "8px 0 0 0",
    fontSize: 14,
    color: "#94a3b8",
    maxWidth: 760,
  },

  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  errorBanner: {
    border: "1px solid #991b1b",
    background: "rgba(153,27,27,0.14)",
    color: "#fca5a5",
    borderRadius: 14,
    padding: 12,
    fontSize: 13.5,
  },

  card: {
    background: "linear-gradient(180deg, #111827 0%, #0b1220 100%)",
    border: "1px solid #1f2937",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 10px 24px rgba(0,0,0,0.16)",
    boxSizing: "border-box",
  },

  cardTitle: {
    margin: "0 0 4px 0",
    fontSize: 18,
    fontWeight: 800,
    color: "#ffffff",
  },

  cardSubtitle: {
    margin: "6px 0 16px 0",
    fontSize: 13.5,
    color: "#94a3b8",
    maxWidth: 720,
    lineHeight: 1.55,
  },

  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginTop: 16,
    flexWrap: "wrap",
  },

  switch: {
    width: 72,
    height: 38,
    borderRadius: 999,
    padding: 3,
    border: "1px solid",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    transition: "background 140ms ease, border-color 140ms ease",
  },

  switchOn: {
    background: "rgba(22,101,52,0.55)",
    borderColor: "#166534",
  },

  switchOff: {
    background: "rgba(30,41,59,0.9)",
    borderColor: "#334155",
  },

  switchBusy: {
    opacity: 0.6,
    cursor: "not-allowed",
  },

  switchKnob: {
    width: 30,
    height: 30,
    borderRadius: 999,
    background: "#e5e7eb",
    boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
    transition: "transform 140ms ease",
    display: "block",
  },

  toggleTextWrap: {
    minWidth: 0,
  },

  toggleLabel: {
    fontSize: 15.5,
    fontWeight: 700,
    color: "#e5e7eb",
  },

  toggleBusy: {
    fontSize: 12.5,
    color: "#94a3b8",
    marginTop: 4,
  },

  note: {
    margin: "16px 0 0 0",
    fontSize: 13,
    color: "#94a3b8",
    lineHeight: 1.55,
    maxWidth: 720,
  },

  fieldLabel: {
    display: "block",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94a3b8",
    fontWeight: 700,
    marginBottom: 8,
  },

  secretRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },

  secretInput: {
    flex: "1 1 320px",
    minWidth: 0,
    background: "#0b1220",
    border: "1px solid #1f2937",
    borderRadius: 12,
    padding: "11px 12px",
    color: "#e5e7eb",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13.5,
  },

  qrRow: {
    display: "flex",
    gap: 20,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginTop: 18,
  },

  // 300x300 con 20px de borde blanco alrededor.
  qrFrame: {
    background: "#ffffff",
    padding: 20,
    borderRadius: 8,
    lineHeight: 0,
    flexShrink: 0,
  },

  qrSide: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 260,
    flex: "1 1 260px",
  },

  qrValueLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94a3b8",
    fontWeight: 700,
  },

  qrValue: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    color: "#cbd5e1",
    wordBreak: "break-all",
  },

  dangerBtn: {
    marginTop: 10,
    background: "linear-gradient(180deg, #7f1d1d 0%, #601414 100%)",
    border: "1px solid #991b1b",
    color: "#fecaca",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
    fontSize: 13.5,
    cursor: "pointer",
  },

  panel: {
    border: "1px solid #1f2937",
    borderRadius: 18,
    background: "#0b1220",
    padding: 18,
    color: "#cbd5e1",
    fontSize: 14,
    marginTop: 16,
  },
};

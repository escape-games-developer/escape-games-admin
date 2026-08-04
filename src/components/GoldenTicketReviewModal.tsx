import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  createScreenshotSignedUrl,
  describeGrantError,
  formatDateDDMMYYYY,
  formatRelative,
  fullName,
  grantGoldenTicket,
  PUSH_GRANTED,
  PUSH_REJECTED_TYPE,
  rejectRatingScreenshot,
  sendPushNotification,
  type PendingRequest,
} from "../lib/goldenTickets";
import type { ToastKind } from "./Toast";

type Mode = "view" | "confirmGrant" | "reject";

const MIN_REASON = 5;

export default function GoldenTicketReviewModal({
  open,
  request,
  onClose,
  onDone,
  toast,
}: {
  open: boolean;
  request: PendingRequest | null;
  onClose: () => void;
  /** Se llama tras un grant/reject exitoso para refrescar el listado. */
  onDone: () => void;
  toast: (kind: ToastKind, text: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const userId = request?.id ?? null;
  const screenshotPath = request?.rating_screenshot_url ?? null;

  // Firma la URL cada vez que se abre con otro usuario.
  useEffect(() => {
    if (!open || !screenshotPath) {
      setImgUrl(null);
      return;
    }

    let cancelled = false;

    setImgLoading(true);
    setImgError("");
    setImgUrl(null);

    (async () => {
      try {
        const url = await createScreenshotSignedUrl(screenshotPath);
        if (cancelled) return;

        if (!url) {
          setImgError("No se pudo generar el link firmado de la captura.");
        } else {
          setImgUrl(url);
        }
      } catch (err: any) {
        if (!cancelled) setImgError(String(err?.message ?? err));
      } finally {
        if (!cancelled) setImgLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, screenshotPath]);

  useEffect(() => {
    if (open) {
      setMode("view");
      setReason("");
      setBusy(false);
    }
  }, [open, userId]);

  if (!open || !request) return null;

  const name = fullName(request);

  const doGrant = async () => {
    if (!userId || busy) return;
    setBusy(true);

    try {
      const result = await grantGoldenTicket(userId);

      if (!result.success) {
        toast("error", describeGrantError(result.error));
        onClose();
        return;
      }

      const numberLabel = result.number != null ? `#${result.number}` : "";
      const expiresLabel = formatDateDDMMYYYY(result.expires_at);

      toast(
        "success",
        `Golden Ticket ${numberLabel} otorgado${
          expiresLabel ? `, vence ${expiresLabel}` : ""
        }`
      );

      // El grant ya está hecho: si el push falla, sólo avisamos.
      const push = await sendPushNotification({
        userId,
        title: PUSH_GRANTED.title,
        body: PUSH_GRANTED.body,
        data: { type: PUSH_GRANTED.type },
      });

      if (!push.ok) {
        console.warn("push grant error:", push.error);
        toast(
          "warning",
          "Golden Ticket otorgado, pero no se pudo enviar el push (el usuario lo verá al abrir la app)"
        );
      }

      onDone();
      onClose();
    } catch (err: any) {
      toast("error", String(err?.message ?? err));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!userId || busy) return;

    const clean = reason.trim();
    if (clean.length < MIN_REASON) {
      toast("error", `El motivo debe tener al menos ${MIN_REASON} caracteres`);
      return;
    }

    setBusy(true);

    try {
      await rejectRatingScreenshot(userId, clean);
      toast("success", "Screenshot rechazado");

      const push = await sendPushNotification({
        userId,
        title: "Tu captura fue rechazada",
        body: `Motivo: ${clean}. Podés volver a subir otra captura desde la app.`,
        data: { type: PUSH_REJECTED_TYPE, reason: clean },
      });

      if (!push.ok) {
        console.warn("push reject error:", push.error);
        toast(
          "warning",
          "Rechazo guardado, pero no se pudo enviar el push (el usuario lo verá al abrir la app)"
        );
      }

      onDone();
      onClose();
    } catch (err: any) {
      toast("error", String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  const reasonTooShort = reason.trim().length < MIN_REASON;

  return createPortal(
    <div style={styles.overlay} onMouseDown={busy ? undefined : onClose}>
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.headerUser}>
            {request.photo_url ? (
              <img src={request.photo_url} alt="" style={styles.avatar} />
            ) : (
              <div style={{ ...styles.avatar, ...styles.avatarFallback }}>
                {name.charAt(0).toUpperCase()}
              </div>
            )}

            <div style={{ minWidth: 0 }}>
              <div style={styles.name}>{name}</div>
              <div style={styles.meta}>
                {request.alias ? `@${request.alias} · ` : ""}
                {request.mail ?? "sin mail"}
              </div>
              <div style={styles.meta}>
                Subido {formatRelative(request.rating_screenshot_uploaded_at)}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="ghostBtn"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div style={styles.body}>
          {mode === "view" ? (
            <>
              <div style={styles.viewer}>
                {imgLoading ? (
                  <div style={styles.viewerMsg}>Cargando captura…</div>
                ) : imgError ? (
                  <div style={{ ...styles.viewerMsg, color: "#f87171" }}>{imgError}</div>
                ) : imgUrl ? (
                  <img src={imgUrl} alt="Captura de la valoración" style={styles.image} />
                ) : (
                  <div style={styles.viewerMsg}>Este usuario no tiene captura cargada.</div>
                )}
              </div>

              {imgUrl ? (
                <a
                  href={imgUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.openLink}
                >
                  Abrir en pestaña nueva ↗
                </a>
              ) : null}

              <div style={styles.actions}>
                <button
                  type="button"
                  onClick={() => setMode("reject")}
                  disabled={busy}
                  style={{ ...styles.btn, ...styles.btnDanger }}
                >
                  Rechazar
                </button>

                <button
                  type="button"
                  onClick={() => setMode("confirmGrant")}
                  disabled={busy}
                  style={{ ...styles.btn, ...styles.btnSuccess }}
                >
                  Aceptar y otorgar Golden Ticket
                </button>
              </div>
            </>
          ) : null}

          {mode === "confirmGrant" ? (
            <>
              <div style={styles.confirmText}>
                ¿Otorgar Golden Ticket a <b>{name}</b>? Se le habilita en su app y recibe
                notificación push.
              </div>

              <div style={styles.actions}>
                <button
                  type="button"
                  onClick={() => setMode("view")}
                  disabled={busy}
                  style={{ ...styles.btn, ...styles.btnGhost }}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={doGrant}
                  disabled={busy}
                  style={{ ...styles.btn, ...styles.btnSuccess }}
                >
                  {busy ? "Otorgando…" : "Confirmar"}
                </button>
              </div>
            </>
          ) : null}

          {mode === "reject" ? (
            <>
              <label style={styles.label} htmlFor="gt-reject-reason">
                Motivo del rechazo
              </label>

              <textarea
                id="gt-reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: la captura no muestra la valoración de la app."
                rows={4}
                disabled={busy}
                style={styles.textarea}
              />

              <div style={styles.hint}>
                {reasonTooShort
                  ? `Mínimo ${MIN_REASON} caracteres. El usuario lo va a ver en la app.`
                  : "El usuario lo va a ver en la app."}
              </div>

              <div style={styles.actions}>
                <button
                  type="button"
                  onClick={() => setMode("view")}
                  disabled={busy}
                  style={{ ...styles.btn, ...styles.btnGhost }}
                >
                  Volver
                </button>

                <button
                  type="button"
                  onClick={doReject}
                  disabled={busy || reasonTooShort}
                  style={{
                    ...styles.btn,
                    ...styles.btnDanger,
                    ...(reasonTooShort ? styles.btnDisabled : null),
                  }}
                >
                  {busy ? "Rechazando…" : "Confirmar rechazo"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

const styles: Record<string, any> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(2,6,23,0.72)",
    zIndex: 11000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },

  modal: {
    width: "min(760px, 100%)",
    maxHeight: "92vh",
    display: "flex",
    flexDirection: "column",
    background: "#0b1220",
    border: "1px solid #1f2937",
    borderRadius: 18,
    boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
    color: "#e5e7eb",
    overflow: "hidden",
  },

  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    padding: 18,
    borderBottom: "1px solid #1f2937",
  },

  headerUser: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    minWidth: 0,
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 999,
    objectFit: "cover",
    border: "1px solid #1f2937",
    flexShrink: 0,
  },

  avatarFallback: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#111827",
    fontWeight: 800,
    color: "#94a3b8",
  },

  name: {
    fontSize: 16,
    fontWeight: 800,
    color: "#ffffff",
  },

  meta: {
    fontSize: 12.5,
    color: "#94a3b8",
    marginTop: 2,
    wordBreak: "break-word",
  },

  body: {
    padding: 18,
    overflow: "auto",
  },

  viewer: {
    width: "100%",
    minHeight: 220,
    maxHeight: "52vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#020617",
    border: "1px solid #1f2937",
    borderRadius: 14,
    overflow: "hidden",
  },

  viewerMsg: {
    padding: 24,
    color: "#94a3b8",
    fontSize: 13.5,
    textAlign: "center",
  },

  image: {
    maxWidth: "100%",
    maxHeight: "52vh",
    objectFit: "contain",
    display: "block",
  },

  openLink: {
    display: "inline-block",
    marginTop: 10,
    fontSize: 12.5,
    color: "#93c5fd",
    textDecoration: "none",
  },

  actions: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    flexWrap: "wrap",
    marginTop: 18,
  },

  btn: {
    minHeight: 44,
    padding: "0 18px",
    borderRadius: 12,
    border: "1px solid transparent",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },

  btnSuccess: {
    background: "#16a34a",
    borderColor: "#15803d",
    color: "#ffffff",
  },

  btnDanger: {
    background: "#dc2626",
    borderColor: "#b91c1c",
    color: "#ffffff",
  },

  btnGhost: {
    background: "transparent",
    borderColor: "#334155",
    color: "#cbd5e1",
  },

  btnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },

  confirmText: {
    fontSize: 14.5,
    lineHeight: 1.6,
    color: "#e5e7eb",
  },

  label: {
    display: "block",
    fontSize: 13,
    color: "#cbd5e1",
    marginBottom: 8,
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: "#0f172a",
    border: "1px solid #1f2937",
    borderRadius: 12,
    color: "#e5e7eb",
    padding: 12,
    fontSize: 14,
    fontFamily: "inherit",
    resize: "vertical",
  },

  hint: {
    marginTop: 6,
    fontSize: 12,
    color: "#94a3b8",
  },
};

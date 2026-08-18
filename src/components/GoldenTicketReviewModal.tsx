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
import { Badge, Button, Card, Modal } from "../ui";

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

  const footer = mode === "view" ? (
    <>
      <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
      <Button variant="danger" onClick={() => setMode("reject")} disabled={busy}>Rechazar</Button>
      <Button variant="primary" onClick={() => setMode("confirmGrant")} disabled={busy}>Aprobar Golden Ticket</Button>
    </>
  ) : mode === "confirmGrant" ? (
    <>
      <Button variant="secondary" onClick={() => setMode("view")} disabled={busy}>Volver</Button>
      <Button variant="primary" onClick={doGrant} loading={busy}>Confirmar aprobación</Button>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={() => setMode("view")} disabled={busy}>Cancelar</Button>
      <Button variant="danger" onClick={doReject} loading={busy} disabled={reasonTooShort}>Confirmar rechazo</Button>
    </>
  );

  return createPortal(
    <Modal
      open
      title="Revisar Golden Ticket"
      description="Verificá la captura antes de aprobar o rechazar la solicitud."
      size="lg"
      panelClassName="eg-golden-review"
      onClose={busy ? () => undefined : onClose}
      footer={footer}
    >
      <div className="eg-golden-review__user">
        <span className="eg-golden-review__avatar">
          {request.photo_url ? <img src={request.photo_url} alt="" /> : (name.charAt(0) || "U").toUpperCase()}
        </span>
        <span className="eg-golden-review__identity">
          <strong>{name}</strong>
          <small>{request.alias ? `@${request.alias}` : "sin alias"} · {request.mail ?? "sin mail"}</small>
        </span>
        <span className="eg-golden-review__meta">
          <Badge tone="warning" small>Pendiente</Badge>
          <small title={request.rating_screenshot_uploaded_at || undefined}>Subido {formatRelative(request.rating_screenshot_uploaded_at)}</small>
        </span>
      </div>

      {mode === "view" && <>
        <section className="eg-golden-review__capture">
          <div className="eg-golden-review__section-title"><strong>Captura enviada</strong>{imgUrl && <a href={imgUrl} target="_blank" rel="noreferrer">Abrir en pestaña nueva ↗</a>}</div>
          <div className="eg-golden-review__viewer">
            {imgLoading ? (
              <div className="eg-golden-review__feedback">Cargando captura...</div>
            ) : imgError ? (
              <div className="eg-golden-review__feedback is-error"><strong>No se pudo cargar la captura.</strong><span>{imgError}</span></div>
            ) : imgUrl ? (
              <img src={imgUrl} alt="Captura de la valoración" />
            ) : (
              <div className="eg-golden-review__feedback">Este usuario no tiene captura cargada.</div>
            )}
          </div>
        </section>
      </>}

      {mode === "confirmGrant" && <Card padding="md" className="eg-golden-review__confirmation">
        <strong>Confirmar aprobación</strong>
        <p>¿Querés otorgar el Golden Ticket a <b>{name}</b>? Se habilitará en su app y se intentará enviar la notificación existente.</p>
      </Card>}

      {mode === "reject" && <div className="eg-golden-review__reject">
        <label className="eg-field" htmlFor="gt-reject-reason">
          <span className="eg-field__label">Motivo del rechazo</span>
          <textarea id="gt-reject-reason" className="eg-input eg-golden-review__textarea" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej: la captura no muestra la valoración de la app." rows={4} disabled={busy} />
          <span className={`eg-field__help${reasonTooShort ? " is-error" : ""}`}>{reasonTooShort ? `Mínimo ${MIN_REASON} caracteres. El usuario lo va a ver en la app.` : "El usuario lo va a ver en la app."}</span>
        </label>
      </div>}
    </Modal>,
    document.body
  );
}

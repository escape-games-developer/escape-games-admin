import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge, Button, EmptyState } from "../../ui";
import type { ToastKind } from "../Toast";
import {
  disablePromotionQrTarget,
  enablePromotionQrTarget,
  fetchPromotionQrTargets,
  promotionErrorMessage,
  rotatePromotionQrTargetToken,
  type PromotionQrTarget,
  type PromotionQrTargetAction,
} from "../../lib/promotions";
import PromotionQrTargetModal from "./PromotionQrTargetModal";
import PromotionConfirmDialog from "./PromotionConfirmDialog";

type Props = {
  promotionId: string;
  promotionName: string;
  toast: (kind: ToastKind, text: string) => void;
};

/** Textos de cada bloque. Los dos son simétricos; cambia qué hace el QR. */
const BLOQUES: { action: PromotionQrTargetAction; titulo: string; ayuda: string }[] = [
  {
    action: "GRANT",
    titulo: "Activación del beneficio",
    ayuda: "El cliente escanea este QR para recibir la promoción.",
  },
  {
    action: "USE",
    titulo: "Utilización del beneficio",
    ayuda: "El cliente escanea este QR al momento de utilizar la promoción.",
  },
];

/**
 * Título de la única lista que se muestra dentro de cada bloque.
 *
 * Los destinos se listan JUNTOS y sin distinguir de qué tipo son. Hell
 * Experiment está modelado como VENUE por una razón técnica —no ensuciar
 * `rooms_v2`—, pero para quien opera el panel es una ubicación más, al mismo
 * nivel que Palermo. Separarlos en dos listas mostraba una decisión de
 * modelado que a nadie le sirve.
 *
 * ROOM sigue sin listarse: son 58 salas y esta pantalla no está pensada para
 * esa lista. Se filtra en la vista, no en la capa de datos.
 */
const TITULO_LISTA = "Sucursales";

/**
 * "GRANT" + "VENUE" + id → identifica una fila sin ambigüedad.
 *
 * El kind entra en la clave porque una sucursal y un punto podrían tener el
 * mismo id: sin él, habilitar un QR podría bloquear los botones del otro.
 */
function filaKey(fila: Pick<PromotionQrTarget, "action" | "targetKind" | "targetId">): string {
  return `${fila.action}:${fila.targetKind}:${fila.targetId}`;
}

/** Cómo se lee la acción dentro de una frase. */
function nombreAccion(action: PromotionQrTargetAction): string {
  return action === "GRANT" ? "Activación" : "Utilización";
}

type Pendiente = { kind: "rotate" | "disable"; fila: PromotionQrTarget };

/**
 * QR de una promoción, por destino.
 *
 * Un destino puede ser una SUCURSAL entera (Palermo) o un PUNTO ESPECÍFICO
 * dentro de una (Hell Experiment, que está en Studios). Cada combinación
 * promoción + destino + acción tiene su propio token, así que regenerar el QR
 * de Activación de Hell Experiment no toca el de Utilización de Hell
 * Experiment, ni ninguno de los de Studios.
 *
 * El backend es la única fuente de verdad: después de habilitar, regenerar o
 * deshabilitar se vuelve a pedir la matriz entera en vez de parchear el array.
 * Habilitar puede devolver un token que ya existía (`already_enabled`), y
 * deshabilitar BORRA la fila — parchear a mano se desincroniza enseguida.
 *
 * Nada se habilita solo: montar el componente solo LEE. Un QR nace únicamente
 * cuando alguien aprieta "Habilitar QR".
 *
 * Este componente es administrativo: lo monta solo quien puede administrar
 * promociones. Un GM nunca llega acá, así que nunca dispara estas RPC.
 */
export default function PromotionQrTargetPanel({ promotionId, promotionName, toast }: Props) {
  const [filas, setFilas] = useState<PromotionQrTarget[]>([]);
  /** Solo la primera carga muestra el placeholder; los refetch no parpadean. */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Fila con una RPC en vuelo: bloquea sus botones, no los del resto. */
  const [busy, setBusy] = useState<string | null>(null);
  const [viendo, setViendo] = useState<PromotionQrTarget | null>(null);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);

  const load = useCallback(async () => {
    try {
      setFilas(await fetchPromotionQrTargets(promotionId));
      setError(null);
    } catch (err) {
      setFilas([]);
      setError(promotionErrorMessage(err, "No pude cargar los QR de la promoción."));
    } finally {
      setLoading(false);
    }
  }, [promotionId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Acción → filas, sucursales y puntos MEZCLADOS y ordenados por nombre.
   *
   * El orden es alfabético sobre el nombre visible, no por tipo: Hell
   * Experiment cae entre Caballito y La Plata como cualquier otra ubicación.
   * Se ordena acá y no se confía en el orden del backend, que agrupa por tipo.
   *
   * Las salas se descartan en este punto: es el único lugar donde ROOM
   * desaparece.
   */
  const porAccion = useMemo(() => {
    const out: Record<PromotionQrTargetAction, PromotionQrTarget[]> = { GRANT: [], USE: [] };

    for (const fila of filas) {
      if (fila.targetKind === "ROOM") continue;
      out[fila.action].push(fila);
    }

    for (const lista of Object.values(out)) {
      // `localeCompare` en es-AR: "Ñuñez" y los acentos ordenan como espera
      // alguien que lee la lista, no como ordena el charset.
      lista.sort((a, b) => a.targetName.localeCompare(b.targetName, "es", { sensitivity: "base" }));
    }

    return out;
  }, [filas]);

  const habilitar = async (fila: PromotionQrTarget) => {
    const key = filaKey(fila);
    setBusy(key);

    try {
      const { alreadyEnabled } = await enablePromotionQrTarget(
        promotionId,
        fila.targetKind,
        fila.targetId,
        fila.action
      );
      // `already_enabled` significa que el token es el de antes, no uno nuevo:
      // decirlo evita que alguien crea que el QR impreso quedó invalidado.
      toast("success", alreadyEnabled
        ? `${fila.targetName} ya tenía su QR habilitado. Se conserva el mismo código.`
        : `QR habilitado para ${fila.targetName}.`);
      await load();
    } catch (err) {
      toast("error", promotionErrorMessage(err, "No pude habilitar el QR."));
    } finally {
      setBusy(null);
    }
  };

  const confirmar = async () => {
    if (!pendiente) return;

    const { kind, fila } = pendiente;
    const key = filaKey(fila);
    setBusy(key);

    try {
      if (kind === "rotate") {
        await rotatePromotionQrTargetToken(promotionId, fila.targetKind, fila.targetId, fila.action);
        toast("success", "QR regenerado correctamente.");
      } else {
        await disablePromotionQrTarget(promotionId, fila.targetKind, fila.targetId, fila.action);
        toast("success", "QR deshabilitado.");
      }

      setPendiente(null);
      // El QR que estaba abierto ya no es válido (rotado) o ya no existe
      // (deshabilitado): se cierra en vez de dejar a la vista un código viejo.
      if (viendo && filaKey(viendo) === key) setViendo(null);
      await load();
    } catch (err) {
      toast("error", promotionErrorMessage(err, kind === "rotate"
        ? "No pude regenerar el QR."
        : "No pude deshabilitar el QR."));
      setPendiente(null);
    } finally {
      setBusy(null);
    }
  };

  const renderFila = (fila: PromotionQrTarget) => {
    const key = filaKey(fila);
    const trabajando = busy === key;

    return (
      <div className={`eg-promo-branch${fila.enabled ? " is-enabled" : ""}`} key={key}>
        {/*
          Solo el nombre. Nada distingue una sucursal de un punto: ni la
          sucursal que lo contiene, ni el tipo de destino. Para quien opera el
          panel son todas ubicaciones equivalentes.
        */}
        <div className="eg-promo-branch__id">
          <strong>{fila.targetName}</strong>
          {/* Destino apagado con QR vivo: se avisa, pero el QR no se esconde. */}
          {!fila.targetActive && <Badge tone="warning" small>Inactiva</Badge>}
        </div>

        <span className="eg-promo-branch__state">
          <Badge tone={fila.enabled ? "success" : "neutral"} dot small>
            {fila.enabled ? "QR habilitado" : "QR no habilitado"}
          </Badge>
        </span>

        <div className="eg-promo-branch__actions">
          {fila.enabled ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                icon="qr"
                disabled={trabajando || !fila.token}
                onClick={() => setViendo(fila)}
              >
                Ver QR
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="refresh"
                disabled={trabajando}
                onClick={() => setPendiente({ kind: "rotate", fila })}
              >
                Regenerar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                disabled={trabajando}
                onClick={() => setPendiente({ kind: "disable", fila })}
              >
                Deshabilitar
              </Button>
            </>
          ) : (
            /*
              Un destino inactivo sin QR no debería llegar acá (el backend no
              lo devuelve), pero si llegara no se le ofrece habilitar: sería
              crear un QR para un lugar que no está operando.
            */
            fila.targetActive && (
              <Button
                size="sm"
                variant="primary"
                icon="plus"
                loading={trabajando}
                onClick={() => void habilitar(fila)}
              >
                Habilitar QR
              </Button>
            )
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="eg-promo-branches">
      {error && (
        <div className="eg-promo-error" role="alert">
          <span>{error}</span>
          <Button size="sm" variant="secondary" icon="refresh" onClick={() => void load()}>Reintentar</Button>
        </div>
      )}

      {loading ? (
        <p className="eg-promo-branches__loading" role="status">Cargando QR de la promoción…</p>
      ) : (
        BLOQUES.map(({ action, titulo, ayuda }) => {
          const lista = porAccion[action];

          return (
            <section className="eg-promo-branches__block" key={action}>
              <header className="eg-promo-branches__head">
                <strong>{titulo}</strong>
                <p>{ayuda}</p>
              </header>

              {lista.length > 0 ? (
                <div className="eg-promo-branches__group">
                  <h4 className="eg-promo-branches__group-title">{TITULO_LISTA}</h4>
                  <div className="eg-promo-branch-list">{lista.map(renderFila)}</div>
                </div>
              ) : (
                <EmptyState
                  icon="qr"
                  title="No hay sucursales disponibles"
                  description="Cuando haya sucursales activas van a aparecer acá para habilitarles el QR."
                />
              )}
            </section>
          );
        })
      )}

      {viendo?.token && (
        <PromotionQrTargetModal
          key={filaKey(viendo)}
          promotionName={promotionName}
          target={viendo}
          token={viendo.token}
          onClose={() => setViendo(null)}
          onError={(msg) => toast("error", msg)}
          onCopied={() => toast("success", "Código copiado.")}
        />
      )}

      {pendiente && (
        <PromotionConfirmDialog
          title={pendiente.kind === "rotate" ? "¿Regenerar este QR?" : "¿Deshabilitar este QR?"}
          message={pendiente.kind === "rotate"
            ? `¿Regenerar el QR de ${nombreAccion(pendiente.fila.action)} de ${pendiente.fila.targetName}? El QR actual dejará de funcionar inmediatamente. Si ya está impreso, deberá reemplazarse.`
            : `¿Deshabilitar el QR de ${nombreAccion(pendiente.fila.action)} de ${pendiente.fila.targetName}? El QR actual dejará de funcionar.`}
          confirmLabel={pendiente.kind === "rotate" ? "Regenerar QR" : "Deshabilitar QR"}
          working={busy === filaKey(pendiente.fila)}
          onConfirm={() => void confirmar()}
          onCancel={() => setPendiente(null)}
        />
      )}
    </div>
  );
}

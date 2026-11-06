import { Button, Modal } from "../../ui";

type Props = {
  title: string;
  /** Qué pasa exactamente si confirma. Se escribe en concreto, no en general. */
  message: string;
  confirmLabel: string;
  /** Acciones destructivas en rojo; el resto en el primario de siempre. */
  tone?: "danger" | "primary";
  working?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirmación para las acciones que rompen un QR ya impreso: regenerar y
 * deshabilitar.
 *
 * Es un modal y no un `window.confirm` porque estas dos acciones invalidan
 * papel que puede estar pegado en la puerta de una sucursal: el aviso tiene
 * que leerse, distinguir el botón peligroso del seguro y poder mostrar el
 * estado "procesando" mientras la RPC responde. El diálogo del navegador no
 * hace nada de eso.
 *
 * Se apoya en el `Modal` del panel, así que hereda cierre con Escape, click
 * afuera y foco, sin agregar estética nueva.
 */
export default function PromotionConfirmDialog({
  title,
  message,
  confirmLabel,
  tone = "danger",
  working = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      open
      title={title}
      size="sm"
      panelClassName="eg-promo-confirm"
      // Mientras la RPC está en vuelo no se cierra: evita dejar la pantalla
      // mostrando un estado que ya no es el del servidor.
      onClose={working ? () => {} : onCancel}
      footer={
        <>
          <Button variant="secondary" disabled={working} onClick={onCancel}>Cancelar</Button>
          <Button variant={tone} loading={working} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="eg-promo-confirm__text">{message}</p>
    </Modal>
  );
}

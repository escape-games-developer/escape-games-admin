import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { timeArgentina, type RangeReservation } from "../../lib/reservations";
import { branchStyle, itemColor, validationLabel, validationState } from "./calendarData";

const WIDTH = 300;

type Props = {
  item: RangeReservation;
  /** Rectángulo de la reserva tocada: el detalle se ubica pegado a ella. */
  anchor: DOMRect;
};

/**
 * Detalle de una reserva al tocarla en el calendario. Se dibuja sobre toda la
 * página (portal), así no lo corta la celda. Abre hacia arriba si la reserva
 * está en la mitad de abajo de la pantalla, y hacia la izquierda si no entra a
 * la derecha.
 */
export default function ReservationPopover({ item, anchor }: Props) {
  const state = validationState(item);
  const up = anchor.top > window.innerHeight / 2;
  const right = anchor.left + WIDTH > window.innerWidth - 8;
  const position: CSSProperties = {
    width: WIDTH,
    ...(up ? { bottom: window.innerHeight - anchor.top + 4 } : { top: anchor.bottom + 4 }),
    ...(right ? { right: Math.max(8, window.innerWidth - anchor.right) } : { left: anchor.left }),
  };
  return createPortal(
    <div
      className="eg-calendar-event-popover"
      style={branchStyle(itemColor(item), position)}
      role="dialog"
      aria-label={`Reserva ${item.referencia}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="eg-calendar-event-popover__branch">
        <i aria-hidden="true" />
        {item.branch_name ?? "Sin sucursal"}
      </span>
      <strong>{item.sala ?? "Sin sala"}</strong>
      <span>{timeArgentina(item.visit_at)} · {item.participantes ? `${item.participantes} jugadores` : "Jugadores sin dato"}</span>
      <span>{item.nombre ?? "—"} · {item.referencia}</span>
      <span className={`eg-calendar-event-popover__state is-${state}`}>
        {validationLabel[state]}: {item.validados}{item.participantes ? ` de ${item.participantes}` : ""}
      </span>
    </div>,
    document.body,
  );
}

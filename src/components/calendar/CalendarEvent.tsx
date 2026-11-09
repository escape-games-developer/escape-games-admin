import { timeArgentina, type RangeReservation } from "../../lib/reservations";
import { branchStyle, itemColor, validationState } from "./calendarData";
import ReservationPopover from "./ReservationPopover";

type Props = {
  item: RangeReservation;
  /** Rectángulo de la línea si su detalle está abierto. */
  anchor: DOMRect | undefined;
  onToggle: (rect: DOMRect) => void;
};

/**
 * Reserva en la vista Mes: una sola línea con el color de su sucursal
 * ("14:45 El Payaso de las Alcantarillas"). Al tocarla muestra el detalle.
 */
export default function CalendarEvent({ item, anchor, onToggle }: Props) {
  const state = validationState(item);
  const time = timeArgentina(item.visit_at);
  const sala = item.sala ?? "Sin sala";
  return (
    <>
      <button
        type="button"
        className={`eg-calendar-line is-${state}`}
        style={branchStyle(itemColor(item))}
        onClick={(event) => { event.stopPropagation(); onToggle(event.currentTarget.getBoundingClientRect()); }}
        aria-expanded={Boolean(anchor)}
        title={`${time} · ${sala}${item.branch_name ? ` · ${item.branch_name}` : ""}`}
      >
        <time>{time}</time>
        <span>{sala}</span>
        {state !== "pending" && <b aria-label={state === "done" ? "Validada" : "Validada en parte"}>✓</b>}
      </button>
      {anchor && <ReservationPopover item={item} anchor={anchor} />}
    </>
  );
}

import { useState } from "react";
import { Badge } from "../../ui";
import type { BadgeTone } from "../../ui";
import { timeArgentina, type RangeReservation } from "../../lib/reservations";
import { branchStyle, dateKey, itemColor, validationState, type ValidationState } from "./calendarData";
import ReservationPopover from "./ReservationPopover";

const stateTone: Record<ValidationState, BadgeTone> = { pending: "neutral", partial: "warning", done: "success" };

type Props = {
  days: Date[];
  byDay: Map<string, RangeReservation[]>;
  today: string;
  showBranch: boolean;
  onOpenDay?: (key: string) => void;
  /** Vista Día: una sola columna y cada tarjeta muestra también quién reservó. */
  single?: boolean;
};

/**
 * Vistas Semana y Día: una columna por día con todas las reservas por horario.
 * La línea de la izquierda tiene el color de la sucursal. Los títulos de los
 * días quedan fijos arriba y debajo se scrollean todos los días juntos (la
 * página no scrollea). Al tocar una tarjeta se abre el detalle, igual que en
 * la vista Mes.
 */
export default function WeekView({ days, byDay, today, showBranch, onOpenDay, single = false }: Props) {
  const [open, setOpen] = useState<{ id: string; rect: DOMRect }>();
  const cols = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };
  return (
    <div className={`eg-calendar-week${single ? " is-single" : ""}`} onClick={() => setOpen(undefined)}>
      <div className="eg-calendar-week__scroll" onScroll={() => setOpen(undefined)}>
        <div className="eg-calendar-week__heads" style={cols}>
          {days.map((day) => {
            const key = dateKey(day);
            const label = (
              <>
                <strong>{new Intl.DateTimeFormat("es-AR", { weekday: single ? "long" : "short" }).format(day)}</strong>
                <span className={key === today ? "is-today" : ""}>{day.getDate()}</span>
              </>
            );
            return (
              <header key={key}>
                {onOpenDay ? (
                  <button type="button" className="eg-calendar-week__day" onClick={() => onOpenDay(key)} aria-label={`Ver el ${day.getDate()} en la vista Día`}>
                    {label}
                  </button>
                ) : (
                  <span className="eg-calendar-week__day">{label}</span>
                )}
              </header>
            );
          })}
        </div>
        <div className="eg-calendar-week__cols" style={cols}>
          {days.map((day) => {
            const key = dateKey(day);
            const items = byDay.get(key) ?? [];
            return (
              <div key={key} className="eg-calendar-week__list">
                {items.map((item) => {
                  const state = validationState(item);
                  const isOpen = open?.id === item.reserva_id;
                  return (
                    <button
                      key={item.reserva_id}
                      type="button"
                      className="eg-calendar-week__card"
                      style={branchStyle(itemColor(item))}
                      aria-expanded={isOpen}
                      title={`${timeArgentina(item.visit_at)} · ${item.sala ?? "Sin sala"}${item.branch_name ? ` · ${item.branch_name}` : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(isOpen ? undefined : { id: item.reserva_id, rect: e.currentTarget.getBoundingClientRect() });
                      }}
                    >
                      <span className="eg-calendar-week__row">
                        <time>{timeArgentina(item.visit_at)}</time>
                        <Badge tone={stateTone[state]} small>
                          {item.participantes ? `${item.validados}/${item.participantes}` : item.validados}
                        </Badge>
                      </span>
                      <strong>{item.sala ?? "Sin sala"}</strong>
                      <span>
                        {item.participantes ? `${item.participantes} jugadores` : "Jugadores sin dato"}
                        {showBranch && item.branch_name ? ` · ${item.branch_name}` : ""}
                        {single ? ` · ${item.nombre ?? "—"} · ${item.referencia}` : ""}
                      </span>
                    </button>
                  );
                })}
                {!items.length && <p>Sin reservas</p>}
              </div>
            );
          })}
        </div>
      </div>
      {open && (() => {
        const item = days.flatMap((d) => byDay.get(dateKey(d)) ?? []).find((r) => r.reserva_id === open.id);
        return item ? <ReservationPopover item={item} anchor={open.rect} /> : null;
      })()}
    </div>
  );
}

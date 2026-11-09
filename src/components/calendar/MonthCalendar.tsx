import { useState } from "react";
import type { RangeReservation } from "../../lib/reservations";
import CalendarEvent from "./CalendarEvent";
import { dateKey, fitCount, plural, summarize } from "./calendarData";
import { useElementSize } from "./useMeasure";

const weekdays = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

// Medidas fijas de cada celda (tienen que coincidir con calendar.css).
const CELL_PAD = 4;
const HEAD_H = 24;
const LINE_H = 20;
const LINE_GAP = 2;

type Props = {
  date: Date;
  days: Date[];
  byDay: Map<string, RangeReservation[]>;
  today: string;
  onOpenDay: (key: string) => void;
};

/**
 * Vista Mes: cada reserva es una línea con el color de su sucursal. Cada día
 * muestra cuántas reservas y jugadores tiene y las líneas que entran según el
 * alto de la pantalla; el resto queda en "+N más", que abre la vista Día.
 */
export default function MonthCalendar({ date, days, byDay, today, onOpenDay }: Props) {
  const [open, setOpen] = useState<{ id: string; rect: DOMRect }>();
  const [gridRef, grid] = useElementSize<HTMLDivElement>();
  const weeks = Math.max(1, days.length / 7);
  const rowHeight = grid.height / weeks;
  const capacity = fitCount(rowHeight - CELL_PAD * 2 - HEAD_H - 1, LINE_H, LINE_GAP);

  return (
    <div className="eg-month-calendar" onClick={() => setOpen(undefined)}>
      <div className="eg-month-calendar__weekdays">{weekdays.map((day) => <div key={day}>{day}</div>)}</div>
      <div ref={gridRef} className="eg-month-calendar__grid" style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}>
        {days.map((day) => {
          const key = dateKey(day);
          const items = byDay.get(key) ?? [];
          const totals = summarize(items);
          const overflow = items.length > capacity;
          const shown = overflow ? items.slice(0, Math.max(0, capacity - 1)) : items;
          return (
            <div key={key} className={`eg-calendar-day${day.getMonth() === date.getMonth() ? "" : " is-outside"}`}>
              <div className="eg-calendar-day__head">
                <button
                  type="button"
                  className={`eg-calendar-day__num${key === today ? " is-today" : ""}`}
                  onClick={(e) => { e.stopPropagation(); onOpenDay(key); }}
                  aria-label={`Ver el ${day.getDate()} en la vista Día`}
                >
                  {day.getDate()}
                </button>
                {items.length > 0 && (
                  <span className="eg-calendar-day__count" title={`${plural(totals.reservas, "reserva", "reservas")} · ${plural(totals.jugadores, "jugador", "jugadores")}`}>
                    {totals.reservas} · {totals.jugadores} jug.
                  </span>
                )}
              </div>
              <div className="eg-calendar-day__events">
                {shown.map((item) => (
                  <CalendarEvent
                    key={item.reserva_id}
                    item={item}
                    anchor={open?.id === item.reserva_id ? open.rect : undefined}
                    onToggle={(rect) => setOpen(open?.id === item.reserva_id ? undefined : { id: item.reserva_id, rect })}
                  />
                ))}
                {overflow && (
                  <button type="button" className="eg-calendar-day__more" onClick={(e) => { e.stopPropagation(); onOpenDay(key); }}>
                    +{items.length - shown.length} más
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

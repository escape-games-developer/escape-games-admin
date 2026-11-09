import { useEffect, useRef, useState } from "react";
import { Icon } from "../../ui";
import { addDays, dateKey, parseKey, startOfWeek } from "./calendarData";

const weekdays = ["L", "M", "M", "J", "V", "S", "D"];

type Props = {
  /** "week": se elige una semana entera (lunes a domingo). "day": un día. */
  mode: "week" | "day";
  value: Date;
  /** Hoy (día de trabajo), YYYY-MM-DD. */
  today: string;
  /** Texto del botón ("Semana del 9 de noviembre", "Lunes, 9 de noviembre de 2026"). */
  label: string;
  onChange: (date: Date) => void;
};

/**
 * Botón con la fecha elegida que abre un calendario chico para elegir otra.
 * En modo semana resalta la semana completa al pasar el mouse y al elegir.
 */
export default function DatePicker({ mode, value, today, label, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) setMonth(new Date(value.getFullYear(), value.getMonth(), 1));
    setOpen(!open);
  };
  const pick = (d: Date) => {
    onChange(d);
    setOpen(false);
  };

  const first = startOfWeek(month);
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
  const selectedKey = dateKey(value);
  const selectedWeek = dateKey(startOfWeek(value));
  const monthTitle = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(month);

  return (
    <div ref={ref} className="eg-datepicker">
      <button type="button" className="eg-datepicker__trigger" onClick={toggle} aria-haspopup="dialog" aria-expanded={open}>
        <Icon name="calendar" size={16} />
        <span>{label}</span>
        <Icon name="chevronRight" size={14} className="eg-datepicker__caret" />
      </button>

      {open && (
        <div className={`eg-datepicker__panel is-${mode}`} role="dialog" aria-label={mode === "week" ? "Elegir semana" : "Elegir día"}>
          <div className="eg-datepicker__head">
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mes anterior">
              <Icon name="chevronLeft" size={16} />
            </button>
            <strong>{monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1)}</strong>
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mes siguiente">
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
          <div className="eg-datepicker__weekdays">{weekdays.map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="eg-datepicker__grid">
            {weeks.map((week) => {
              const weekKey = dateKey(week[0]);
              return (
                <div key={weekKey} className={`eg-datepicker__week${mode === "week" && weekKey === selectedWeek ? " is-selected" : ""}`}>
                  {week.map((day) => {
                    const key = dateKey(day);
                    const cls = [
                      "eg-datepicker__day",
                      day.getMonth() !== month.getMonth() ? "is-outside" : "",
                      key === today ? "is-today" : "",
                      mode === "day" && key === selectedKey ? "is-selected" : "",
                    ].filter(Boolean).join(" ");
                    return (
                      <button
                        key={key}
                        type="button"
                        className={cls}
                        onClick={() => pick(day)}
                        aria-label={new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(day)}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="eg-datepicker__foot">
            <button type="button" onClick={() => pick(parseKey(today))}>Hoy</button>
          </div>
        </div>
      )}
    </div>
  );
}

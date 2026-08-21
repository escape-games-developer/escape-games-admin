import { useEffect, useRef } from "react";
import { itemMeta, type CalendarItemType } from "./calendarData";
type Props = { date?: Date; onClose: () => void };
export default function NewCalendarItemMenu({ date, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, [onClose]);
  const types: CalendarItemType[] = ["birthday", "social", "event"];
  return <div ref={ref} className="eg-calendar-new-menu" role="menu" aria-label="Crear elemento">{date && <p className="eg-calendar-new-menu__date">{new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long" }).format(date)}</p>}{types.map((type) => <button key={type} type="button" role="menuitem" onClick={onClose}><span aria-hidden="true">{itemMeta[type].emoji}</span>{itemMeta[type].label}</button>)}</div>;
}

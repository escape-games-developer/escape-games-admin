import { useState } from "react";
import { Icon } from "../../ui";
import CalendarEvent from "./CalendarEvent";
import NewCalendarItemMenu from "./NewCalendarItemMenu";
import { calendarItems, dateKey } from "./calendarData";
const weekdays = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
export default function MonthCalendar({ date }: { date: Date }) {
  const [newOnDate, setNewOnDate] = useState<string>(); const [openEvent, setOpenEvent] = useState<number>();
  const first = new Date(date.getFullYear(), date.getMonth(), 1); const start = new Date(date.getFullYear(), date.getMonth(), 1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)); const today = new Date();
  return <div className="eg-month-calendar"><div className="eg-month-calendar__weekdays">{weekdays.map((day) => <div key={day}>{day}</div>)}</div><div className="eg-month-calendar__grid">{days.map((day) => {
    const key = dateKey(day); const items = calendarItems.filter((item) => item.date === key);
    return <div key={key} className={`eg-calendar-day${day.getMonth() === date.getMonth() ? "" : " is-outside"}`} onClick={() => setOpenEvent(undefined)}><div className="eg-calendar-day__head"><span className={key === dateKey(today) ? "is-today" : ""}>{day.getDate()}</span><button className="eg-calendar-day__add" type="button" aria-label={`Crear elemento el ${day.getDate()}`} onClick={(event) => { event.stopPropagation(); setNewOnDate(key); }}><Icon name="plus" size={14} /></button>{newOnDate === key && <NewCalendarItemMenu date={day} onClose={() => setNewOnDate(undefined)} />}</div><div className="eg-calendar-day__events">{items.slice(0, 3).map((item) => <CalendarEvent key={item.id} item={item} open={openEvent === item.id} onToggle={() => setOpenEvent(openEvent === item.id ? undefined : item.id)} />)}{items.length > 3 && <button type="button" className="eg-calendar-day__more">+{items.length - 3} más</button>}</div></div>;
  })}</div></div>;
}

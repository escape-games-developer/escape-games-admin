import { useState } from "react";
import { Button, Card, Icon, PageHeader } from "../../ui";
import MonthCalendar from "./MonthCalendar";
import NewCalendarItemMenu from "./NewCalendarItemMenu";
import { calendarItems, dateKey } from "./calendarData";
type ViewMode = "month" | "week" | "day";
const viewLabels: Record<ViewMode, string> = { month: "Mes", week: "Semana", day: "Día" };
function startOfWeek(date: Date) { const result = new Date(date); result.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return result; }
export default function CalendarView() {
  const [date, setDate] = useState(new Date()); const [view, setView] = useState<ViewMode>("month"); const [newMenu, setNewMenu] = useState(false);
  const move = (direction: number) => setDate((current) => { if (view === "month") return new Date(current.getFullYear(), current.getMonth() + direction, 1); const next = new Date(current); next.setDate(current.getDate() + direction * (view === "week" ? 7 : 1)); return next; });
  const title = view === "month" ? new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(date) : view === "week" ? `Semana del ${new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long" }).format(startOfWeek(date))}` : new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  return <section className="eg-calendar-page"><PageHeader title="Calendario" subtitle="Gestioná cumpleaños, eventos y juegos sociales." action={<div className="eg-calendar-new"><Button variant="primary" icon="plus" onClick={() => setNewMenu(!newMenu)}>Nuevo</Button>{newMenu && <NewCalendarItemMenu onClose={() => setNewMenu(false)} />}</div>} /><Card padding="none" className="eg-calendar-card"><div className="eg-calendar-toolbar"><div className="eg-calendar-toolbar__nav"><Button onClick={() => setDate(new Date())}>Hoy</Button><div className="eg-calendar-toolbar__arrows"><Button title="Anterior" onClick={() => move(-1)}><Icon name="chevronLeft" size={18} /></Button><Button title="Siguiente" onClick={() => move(1)}><Icon name="chevronRight" size={18} /></Button></div><h2>{title.charAt(0).toUpperCase() + title.slice(1)}</h2></div><div className="eg-calendar-segmented" aria-label="Vista del calendario">{(Object.keys(viewLabels) as ViewMode[]).map((mode) => <button key={mode} type="button" className={view === mode ? "is-active" : ""} onClick={() => setView(mode)}>{viewLabels[mode]}</button>)}</div></div>{view === "month" ? <MonthCalendar date={date} /> : <SimpleCalendarView date={date} view={view} />}</Card></section>;
}
function SimpleCalendarView({ date, view }: { date: Date; view: "week" | "day" }) {
  const first = view === "week" ? startOfWeek(date) : date; const days = Array.from({ length: view === "week" ? 7 : 1 }, (_, index) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + index));
  return <div className={`eg-calendar-agenda is-${view}`}>{days.map((day) => { const items = calendarItems.filter((item) => item.date === dateKey(day)); return <section key={dateKey(day)}><header><strong>{new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(day)}</strong><span>{day.getDate()}</span></header><div>{items.length ? items.map((item) => <article key={item.id} className={`is-${item.type}`}><time>{item.time}</time><strong>{item.title}</strong><span>{item.location}</span></article>) : <p>Sin actividades</p>}</div></section>; })}</div>;
}

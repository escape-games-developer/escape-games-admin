import { Button } from "../../ui";
import { itemMeta, type CalendarItem } from "./calendarData";
type Props = { item: CalendarItem; open: boolean; onToggle: () => void };
export default function CalendarEvent({ item, open, onToggle }: Props) {
  const meta = itemMeta[item.type];
  return <div className="eg-calendar-event-wrap"><button type="button" className={`eg-calendar-event is-${item.type}`} onClick={(event) => { event.stopPropagation(); onToggle(); }} aria-expanded={open}><span className="eg-calendar-event__top"><span aria-hidden="true">{meta.emoji}</span><strong>{item.time}</strong></span><span className="eg-calendar-event__title">{item.title}</span><span className="eg-calendar-event__place">{item.location}</span></button>{open && <div className="eg-calendar-event-popover" role="dialog" aria-label={`Detalle de ${item.title}`} onClick={(event) => event.stopPropagation()}><span className="eg-calendar-event-popover__tag">{meta.emoji} {meta.label}</span><strong>{item.person ?? item.title}</strong><span>{item.time} · {item.location}</span>{item.guests && <span>{item.guests} invitados</span>}<div className="eg-calendar-event-popover__actions"><Button size="sm" variant="secondary" icon="eye">Ver detalle</Button><Button size="sm" variant="ghost" icon="edit">Editar</Button></div></div>}</div>;
}

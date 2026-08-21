export type CalendarItemType = "birthday" | "social" | "event";
export type CalendarItem = { id: number; date: string; time: string; title: string; location: string; type: CalendarItemType; person?: string; guests?: number };
export const calendarItems: CalendarItem[] = [
  { id: 1, date: "2026-08-04", time: "15:00", title: "Cumpleaños Martina", person: "Martina Fernández", location: "Palermo", guests: 14, type: "birthday" },
  { id: 2, date: "2026-08-06", time: "18:30", title: "Juego Social", location: "Belgrano", type: "social" },
  { id: 3, date: "2026-08-08", time: "16:00", title: "Evento Corporativo", location: "Palermo", type: "event" },
  { id: 4, date: "2026-08-11", time: "17:00", title: "Juego Social", location: "Abasto", type: "social" },
  { id: 5, date: "2026-08-11", time: "19:30", title: "Cumpleaños Lucas", person: "Lucas Gómez", location: "Belgrano", guests: 12, type: "birthday" },
  { id: 6, date: "2026-08-18", time: "15:00", title: "Cumpleaños Sofía", person: "Sofía Méndez", location: "Palermo", guests: 18, type: "birthday" },
  { id: 7, date: "2026-08-20", time: "18:00", title: "Juego Social", location: "Palermo", type: "social" },
  { id: 8, date: "2026-08-25", time: "19:00", title: "Evento Privado", location: "Abasto", type: "event" },
];
export const itemMeta: Record<CalendarItemType, { label: string; emoji: string }> = { birthday: { label: "Cumpleaños", emoji: "🎂" }, social: { label: "Juego social", emoji: "🎮" }, event: { label: "Evento", emoji: "🎉" } };
export function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

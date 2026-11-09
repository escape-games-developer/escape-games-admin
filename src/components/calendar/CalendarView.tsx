import { useEffect, useMemo, useState } from "react";
import { Button, Select } from "../../ui";
import {
  fetchActiveBranches,
  fetchRangeReservations,
  todayArgentina,
  type BranchOption,
  type RangeReservation,
} from "../../lib/reservations";
import DatePicker from "./DatePicker";
import MonthCalendar from "./MonthCalendar";
import WeekView from "./WeekView";
import {
  branchColor,
  branchStyle,
  dateKey,
  groupByDay,
  itemColor,
  parseKey,
  plural,
  summarize,
  visibleDays,
  type ViewMode,
} from "./calendarData";
import { useFillViewport } from "./useMeasure";

/**
 * Calendario de reservas web pagadas, en vista Mes, Semana o Día. Cada
 * sucursal tiene su color. Ocupa todo el alto de la ventana sin que la página
 * scrollee, y se ven todas las reservas: un día con muchas achica sus líneas
 * y, si aun así no entran, scrollea por dentro de su celda.
 *
 * Datos: admin_reservations_range (migración 20261109220000). Un GM ve solo
 * su sucursal; eso lo hace cumplir la base. El super admin puede elegir una o
 * ver todas. Las reservas llegan desde la hoja VENTAS ONLINE cada 15 minutos.
 */

const viewLabels: Record<ViewMode, string> = { month: "Mes", week: "Semana", day: "Día" };

const monthValue = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => {
  const s = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Meses del selector: desde 12 meses atrás hasta 12 adelante de hoy (y el que se está mirando, si queda afuera). */
function monthOptions(today: string, current: Date) {
  const base = parseKey(today);
  const list: { value: string; label: string }[] = [];
  for (let i = -12; i <= 12; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    list.push({ value: monthValue(d), label: monthLabel(d) });
  }
  const cur = monthValue(current);
  if (!list.some((m) => m.value === cur)) {
    list.push({ value: cur, label: monthLabel(current) });
    list.sort((a, b) => a.value.localeCompare(b.value));
  }
  return list;
}

type Props = {
  /**
   * Solo la vista Día, sin selector de vista: la app instalada del GM
   * (GmAppShell) muestra únicamente las reservas día por día.
   */
  dayOnly?: boolean;
  /** Título del centro de la barra. */
  heading?: string;
};

export default function CalendarView({ dayOnly = false, heading = "Calendario" }: Props) {
  const isSuper = localStorage.getItem("eg_admin_is_super") === "true";
  const today = todayArgentina();
  const frameRef = useFillViewport<HTMLDivElement>();

  const [date, setDate] = useState(() => parseKey(today));
  const [chosenView, setView] = useState<ViewMode>("month");
  const view: ViewMode = dayOnly ? "day" : chosenView;
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchId, setBranchId] = useState("");
  const [reload, setReload] = useState(0);
  // Resultado del último pedido que respondió. "Cargando" = todavía no respondió
  // el pedido del rango que se está mirando (así el efecto no toca el estado de
  // forma síncrona).
  const [result, setResult] = useState<{ key: string; items: RangeReservation[]; error: string }>({ key: "", items: [], error: "" });

  const days = useMemo(() => visibleDays(date, view), [date, view]);
  const from = dateKey(days[0]);
  const to = dateKey(days[days.length - 1]);
  const requestKey = `${from}|${to}|${branchId}|${reload}`;
  const loading = result.key !== requestKey;
  const items = result.items;
  const error = loading ? "" : result.error;

  useEffect(() => {
    fetchActiveBranches().then(setBranches).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchRangeReservations(from, to, isSuper ? branchId || null : null)
      .then((rows) => { if (!cancelled) setResult({ key: requestKey, items: rows, error: "" }); })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, items: [], error: err instanceof Error ? err.message : "No se pudieron cargar las reservas." });
      });
    return () => { cancelled = true; };
  }, [from, to, branchId, isSuper, requestKey]);

  const byDay = useMemo(() => groupByDay(items), [items]);
  const showBranch = isSuper && !branchId;

  // Resumen del período: en la vista Mes, solo los días del mes (no los de relleno).
  const totals = useMemo(() => {
    const monthPrefix = dateKey(date).slice(0, 7);
    return summarize(view === "month" ? items.filter((r) => r.dia.startsWith(monthPrefix)) : items);
  }, [items, view, date]);

  // Referencias: las sucursales que aparecen en lo que se está viendo.
  const legend = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of items) map.set(r.branch_name ?? "Sin sucursal", itemColor(r));
    if (!map.size && isSuper && branchId) {
      const b = branches.find((x) => x.id === branchId);
      if (b) map.set(b.name, branchColor(b.name));
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [items, isSuper, branchId, branches]);

  const openDay = (key: string) => {
    setDate(parseKey(key));
    setView("day");
  };

  const rawTitle =
    view === "month"
      ? new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(date)
      : view === "week"
        ? `Semana del ${new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long" }).format(days[0])}`
        : new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);

  return (
    <section className="eg-calendar-page">
        <div ref={frameRef} className="eg-calendar-frame">
          <div className="eg-calendar-toolbar">
            {view === "month" ? (
              <div className="eg-calendar-toolbar__nav">
                <Select
                  className="eg-calendar-month-select"
                  value={monthValue(date)}
                  onChange={(e) => setDate(parseKey(`${e.target.value}-01`))}
                  aria-label="Mes"
                >
                  {monthOptions(today, date).map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
              </div>
            ) : (
              <div className="eg-calendar-toolbar__nav">
                <DatePicker mode={view} value={date} today={today} label={title} onChange={setDate} />
              </div>
            )}
            <h1 className="eg-calendar-toolbar__title">{heading}</h1>
            <div className="eg-calendar-toolbar__side">
              {isSuper && !dayOnly && (
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} aria-label="Sucursal">
                  <option value="">Todas las sucursales</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              )}
              {!dayOnly && (
                <div className="eg-calendar-segmented" aria-label="Vista del calendario">
                  {(Object.keys(viewLabels) as ViewMode[]).map((mode) => (
                    <button key={mode} type="button" className={view === mode ? "is-active" : ""} onClick={() => setView(mode)}>
                      {viewLabels[mode]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="eg-calendar-summary" aria-live="polite">
            {loading ? (
              <span>Cargando reservas…</span>
            ) : error ? (
              <span className="eg-calendar-summary__error">
                {error}{" "}
                <Button size="sm" variant="ghost" icon="refresh" onClick={() => setReload((n) => n + 1)}>Reintentar</Button>
              </span>
            ) : view !== "month" ? (
              <span>
                <strong>{plural(totals.reservas, "reserva", "reservas")}</strong> · {plural(totals.jugadores, "jugador", "jugadores")} · {plural(totals.validados, "sala validada", "salas validadas")}
              </span>
            ) : (
              <span />
            )}
            {legend.length > 0 && (
              <span className="eg-calendar-legend" aria-label="Colores por sucursal">
                {legend.map(([name, color]) => (
                  <span key={name} style={branchStyle(color)}><i aria-hidden="true" />{name}</span>
                ))}
              </span>
            )}
          </div>

          <div className={loading ? "eg-calendar-body is-loading" : "eg-calendar-body"}>
            {view === "month" && <MonthCalendar date={date} days={days} byDay={byDay} today={today} onOpenDay={openDay} />}
            {view === "week" && <WeekView days={days} byDay={byDay} today={today} showBranch={showBranch} onOpenDay={openDay} />}
            {view === "day" && <WeekView days={days} byDay={byDay} today={today} showBranch={showBranch} single />}
          </div>
        </div>
    </section>
  );
}

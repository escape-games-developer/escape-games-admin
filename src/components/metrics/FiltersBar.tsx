import { useRef } from "react";

import { Button, Card, Input } from "../../ui";
import type {
  MetricsChannel,
  MetricsFilterOptions,
  MetricsQuery,
} from "../../services/metrics/types";

type Props = {
  value: MetricsQuery;
  options?: MetricsFilterOptions;
  /** Se dispara al Aplicar, no en cada tecla: cada cambio es un request. */
  onApply: (next: MetricsQuery) => void;
  onChange: (next: MetricsQuery) => void;
  loading?: boolean;
  /** Período que ORIGEN informó haber usado. Puede no ser el pedido. */
  periodoAplicado?: string;
};

/** Nombres legibles de los canales. Las claves son las que entiende ORIGEN. */
const NOMBRE_CANAL: Record<MetricsChannel, string> = {
  meta_ads: "Meta Ads",
  web: "Web",
  organico: "Orgánico",
  espontaneas: "Espontáneas",
  sin_atribuir: "Sin atribuir",
};

/**
 * Filtros de Métricas.
 *
 * Los cuatro son funcionales y TODOS se resuelven del lado de ORIGEN:
 * Aplicar manda un único request con lo que haya puesto. Nada se
 * recorta en el navegador — si el panel filtrara por su cuenta,
 * `summary` (que se calcula en la planilla) dejaría de cerrar con las
 * tablas, y no habría forma de saber cuál de los dos miente.
 *
 * Las opciones vienen del endpoint y se arman con el universo del
 * PERÍODO, no con lo que quedó después de filtrar: elegir una sucursal
 * no borra las demás de la lista, así se puede cambiar de opción sin
 * resetear todo.
 */
export default function FiltersBar({
  value,
  options,
  onApply,
  onChange,
  loading,
  periodoAplicado,
}: Props) {
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  /** Mismo gesto que Novedades: enfocar un `type="date"` abre el calendario. */
  const openDatePicker = (element: HTMLInputElement | null) => {
    try {
      element?.showPicker?.();
    } catch {
      /* Navegador sin showPicker: queda el comportamiento nativo de siempre. */
    }
  };

  const set = (key: keyof MetricsQuery, next: string) => {
    // Cadena vacía = "todas". Se borra la clave en vez de mandarla
    // vacía: la ausencia del parámetro es lo que ORIGEN lee como
    // "sin filtro".
    const siguiente: MetricsQuery = { ...value };
    if (next) (siguiente[key] as string) = next;
    else delete siguiente[key];
    onChange(siguiente);
  };

  const hayFiltros = Boolean(value.branch || value.channel || value.campaign);

  /** Limpia los tres filtros y conserva el rango de fechas. */
  const limpiar = () => {
    const soloFechas: MetricsQuery = { from: value.from, to: value.to };
    onChange(soloFechas);
    onApply(soloFechas);
  };

  return (
    <Card padding="sm" className="eg-metrics-filters">
      <div className="eg-field">
        <span className="eg-field__label">Rango de fechas</span>
        <div className="eg-metrics-filters__range">
          <Input
            ref={fromRef}
            type="date"
            value={value.from ?? ""}
            max={value.to}
            onChange={(event) => set("from", event.target.value)}
            onFocus={() => openDatePicker(fromRef.current)}
            aria-label="Fecha desde"
          />
          <span className="eg-metrics-filters__dash" aria-hidden="true">–</span>
          <Input
            ref={toRef}
            type="date"
            value={value.to ?? ""}
            min={value.from}
            onChange={(event) => set("to", event.target.value)}
            onFocus={() => openDatePicker(toRef.current)}
            aria-label="Fecha hasta"
          />
        </div>
      </div>

      <label className="eg-field" htmlFor="metrics-branch">
        <span className="eg-field__label">Sucursal</span>
        <select
          id="metrics-branch"
          className="eg-select"
          value={value.branch ?? ""}
          disabled={!options}
          onChange={(event) => set("branch", event.target.value)}
        >
          <option value="">Todas las sucursales</option>
          {options?.branches.map((marca) => (
            <option key={marca} value={marca}>{marca}</option>
          ))}
        </select>
      </label>

      <label className="eg-field" htmlFor="metrics-channel">
        <span className="eg-field__label">Canal</span>
        <select
          id="metrics-channel"
          className="eg-select"
          value={value.channel ?? ""}
          disabled={!options}
          onChange={(event) => set("channel", event.target.value)}
        >
          <option value="">Todos los canales</option>
          {options?.channels.map((canal) => (
            <option key={canal} value={canal}>{NOMBRE_CANAL[canal] ?? canal}</option>
          ))}
        </select>
      </label>

      <label className="eg-field" htmlFor="metrics-campaign">
        <span className="eg-field__label">Campaña</span>
        <select
          id="metrics-campaign"
          className="eg-select"
          value={value.campaign ?? ""}
          disabled={!options}
          onChange={(event) => set("campaign", event.target.value)}
        >
          <option value="">Todas las campañas</option>
          {options?.campaigns.map((campana) => (
            <option key={campana} value={campana}>{campana}</option>
          ))}
        </select>
      </label>

      <div className="eg-metrics-filters__actions">
        <Button variant="primary" onClick={() => onApply(value)} loading={loading}>
          Aplicar
        </Button>
        <Button variant="ghost" onClick={limpiar} disabled={loading || !hayFiltros}>
          Limpiar filtros
        </Button>
      </div>

      <p className="eg-metrics-filters__note">
        {periodoAplicado
          ? `Datos de ORIGEN — período aplicado: ${periodoAplicado}.`
          : "Datos de ORIGEN."}{" "}
        Los filtros se resuelven en la planilla, no en el panel, así los totales y las tablas
        siempre cierran entre sí.
      </p>
    </Card>
  );
}

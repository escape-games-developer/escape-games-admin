type Row = {
  key: string;
  label: string;
  value: string;
  color?: string;
};

type Props = {
  title: string;
  rows: Row[];
};

/**
 * Tooltip de los gráficos de Métricas.
 *
 * Recharts trae uno propio con estilos inline (fondo blanco, borde gris) que
 * en un panel oscuro canta de lejos. Este usa las mismas superficies, bordes y
 * tipografías que el resto del panel, y además deja formatear los valores con
 * los helpers de `metricsFormat` en lugar del `toLocaleString` por defecto.
 */
export default function ChartTooltip({ title, rows }: Props) {
  return (
    <div className="eg-metrics-tooltip">
      <div className="eg-metrics-tooltip__title">{title}</div>
      {rows.map((row) => (
        <div className="eg-metrics-tooltip__row" key={row.key}>
          {row.color && (
            <span className="eg-metrics-legend__dot" style={{ background: row.color }} aria-hidden="true" />
          )}
          <span>{row.label}</span>
          <b className="eg-metrics-num">{row.value}</b>
        </div>
      ))}
    </div>
  );
}

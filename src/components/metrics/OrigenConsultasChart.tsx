import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Card } from "../../ui";
import ChartTooltip from "./ChartTooltip";
import { channelColor, getChartTheme } from "./chartTheme";
import { formatNumber, formatPercent, orDash } from "./metricsFormat";
import { listaDeOrigenes } from "./sourcesList";
import type { MetricsSources } from "../../services/metrics/types";

type Props = {
  sources: MetricsSources;
  total: number;
  loading?: boolean;
};

/**
 * Origen de las consultas, en donut.
 *
 * El porcentaje NO se calcula acá: viene en `share`, ya resuelto por
 * ORIGEN sobre el total del período. Recalcularlo del lado del panel
 * solo abriría la puerta a que los dos números discrepen por un
 * redondeo y nadie sepa cuál creer.
 *
 * Las repetidas no entran: no suman al total —son la misma persona
 * contada dos veces— y meterlas rompería el 100%.
 */
export default function OrigenConsultasChart({ sources, total, loading }: Props) {
  const theme = getChartTheme();

  const slices = useMemo(
    () => listaDeOrigenes(sources)
      .map((s) => ({ ...s, color: channelColor(theme, s.key) }))
      .filter((s) => s.consultas > 0),
    [sources, theme]
  );

  return (
    <Card className="eg-metrics-card">
      <div className="eg-metrics-card__head">
        <h2 className="eg-metrics-card__title">Origen de consultas</h2>
        <p className="eg-metrics-card__sub">Reparto del total del período</p>
      </div>

      <div className="eg-metrics-chart eg-metrics-chart--sm eg-metrics-donut">
        {loading ? (
          <div className="eg-metrics-skeleton" aria-hidden="true" />
        ) : slices.length === 0 ? (
          <p className="eg-metrics-vacio">No hay consultas en este período.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="consultas"
                  nameKey="label"
                  innerRadius="62%"
                  outerRadius="88%"
                  paddingAngle={2}
                  stroke="none"
                  /* Sin animación: el panel no anima nada más y acá
                     llamaría la atención sobre el gráfico sin necesidad. */
                  isAnimationActive={false}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.key} fill={slice.color} />
                  ))}
                </Pie>

                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const slice = payload[0]?.payload as (typeof slices)[number] | undefined;
                    if (!slice) return null;
                    return (
                      <ChartTooltip
                        title={slice.label}
                        rows={[
                          { key: "consultas", label: "Consultas", value: formatNumber(slice.consultas), color: slice.color },
                          { key: "share", label: "Del total", value: orDash(slice.share, (n) => formatPercent(n)) },
                        ]}
                      />
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* El total va en el hueco del donut: es el número que da
                contexto a todos los porcentajes. */}
            <div className="eg-metrics-donut__center">
              <span className="eg-metrics-donut__total eg-metrics-num">{formatNumber(total)}</span>
              <span className="eg-metrics-donut__label">Consultas</span>
            </div>
          </>
        )}
      </div>

      <div className="eg-metrics-legend">
        {slices.map((slice) => (
          <span className="eg-metrics-legend__item" key={slice.key} title={slice.definicion}>
            <span className="eg-metrics-legend__dot" style={{ background: slice.color }} aria-hidden="true" />
            {slice.label}
            <span className="eg-metrics-legend__value eg-metrics-num">
              {formatNumber(slice.consultas)}
            </span>
            <span className="eg-metrics-legend__share">
              {orDash(slice.share, (n) => formatPercent(n, 0))}
            </span>
          </span>
        ))}
      </div>
    </Card>
  );
}

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "../../ui";
import ChartTooltip from "./ChartTooltip";
import { AXIS_TICK, getChartTheme } from "./chartTheme";
import {
  formatCurrency,
  formatDayLabel,
  formatFullDate,
  formatNumber,
  orDash,
  SIN_DATO,
} from "./metricsFormat";
import type { MetricsDay } from "../../services/metrics/types";

type Props = {
  data: MetricsDay[];
  loading?: boolean;
};

/**
 * Serie principal: consultas y ventas online por día.
 *
 * Dos ejes Y, no uno. Con cientos de consultas contra decenas de
 * ventas en una sola escala, la línea de ventas queda pegada al piso —
 * y es justo la que más importa mirar. El eje de ventas va a la
 * derecha, con el color de su serie, para que se entienda cuál es cuál.
 *
 * Ojo al leerlo: las consultas se cuentan por el día en que entraron y
 * las ventas por la fecha del pedido. Son dos relojes distintos, así
 * que un pico de ventas no tiene por qué caer el mismo día que el pico
 * de consultas que lo generó.
 */
export default function ConsultasVentasChart({ data, loading }: Props) {
  const theme = getChartTheme();

  /* Con el filtro por canal puesto, ORIGEN devuelve `ventas_online` en
     null para todos los días: la hoja VENTAS ONLINE no sabe por qué
     canal consultó el comprador. Es todo o nada, así que alcanza con
     mirar si algún día la trae. Cuando no está, la serie NO se dibuja
     en cero — se saca del gráfico y se dice por qué. */
  const ventasDisponibles = useMemo(
    () => data.length > 0 && data.every((d) => d.ventas_online !== null),
    [data]
  );

  const totals = useMemo(
    () => data.reduce(
      (acc, d) => ({
        consultas: acc.consultas + d.consultas,
        ventas: acc.ventas + (d.ventas_online ?? 0),
      }),
      { consultas: 0, ventas: 0 }
    ),
    [data]
  );

  return (
    <Card className="eg-metrics-card">
      <div className="eg-metrics-card__head">
        <h2 className="eg-metrics-card__title">Consultas y ventas por día</h2>
        <p className="eg-metrics-card__sub">
          Consultas por fecha de ingreso · ventas online por fecha del pedido
        </p>
      </div>

      <div className="eg-metrics-legend">
        <span className="eg-metrics-legend__item">
          <span className="eg-metrics-legend__dot" style={{ background: theme.consultas }} aria-hidden="true" />
          Consultas
          <span className="eg-metrics-legend__value eg-metrics-num">{formatNumber(totals.consultas)}</span>
        </span>
        <span className="eg-metrics-legend__item">
          <span className="eg-metrics-legend__dot" style={{ background: theme.ventas }} aria-hidden="true" />
          Ventas online
          <span className="eg-metrics-legend__value eg-metrics-num">
            {ventasDisponibles ? formatNumber(totals.ventas) : SIN_DATO}
          </span>
        </span>
      </div>

      <div className="eg-metrics-chart">
        {loading ? (
          <div className="eg-metrics-skeleton" aria-hidden="true" />
        ) : data.length === 0 ? (
          <p className="eg-metrics-vacio">No hay días con movimiento en este período.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={theme.grid} vertical={false} />

              <XAxis
                dataKey="fecha"
                tickFormatter={formatDayLabel}
                stroke={theme.axis}
                tick={{ ...AXIS_TICK, fill: theme.axis }}
                tickLine={false}
                axisLine={{ stroke: theme.grid }}
                minTickGap={12}
              />

              <YAxis
                yAxisId="consultas"
                stroke={theme.axis}
                tick={{ ...AXIS_TICK, fill: theme.axis }}
                tickLine={false}
                axisLine={false}
                width={44}
              />

              {ventasDisponibles && (
                <YAxis
                  yAxisId="ventas"
                  orientation="right"
                  stroke={theme.ventas}
                  tick={{ ...AXIS_TICK, fill: theme.ventas }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
              )}

              <Tooltip
                cursor={{ stroke: theme.border, strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const dia = payload[0]?.payload as MetricsDay | undefined;
                  if (!dia) return null;
                  return (
                    <ChartTooltip
                      title={formatFullDate(String(label))}
                      rows={[
                        { key: "consultas", label: "Consultas", value: formatNumber(dia.consultas), color: theme.consultas },
                        { key: "anuncios", label: "De anuncios", value: formatNumber(dia.de_anuncios) },
                        { key: "ventas", label: "Ventas online", value: orDash(dia.ventas_online, formatNumber), color: theme.ventas },
                        { key: "facturado", label: "Facturado", value: orDash(dia.facturacion_online, formatCurrency) },
                      ]}
                    />
                  );
                }}
              />

              <Line
                yAxisId="consultas"
                type="monotone"
                dataKey="consultas"
                stroke={theme.consultas}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />

              {ventasDisponibles && (
                <Line
                  yAxisId="ventas"
                  type="monotone"
                  dataKey="ventas_online"
                  stroke={theme.ventas}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {!loading && data.length > 0 && !ventasDisponibles && (
        <p className="eg-metrics-card__sub">
          La serie de ventas no se dibuja: con el filtro por canal, la hoja VENTAS ONLINE no puede
          decir por dónde consultó el comprador.
        </p>
      )}
    </Card>
  );
}

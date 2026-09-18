import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "../../ui";
import ChartTooltip from "./ChartTooltip";
import { AXIS_TICK, channelColor, getChartTheme } from "./chartTheme";
import { formatCurrency, formatNumber } from "./metricsFormat";
import { listaDeOrigenes } from "./sourcesList";
import type { MetricsSources } from "../../services/metrics/types";

type Props = {
  sources: MetricsSources;
  loading?: boolean;
};

/**
 * Ventas online atribuidas por origen.
 *
 * ACÁ NO VA UNA TASA DE CONVERSIÓN, y la ausencia es deliberada.
 * ORIGEN no puede contar las ventas de cumpleaños todavía, así que
 * dividir las compras web por las consultas daría una conversión
 * parcial —solo entradas— presentada como si fuera la del negocio.
 * Con cumpleaños facturando cientos de miles y entradas unos pocos
 * miles, ese número invita a apagar campañas rentables.
 *
 * Lo que sí es un dato firme es el ABSOLUTO: cuánta gente consultó por
 * cada canal y después compró en la tienda. Es lo que se dibuja.
 *
 * Va al lado del donut a propósito: el donut dice de dónde viene el
 * VOLUMEN y este dice de dónde vienen las compras web.
 */
export default function VentasOrigenChart({ sources, loading }: Props) {
  const theme = getChartTheme();

  const data = useMemo(
    // El `?? 0` es un guard de TIPOS, no una coerción de datos: en el
    // JSON solo `sources.repetidas` trae nulls, y `listaDeOrigenes` no
    // la devuelve. Para estos cinco orígenes siempre viene número.
    () => listaDeOrigenes(sources).map((s) => ({
      ...s,
      ventas: s.ventasOnlineAtribuidas ?? 0,
      color: channelColor(theme, s.key),
    })),
    [sources, theme]
  );

  const hayVentas = data.some((d) => d.ventas > 0);

  return (
    <Card className="eg-metrics-card">
      <div className="eg-metrics-card__head">
        <h2 className="eg-metrics-card__title">Ventas online por origen</h2>
        <p className="eg-metrics-card__sub">Consultaron por ese canal y después compraron en la web</p>
      </div>

      <div className="eg-metrics-chart eg-metrics-chart--sm">
        {loading ? (
          <div className="eg-metrics-skeleton" aria-hidden="true" />
        ) : !hayVentas ? (
          <p className="eg-metrics-vacio">
            Ninguna compra web del período viene de una consulta previa registrada.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={theme.grid} horizontal={false} />

              <XAxis
                type="number"
                allowDecimals={false}
                stroke={theme.axis}
                tick={{ ...AXIS_TICK, fill: theme.axis }}
                tickLine={false}
                axisLine={{ stroke: theme.grid }}
              />

              <YAxis
                type="category"
                dataKey="label"
                stroke={theme.axis}
                tick={{ ...AXIS_TICK, fill: theme.text }}
                tickLine={false}
                axisLine={false}
                width={92}
              />

              <Tooltip
                cursor={{ fill: theme.surface, opacity: .5 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as (typeof data)[number] | undefined;
                  if (!row) return null;
                  return (
                    <ChartTooltip
                      title={row.label}
                      rows={[
                        { key: "ventas", label: "Ventas online", value: formatNumber(row.ventas), color: row.color },
                        { key: "facturado", label: "Facturado", value: formatCurrency(row.facturacionOnlineAtribuida ?? 0) },
                        { key: "consultas", label: "Consultas", value: formatNumber(row.consultas) },
                      ]}
                    />
                  );
                }}
              />

              <Bar dataKey="ventas" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
                {data.map((row) => (
                  <Cell key={row.key} fill={row.color} />
                ))}
                <LabelList
                  dataKey="ventas"
                  position="right"
                  formatter={(value) => formatNumber(Number(value ?? 0))}
                  style={{ fill: theme.text, fontSize: 11, fontWeight: 700 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

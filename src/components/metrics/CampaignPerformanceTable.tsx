import { Card, DataTable, type DataTableColumn } from "../../ui";
import { formatCurrency, formatNumber, formatRoas, orDash } from "./metricsFormat";
import type { MetricsCampaign } from "../../services/metrics/types";

type Props = {
  rows: MetricsCampaign[];
  loading?: boolean;
};

/**
 * Campañas, ordenadas por consultas (ya vienen así desde ORIGEN).
 *
 * Dos señales de venta, con nombres distintos porque miden cosas
 * distintas y sumarlas no significaría nada:
 *
 *   ATRIBUIDAS → la persona consultó por esa campaña y después compró
 *     en la web. Sale de la columna VENTA ONLINE de ORIGEN.
 *   POR UTM → el pedido de WooCommerce traía esa campaña en su
 *     utm_campaign. Cuando viene vacía no se atribuye a ninguna, así
 *     que nunca suman de más.
 *
 * Una misma venta puede aparecer en las dos, o en ninguna.
 */
export default function CampaignPerformanceTable({ rows, loading }: Props) {
  const num = (valor: number) => <span className="eg-metrics-num">{formatNumber(valor)}</span>;
  const plata = (valor: number) => <span className="eg-metrics-num">{formatCurrency(valor)}</span>;
  const opcional = (valor: number | null, format: (n: number) => string = formatNumber) => (
    <span className={`eg-metrics-num${valor === null ? " is-empty" : ""}`}>
      {orDash(valor, format)}
    </span>
  );

  const columns: DataTableColumn<MetricsCampaign>[] = [
    { key: "campana", header: "Campaña", render: (r) => <span className="eg-metrics-name">{r.campana}</span> },
    { key: "consultas", header: "Consultas", align: "right", render: (r) => num(r.consultas) },

    { key: "ventas_atrib", header: "Ventas atribuidas", align: "right", render: (r) => num(r.ventas_online_atribuidas) },
    { key: "fact_atrib", header: "Facturación atribuida", align: "right", render: (r) => plata(r.facturacion_online_atribuida) },

    { key: "ventas_utm", header: "Ventas por UTM", align: "right", render: (r) => num(r.ventas_online_utm) },
    { key: "fact_utm", header: "Facturación por UTM", align: "right", render: (r) => plata(r.facturacion_online_utm) },

    { key: "gasto", header: "Gasto Meta", align: "right", render: (r) => opcional(r.gasto_meta, formatCurrency) },
    { key: "cpl", header: "CPL", align: "right", render: (r) => opcional(r.cpl, formatCurrency) },
    { key: "cpa", header: "CPA", align: "right", render: (r) => opcional(r.cpa, formatCurrency) },
    { key: "roas", header: "ROAS", align: "right", render: (r) => opcional(r.roas, (n) => formatRoas(n, 1)) },
  ];

  return (
    <Card className="eg-metrics-table-card">
      <div className="eg-metrics-card__head">
        <h2 className="eg-metrics-card__title">Campañas</h2>
        <p className="eg-metrics-card__sub">Ordenadas por volumen de consultas</p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.campana}
        loading={loading}
        loadingLabel="Cargando campañas…"
        empty="No hay campañas con consultas en este período."
      />
    </Card>
  );
}

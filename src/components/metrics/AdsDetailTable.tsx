import { Card, DataTable, type DataTableColumn } from "../../ui";
import { formatNumber } from "./metricsFormat";
import type { MetricsAd, MetricsDiagnostico } from "../../services/metrics/types";

type Props = {
  rows: MetricsAd[];
  diagnostico: MetricsDiagnostico;
  loading?: boolean;
};

/**
 * Campaña ▸ conjunto ▸ anuncio.
 *
 * Solo consultas. El gasto por anuncio existe en el JSON pero no se
 * muestra todavía: cruza por NOMBRE entre ORIGEN y GASTO META, y esa
 * unión hay que validarla antes de mostrar plata al lado de un anuncio.
 * Un match errado no se ve como error, se ve como un anuncio caro.
 */
export default function AdsDetailTable({ rows, diagnostico, loading }: Props) {
  const columns: DataTableColumn<MetricsAd>[] = [
    { key: "campana", header: "Campaña", render: (r) => <span className="eg-metrics-name">{r.campana}</span> },
    { key: "conjunto", header: "Conjunto", render: (r) => r.conjunto || "—" },
    { key: "anuncio", header: "Anuncio", render: (r) => r.anuncio || "—" },
    {
      key: "consultas",
      header: "Consultas",
      align: "right",
      render: (r) => <span className="eg-metrics-num">{formatNumber(r.consultas)}</span>,
    },
  ];

  const { anuncios_totales, devueltos, truncado } = diagnostico.ads_detail;

  return (
    <Card className="eg-metrics-table-card">
      <div className="eg-metrics-card__head">
        <h2 className="eg-metrics-card__title">Anuncios</h2>
        <p className="eg-metrics-card__sub">
          {truncado
            ? `Los ${formatNumber(devueltos)} con más consultas, de ${formatNumber(anuncios_totales)}`
            : "Consultas por anuncio, ordenadas por volumen"}
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.campana}|${r.conjunto}|${r.anuncio}`}
        loading={loading}
        loadingLabel="Cargando anuncios…"
        empty="No hay anuncios con consultas en este período."
      />
    </Card>
  );
}

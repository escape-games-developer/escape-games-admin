import { Card, DataTable, type DataTableColumn } from "../../ui";
import { formatCurrency, formatNumber, formatRoas, orDash } from "./metricsFormat";
import type { MetricsBranch } from "../../services/metrics/types";

type Props = {
  rows: MetricsBranch[];
  loading?: boolean;
};

/**
 * Rendimiento por sucursal.
 *
 * Es el `DataTable` del panel, sin variantes: mismas alturas de fila,
 * mismo hover, mismo scroll horizontal en pantallas chicas.
 *
 * Las columnas que ORIGEN todavía no puede calcular quedan a la vista
 * con un "—" en vez de esconderse. Que el hueco se vea es la única
 * forma de que se sepa que falta; una columna escondida es una
 * pregunta que nadie vuelve a hacer.
 *
 * La lista puede traer sucursales con 0 consultas: son las que venden
 * por la web pero no tienen número propio en respond.io.
 */
export default function BranchPerformanceTable({ rows, loading }: Props) {
  const num = (valor: number) => <span className="eg-metrics-num">{formatNumber(valor)}</span>;
  const plata = (valor: number) => <span className="eg-metrics-num">{formatCurrency(valor)}</span>;
  /* `orDash` es lo que mantiene la diferencia entre "no lo sabemos" y
     "es cero". Nunca `valor || 0` sobre estas columnas. */
  const opcional = (valor: number | null, format: (n: number) => string = formatNumber) => (
    <span className={`eg-metrics-num${valor === null ? " is-empty" : ""}`}>
      {orDash(valor, format)}
    </span>
  );

  const columns: DataTableColumn<MetricsBranch>[] = [
    { key: "marca", header: "Sucursal", render: (r) => <span className="eg-metrics-name">{r.marca}</span> },

    { key: "consultas", header: "Consultas", align: "right", render: (r) => num(r.consultas) },
    { key: "de_anuncios", header: "De anuncios", align: "right", render: (r) => num(r.de_anuncios) },
    { key: "de_web", header: "De web", align: "right", render: (r) => num(r.de_web) },
    { key: "organico", header: "Orgánico", align: "right", render: (r) => num(r.organico) },
    { key: "espontaneas", header: "Espontáneas", align: "right", render: (r) => num(r.espontaneas) },
    { key: "sin_identificar", header: "Sin identificar", align: "right", render: (r) => num(r.sin_identificar) },
    { key: "repetidas", header: "Repetidas", align: "right", render: (r) => num(r.repetidas) },
    { key: "sin_telefono", header: "Sin teléfono", align: "right", render: (r) => num(r.sin_telefono) },

    /* Estas tres salen de la hoja VENTAS ONLINE y con filtro por canal
       ORIGEN las devuelve en null: esa hoja no sabe por qué canal
       consultó el comprador. Por eso van por `opcional`, no por `plata`. */
    { key: "ventas_online", header: "Ventas online", align: "right", render: (r) => opcional(r.ventas_online) },
    { key: "facturacion_online", header: "Facturación online", align: "right", render: (r) => opcional(r.facturacion_online, formatCurrency) },
    { key: "ticket", header: "Ticket prom.", align: "right", render: (r) => opcional(r.ticket_promedio_online, formatCurrency) },

    { key: "ventas_atrib", header: "Ventas atribuidas", align: "right", render: (r) => num(r.ventas_online_atribuidas) },
    { key: "fact_atrib", header: "Facturación atribuida", align: "right", render: (r) => plata(r.facturacion_online_atribuida) },

    { key: "ventas_offline", header: "Ventas offline", align: "right", render: (r) => opcional(r.ventas_offline) },
    { key: "fact_offline", header: "Facturación offline", align: "right", render: (r) => opcional(r.facturacion_offline, formatCurrency) },

    { key: "gasto", header: "Gasto Meta", align: "right", render: (r) => opcional(r.gasto_meta, formatCurrency) },
    { key: "cpl", header: "CPL", align: "right", render: (r) => opcional(r.cpl, formatCurrency) },
    { key: "cpa", header: "CPA", align: "right", render: (r) => opcional(r.cpa, formatCurrency) },
    { key: "roas", header: "ROAS", align: "right", render: (r) => opcional(r.roas, (n) => formatRoas(n, 1)) },
  ];

  return (
    <Card className="eg-metrics-table-card eg-metrics-table-card--ancha">
      <div className="eg-metrics-card__head">
        <h2 className="eg-metrics-card__title">Performance por sucursal</h2>
        <p className="eg-metrics-card__sub">Consultas, cierre y retorno de cada local</p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.marca}
        loading={loading}
        loadingLabel="Cargando sucursales…"
        empty="No hay sucursales con movimiento en este período."
      />
    </Card>
  );
}

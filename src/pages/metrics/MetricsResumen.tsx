import { useCallback, useEffect, useState } from "react";

import AdsDetailTable from "../../components/metrics/AdsDetailTable";
import AttributionFunnel from "../../components/metrics/AttributionFunnel";
import BranchPerformanceTable from "../../components/metrics/BranchPerformanceTable";
import CampaignPerformanceTable from "../../components/metrics/CampaignPerformanceTable";
import ConsultasVentasChart from "../../components/metrics/ConsultasVentasChart";
import DataHealthCard from "../../components/metrics/DataHealthCard";
import FiltersBar from "../../components/metrics/FiltersBar";
import MetricCard from "../../components/metrics/MetricCard";
import OrigenConsultasChart from "../../components/metrics/OrigenConsultasChart";
import VentasOrigenChart from "../../components/metrics/VentasOrigenChart";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRoas,
  orDash,
  SIN_DATO,
} from "../../components/metrics/metricsFormat";
import { getMetrics, MetricsError } from "../../services/metrics/metricsService";
import type { MetricsOverview, MetricsQuery } from "../../services/metrics/types";
import { Button, Card, Icon } from "../../ui";

/**
 * Métricas › Resumen.
 *
 * Todo sale de ORIGEN en una sola lectura. La pantalla no calcula
 * métricas ni completa huecos: muestra lo que la planilla devuelve, y
 * un "—" donde ORIGEN dice que no puede calcular. La diferencia entre
 * `null` y `0` se respeta en cada celda — ver `orDash()`.
 *
 * El filtro de fechas dispara un request nuevo. No se baja todo para
 * recortar acá: la fuente de verdad sobre qué entra en un período es
 * la planilla, no el navegador.
 */
export default function MetricsResumen() {
  const [query, setQuery] = useState<MetricsQuery>({});
  const [applied, setApplied] = useState<MetricsQuery>({});
  const [data, setData] = useState<MetricsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (q: MetricsQuery) => {
    setLoading(true);
    setError(null);
    try {
      const overview = await getMetrics(q);
      setData(overview);
      // Los inputs se sincronizan con lo que ORIGEN dice haber usado:
      // el período (que en la primera carga es su ventana por defecto)
      // y los filtros tal cual los interpretó. Se parte de `q` para no
      // borrar la selección al refrescar.
      setQuery({
        ...q,
        from: overview.period.from,
        to: overview.period.to,
        branch: overview.filters.branch ?? undefined,
        channel: overview.filters.channel ?? undefined,
        campaign: overview.filters.campaign ?? undefined,
      });
    } catch (err) {
      // Nunca se dejan los datos anteriores a la vista: números viejos
      // presentados como actuales son peores que una pantalla vacía.
      setData(null);
      setError(err instanceof MetricsError ? err.message : "No se pudieron cargar las métricas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar(applied);
  }, [applied, cargar]);

  const summary = data?.summary;

  /* Las nueve cards de siempre. Las que ORIGEN no puede calcular hoy
     muestran "—" y explican por qué en el `hint`, en vez de quedar en
     blanco: un hueco sin explicación se lee como un bug. */
  const kpis = [
    {
      key: "consultas", label: "Consultas", icon: "chat" as const, tone: "accent" as const,
      value: summary ? formatNumber(summary.consultas) : SIN_DATO,
      hint: "Sin las repetidas",
    },
    {
      key: "ventas", label: "Ventas online", icon: "ticket" as const, tone: "success" as const,
      value: orDash(summary?.ventas_online ?? null, formatNumber),
      hint: "Pedidos web cobrados",
    },
    {
      key: "facturacion", label: "Facturación online", icon: "money" as const, tone: "success" as const,
      value: orDash(summary?.facturacion_online ?? null, formatCurrency),
      hint: "Solo tienda web",
    },
    {
      key: "ticket", label: "Ticket promedio", icon: "records" as const,
      value: orDash(summary?.ticket_promedio_online ?? null, formatCurrency),
      hint: "De las ventas online",
    },
    {
      key: "conversion", label: "Conversión total", icon: "target" as const,
      value: orDash(summary?.conversion_total ?? null, (n) => formatPercent(n)),
      hint: "Falta contar las ventas de cumpleaños",
    },
    {
      key: "gasto", label: "Gasto Meta", icon: "ads" as const, tone: "warning" as const,
      value: orDash(summary?.gasto_meta ?? null, formatCurrency),
      hint: "Hoja GASTO META del período",
    },
    {
      key: "cpl", label: "CPL", icon: "users" as const,
      value: orDash(summary?.cpl ?? null, formatCurrency),
      hint: "Gasto sobre consultas de anuncios",
    },
    {
      key: "cpa", label: "CPA", icon: "progress" as const,
      value: orDash(summary?.cpa ?? null, formatCurrency),
      hint: "Falta contar las ventas de cumpleaños",
    },
    {
      key: "roas", label: "ROAS", icon: "trending" as const,
      value: orDash(summary?.roas ?? null, (n) => formatRoas(n)),
      hint: "Falta la facturación offline",
    },
  ];

  /* Desglose de las consultas. Sale de `summary`, no del donut, para
     que sea exactamente el mismo número que informa ORIGEN. */
  const desglose = summary
    ? [
        { key: "anuncios", label: "De anuncios", value: summary.consultas_de_anuncios },
        { key: "web", label: "De web", value: summary.consultas_de_web },
        { key: "organico", label: "Orgánico", value: summary.consultas_organico },
        { key: "espontaneas", label: "Espontáneas", value: summary.consultas_espontaneas },
        { key: "sin_ident", label: "Sin identificar", value: summary.consultas_sin_identificar },
        { key: "sin_tel", label: "Sin teléfono (IG/MSN)", value: summary.consultas_ig_msn_sin_telefono },
        { key: "repetidas", label: "Repetidas descartadas", value: summary.repetidas_descartadas },
      ]
    : [];

  if (error) {
    return (
      <>
        <FiltersBar
          value={query}
          options={data?.filter_options}
          onChange={setQuery}
          onApply={setApplied}
          loading={loading}
        />
        <Card className="eg-metrics-error" role="alert">
          <span className="eg-metrics-error__icon" aria-hidden="true">
            <Icon name="refresh" size={22} />
          </span>
          <strong>No se pudieron cargar las métricas.</strong>
          <span className="eg-metrics-error__detalle">{error}</span>
          <Button variant="primary" onClick={() => void cargar(applied)} loading={loading}>
            Reintentar
          </Button>
        </Card>
      </>
    );
  }

  return (
    <>
      <FiltersBar
        value={query}
        options={data?.filter_options}
        onChange={setQuery}
        onApply={setApplied}
        loading={loading}
        periodoAplicado={data ? `${data.period.from} a ${data.period.to}` : undefined}
      />

      <section className="eg-metrics-kpis" aria-label="Indicadores del período">
        {kpis.map((kpi) => (
          <MetricCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            tone={kpi.tone}
            hint={kpi.hint}
            loading={loading}
          />
        ))}
      </section>

      <Card padding="sm" className="eg-metrics-desglose">
        {loading || !summary ? (
          <span className="eg-metrics-desglose__cargando">Cargando desglose de consultas…</span>
        ) : (
          desglose.map((item) => (
            <span className="eg-metrics-desglose__item" key={item.key}>
              <span className="eg-metrics-desglose__label">{item.label}</span>
              <b className="eg-metrics-num">{formatNumber(item.value)}</b>
            </span>
          ))
        )}
      </Card>

      <ConsultasVentasChart data={data?.daily ?? []} loading={loading} />

      {data && !loading ? (
        <>
          <div className="eg-metrics-split">
            <OrigenConsultasChart
              sources={data.sources}
              total={data.summary.consultas}
              loading={loading}
            />
            <VentasOrigenChart sources={data.sources} loading={loading} />
          </div>

          <AttributionFunnel
            summary={data.summary}
            sources={data.sources}
            diagnostico={data.diagnostico}
          />

          <BranchPerformanceTable rows={data.branches} />
          <CampaignPerformanceTable rows={data.campaigns} />
          <AdsDetailTable rows={data.ads_detail} diagnostico={data.diagnostico} />
          <DataHealthCard diagnostico={data.diagnostico} period={data.period} />
        </>
      ) : (
        <div className="eg-metrics-split">
          <Card className="eg-metrics-card">
            <div className="eg-metrics-skeleton" style={{ height: 244 }} aria-hidden="true" />
          </Card>
          <Card className="eg-metrics-card">
            <div className="eg-metrics-skeleton" style={{ height: 244 }} aria-hidden="true" />
          </Card>
        </div>
      )}
    </>
  );
}

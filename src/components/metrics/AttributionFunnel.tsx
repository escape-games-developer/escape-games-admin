import { useMemo } from "react";

import { Card, Icon } from "../../ui";
import { formatCurrency, formatNumber, formatPercent, orDash } from "./metricsFormat";
import type {
  MetricsDiagnostico,
  MetricsSources,
  MetricsSummary,
} from "../../services/metrics/types";

type Props = {
  summary: MetricsSummary;
  sources: MetricsSources;
  diagnostico: MetricsDiagnostico;
  loading?: boolean;
};

/**
 * Embudo de atribución: de la consulta que entra a la plata que entró.
 *
 * Se dibuja con barras propias en lugar del `FunnelChart` de Recharts
 * porque el trapecio es ilegible cuando el último paso es el 1% del
 * primero, y porque cada paso necesita su propio texto de contexto.
 *
 * DOS COSAS QUE HAY QUE TENER A LA VISTA AL LEERLO:
 *
 * 1. "Compraron en la web" NO es un subconjunto de "de anuncios":
 *    entra gente de cualquier origen. Los pasos 1 y 2 sí están
 *    anidados; el 3 cuelga del 1, no del 2. Está dicho en su nota.
 *
 * 2. Faltan las ventas de cumpleaños, que son el grueso del negocio.
 *    ORIGEN todavía no las puede contar. Por eso el embudo cierra en
 *    un número chico, y por eso NO se muestra una tasa de conversión:
 *    sería la del negocio entero calculada con una esquina.
 */
export default function AttributionFunnel({ summary, sources, diagnostico, loading }: Props) {
  const compraronEnLaWeb = diagnostico.atribucion.consultas_del_periodo_que_compraron_en_la_web;

  // El `?? 0` es un guard de TIPOS, no una coerción de datos: en el JSON
  // solo `sources.repetidas` trae nulls, y acá no se la suma.
  const facturacionAtribuida = useMemo(() => {
    const claves = ["meta_ads", "web", "organico", "espontaneas", "sin_atribuir"] as const;
    return claves.reduce((acc, k) => acc + (sources[k].facturacion_online_atribuida ?? 0), 0);
  }, [sources]);

  const pasos = useMemo(() => {
    const base = summary.consultas;
    const ancho = (valor: number) =>
      base > 0 ? Math.max((valor / base) * 100, 4) : 0;

    return [
      {
        key: "consultas",
        label: "Consultas recibidas",
        texto: formatNumber(summary.consultas),
        ancho: base > 0 ? 100 : 0,
        nota: "Todos los canales, sin las repetidas.",
        plata: false,
      },
      {
        key: "anuncios",
        label: "De anuncios de Meta",
        texto: formatNumber(summary.consultas_de_anuncios),
        ancho: ancho(summary.consultas_de_anuncios),
        nota: `${orDash(sources.meta_ads.share, (n) => formatPercent(n))} del total`,
        plata: false,
      },
      {
        key: "compraron",
        label: "Compraron en la web",
        texto: formatNumber(compraronEnLaWeb),
        ancho: ancho(compraronEnLaWeb),
        nota: "Consultaron y después compraron en la tienda. De cualquier origen, no solo de anuncios.",
        plata: false,
      },
      {
        key: "facturado",
        label: "Facturado por esas compras",
        texto: formatCurrency(facturacionAtribuida),
        // Es plata, no cantidad: hereda el ancho del paso anterior en
        // vez de escalarse contra las consultas. Comparar $ contra
        // personas no significa nada.
        ancho: ancho(compraronEnLaWeb),
        nota: "No incluye las ventas de cumpleaños: ORIGEN todavía no las puede contar.",
        plata: true,
      },
    ];
  }, [summary, sources, compraronEnLaWeb, facturacionAtribuida]);

  const sinAtribuir = sources.sin_atribuir;

  return (
    <Card className="eg-metrics-card">
      <div className="eg-metrics-card__head">
        <h2 className="eg-metrics-card__title">Embudo de atribución</h2>
        <p className="eg-metrics-card__sub">De la consulta recibida a la venta facturada</p>
      </div>

      {loading ? (
        <div className="eg-metrics-skeleton" style={{ height: 220 }} aria-hidden="true" />
      ) : (
        <>
          <ol className="eg-metrics-funnel">
            {pasos.map((paso) => (
              <li className={`eg-metrics-funnel__step${paso.plata ? " is-money" : ""}`} key={paso.key}>
                <div className="eg-metrics-funnel__head">
                  <span className="eg-metrics-funnel__label">{paso.label}</span>
                  <span className="eg-metrics-funnel__value">{paso.texto}</span>
                </div>
                <div className="eg-metrics-funnel__track">
                  <div className="eg-metrics-funnel__bar" style={{ width: `${paso.ancho}%` }} />
                </div>
                <div className="eg-metrics-funnel__note">{paso.nota}</div>
              </li>
            ))}
          </ol>

          {/* Discreta: es un dato de calidad de los datos, no una falla. */}
          <div className="eg-metrics-alert" role="status">
            <span className="eg-metrics-alert__icon" aria-hidden="true">
              <Icon name="link" size={16} />
            </span>
            <span className="eg-metrics-alert__text">
              <strong>
                Sin atribuir: {formatNumber(sinAtribuir.consultas)} consultas
                {" — "}
                {orDash(sinAtribuir.share, (n) => formatPercent(n))}
              </strong>
              <span>{sinAtribuir.definicion}</span>
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

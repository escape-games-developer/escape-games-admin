import { PageHeader } from "../../ui";
import MetricsResumen from "./MetricsResumen";
import MetricsSoon from "./MetricsSoon";
import "../../components/metrics/metrics.css";

export type MetricsSection = "resumen" | "sucursales" | "campanas" | "ventas" | "diagnostico";

type Props = {
  section: MetricsSection;
};

/**
 * Métricas — contenedor de las cinco subsecciones.
 *
 * Mismo patrón que `IntranetPage`: una ruta por subsección, un solo componente
 * que decide qué cuerpo montar. La cabecera es común a todas para que cambiar
 * de subsección no mueva el título ni el subtítulo de lugar.
 *
 * Hoy solo "Resumen" está desarrollada; el resto responde con una pantalla que
 * dice qué va a mostrar. Ver `MetricsSoon`.
 */
export default function MetricsPage({ section }: Props) {
  return (
    <div className="eg-metrics-page">
      <PageHeader title="Métricas" subtitle="Marketing, atribución y ventas" />

      {section === "resumen" && <MetricsResumen />}

      {section === "sucursales" && (
        <MetricsSoon
          title="Métricas por sucursal"
          description="El detalle completo de cada local, con su propia serie diaria y comparación entre sucursales."
          bullets={[
            { title: "Ficha por local", detail: "Consultas, ventas, facturación y gasto de cada sucursal en su propia vista." },
            { title: "Comparativa", detail: "Las cuatro sucursales sobre el mismo eje, para ver quién cierra mejor." },
            { title: "Evolución", detail: "Cómo se movió cada local período contra período." },
          ]}
        />
      )}

      {section === "campanas" && (
        <MetricsSoon
          title="Métricas por campaña"
          description="El rendimiento de la pauta al detalle: campaña, conjunto de anuncios y anuncio."
          bullets={[
            { title: "Hasta el anuncio", detail: "Bajar de la campaña al conjunto y al creativo que trajo la consulta." },
            { title: "Costo por venta", detail: "CPA real sobre ventas confirmadas, no sobre consultas." },
            { title: "Presupuesto", detail: "Dónde está puesta la plata y qué está devolviendo." },
          ]}
        />
      )}

      {section === "ventas" && (
        <MetricsSoon
          title="Ventas"
          description="El detalle de las reservas confirmadas y de dónde vino cada una."
          bullets={[
            { title: "Listado de ventas", detail: "Cada reserva con su sucursal, su sala y su origen." },
            { title: "Ticket", detail: "Cómo se reparte el ticket promedio y qué lo mueve." },
            { title: "Tiempo de cierre", detail: "Cuánto pasa entre la consulta y la reserva confirmada." },
          ]}
        />
      )}

      {section === "diagnostico" && (
        <MetricsSoon
          title="Diagnóstico de atribución"
          description="La salud de los datos: qué consultas no se pudieron atribuir y por qué."
          bullets={[
            { title: "Consultas sin atribuir", detail: "El listado detrás del número, para poder revisarlas de a una." },
            { title: "Motivos", detail: "Sin parámetros de campaña, link acortado, contacto directo, y qué pesa más." },
            { title: "Cobertura", detail: "Qué porcentaje del período quedó correctamente identificado." },
          ]}
        />
      )}
    </div>
  );
}

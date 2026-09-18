import { Card, Icon } from "../../ui";
import { formatNumber, formatTimestamp } from "./metricsFormat";
import type { MetricsDiagnostico, MetricsPeriod } from "../../services/metrics/types";

type Props = {
  diagnostico: MetricsDiagnostico;
  period: MetricsPeriod;
};

/**
 * Estado de los datos.
 *
 * Los textos NO se escriben acá: son los `avisos` que redacta ORIGEN,
 * que es quien sabe por qué falta cada cosa. Duplicar esa explicación
 * en el panel garantizaría que algún día las dos versiones digan
 * distinto, y la del panel sería la desactualizada.
 *
 * Sin esta card, el tablero no puede distinguir "no pasó nada" de "no
 * lo estamos midiendo", que es la diferencia más cara de confundir.
 */
export default function DataHealthCard({ diagnostico, period }: Props) {
  const { avisos, consultas, ventas_online, gasto_meta } = diagnostico;

  return (
    <Card className="eg-metrics-card eg-metrics-salud">
      <div className="eg-metrics-card__head">
        <h2 className="eg-metrics-card__title">Estado de los datos</h2>
        <p className="eg-metrics-card__sub">
          ORIGEN {period.version} · generado {formatTimestamp(period.generated_at)}
        </p>
      </div>

      <ul className="eg-metrics-salud__lista">
        {avisos.length === 0 ? (
          <li className="eg-metrics-salud__item">
            <span className="eg-metrics-salud__icono" aria-hidden="true">
              <Icon name="records" size={14} />
            </span>
            <span>Sin observaciones para este período.</span>
          </li>
        ) : (
          avisos.map((aviso) => (
            <li className="eg-metrics-salud__item" key={aviso}>
              <span className="eg-metrics-salud__icono" aria-hidden="true">
                <Icon name="link" size={14} />
              </span>
              <span>{aviso}</span>
            </li>
          ))
        )}
      </ul>

      <div className="eg-metrics-salud__cifras">
        <span>
          Consultas fuera del período: <b>{formatNumber(consultas.fuera_del_periodo)}</b>
        </span>
        <span>
          Filas leídas de VENTAS ONLINE: <b>{formatNumber(ventas_online.filas_leidas)}</b>
        </span>
        <span>
          Gasto Meta cargado hasta: <b>{gasto_meta.ultimo_dia_cargado ?? "—"}</b>
        </span>
      </div>
    </Card>
  );
}

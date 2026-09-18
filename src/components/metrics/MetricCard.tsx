import Icon, { type IconName } from "../../ui/icons";
import type { StatCardTone } from "../../ui";
import { SIN_DATO } from "./metricsFormat";

type Props = {
  label: string;
  /** Ya formateado por la vista, o `SIN_DATO` si ORIGEN no lo puede calcular. */
  value: string;
  icon?: IconName;
  /** Mismo juego de tonos que `StatCard`: pinta el icono, nunca el número. */
  tone?: StatCardTone;
  /** Texto chico abajo. Acá va POR QUÉ una métrica no está disponible. */
  hint?: string;
  loading?: boolean;
};

/**
 * Card de KPI de Métricas.
 *
 * Reusa a propósito las clases de `StatCard` (`.eg-stat*`) en lugar de
 * armar una card nueva: superficie, borde, radio, icono y tipografía
 * salen del mismo lugar que el resto del panel.
 *
 * La card NO decide si hay dato: recibe el string ya resuelto. Cuando
 * ese string es `SIN_DATO` se dibuja apagada, para que un "—" no se
 * lea como un número más. La diferencia entre "no lo sabemos" y "es
 * cero" tiene que verse, no solo estar en el JSON.
 */
export default function MetricCard({
  label,
  value,
  icon,
  tone = "neutral",
  hint,
  loading = false,
}: Props) {
  const sinDato = value === SIN_DATO;

  return (
    <div className={`eg-stat eg-stat--${tone} eg-metric-card${sinDato ? " is-empty" : ""}`}>
      {icon && (
        <span className="eg-stat__icon" aria-hidden="true">
          <Icon name={icon} size={18} />
        </span>
      )}

      <div className="eg-stat__body">
        <div className="eg-stat__label">{label}</div>

        {loading ? (
          <span className="eg-stat__skeleton" aria-hidden="true" />
        ) : (
          <div className="eg-stat__value eg-metrics-num">{value}</div>
        )}

        {hint && !loading && (
          <div className="eg-metric-card__foot">
            <span className="eg-metric-card__hint" title={hint}>{hint}</span>
          </div>
        )}
      </div>
    </div>
  );
}

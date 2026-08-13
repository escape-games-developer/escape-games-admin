import Icon, { type IconName } from "./icons";

export type StatCardTone = "neutral" | "success" | "danger" | "warning" | "accent";

type Props = {
  /** El número grande. String para poder mostrar "0 / 100" o "—". */
  value: React.ReactNode;
  label: string;
  icon?: IconName;
  tone?: StatCardTone;
  /** Placeholder mientras la query todavía no resolvió. */
  loading?: boolean;
};

/**
 * Tile de métrica. Es el mismo componente para las 5 secciones: si una
 * pantalla necesita algo distinto, se agrega un `tone`, no una card nueva.
 */
export default function StatCard({ value, label, icon, tone = "neutral", loading = false }: Props) {
  return (
    <div className={`eg-stat eg-stat--${tone}`}>
      {icon && (
        <span className="eg-stat__icon" aria-hidden="true">
          <Icon name={icon} size={18} />
        </span>
      )}

      <div className="eg-stat__body">
        {loading ? (
          <span className="eg-stat__skeleton" aria-hidden="true" />
        ) : (
          <div className="eg-stat__value">{value}</div>
        )}
        <div className="eg-stat__label">{label}</div>
      </div>
    </div>
  );
}

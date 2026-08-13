import Icon, { type IconName } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "md" | "sm";

type Props = {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  title?: string;
  type?: "button" | "submit";
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
};

/**
 * Botón base del panel.
 *
 * `primary` (naranja) queda reservado para la acción importante de cada
 * pantalla. Todo lo demás debería usar `secondary` o `ghost` para no llenar
 * la interfaz de naranja.
 */
export default function Button({
  children,
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  title,
  type = "button",
  onClick,
}: Props) {
  const cls = [
    "eg-btn",
    `eg-btn--${variant}`,
    size === "sm" ? "eg-btn--sm" : "",
    fullWidth ? "eg-btn--full" : "",
    !children ? "eg-btn--icon-only" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const iconSize = size === "sm" ? 14 : 16;

  return (
    <button
      type={type}
      className={cls}
      disabled={disabled || loading}
      title={title}
      onClick={onClick}
    >
      {loading ? (
        <span className="eg-btn__spinner" aria-hidden="true" />
      ) : (
        icon && <Icon name={icon} size={iconSize} />
      )}
      {children && <span>{children}</span>}
      {iconRight && !loading && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
}

import Icon from "../../ui/icons";

export type Crumb = {
  label: string;
  /** Sin `to` se renderiza como texto plano (última miga). */
  to?: string;
};

type Props = {
  crumbs: Crumb[];
  userName: string;
  online?: boolean;
  /** Solo se muestra en mobile, para abrir el sidebar como drawer. */
  onOpenMenu?: () => void;
};

/**
 * Barra superior compacta (62px). Reemplaza al header gigante con logo
 * centrado: el logo ahora vive en el sidebar.
 */
export default function AdminTopbar({ crumbs, userName, online = true, onOpenMenu }: Props) {
  return (
    <header className="eg-topbar">
      {onOpenMenu && (
        <button
          type="button"
          className="eg-topbar__menu"
          onClick={onOpenMenu}
          aria-label="Abrir menú"
        >
          <span className="eg-burger" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      )}

      <nav className="eg-crumbs" aria-label="Ruta">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={`${c.label}-${i}`} className="eg-crumbs__item">
              {i > 0 && (
                <span className="eg-crumbs__sep" aria-hidden="true">
                  /
                </span>
              )}
              <span className={last ? "eg-crumbs__current" : "eg-crumbs__link"}>{c.label}</span>
            </span>
          );
        })}
      </nav>

      <div className="eg-topbar__right">
        <span className={`eg-status${online ? " is-online" : ""}`}>
          <span className="eg-status__dot" aria-hidden="true" />
          {online ? "online" : "offline"}
        </span>

        <span className="eg-topbar__user" title={userName}>
          <span className="eg-avatar eg-avatar--sm" aria-hidden="true">
            {(userName.trim()[0] || "A").toUpperCase()}
          </span>
          <span className="eg-topbar__user-name">{userName}</span>
          <Icon name="chevronRight" size={14} />
        </span>
      </div>
    </header>
  );
}

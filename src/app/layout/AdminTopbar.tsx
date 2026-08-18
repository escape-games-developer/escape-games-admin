import Breadcrumb from "../../ui/Breadcrumb";

export type Crumb = {
  label: string;
  /** Sin `to` se renderiza como texto plano (última miga). */
  to?: string;
};

type Props = {
  crumbs: Crumb[];
  /** Conservado por compatibilidad con la vitrina; el usuario vive en el sidebar. */
  userName?: string;
  /** Solo se muestra en mobile, para abrir el sidebar como drawer. */
  onOpenMenu?: () => void;
};

/**
 * Barra superior compacta (62px). Reemplaza al header gigante con logo
 * centrado: el logo ahora vive en el sidebar.
 */
export default function AdminTopbar({ crumbs, onOpenMenu }: Props) {
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

      <Breadcrumb items={crumbs} />
    </header>
  );
}

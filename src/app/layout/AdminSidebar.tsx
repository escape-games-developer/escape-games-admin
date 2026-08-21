import { useState } from "react";
import { Link } from "react-router-dom";
import Icon, { type IconName } from "../../ui/icons";
import logo from "../../assets/escape-logo.png";

export type NavItem = {
  key: string;
  label: string;
  to: string;
  icon: IconName;
  children?: Array<{
    key: string;
    label: string;
    to: string;
  }>;
};

type Props = {
  /** Ya filtrados por permisos por quien lo monta. El sidebar no decide visibilidad. */
  items: NavItem[];
  activeKey: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Ruta de Ajustes. Solo la recibe quien puede entrar (Admin General). */
  settingsTo?: string;
  onLogout: () => void;
  /** Se dispara al navegar. En mobile lo usa el shell para cerrar el drawer. */
  onNavigate?: () => void;
};

/**
 * Sidebar permanente del panel. Componente de PRESENTACIÓN puro: no consulta
 * Supabase y no decide qué ítems mostrar — todo eso llega desde AdminLayout.
 * La identidad del usuario ya no vive acá: se muestra en la topbar.
 *
 * "Ajustes" se presenta deshabilitado porque todavía no existe una ruta real.
 * Así se respeta la jerarquía visual sin inventar navegación.
 */
export default function AdminSidebar({
  items,
  activeKey,
  collapsed,
  onToggleCollapse,
  settingsTo,
  onLogout,
  onNavigate,
}: Props) {
  /** Qué grupo contiene la ruta actual. Decide la SELECCIÓN, no la apertura. */
  const activeGroupKey = items.find((item) => item.children?.some((child) => child.key === activeKey))?.key;

  /**
   * Qué grupo está desplegado. Es estado propio del menú, independiente de la
   * ruta: por eso Intranet se puede cerrar aunque Cotizador siga siendo la
   * sección abierta. Lo único que hace la ruta es abrir el grupo al ENTRAR,
   * comparando contra el valor anterior en render (el patrón de React para
   * ajustar estado ante un cambio de props, sin efecto ni re-render en cascada).
   */
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroupKey ?? null);
  const [seenGroupKey, setSeenGroupKey] = useState(activeGroupKey);

  if (activeGroupKey !== seenGroupKey) {
    setSeenGroupKey(activeGroupKey);
    if (activeGroupKey) setOpenGroup(activeGroupKey);
  }

  return (
    <aside className={`eg-sidebar${collapsed ? " is-collapsed" : ""}`}>
      {/* ---------------------------- Marca ---------------------------- */}
      <div className="eg-sidebar__brand">
        <button
          type="button"
          className="eg-sidebar__brand-toggle"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
        >
          {collapsed ? (
            <span className="eg-sidebar__brand-mark">EG</span>
          ) : (
            <img className="eg-sidebar__logo" src={logo} alt="Escape Games" />
          )}
        </button>
      </div>

      {/* La identidad del usuario (avatar, nombre, puesto y código GM) vive en
          la topbar: ver `AdminUserBar`. Acá el menú arranca pegado al logo. */}

      {/* ------------------------- Navegación -------------------------- */}
      <nav className="eg-sidebar__nav" aria-label="Secciones">
        {items.map((item) => {
          const groupActive = item.children?.some((child) => child.key === activeKey) ?? false;
          // La ruta marca el grupo como seleccionado…
          const active = item.key === activeKey || groupActive;
          // …pero NO lo mantiene desplegado: eso lo decide solo el usuario.
          const isOpen = openGroup === item.key;

          if (item.children && !collapsed) {
            return (
              <div className={`eg-navgroup${isOpen ? " is-open" : ""}`} key={item.key}>
                <button
                  type="button"
                  className={`eg-navitem eg-navitem--group${active ? " is-active" : ""}`}
                  aria-expanded={isOpen}
                  aria-controls={`eg-navgroup-${item.key}`}
                  onClick={() => setOpenGroup((current) => current === item.key ? null : item.key)}
                >
                  <span className="eg-navitem__bar" aria-hidden="true" />
                  <span className="eg-navitem__icon"><Icon name={item.icon} size={18} /></span>
                  <span className="eg-navitem__label">{item.label}</span>
                  <span className="eg-navitem__chevron" aria-hidden="true">
                    <Icon name="chevronRight" size={15} />
                  </span>
                </button>
                <div className="eg-navgroup__children" id={`eg-navgroup-${item.key}`}>
                  <div className="eg-navgroup__children-inner">
                    {item.children.map((child) => {
                      const childActive = child.key === activeKey;
                      return (
                        <Link
                          key={child.key}
                          to={child.to}
                          className={`eg-navsubitem${childActive ? " is-active" : ""}`}
                          aria-current={childActive ? "page" : undefined}
                          onClick={onNavigate}
                        >
                          <span className="eg-navsubitem__dot" aria-hidden="true" />
                          <span>{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={item.key}
              to={item.to}
              className={`eg-navitem${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              onClick={onNavigate}
            >
              <span className="eg-navitem__bar" aria-hidden="true" />
              <span className="eg-navitem__icon">
                <Icon name={item.icon} size={18} />
              </span>
              {!collapsed && <span className="eg-navitem__label">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* ----------------------------- Pie ----------------------------- */}
      <div className="eg-sidebar__footer">
        {/* Ajustes ya tiene pantalla, pero solo para quien puede entrar: si no
            llega `settingsTo`, se sigue presentando deshabilitado. */}
        {settingsTo ? (
          <Link
            to={settingsTo}
            className={`eg-navitem eg-navitem--btn${activeKey === "settings" ? " is-active" : ""}`}
            aria-current={activeKey === "settings" ? "page" : undefined}
            title={collapsed ? "Ajustes" : undefined}
            onClick={onNavigate}
          >
            <span className="eg-navitem__bar" aria-hidden="true" />
            <span className="eg-navitem__icon">
              <Icon name="settings" size={18} />
            </span>
            {!collapsed && <span className="eg-navitem__label">Ajustes</span>}
          </Link>
        ) : (
          <button
            type="button"
            className="eg-navitem eg-navitem--btn"
            disabled
            aria-disabled="true"
            title={collapsed ? "Ajustes (próximamente)" : "Próximamente"}
          >
            <span className="eg-navitem__bar" aria-hidden="true" />
            <span className="eg-navitem__icon">
              <Icon name="settings" size={18} />
            </span>
            {!collapsed && <span className="eg-navitem__label">Ajustes</span>}
          </button>
        )}

        <button
          type="button"
          className="eg-navitem eg-navitem--btn"
          onClick={onLogout}
          title={collapsed ? "Cerrar sesión" : undefined}
        >
          <span className="eg-navitem__bar" aria-hidden="true" />
          <span className="eg-navitem__icon">
            <Icon name="logout" size={18} />
          </span>
          {!collapsed && <span className="eg-navitem__label">Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}

import { Link } from "react-router-dom";
import Icon, { type IconName } from "../../ui/icons";
import logo from "../../assets/escape-logo.png";

export type NavItem = {
  key: string;
  label: string;
  to: string;
  icon: IconName;
};

type Props = {
  /** Ya filtrados por permisos por quien lo monta. El sidebar no decide visibilidad. */
  items: NavItem[];
  activeKey: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  userName: string;
  userRole: string;
  onLogout: () => void;
  /** Se dispara al navegar. En mobile lo usa el shell para cerrar el drawer. */
  onNavigate?: () => void;
};

/**
 * Sidebar permanente del panel. Componente de PRESENTACIÓN puro: no consulta
 * Supabase, no lee localStorage y no decide qué ítems mostrar — todo eso
 * llega por props desde AdminLayout.
 *
 * "Ajustes" no está: todavía no existe la ruta /ajustes y un link muerto en
 * la navegación es peor que no tenerlo. Cuando vuelva el módulo de
 * Configuración, se agrega un item más al array y aparece solo.
 */
export default function AdminSidebar({
  items,
  activeKey,
  collapsed,
  onToggleCollapse,
  userName,
  userRole,
  onLogout,
  onNavigate,
}: Props) {
  const initial = (userName.trim()[0] || "A").toUpperCase();

  return (
    <aside className={`eg-sidebar${collapsed ? " is-collapsed" : ""}`}>
      {/* ---------------------------- Marca ---------------------------- */}
      <div className="eg-sidebar__brand">
        {collapsed ? (
          <span className="eg-sidebar__brand-mark" title="Escape Games">
            EG
          </span>
        ) : (
          <img className="eg-sidebar__logo" src={logo} alt="Escape Games" />
        )}
      </div>

      {/* --------------------------- Perfil ---------------------------- */}
      <div className="eg-sidebar__profile" title={collapsed ? `${userName} — ${userRole}` : undefined}>
        <span className="eg-avatar" aria-hidden="true">
          {initial}
        </span>
        {!collapsed && (
          <span className="eg-sidebar__profile-text">
            <span className="eg-sidebar__profile-name">{userName}</span>
            <span className="eg-sidebar__profile-role">{userRole}</span>
          </span>
        )}
      </div>

      {/* ------------------------- Navegación -------------------------- */}
      <nav className="eg-sidebar__nav" aria-label="Secciones">
        {items.map((item) => {
          const active = item.key === activeKey;
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

        <button
          type="button"
          className="eg-sidebar__collapse"
          onClick={onToggleCollapse}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
        >
          <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={16} />
          {!collapsed && <span>Contraer menú</span>}
        </button>
      </div>
    </aside>
  );
}

import { useState } from "react";
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
 * Supabase y no decide qué ítems mostrar — todo eso llega desde
 * AdminLayout. Solo lee el código GM ya cargado para presentarlo.
 *
 * "Ajustes" se presenta deshabilitado porque todavía no existe una ruta real.
 * Así se respeta la jerarquía visual sin inventar navegación.
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
  const gmCode = collapsed ? "" : String(localStorage.getItem("eg_admin_gm_code") || "").trim();
  const [copied, setCopied] = useState(false);

  const copyGmCode = async () => {
    if (!gmCode) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(gmCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      const field = document.createElement("textarea");
      field.value = gmCode;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const didCopy = document.execCommand("copy");
      field.remove();
      setCopied(didCopy);
      if (didCopy) window.setTimeout(() => setCopied(false), 1400);
    }
  };

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

      {/* --------------------------- Perfil ---------------------------- */}
      <div className="eg-sidebar__profile" title={collapsed ? `${userName} — ${userRole}` : undefined}>
        <span className="eg-avatar" aria-hidden="true">
          {initial}
        </span>
        {!collapsed && (
          <span className="eg-sidebar__profile-text">
            <span className="eg-sidebar__profile-name">{userName}</span>
            <span className="eg-sidebar__profile-role">{userRole}</span>
            {gmCode && (
              <span className="eg-sidebar__gm-code">
                <span className="eg-sidebar__gm-label">GM:</span>
                <strong>{gmCode}</strong>
                <button type="button" onClick={copyGmCode} aria-label="Copiar código GM" title="Copiar código GM">
                  <Icon name="copy" size={12} />
                </button>
                {copied && <span className="eg-sidebar__gm-copied" role="status">Copiado</span>}
              </span>
            )}
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

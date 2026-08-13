import { useCallback, useEffect, useState } from "react";
import AdminSidebar, { type NavItem } from "./AdminSidebar";
import AdminTopbar, { type Crumb } from "./AdminTopbar";

const COLLAPSE_KEY = "eg_admin_sidebar_collapsed";

type Props = {
  items: NavItem[];
  activeKey: string;
  crumbs: Crumb[];
  userName: string;
  userRole: string;
  onLogout: () => void;
  children: React.ReactNode;
};

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Estructura permanente del panel: SIDEBAR FIJO + ÁREA PRINCIPAL.
 *
 * Es el contenedor de presentación. No hace auth ni queries: AdminLayout
 * sigue siendo el dueño de la sesión y le pasa todo por props.
 *
 * Responsive:
 *   desktop → sidebar fijo expandido (o contraído, según preferencia)
 *   tablet  → sidebar contraído a iconos
 *   mobile  → sidebar como drawer sobre un overlay
 */
export default function AdminShell({
  items,
  activeKey,
  crumbs,
  userName,
  userRole,
  onLogout,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        /* modo privado / storage bloqueado: la preferencia no persiste, nada más */
      }
      return next;
    });
  }, []);

  // Cerrar el drawer al pasar a viewport grande, para no dejarlo colgado.
  useEffect(() => {
    if (!mobileOpen) return;

    const mq = window.matchMedia("(min-width: 900px)");
    const onChange = () => {
      if (mq.matches) setMobileOpen(false);
    };

    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const shellCls = [
    "eg-shell",
    collapsed ? "is-collapsed" : "",
    mobileOpen ? "is-drawer-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellCls}>
      <AdminSidebar
        items={items}
        activeKey={activeKey}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        userName={userName}
        userRole={userRole}
        onLogout={onLogout}
        onNavigate={() => setMobileOpen(false)}
      />

      {mobileOpen && (
        <button
          type="button"
          className="eg-shell__overlay"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="eg-shell__main">
        <AdminTopbar crumbs={crumbs} userName={userName} onOpenMenu={() => setMobileOpen(true)} />
        <main className="eg-shell__content">{children}</main>
      </div>
    </div>
  );
}

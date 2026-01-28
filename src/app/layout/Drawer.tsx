import React, { useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import logo from "../../assets/escape-logo.png";

type Props = {
  open: boolean;
  onClose: () => void;
  userName: string;
};

type UserRole = "CLIENT" | "GM" | "ADMIN";

const SESSION_KEY = "admin_demo_session";

function safeJsonParse<T>(raw: string | null): T | null {
  try {
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export default function Drawer({ open, onClose, userName }: Props) {
  const nav = useNavigate();

  const session = useMemo(() => {
    const parsed = safeJsonParse<any>(localStorage.getItem(SESSION_KEY));
    const role = (parsed?.role as UserRole) || "ADMIN";
    const branch = parsed?.branch ? String(parsed.branch) : "";
    return { role, branch };
  }, []);

  const roleLabel =
    session.role === "ADMIN" ? "Administrador" : session.role === "GM" ? "Game Master" : "Cliente";

  const canSeeRooms = session.role === "ADMIN" || session.role === "GM";
  const canSeeNews = session.role === "ADMIN";
  const canSeeUsers = session.role === "ADMIN" || session.role === "GM";

  const logout = () => {
    localStorage.removeItem("admin_demo_session");
    nav("/login", { replace: true });
  };

  return (
    <>
      <div className={open ? "backdrop show" : "backdrop"} onMouseDown={onClose} />

      <aside className={open ? "drawer open" : "drawer"}>
        <div className="drawerHeader">
          <div className="drawerHeaderCenter">
            <img className="drawerLogoOnly" src={logo} alt="Escape Games" />
          </div>

          <button className="iconBtn drawerCloseBtn" onClick={onClose} aria-label="Cerrar menú">
            ✕
          </button>
        </div>

        <div className="drawerSection">
          <div className="drawerSectionTitle">Perfil</div>

          <div className="profileCard">
            <div className="avatarCircle">{(userName?.[0] || "A").toUpperCase()}</div>
            <div className="profileInfo">
              <div className="profileName">{userName}</div>
              <div className="profileRole">
                {roleLabel}
                {session.role === "GM" && session.branch ? ` • ${session.branch}` : ""}
              </div>
            </div>
          </div>
        </div>

        <div className="drawerSection">
          <div className="drawerSectionTitle">Secciones</div>

          <nav className="drawerNav">
            {canSeeRooms ? (
              <NavLink to="/salas" className={({ isActive }) => (isActive ? "navItem active" : "navItem")}>
                Salas
              </NavLink>
            ) : null}

            {canSeeNews ? (
              <NavLink
                to="/novedades"
                className={({ isActive }) => (isActive ? "navItem active" : "navItem")}
              >
                Novedades
              </NavLink>
            ) : null}

            {canSeeUsers ? (
              <NavLink
                to="/usuarios"
                className={({ isActive }) => (isActive ? "navItem active" : "navItem")}
              >
                Usuarios
              </NavLink>
            ) : null}
          </nav>
        </div>

        <div className="drawerFooter">
          <button className="logoutBtn" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}

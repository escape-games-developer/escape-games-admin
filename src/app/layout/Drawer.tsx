import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import logo from "../../assets/escape-logo.png";

type Props = {
  open: boolean;
  onClose: () => void;
  userName: string;
};

export default function Drawer({ open, onClose, userName }: Props) {
  const nav = useNavigate();

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
              <div className="profileRole">Administrador</div>
            </div>
          </div>
        </div>

        <div className="drawerSection">
          <div className="drawerSectionTitle">Secciones</div>

          <nav className="drawerNav">
            <NavLink to="/salas" className={({ isActive }) => (isActive ? "navItem active" : "navItem")}>
              Salas
            </NavLink>
            <NavLink to="/novedades" className={({ isActive }) => (isActive ? "navItem active" : "navItem")}>
              Novedades
            </NavLink>
            <NavLink to="/usuarios" className={({ isActive }) => (isActive ? "navItem active" : "navItem")}>
              Usuarios
            </NavLink>
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

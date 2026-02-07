import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import logo from "../../assets/escape-logo.png";
import { supabase } from "../../lib/supabase";

type Props = {
  open: boolean;
  onClose: () => void;
  userName: string;
};

type UserRole = "CLIENT" | "GM" | "ADMIN" | "ADMIN_GENERAL";

type UserPermissions = {
  canManageRooms: boolean;
  canManageNews: boolean;
  canManageUsers: boolean;
  canEditRankings: boolean;
  canAwardKeys: boolean;
  canResetClientPassword: boolean;
};

const defaultPerms: UserPermissions = {
  canManageRooms: false,
  canManageNews: false,
  canManageUsers: false,
  canEditRankings: false,
  canAwardKeys: false,
  canResetClientPassword: false,
};

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

  const [role, setRole] = useState<UserRole>("ADMIN");
  const [branchLabel, setBranchLabel] = useState<string>("");
  const [perms, setPerms] = useState<UserPermissions>(defaultPerms);

  // ✅ fallback (por si venís de una versión vieja con demo_session)
  const demoSession = useMemo(() => {
    const parsed = safeJsonParse<any>(localStorage.getItem("admin_demo_session"));
    const r = (parsed?.role as UserRole) || "ADMIN";
    const b = parsed?.branch ? String(parsed.branch) : "";
    return { role: r, branch: b };
  }, []);

  // ✅ fallback NUEVO: lo que setea el Login actual
  const lsRole = useMemo(() => {
    const r = localStorage.getItem("eg_admin_role") as UserRole | null;
    return r || null;
  }, []);

  const lsBranch = useMemo(() => {
    const b = localStorage.getItem("eg_admin_branch_id");
    return b && b.trim() !== "" ? `Sucursal #${b}` : "";
  }, []);

  const lsPerms = useMemo(() => {
    const raw = localStorage.getItem("eg_admin_permissions");
    const parsed = safeJsonParse<any>(raw);
    return parsed ? ({ ...defaultPerms, ...parsed } as UserPermissions) : null;
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadRole = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return;

      // 1) leer admins (acá está la verdad)
      const { data: adminRow, error: adminErr } = await supabase
        .from("admins")
        .select("branch_id, mail, gm_code, is_super, permissions")
        .eq("user_id", uid)
        .maybeSingle();

      if (adminErr) {
        console.error(adminErr);
        return;
      }

      if (!mounted) return;

      if (!adminRow) {
        // no está en admins => CLIENT (para este panel, básicamente no debería pasar)
        setRole("CLIENT");
        setBranchLabel("");
        setPerms(defaultPerms);
        return;
      }

      // ✅ regla final:
      // is_super -> ADMIN_GENERAL
      // gm_code -> GM
      // else -> ADMIN (sucursal)
      let computed: UserRole;
      if (adminRow.is_super) computed = "ADMIN_GENERAL";
      else if (adminRow.gm_code) computed = "GM";
      else computed = "ADMIN";

      setRole(computed);

      // label sucursal solo si tiene branch_id (super puede ser null)
      setBranchLabel(adminRow.branch_id ? `Sucursal #${adminRow.branch_id}` : "");

      // ✅ permisos (por defecto todos false)
      const mergedPerms: UserPermissions = { ...defaultPerms, ...(adminRow.permissions || {}) };
      setPerms(mergedPerms);

      // ✅ persistimos (por si el usuario refresca)
      localStorage.setItem("eg_admin_role", computed);
      localStorage.setItem("eg_admin_mail", adminRow.mail ?? "");
      localStorage.setItem("eg_admin_branch_id", String(adminRow.branch_id ?? ""));
      localStorage.setItem("eg_admin_is_super", adminRow.is_super ? "true" : "false");
      localStorage.setItem("eg_admin_permissions", JSON.stringify(adminRow.permissions || {}));
    };

    loadRole();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadRole();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // prioridad: DB role -> localStorage -> demoSession
  const roleToUse: UserRole = role || lsRole || demoSession.role;
  const branchToUse = branchLabel || lsBranch || demoSession.branch;

  // permisos: DB -> localStorage -> default
  const permsToUse: UserPermissions = perms || lsPerms || defaultPerms;

  const roleLabel =
    roleToUse === "ADMIN_GENERAL"
      ? "Admin General"
      : roleToUse === "ADMIN"
      ? "Administrador"
      : roleToUse === "GM"
      ? "Game Master"
      : "Cliente";

  const isSuper = roleToUse === "ADMIN_GENERAL";

  // ✅ permisos efectivos: super lo puede todo
  const effectivePerms: UserPermissions = isSuper
    ? {
        canManageRooms: true,
        canManageNews: true,
        canManageUsers: true,
        canEditRankings: true,
        canAwardKeys: true,
        canResetClientPassword: true,
      }
    : permsToUse;

  // ✅ qué secciones mostrar (por permisos)
  const canSeeRooms = effectivePerms.canManageRooms || effectivePerms.canEditRankings;
  const canSeeNews = effectivePerms.canManageNews;
  const canSeeUsers = effectivePerms.canManageUsers;

  const logout = async () => {
    try {
      // por si quedó basura de versiones anteriores
      localStorage.removeItem("admin_demo_session");

      // limpiamos también lo nuevo
      localStorage.removeItem("eg_admin_role");
      localStorage.removeItem("eg_admin_mail");
      localStorage.removeItem("eg_admin_branch_id");
      localStorage.removeItem("eg_admin_is_super");
      localStorage.removeItem("eg_admin_permissions");

      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      nav("/login", { replace: true });
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No pude cerrar sesión. Probá de nuevo.");
    }
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
                {/* si es GM o admin de sucursal, mostramos sucursal si existe */}
                {(roleToUse === "GM" || roleToUse === "ADMIN") && branchToUse ? ` • ${branchToUse}` : ""}
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
              <NavLink to="/novedades" className={({ isActive }) => (isActive ? "navItem active" : "navItem")}>
                Novedades
              </NavLink>
            ) : null}

            {canSeeUsers ? (
              <NavLink to="/usuarios" className={({ isActive }) => (isActive ? "navItem active" : "navItem")}>
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

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
  const [gmCode, setGmCode] = useState<string>("");

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

  // ✅ branch: prioriza nombre si existe, si no cae al id
  const lsBranch = useMemo(() => {
    const name = localStorage.getItem("eg_admin_branch_name");
    if (name && name.trim() !== "") return name;
    const b = localStorage.getItem("eg_admin_branch_id");
    return b && b.trim() !== "" ? `Sucursal #${b}` : "";
  }, []);

  const lsPerms = useMemo(() => {
    const raw = localStorage.getItem("eg_admin_permissions");
    const parsed = safeJsonParse<any>(raw);
    return parsed ? ({ ...defaultPerms, ...parsed } as UserPermissions) : null;
  }, []);

  const lsGmCode = useMemo(() => {
    const c = localStorage.getItem("eg_admin_gm_code");
    return c && c.trim() !== "" ? c : "";
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadRole = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return;

      // ✅ 1) leer admins (SIN joins)
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
        setRole("CLIENT");
        setBranchLabel("");
        setPerms(defaultPerms);
        setGmCode("");
        return;
      }

      // ✅ regla final:
      // is_super -> ADMIN_GENERAL
      // gm_code -> GM
      // else -> ADMIN
      let computed: UserRole;
      if (adminRow.is_super) computed = "ADMIN_GENERAL";
      else if (adminRow.gm_code) computed = "GM";
      else computed = "ADMIN";

      setRole(computed);

      // ✅ permisos
      const mergedPerms: UserPermissions = { ...defaultPerms, ...(adminRow.permissions || {}) };
      setPerms(mergedPerms);

      // ✅ gm_code
      const code = adminRow.gm_code ? String(adminRow.gm_code) : "";
      setGmCode(code);

      // ✅ 2) sucursal
      let branchLbl = adminRow.branch_id ? `Sucursal #${adminRow.branch_id}` : "";
      let branchName = "";

      if (adminRow.branch_id && !adminRow.is_super) {
        const { data: br, error: brErr } = await supabase
          .from("branches")
          .select("name")
          .eq("id", adminRow.branch_id)
          .maybeSingle();

        if (!brErr && br?.name) {
          branchName = String(br.name);
          branchLbl = branchName;
        } else if (brErr) {
          console.warn("No pude leer branches.name, dejo fallback:", brErr);
        }
      }

      if (!mounted) return;

      setBranchLabel(branchLbl);

      // ✅ persistimos
      localStorage.setItem("eg_admin_role", computed);
      localStorage.setItem("eg_admin_mail", adminRow.mail ?? "");
      localStorage.setItem("eg_admin_branch_id", String(adminRow.branch_id ?? ""));
      localStorage.setItem("eg_admin_branch_name", branchName);
      localStorage.setItem("eg_admin_is_super", adminRow.is_super ? "true" : "false");
      localStorage.setItem("eg_admin_permissions", JSON.stringify(adminRow.permissions || {}));
      localStorage.setItem("eg_admin_gm_code", code);
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

  const permsToUse: UserPermissions = perms || lsPerms || defaultPerms;
  const gmCodeToUse = gmCode || lsGmCode;

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
      localStorage.removeItem("admin_demo_session");
      localStorage.removeItem("eg_admin_role");
      localStorage.removeItem("eg_admin_mail");
      localStorage.removeItem("eg_admin_branch_id");
      localStorage.removeItem("eg_admin_branch_name");
      localStorage.removeItem("eg_admin_is_super");
      localStorage.removeItem("eg_admin_permissions");
      localStorage.removeItem("eg_admin_gm_code");

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
              <div className="profileRole">{roleLabel}</div>

              {/* ✅ STAFF: mostrar código GM (y sucursal solo si corresponde) */}
              {roleToUse !== "CLIENT" ? (
                <>
                  {!isSuper ? (
                    <div className="profileBranch">Sucursal: {branchToUse || "sin asignar"}</div>
                  ) : null}

                  <div className="profileGmCode">
                    <span style={{ opacity: 0.7 }}>Código GM:</span> <b>{gmCodeToUse || "sin código"}</b>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="drawerSection">
          <div className="drawerSectionTitle">Secciones</div>

          <nav className="drawerNav">
            {canSeeRooms ? (
              <NavLink
                to="/salas"
                onClick={onClose}
                className={({ isActive }) => (isActive ? "navItem active" : "navItem")}
              >
                Salas
              </NavLink>
            ) : null}

            {canSeeNews ? (
              <NavLink
                to="/novedades"
                onClick={onClose}
                className={({ isActive }) => (isActive ? "navItem active" : "navItem")}
              >
                Novedades
              </NavLink>
            ) : null}

            {canSeeUsers ? (
              <NavLink
                to="/usuarios"
                onClick={onClose}
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

import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
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
  const [role, setRole] = useState<UserRole | null>(null);
  const [branchLabel, setBranchLabel] = useState("");
  const [perms, setPerms] = useState<UserPermissions | null>(null);
  const [gmCode, setGmCode] = useState("");
  const [loadingRole, setLoadingRole] = useState(true);

  const demoSession = useMemo(() => {
    const parsed = safeJsonParse<any>(localStorage.getItem("admin_demo_session"));
    const sessionRole = (parsed?.role as UserRole) || "CLIENT";
    const sessionBranch = parsed?.branch ? String(parsed.branch) : "";
    return { role: sessionRole, branch: sessionBranch };
  }, []);

  const lsRole = useMemo(() => {
    const storedRole = localStorage.getItem("eg_admin_role") as UserRole | null;
    return storedRole || null;
  }, []);

  const lsBranch = useMemo(() => {
    const name = localStorage.getItem("eg_admin_branch_name");
    if (name && name.trim() !== "") return name;

    const branchId = localStorage.getItem("eg_admin_branch_id");
    return branchId && branchId.trim() !== "" ? `Sucursal #${branchId}` : "";
  }, []);

  const lsPerms = useMemo(() => {
    const raw = localStorage.getItem("eg_admin_permissions");
    const parsed = safeJsonParse<any>(raw);
    return parsed ? ({ ...defaultPerms, ...parsed } as UserPermissions) : null;
  }, []);

  const lsGmCode = useMemo(() => {
    const code = localStorage.getItem("eg_admin_gm_code");
    return code && code.trim() !== "" ? code : "";
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadRole = async () => {
      try {
        setLoadingRole(true);

        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user?.id;

        if (!uid) {
          if (!mounted) return;
          setRole("CLIENT");
          setBranchLabel("");
          setPerms(defaultPerms);
          setGmCode("");
          setLoadingRole(false);
          return;
        }

        const { data: adminRow, error: adminErr } = await supabase
          .from("admins")
          .select("branch_id, mail, gm_code, is_super, permissions")
          .eq("user_id", uid)
          .maybeSingle();

        if (adminErr) {
          console.error(adminErr);
          if (!mounted) return;
          setRole("CLIENT");
          setBranchLabel("");
          setPerms(defaultPerms);
          setGmCode("");
          setLoadingRole(false);
          return;
        }

        if (!mounted) return;

        if (!adminRow) {
          setRole("CLIENT");
          setBranchLabel("");
          setPerms(defaultPerms);
          setGmCode("");
          setLoadingRole(false);
          return;
        }

        let computedRole: UserRole;
        if (adminRow.is_super) {
          computedRole = "ADMIN_GENERAL";
        } else if (adminRow.gm_code) {
          computedRole = "GM";
        } else {
          computedRole = "ADMIN";
        }

        setRole(computedRole);

        const mergedPerms: UserPermissions = {
          ...defaultPerms,
          ...(adminRow.permissions || {}),
        };
        setPerms(mergedPerms);

        const nextGmCode = adminRow.gm_code ? String(adminRow.gm_code) : "";
        setGmCode(nextGmCode);

        let nextBranchLabel = adminRow.branch_id ? `Sucursal #${adminRow.branch_id}` : "";
        let nextBranchName = "";

        if (adminRow.branch_id && !adminRow.is_super) {
          const { data: branchRow, error: branchErr } = await supabase
            .from("branches")
            .select("name")
            .eq("id", adminRow.branch_id)
            .maybeSingle();

          if (!branchErr && branchRow?.name) {
            nextBranchName = String(branchRow.name);
            nextBranchLabel = nextBranchName;
          }
        }

        if (!mounted) return;

        setBranchLabel(nextBranchLabel);

        localStorage.setItem("eg_admin_role", computedRole);
        localStorage.setItem("eg_admin_mail", adminRow.mail ?? "");
        localStorage.setItem("eg_admin_branch_id", String(adminRow.branch_id ?? ""));
        localStorage.setItem("eg_admin_branch_name", nextBranchName);
        localStorage.setItem("eg_admin_is_super", adminRow.is_super ? "true" : "false");
        localStorage.setItem("eg_admin_permissions", JSON.stringify(adminRow.permissions || {}));
        localStorage.setItem("eg_admin_gm_code", nextGmCode);
      } finally {
        if (mounted) setLoadingRole(false);
      }
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

  const roleToUse: UserRole = role ?? lsRole ?? demoSession.role ?? "CLIENT";
  const branchToUse = branchLabel || lsBranch || demoSession.branch;
  const permsToUse: UserPermissions = perms ?? lsPerms ?? defaultPerms;
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
  const isAdmin = roleToUse === "ADMIN_GENERAL" || roleToUse === "ADMIN";
  const isGM = roleToUse === "GM";

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

  const canAccessRooms =
    isGM || effectivePerms.canManageRooms || effectivePerms.canEditRankings;

  const canSeeNews = effectivePerms.canManageNews;
  const canSeeUsers = effectivePerms.canManageUsers;
  const canSeeUserProgress = !loadingRole && isAdmin;

  const logout = async () => {
    const keysToRemove = [
      "admin_demo_session",
      "eg_admin_role",
      "eg_admin_mail",
      "eg_admin_branch_id",
      "eg_admin_branch_name",
      "eg_admin_is_super",
      "eg_admin_permissions",
      "eg_admin_gm_code",
    ];

    const supabaseKeys = Object.keys(localStorage).filter((key) =>
      key.startsWith("sb-")
    );

    const allKeys = [...keysToRemove, ...supabaseKeys];

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });

      if (error && error.name !== "AuthSessionMissingError") {
        throw error;
      }
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    } finally {
      allKeys.forEach((key) => localStorage.removeItem(key));
      sessionStorage.clear();
      window.location.replace("/login");
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

          <button
            className="iconBtn drawerCloseBtn"
            onClick={onClose}
            aria-label="Cerrar menú"
            type="button"
          >
            ×
          </button>
        </div>

        <div className="drawerSection">
          <div className="drawerSectionTitle">Perfil</div>

          <div className="profileCard">
            <div className="avatarCircle">{(userName?.[0] || "A").toUpperCase()}</div>

            <div className="profileInfo">
              <div className="profileName">{userName}</div>
              <div className="profileRole">{roleLabel}</div>

              {roleToUse !== "CLIENT" && (
                <>
                  {!isSuper && (
                    <div className="profileBranch">
                      Sucursal: {branchToUse || "sin asignar"}
                    </div>
                  )}

                  <div className="profileGmCode">
                    <span style={{ opacity: 0.7 }}>Código GM:</span>{" "}
                    <b>{gmCodeToUse || "sin código"}</b>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="drawerSection">
          <div className="drawerSectionTitle">Secciones</div>

          <nav className="drawerNav">
            {canAccessRooms && (
              <NavLink
                to="/salas"
                onClick={onClose}
                className={({ isActive }) => (isActive ? "navItem active" : "navItem")}
              >
                Salas
              </NavLink>
            )}

            {canSeeNews && (
              <NavLink
                to="/novedades"
                onClick={onClose}
                className={({ isActive }) => (isActive ? "navItem active" : "navItem")}
              >
                Novedades
              </NavLink>
            )}

            {canSeeUsers && (
              <NavLink
                to="/usuarios"
                end
                onClick={onClose}
                className={({ isActive }) => (isActive ? "navItem active" : "navItem")}
              >
                Usuarios
              </NavLink>
            )}

            {canSeeUserProgress && (
              <NavLink
                to="/usuarios/progreso"
                onClick={onClose}
                className={({ isActive }) => (isActive ? "navItem active" : "navItem")}
              >
                Progreso de usuarios
              </NavLink>
            )}
          </nav>
        </div>

        <div className="drawerFooter">
          <button className="logoutBtn" onClick={logout} type="button">
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
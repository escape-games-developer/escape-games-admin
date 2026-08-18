import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminShell from "./AdminShell";
import type { NavItem } from "./AdminSidebar";
import type { Crumb } from "./AdminTopbar";

type UserRole = "CLIENT" | "GM" | "ADMIN" | "ADMIN_GENERAL";
type UserPermissions = {
  canManageRooms: boolean;
  canManageNews: boolean;
  canManageUsers: boolean;
  canEditRankings: boolean;
  canAwardKeys: boolean;
  canResetClientPassword: boolean;
};

const emptyPermissions: UserPermissions = {
  canManageRooms: false,
  canManageNews: false,
  canManageUsers: false,
  canEditRankings: false,
  canAwardKeys: false,
  canResetClientPassword: false,
};

function readRole(): UserRole {
  return (localStorage.getItem("eg_admin_role") as UserRole | null) ?? "CLIENT";
}

function readPermissions(): UserPermissions {
  try {
    return { ...emptyPermissions, ...JSON.parse(localStorage.getItem("eg_admin_permissions") || "{}") };
  } catch {
    return emptyPermissions;
  }
}

function roleLabel(role: UserRole): string {
  if (role === "ADMIN_GENERAL") return "Admin General";
  if (role === "ADMIN") return "Administrador";
  if (role === "GM") return "Game Master";
  return "Cliente";
}

const pageMeta: Record<string, { key: string; crumbs: Crumb[] }> = {
  "/salas": { key: "rooms", crumbs: [{ label: "Salas" }, { label: "Listado" }] },
  "/novedades": { key: "news", crumbs: [{ label: "Novedades" }, { label: "Listado" }] },
  "/usuarios": { key: "users", crumbs: [{ label: "Usuarios" }, { label: "Listado" }] },
  "/golden-tickets": { key: "tickets", crumbs: [{ label: "Golden Ticket" }, { label: "Solicitudes" }] },
  "/usuarios/progreso": { key: "progress", crumbs: [{ label: "Progreso" }, { label: "Usuarios" }] },
};

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [userName, setUserName] = useState("Administrador");
  const [role, setRole] = useState<UserRole>(readRole);
  const [permissions, setPermissions] = useState<UserPermissions>(readPermissions);

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/login", { replace: true });
        return;
      }

      const { data: adminRow } = await supabase
        .from("admins")
        .select("mail, branch_id, gm_code")
        .eq("user_id", data.session.user.id)
        .maybeSingle();

      if (!adminRow) {
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
        return;
      }

      if (mounted) {
        const metadata = data.session.user.user_metadata ?? {};
        const firstName = String(metadata.nombre ?? metadata.first_name ?? "").trim();
        const lastName = String(metadata.apellido ?? metadata.last_name ?? "").trim();
        const displayName = [firstName, lastName].filter(Boolean).join(" ");
        const gmCode = String(adminRow.gm_code || "").trim();
        if (gmCode) localStorage.setItem("eg_admin_gm_code", gmCode);
        else localStorage.removeItem("eg_admin_gm_code");
        setRole(readRole());
        setPermissions(readPermissions());
        setUserName(displayName || adminRow.mail || localStorage.getItem("eg_admin_mail") || "Administrador");
        setReady(true);
      }
    };

    void boot();
    const { data: sub } = supabase.auth.onAuthStateChange(() => void boot());
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  const items = useMemo<NavItem[]>(() => {
    const isSuper = role === "ADMIN_GENERAL";
    const isAdmin = isSuper || role === "ADMIN";
    const effective: UserPermissions = isSuper
      ? {
          canManageRooms: true,
          canManageNews: true,
          canManageUsers: true,
          canEditRankings: true,
          canAwardKeys: true,
          canResetClientPassword: true,
        }
      : permissions;
    const nav: NavItem[] = [];

    if (role === "GM" || effective.canManageRooms || effective.canEditRankings) {
      nav.push({ key: "rooms", label: "Salas", to: "/salas", icon: "rooms" });
    }
    if (effective.canManageNews) nav.push({ key: "news", label: "Novedades", to: "/novedades", icon: "news" });
    if (effective.canManageUsers) {
      nav.push({ key: "users", label: "Usuarios", to: "/usuarios", icon: "users" });
      nav.push({ key: "tickets", label: "Golden Ticket", to: "/golden-tickets", icon: "ticket" });
    }
    if (isAdmin) nav.push({ key: "progress", label: "Progreso usuarios", to: "/usuarios/progreso", icon: "progress" });
    return nav;
  }, [permissions, role]);

  const logout = async () => {
    const keysToRemove = [
      "admin_demo_session", "eg_admin_role", "eg_admin_mail", "eg_admin_branch_id",
      "eg_admin_branch_name", "eg_admin_is_super", "eg_admin_permissions", "eg_admin_gm_code",
    ];
    const supabaseKeys = Object.keys(localStorage).filter((key) => key.startsWith("sb-"));

    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error && error.name !== "AuthSessionMissingError") throw error;
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    } finally {
      [...keysToRemove, ...supabaseKeys].forEach((key) => localStorage.removeItem(key));
      sessionStorage.clear();
      window.location.replace("/login");
    }
  };

  if (!ready) return null;
  const meta = pageMeta[location.pathname] ?? { key: "", crumbs: [] };

  return (
    <AdminShell
      items={items}
      activeKey={meta.key}
      crumbs={meta.crumbs}
      userName={userName}
      userRole={roleLabel(role)}
      onLogout={logout}
    >
      <Outlet />
    </AdminShell>
  );
}

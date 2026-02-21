import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AdminLayout from "./layout/AdminLayout";

import Login from ".././pages/Login";
import Rooms from ".././pages/Rooms";
import News from ".././pages/News";
import Users from ".././pages/Users";
import Notifications from ".././pages/Notifications"; // ✅ NUEVO

type UserRole = "CLIENT" | "GM" | "ADMIN" | "ADMIN_GENERAL";

type UserPermissions = {
  canManageRooms: boolean;
  canManageNews: boolean;
  canManageUsers: boolean;
  canEditRankings: boolean;
  canAwardKeys: boolean;
  canResetClientPassword: boolean;
};

/** ✅ Fuente de verdad: lo que ya persistís desde DB en Drawer/Login */
function getRole(): UserRole {
  const r = localStorage.getItem("eg_admin_role") as UserRole | null;
  return r || "CLIENT";
}

function getPerms(): Partial<UserPermissions> {
  try {
    const raw = localStorage.getItem("eg_admin_permissions");
    return raw ? (JSON.parse(raw) as Partial<UserPermissions>) : {};
  } catch {
    return {};
  }
}

function isSuper(): boolean {
  return (
    localStorage.getItem("eg_admin_is_super") === "true" ||
    getRole() === "ADMIN_GENERAL"
  );
}

/** ✅ Guard por rol */
function RequireRole({
  allow,
  children,
}: {
  allow: UserRole[];
  children: React.ReactNode;
}) {
  const role = getRole();
  if (!allow.includes(role)) return <Navigate to="/salas" replace />;
  return <>{children}</>;
}

/** ✅ Guard por permiso (ADMIN_GENERAL siempre pasa) */
function RequirePerm({
  permKey,
  children,
}: {
  permKey: keyof UserPermissions;
  children: React.ReactNode;
}) {
  if (isSuper()) return <>{children}</>;

  const role = getRole();
  // solo staff puede tener permisos (GM/ADMIN). CLIENT no.
  if (role !== "GM" && role !== "ADMIN") return <Navigate to="/salas" replace />;

  const perms = getPerms();
  const ok = !!perms?.[permKey];
  if (!ok) return <Navigate to="/salas" replace />;

  return <>{children}</>;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<AdminLayout />}>
        <Route path="/" element={<Navigate to="/salas" replace />} />

        {/* ✅ GM puede ver salas (pero después filtrás por sucursal en Rooms) */}
        <Route
          path="/salas"
          element={
            <RequireRole allow={["ADMIN_GENERAL", "ADMIN", "GM"]}>
              <Rooms />
            </RequireRole>
          }
        />

        {/* ✅ Novedades:
            - ADMIN_GENERAL siempre
            - GM/ADMIN solo si canManageNews */}
        <Route
          path="/novedades"
          element={
            <RequirePerm permKey="canManageNews">
              <News />
            </RequirePerm>
          }
        />

        {/* ✅ Usuarios:
            - ADMIN_GENERAL siempre
            - GM/ADMIN solo si canManageUsers */}
        <Route
          path="/usuarios"
          element={
            <RequirePerm permKey="canManageUsers">
              <Users />
            </RequirePerm>
          }
        />

        {/* ✅ NUEVO: Notificaciones (SOLO ADMIN_GENERAL) */}
        <Route
          path="/notificaciones"
          element={
            <RequireRole allow={["ADMIN_GENERAL"]}>
              <Notifications />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/salas" replace />} />
    </Routes>
  );
}

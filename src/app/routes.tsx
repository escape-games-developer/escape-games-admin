import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AdminLayout from "./layout/AdminLayout";

import Login from ".././pages/Login";
import SetPassword from ".././pages/SetPassword";
import Rooms from ".././pages/Rooms";
import News from ".././pages/News";
import Users from ".././pages/Users";
import UserProgressPage from ".././pages/UserProgressPage";
import GoldenTicketAdmin from ".././pages/GoldenTicketAdmin";
import UiPreview from ".././pages/UiPreview";

type UserRole = "CLIENT" | "GM" | "ADMIN" | "ADMIN_GENERAL";

type UserPermissions = {
  canManageRooms: boolean;
  canManageNews: boolean;
  canManageUsers: boolean;
  canEditRankings: boolean;
  canAwardKeys: boolean;
  canResetClientPassword: boolean;
};

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

function RequirePerm({
  permKey,
  children,
}: {
  permKey: keyof UserPermissions;
  children: React.ReactNode;
}) {
  if (isSuper()) return <>{children}</>;

  const role = getRole();
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

      {/*
        Público a propósito: se entra con el link del invite de Supabase, que
        trae los tokens en el hash. No puede pasar por AdminLayout ni por los
        guards, porque todavía no hay nada en localStorage.
      */}
      <Route path="/set-password" element={<SetPassword />} />

      {/* Vitrina del sistema de UI (Etapa 1A del rediseño). Fuera de
          AdminLayout y sin guards: es solo presentación, no toca datos. */}
      <Route path="/_ui-preview" element={<UiPreview />} />

      <Route element={<AdminLayout />}>
        <Route path="/" element={<Navigate to="/salas" replace />} />

        <Route
          path="/salas"
          element={
            <RequireRole allow={["ADMIN_GENERAL", "ADMIN", "GM"]}>
              <Rooms />
            </RequireRole>
          }
        />

        <Route
          path="/novedades"
          element={
            <RequirePerm permKey="canManageNews">
              <News />
            </RequirePerm>
          }
        />

        <Route
          path="/usuarios"
          element={
            <RequirePerm permKey="canManageUsers">
              <Users />
            </RequirePerm>
          }
        />

        <Route
          path="/golden-tickets"
          element={
            <RequirePerm permKey="canManageUsers">
              <GoldenTicketAdmin />
            </RequirePerm>
          }
        />

        <Route
          path="/usuarios/progreso"
          element={
            <RequireRole allow={["ADMIN_GENERAL", "ADMIN"]}>
              <UserProgressPage />
            </RequireRole>
          }
        />

      </Route>

      <Route path="*" element={<Navigate to="/salas" replace />} />
    </Routes>
  );
}
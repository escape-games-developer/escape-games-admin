import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AdminLayout from "./layout/AdminLayout";

import Login from ".././pages/Login";
import Rooms from ".././pages/Rooms";
import News from ".././pages/News";
import Users from ".././pages/Users";

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

function getRole(): UserRole {
  const parsed = safeJsonParse<any>(localStorage.getItem(SESSION_KEY));
  return (parsed?.role as UserRole) || "ADMIN";
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

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<AdminLayout />}>
        <Route path="/" element={<Navigate to="/salas" replace />} />

        <Route path="/salas" element={<Rooms />} />

        <Route
          path="/novedades"
          element={
            <RequireRole allow={["ADMIN"]}>
              <News />
            </RequireRole>
          }
        />

        <Route
          path="/usuarios"
          element={
            <RequireRole allow={["ADMIN", "GM"]}>
              <Users />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/salas" replace />} />
    </Routes>
  );
}

import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AdminLayout from "./layout/AdminLayout";

import Login from ".././pages/Login";
import Rooms from ".././pages/Rooms";
import News from ".././pages/News";
import Users from ".././pages/Users";

type UserRole = "CLIENT" | "GM" | "ADMIN" | "ADMIN_GENERAL";

/** ✅ Fuente de verdad: lo que ya persistís desde DB en Drawer/Login */
function getRole(): UserRole {
  const r = localStorage.getItem("eg_admin_role") as UserRole | null;
  return r || "CLIENT";
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

        {/* ✅ GM puede ver salas (pero después filtramos por sucursal en Rooms) */}
        <Route
          path="/salas"
          element={
            <RequireRole allow={["ADMIN_GENERAL", "ADMIN", "GM"]}>
              <Rooms />
            </RequireRole>
          }
        />

        {/* ✅ SOLO ADMIN_GENERAL */}
        <Route
          path="/novedades"
          element={
            <RequireRole allow={["ADMIN_GENERAL"]}>
              <News />
            </RequireRole>
          }
        />

        {/* ✅ SOLO ADMIN_GENERAL */}
        <Route
          path="/usuarios"
          element={
            <RequireRole allow={["ADMIN_GENERAL"]}>
              <Users />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/salas" replace />} />
    </Routes>
  );
}

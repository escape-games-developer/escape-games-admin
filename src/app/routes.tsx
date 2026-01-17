import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AdminLayout from "./layout/AdminLayout";

import Login from ".././pages/Login";
import Rooms from ".././pages/Rooms";
import News from ".././pages/News";
import Users from ".././pages/Users";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<AdminLayout />}>
        <Route path="/" element={<Navigate to="/salas" replace />} />
        <Route path="/salas" element={<Rooms />} />
        <Route path="/novedades" element={<News />} />
        <Route path="/usuarios" element={<Users />} />
      </Route>

      <Route path="*" element={<Navigate to="/salas" replace />} />
    </Routes>
  );
}

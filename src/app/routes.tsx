import React from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import AdminLayout from "./layout/AdminLayout";

import Login from ".././pages/Login";
import SetPassword from ".././pages/SetPassword";
import Rooms from ".././pages/Rooms";
import News from ".././pages/News";
import Users from ".././pages/Users";
import UserProgressPage from ".././pages/UserProgressPage";
import GoldenTicketAdmin from ".././pages/GoldenTicketAdmin";
import Promotions from ".././pages/Promotions";
import UiPreview from ".././pages/UiPreview";
import IntranetPage from ".././pages/IntranetPage";
import CalendarPage from ".././pages/CalendarPage";
import ChatPage from ".././pages/ChatPage";
import SettingsPage from ".././pages/SettingsPage";
import RecontactosPage from ".././pages/RecontactosPage";
import type { MetricsSection } from ".././pages/metrics/MetricsPage";
import SectionGuard from ".././components/SectionGuard";

/**
 * Métricas se carga aparte. Es la única pantalla que usa Recharts, y esa
 * librería pesa más que varias secciones juntas: metida en el bundle principal
 * se la bancarían también los GM, que ni siquiera ven la sección. Mismo recurso
 * que ya usa Novedades con el selector de emojis.
 */
const MetricsPage = React.lazy(() => import(".././pages/metrics/MetricsPage"));

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

/**
 * Gate + límite de Suspense de Métricas, para no repetirlos en las cinco rutas.
 *
 * Dos capas, como el resto del panel:
 *   · RequireRole    → los tres perfiles del panel. Sigue frenando a CLIENT
 *                      y a cualquier rol que se agregue mañana.
 *   · SectionGuard   → la habilitación de Ajustes. Para ADMIN_GENERAL y ADMIN
 *                      siempre pasa; para GM manda el switch.
 *
 * GM entró a la lista de roles en esta versión: antes la ruta era solo para
 * perfiles administrativos, y sin ese cambio el switch de Ajustes no podría
 * darle acceso a nadie — quedaría un toggle que no hace nada.
 *
 * El Suspense va ADENTRO del guard a propósito: así un GM sin la sección
 * habilitada ni siquiera descarga el chunk de Métricas.
 */
function Metricas({ section }: { section: MetricsSection }) {
  return (
    <RequireRole allow={["ADMIN_GENERAL", "ADMIN", "GM"]}>
      <SectionGuard section="metrics">
        <React.Suspense fallback={<div className="eg-page-loading">Cargando métricas…</div>}>
          <MetricsPage section={section} />
        </React.Suspense>
      </SectionGuard>
    </RequireRole>
  );
}

/*
  404 real. Antes esto era <Navigate to="/salas" replace />, y eso hacía que una
  ruta faltante se viera exactamente igual que un rebote por permisos: si el
  bundle desplegado no traía /set-password, el invite terminaba en /salas (o en
  /login si no había sesión) sin ninguna pista de que la ruta no existía. Un
  404 explícito deja el problema a la vista en lugar de disfrazarlo.
*/
function NotFound() {
  const logged = !!localStorage.getItem("eg_admin_role");

  return (
    <div className="authWrap">
      <div className="authCard" style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 900, fontSize: 40, lineHeight: 1 }}>404</div>

        <div style={{ fontWeight: 700, fontSize: 16, marginTop: 8 }}>
          Esta página no existe
        </div>

        <div style={{ opacity: 0.8, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
          La ruta <code>{window.location.pathname}</code> no está registrada en el
          panel. Si llegaste desde un mail o un link reciente, avisale al equipo:
          puede ser una versión vieja publicada.
        </div>

        <Link
          to={logged ? "/salas" : "/login"}
          className="btnSmall"
          style={{ display: "inline-block", marginTop: 14, textDecoration: "none" }}
        >
          {logged ? "Volver al panel" : "Ir al login"}
        </Link>
      </div>
    </div>
  );
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

        {/*
          Dos capas por ruta, y las dos tienen que pasar:

            · RequireRole / RequirePerm → permisos de siempre, por usuario.
              No se tocan ni se debilitan.
            · SectionGuard             → habilitación de la sección para el
              rol, configurable desde Ajustes. Puede sacar acceso, nunca darlo.

          Esto es lo que hace que escribir la URL a mano tampoco funcione: no
          alcanza con esconder el ítem del sidebar.
        */}
        <Route
          path="/salas"
          element={
            <RequireRole allow={["ADMIN_GENERAL", "ADMIN", "GM"]}>
              <SectionGuard section="rooms">
                <Rooms />
              </SectionGuard>
            </RequireRole>
          }
        />

        <Route
          path="/novedades"
          element={
            <RequirePerm permKey="canManageNews">
              <SectionGuard section="news">
                <News />
              </SectionGuard>
            </RequirePerm>
          }
        />

        <Route
          path="/usuarios"
          element={
            <RequirePerm permKey="canManageUsers">
              <SectionGuard section="users">
                <Users />
              </SectionGuard>
            </RequirePerm>
          }
        />

        <Route
          path="/golden-tickets"
          element={
            <RequirePerm permKey="canManageUsers">
              <SectionGuard section="golden_ticket">
                <GoldenTicketAdmin />
              </SectionGuard>
            </RequirePerm>
          }
        />

        {/* Beneficios › Promociones. Etapa visual con datos mock: sin clave en
            admin_section_permissions todavía, así que el gate es solo el rol. */}
        <Route
          path="/beneficios/promociones"
          element={
            <RequireRole allow={["ADMIN_GENERAL", "ADMIN"]}>
              <Promotions />
            </RequireRole>
          }
        />

        {/*
          Métricas. Etapa visual con datos mock, igual que Promociones: no hay
          clave en `admin_section_permissions` todavía, así que el único gate
          es el rol. Cuando la sección se conecte al sistema de atribución hay
          que sumarle su `SectionGuard`, como el resto.

          `/metricas` sin subsección rebota a Resumen, que es la única que hoy
          muestra datos.
        */}
        <Route path="/metricas" element={<Navigate to="/metricas/resumen" replace />} />
        <Route path="/metricas/resumen" element={<Metricas section="resumen" />} />
        <Route path="/metricas/sucursales" element={<Metricas section="sucursales" />} />
        <Route path="/metricas/campanas" element={<Metricas section="campanas" />} />
        <Route path="/metricas/ventas" element={<Metricas section="ventas" />} />
        <Route path="/metricas/diagnostico" element={<Metricas section="diagnostico" />} />

        <Route
          path="/usuarios/progreso"
          element={
            <RequireRole allow={["ADMIN_GENERAL", "ADMIN"]}>
              <SectionGuard section="user_progress">
                <UserProgressPage />
              </SectionGuard>
            </RequireRole>
          }
        />

        <Route path="/admin/intranet/cotizador" element={<SectionGuard section="intranet_quote"><IntranetPage section="cotizador" /></SectionGuard>} />
        <Route path="/admin/intranet/mensajes" element={<SectionGuard section="intranet_messages"><IntranetPage section="mensajes" /></SectionGuard>} />
        <Route path="/admin/intranet/objeciones" element={<SectionGuard section="intranet_objections"><IntranetPage section="objeciones" /></SectionGuard>} />
        <Route path="/admin/intranet/respond-io" element={<SectionGuard section="intranet_respond_io"><IntranetPage section="respond-io" /></SectionGuard>} />
        <Route path="/admin/calendario" element={<SectionGuard section="calendar"><CalendarPage /></SectionGuard>} />
        <Route path="/admin/recontactos" element={<SectionGuard section="recontactos"><RecontactosPage /></SectionGuard>} />

        {/* Chat interno. Etapa de UI: no toca datos, así que su único gate es
            la habilitación de sección. */}
        <Route path="/chat" element={<SectionGuard section="chat"><ChatPage /></SectionGuard>} />

        {/* Ajustes: solo perfiles administrativos, ni GM ni CLIENT por URL.
            La RLS lo respalda del lado de la base, así que esconder la
            pantalla no es la defensa. */}
        <Route
          path="/ajustes"
          element={
            <RequireRole allow={["ADMIN_GENERAL", "ADMIN"]}>
              <SettingsPage />
            </RequireRole>
          }
        />

      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminShell from "./AdminShell";
import type { NavItem } from "./AdminSidebar";
import type { Crumb } from "./AdminTopbar";
import ChatProvider from "../../components/chat/ChatProvider";
import ChatFloatingManager from "../../components/chat/ChatFloatingManager";
import { getBranchSheets, getRecontactosConfig } from "../../services/recontactos/recontactosService";
import {
  SECTION_UNRESTRICTED_ROLES,
  cacheSectionPermissions,
  canAccessSection,
  fallbackSectionPermissions,
  fetchSectionPermissions,
  visibleChildren,
  type SectionPermissions,
} from "../../lib/sectionPermissions";
import {
  SectionPermissionsContext,
  buildSectionPermissionsStore,
} from "../../lib/sectionPermissionsStore";

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

function roleLabel(role: UserRole): string {
  // Etiquetas de presentación. El rol interno sigue siendo ADMIN_GENERAL y los
  // permisos no se tocan: esto es solo lo que se lee en pantalla.
  if (role === "ADMIN_GENERAL") return "Admin";
  if (role === "ADMIN") return "Administrador";
  if (role === "GM") return "Game Master";
  return "Cliente";
}

const pageMeta: Record<string, { key: string; crumbs: Crumb[] }> = {
  "/salas": { key: "rooms", crumbs: [{ label: "Salas" }, { label: "Listado" }] },
  "/novedades": { key: "news", crumbs: [{ label: "Novedades" }, { label: "Listado" }] },
  "/usuarios": { key: "users", crumbs: [{ label: "Usuarios" }, { label: "Listado" }] },
  "/golden-tickets": { key: "tickets", crumbs: [{ label: "Beneficios" }, { label: "Golden Ticket" }] },
  "/beneficios/promociones": { key: "promotions", crumbs: [{ label: "Beneficios" }, { label: "Promociones" }] },
  "/usuarios/progreso": { key: "progress", crumbs: [{ label: "Progreso" }, { label: "Usuarios" }] },
  "/metricas/resumen": { key: "metrics-resumen", crumbs: [{ label: "Métricas" }, { label: "Resumen" }] },
  "/metricas/sucursales": { key: "metrics-sucursales", crumbs: [{ label: "Métricas" }, { label: "Sucursales" }] },
  "/metricas/campanas": { key: "metrics-campanas", crumbs: [{ label: "Métricas" }, { label: "Campañas" }] },
  "/metricas/ventas": { key: "metrics-ventas", crumbs: [{ label: "Métricas" }, { label: "Ventas" }] },
  "/metricas/diagnostico": { key: "metrics-diagnostico", crumbs: [{ label: "Métricas" }, { label: "Diagnóstico" }] },
  "/admin/intranet/cotizador": { key: "intranet-cotizador", crumbs: [{ label: "Intranet" }, { label: "Cotizador" }] },
  "/admin/intranet/mensajes": { key: "intranet-mensajes", crumbs: [{ label: "Intranet" }, { label: "Mensajes" }] },
  "/admin/intranet/objeciones": { key: "intranet-objeciones", crumbs: [{ label: "Intranet" }, { label: "Menú de Objeciones" }] },
  "/admin/intranet/respond-io": { key: "intranet-respond-io", crumbs: [{ label: "Intranet" }, { label: "Instructivo Respond IO" }] },
  "/admin/calendario": { key: "calendar", crumbs: [{ label: "Calendario" }] },
  "/admin/recontactos": { key: "recontactos", crumbs: [{ label: "Recontactos" }, { label: "Cumpleaños" }] },
  "/chat": { key: "chat", crumbs: [{ label: "Chat interno" }, { label: "Conversaciones" }] },
  "/ajustes": { key: "settings", crumbs: [{ label: "Ajustes" }, { label: "Habilitación de secciones" }] },
};

/**
 * Puente entre la clave de sección (la que se configura en Ajustes y vive en
 * la base) y la clave de navegación que ya usaban `pageMeta` y `activeKey`.
 * Se mantiene el nombre viejo para no tocar el resaltado del sidebar.
 */
const navKeyPorSeccion: Partial<Record<string, string>> = {
  intranet_quote: "intranet-cotizador",
  intranet_messages: "intranet-mensajes",
  intranet_objections: "intranet-objeciones",
  intranet_respond_io: "intranet-respond-io",
};

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const bootVersion = useRef(0);
  /**
   * `useNavigate` devuelve una función NUEVA en cada cambio de ruta (depende de
   * `locationPathname` en react-router). Tenerla como dependencia del boot hacía
   * que navegar entre secciones volviera a correr todo el arranque —y con él
   * `setReady(false)`—, o sea: se desmontaba el panel entero y se veía el
   * spinner de "Preparando el panel…" en cada click del sidebar. Guardarla en un
   * ref deja el efecto corriendo una sola vez, al montar.
   */
  const navigateRef = useRef(navigate);
  /** Usuario ya booteado. Permite ignorar los eventos de auth que no cambian la sesión. */
  const bootedUserId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [userName, setUserName] = useState("Administrador");
  const [role, setRole] = useState<UserRole>("CLIENT");
  const [permissions, setPermissions] = useState<UserPermissions>(emptyPermissions);
  /** Habilitación de secciones del rol en sesión. Se lee una sola vez, acá. */
  const [sectionPermissions, setSectionPermissions] = useState<SectionPermissions>({});
  /** La lectura falló y se está usando caché o el mínimo conocido. */
  const [sectionsDegraded, setSectionsDegraded] = useState(false);
  const [recontactosEnabled, setRecontactosEnabled] = useState(false);
  const [recontactosBranchEnabled, setRecontactosBranchEnabled] = useState(false);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      const version = ++bootVersion.current;
      // Ojo: acá NO se baja `ready`. El panel arranca en false y, una vez
      // arriba, no se vuelve a desmontar: un re-boot refresca los datos en su
      // lugar. Bajarlo era lo que borraba modales y formularios abiertos.
      const { data } = await supabase.auth.getSession();
      if (!mounted || version !== bootVersion.current) return;
      if (!data.session) {
        navigateRef.current("/login", { replace: true });
        return;
      }
      bootedUserId.current = data.session.user.id;
      try {
        const recontactosConfig = await getRecontactosConfig();
        if (mounted && version === bootVersion.current) setRecontactosEnabled(recontactosConfig.enabled);
      } catch {
        if (mounted && version === bootVersion.current) setRecontactosEnabled(false);
      }

      const { data: adminRow } = await supabase
        .from("admins")
        .select("mail, branch_id, gm_code, is_super, permissions")
        .eq("user_id", data.session.user.id)
        .maybeSingle();

      if (!mounted || version !== bootVersion.current) return;

      if (!adminRow) {
        await supabase.auth.signOut();
        navigateRef.current("/login", { replace: true });
        return;
      }

      if (adminRow.is_super) setRecontactosBranchEnabled(true);
      else {
        try {
          const branchSheets = await getBranchSheets();
          const ownSheet = branchSheets.find((item) => item.branchId === String(adminRow.branch_id ?? ""));
          if (mounted && version === bootVersion.current) setRecontactosBranchEnabled(Boolean(ownSheet?.active && ownSheet.sheetId));
        } catch {
          if (mounted && version === bootVersion.current) setRecontactosBranchEnabled(false);
        }
      }

      if (mounted) {
        const nextRole: UserRole = adminRow.is_super
          ? "ADMIN_GENERAL"
          : adminRow.gm_code
            ? "GM"
            : "ADMIN";
        const nextPermissions: UserPermissions = {
          ...emptyPermissions,
          ...((adminRow.permissions as Partial<UserPermissions> | null) ?? {}),
        };
        const metadata = data.session.user.user_metadata ?? {};
        const firstName = String(metadata.nombre ?? metadata.first_name ?? "").trim();
        const lastName = String(metadata.apellido ?? metadata.last_name ?? "").trim();
        const displayName = [firstName, lastName].filter(Boolean).join(" ");
        const gmCode = String(adminRow.gm_code || "").trim();
        if (gmCode) localStorage.setItem("eg_admin_gm_code", gmCode);
        else localStorage.removeItem("eg_admin_gm_code");
        localStorage.setItem("eg_admin_role", nextRole);
        localStorage.setItem("eg_admin_mail", adminRow.mail ?? data.session.user.email ?? "");
        localStorage.setItem("eg_admin_branch_id", String(adminRow.branch_id ?? ""));
        localStorage.setItem("eg_admin_is_super", String(Boolean(adminRow.is_super)));
        localStorage.setItem("eg_admin_permissions", JSON.stringify(nextPermissions));
        setRole(nextRole);
        setPermissions(nextPermissions);
        setUserName(displayName || adminRow.mail || localStorage.getItem("eg_admin_mail") || "Administrador");

        /**
         * Habilitación de secciones: una única lectura por sesión, antes de
         * levantar el panel. Así el sidebar y las rutas ya nacen filtrados y
         * no se ve una sección aparecer y desaparecer.
         *
         * Solo se consulta para los roles que el filtro afecta (hoy GM): un
         * Admin General ve todo igual, no tiene sentido pedirlo.
         */
        if (!SECTION_UNRESTRICTED_ROLES.includes(nextRole)) {
          try {
            const secciones = await fetchSectionPermissions(nextRole);
            if (!mounted || version !== bootVersion.current) return;
            setSectionPermissions(secciones);
            setSectionsDegraded(false);
            cacheSectionPermissions(nextRole, secciones);
          } catch {
            // Sin servidor NO se abre todo: se usa la última configuración
            // conocida y, si no hay, el mínimo para poder cotizar.
            if (!mounted || version !== bootVersion.current) return;
            setSectionPermissions(fallbackSectionPermissions(nextRole));
            setSectionsDegraded(true);
          }
        } else {
          setSectionPermissions({});
          setSectionsDegraded(false);
        }

        setReady(true);
      }
    };

    void boot();

    /**
     * Supabase re-emite `SIGNED_IN` cada vez que la pestaña vuelve a estar
     * visible —GoTrueClient registra su propio listener de `visibilitychange` y
     * corre `_recoverAndRefresh()`— y `TOKEN_REFRESHED` cada vez que renueva el
     * token. Antes cualquiera de esos eventos volvía a disparar `boot()`, que
     * desmontaba el panel completo: por eso volver de otra pestaña de Chrome
     * cerraba el modal o el formulario que estuviera abierto.
     *
     * Acá se reacciona solo a lo que de verdad cambia la sesión.
     */
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      // Se emite al suscribirse con la sesión que ya está leyendo `boot()`.
      // No es un cambio: reaccionar duplicaría el arranque.
      if (event === "INITIAL_SESSION") return;

      if (event === "SIGNED_OUT") {
        bootedUserId.current = null;
        navigateRef.current("/login", { replace: true });
        return;
      }

      const userId = session?.user?.id ?? null;
      // Mismo usuario (refresh de token, vuelta de foco, update de metadata):
      // la sesión sigue siendo la misma, no hay nada que rearmar.
      if (!userId || userId === bootedUserId.current) return;

      // Usuario distinto: acá sí corresponde levantar el panel desde cero, para
      // no dejar a la vista los permisos del anterior.
      setReady(false);
      void boot();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const syncRecontactosConfig = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof detail?.enabled === "boolean") setRecontactosEnabled(detail.enabled);
    };
    window.addEventListener("eg:recontactos-config", syncRecontactosConfig);
    return () => window.removeEventListener("eg:recontactos-config", syncRecontactosConfig);
  }, []);

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

    /**
     * Habilitación de secciones. Se aplica ADEMÁS de los permisos por usuario
     * que ya existían: este switch puede sacar una sección, nunca darla.
     */
    const habilitada = (key: Parameters<typeof canAccessSection>[0]) =>
      canAccessSection(key, role, sectionPermissions);

    if ((role === "GM" || effective.canManageRooms || effective.canEditRankings) && habilitada("rooms")) {
      nav.push({ key: "rooms", label: "Salas", to: "/salas", icon: "rooms" });
    }
    if (effective.canManageNews && habilitada("news")) {
      nav.push({ key: "news", label: "Novedades", to: "/novedades", icon: "news" });
    }
    if (effective.canManageUsers && habilitada("users")) {
      nav.push({ key: "users", label: "Usuarios", to: "/usuarios", icon: "users" });
    }

    /**
     * Beneficios: grupo solo de navegación, sin clave propia en
     * `admin_section_permissions`. Golden Ticket conserva exactamente su regla
     * de siempre (canManageUsers + sección golden_ticket). Promociones es UI
     * mock y se muestra solo a perfiles administrativos, sin depender de la
     * habilitación de secciones.
     */
    const hijasBeneficios: NonNullable<NavItem["children"]> = [];
    if (effective.canManageUsers && habilitada("golden_ticket")) {
      hijasBeneficios.push({ key: "tickets", label: "Golden Ticket", to: "/golden-tickets" });
    }
    if (isAdmin) {
      hijasBeneficios.push({ key: "promotions", label: "Promociones", to: "/beneficios/promociones" });
    }
    if (hijasBeneficios.length > 0) {
      nav.push({
        key: "beneficios",
        label: "Beneficios",
        to: hijasBeneficios[0].to,
        icon: "ticket",
        children: hijasBeneficios,
      });
    }
    if (isAdmin && habilitada("user_progress")) {
      nav.push({ key: "progress", label: "Progreso usuarios", to: "/usuarios/progreso", icon: "progress" });
    }

    /**
     * Métricas: grupo de navegación con su propia clave de sección. El switch
     * de Ajustes decide si un GM la ve; para los perfiles administrativos
     * `habilitada()` siempre da true, así que a ellos no los toca.
     */
    if (habilitada("metrics")) {
      nav.push({
        key: "metrics",
        label: "Métricas",
        to: "/metricas/resumen",
        icon: "metrics",
        children: [
          { key: "metrics-resumen", label: "Resumen", to: "/metricas/resumen" },
          { key: "metrics-sucursales", label: "Sucursales", to: "/metricas/sucursales" },
          { key: "metrics-campanas", label: "Campañas", to: "/metricas/campanas" },
          { key: "metrics-ventas", label: "Ventas", to: "/metricas/ventas" },
          { key: "metrics-diagnostico", label: "Diagnóstico", to: "/metricas/diagnostico" },
        ],
      });
    }

    // Intranet: el grupo se arma con las subsecciones habilitadas. Si el padre
    // está apagado `visibleChildren` devuelve vacío, y si no queda ninguna hija
    // tampoco se dibuja el grupo: nada de desplegables vacíos.
    const hijasIntranet = visibleChildren("intranet", role, sectionPermissions);
    if (hijasIntranet.length > 0) {
      nav.push({
        key: "intranet",
        label: "Intranet",
        to: hijasIntranet[0].path ?? "/admin/intranet/cotizador",
        icon: "intranet",
        children: hijasIntranet.map((hija) => ({
          key: navKeyPorSeccion[hija.key] ?? hija.key,
          label: hija.label,
          to: hija.path ?? "/admin/intranet/cotizador",
        })),
      });
    }

    if (habilitada("calendar")) {
      nav.push({ key: "calendar", label: "Calendario", to: "/admin/calendario", icon: "calendar" });
    }
    if ((isSuper || (recontactosEnabled && recontactosBranchEnabled)) && habilitada("recontactos")) {
      nav.push({ key: "recontactos", label: "Recontactos", to: "/admin/recontactos", icon: "recontactos" });
    }
    if (habilitada("chat")) {
      nav.push({ key: "chat", label: "Chat interno", to: "/chat", icon: "chat" });
    }
    return nav;
  }, [permissions, role, sectionPermissions, recontactosEnabled, recontactosBranchEnabled]);

  /** Valor del contexto. `ready` es el mismo gate que ya frenaba el panel. */
  const sectionStore = useMemo(
    () => buildSectionPermissionsStore(role, sectionPermissions, !ready, sectionsDegraded),
    [role, sectionPermissions, ready, sectionsDegraded]
  );

  const logout = async () => {
    const keysToRemove = [
      "admin_demo_session", "eg_admin_role", "eg_admin_mail", "eg_admin_branch_id",
      "eg_admin_branch_name", "eg_admin_is_super", "eg_admin_permissions", "eg_admin_gm_code",
      // Borrador del cotizador: sobrevive a navegar y recargar, pero no a un
      // cambio de usuario en la misma máquina.
      "eg_cotizador_borrador_v1",
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

  if (!ready) {
    return (
      <div className="eg-admin-boot" role="status" aria-live="polite">
        <span className="eg-admin-boot__spinner" aria-hidden="true" />
        <span>Preparando el panel…</span>
      </div>
    );
  }
  const meta = pageMeta[location.pathname] ?? { key: "", crumbs: [] };

  /**
   * Un solo interruptor para todo el Chat interno: la sección `chat`.
   *
   * Con `chat = false` directamente no se monta `ChatProvider`, y eso apaga de
   * una todos los accesos globales sin tocar nada de la lógica del chat:
   *   · el globo del header y su contador (ChatTopbarButton se dibuja solo si
   *     encuentra el provider arriba);
   *   · las ventanas flotantes y las minimizadas (ChatFloatingManager);
   *   · el ítem del sidebar (ya filtrado más arriba) y la ruta /chat (guard).
   *
   * Ojo: `intranet_messages` es otra cosa — controla Intranet › Mensajes y no
   * tiene nada que ver con este globo.
   */
  const chatHabilitado = canAccessSection("chat", role, sectionPermissions);

  const panel = (
    <>
      <AdminShell
        items={items}
        activeKey={meta.key}
        crumbs={meta.crumbs}
        userName={userName}
        userRole={roleLabel(role)}
        settingsTo={role === "ADMIN_GENERAL" || role === "ADMIN" ? "/ajustes" : undefined}
        onLogout={logout}
      >
        <Outlet />
      </AdminShell>

      {chatHabilitado && <ChatFloatingManager />}
    </>
  );

  return (
    // La habilitación de secciones envuelve todo: el guard de rutas y Ajustes
    // la leen de acá, sin volver a consultar Supabase.
    <SectionPermissionsContext.Provider value={sectionStore}>
      {/* El chat envuelve al shell para que las ventanas flotantes sobrevivan
          al cambio de ruta: el estado vive acá arriba, no en la página. */}
      {chatHabilitado ? <ChatProvider>{panel}</ChatProvider> : panel}
    </SectionPermissionsContext.Provider>
  );
}

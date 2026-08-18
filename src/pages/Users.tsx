import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

import GoldenTicketReviewModal from "../components/GoldenTicketReviewModal";
import { ToastStack, useToasts } from "../components/Toast";
import {
  ActionMenu,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Icon as UiIcon,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  Toggle,
  type DataTableColumn,
} from "../ui";
import { fetchAppConfig, setRatingUploadEnabled } from "../lib/appConfig";
import {
  describeGoldenTicketSource,
  fetchGoldenTicketInfo,
  formatDateDDMMYYYY,
  normalizeGoldenTicketSource,
  revokeGoldenTicket,
  type GoldenTicketInfo,
  type GoldenTicketSource,
  type PendingRequest,
} from "../lib/goldenTickets";

/** ✅ mismas sucursales que Rooms */
const BRANCHES = [
  "Nuñez",
  "San Telmo",
  "Saavedra",
  "Caballito",
  "Palermo",
  "Almagro",
  "Urquiza",
  "Studios",
  "La Plata",
  "Bariloche",
  "Salta",
] as const;

type Branch = (typeof BRANCHES)[number];
type UserRole = "CLIENT" | "GM" | "ADMIN_GENERAL";

type UserPermissions = {
  canManageRooms: boolean;
  canManageNews: boolean;
  canManageUsers: boolean;
  canEditRankings: boolean;
  canAwardKeys: boolean;
  canResetClientPassword: boolean;
};

type User = {
  id: string;
  firstName: string;
  lastName: string;
  alias: string;
  email: string;
  avatarUrl?: string;
  role: UserRole;
  branch: Branch | "";
  active: boolean;
  permissions: UserPermissions;
  goldenActive: boolean;
  goldenSource: GoldenTicketSource;
  _isStaff: boolean;
};

/**
 * Espejo exacto de defaultPermissionsForRole() de la Edge Function create-user.
 * Si esto se desincroniza, la UI miente sobre lo que el server guardó.
 */
const defaultPermsForRole = (role: UserRole): UserPermissions =>
  role === "ADMIN_GENERAL"
    ? {
        canManageRooms: true,
        canManageNews: true,
        canManageUsers: true,
        canEditRankings: true,
        canAwardKeys: true,
        canResetClientPassword: true,
      }
    : {
        canManageRooms: false,
        canManageNews: false,
        canManageUsers: false,
        canEditRankings: false,
        canAwardKeys: role === "GM",
        canResetClientPassword: false,
      };

/** Permisos que un GM no puede tener nunca. */
const ADMIN_ONLY_PERMS = [
  "canManageRooms",
  "canManageNews",
  "canManageUsers",
  "canResetClientPassword",
] as const;

/** Red de seguridad: venga de donde venga el objeto, se normaliza al rol. */
const sanitizePermsForRole = (role: UserRole, p: UserPermissions): UserPermissions => {
  if (role === "ADMIN_GENERAL") return defaultPermsForRole("ADMIN_GENERAL");

  const out: UserPermissions = { ...p, canAwardKeys: role === "GM" };
  for (const k of ADMIN_ONLY_PERMS) out[k] = false;
  return out;
};

const isStaffRole = (r: UserRole) => r === "GM" || r === "ADMIN_GENERAL";

function safeRole(v: any): UserRole {
  return v === "CLIENT" || v === "GM" || v === "ADMIN_GENERAL" ? v : "CLIENT";
}
function genGmCode(len = 10) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function humanizeEdgeError(err: any) {
  const raw = String(err?.message || err || "");
  const msg = raw.toLowerCase();

  if (msg.includes("failed to fetch")) return "No pude contactar la Edge Function. Revisá deploy / CORS / red.";
  if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("invalid jwt")) {
    return "No autorizado (401). Token inválido para la Edge Function.";
  }
  if (msg.includes("403")) return "Forbidden (403). Tu usuario no es Admin General.";
  if (msg.includes("409")) return "Ese mail ya existe (409).";
  return raw || "Error inesperado.";
}

function newUserTemplate(): User {
  return {
    id: crypto.randomUUID(),
    firstName: "",
    lastName: "",
    alias: "",
    email: "",
    avatarUrl: "",
    role: "CLIENT",
    branch: "",
    active: true,
    permissions: defaultPermsForRole("CLIENT"),
    goldenActive: false,
    goldenSource: null,
    _isStaff: false,
  };
}

/* ===== ICONOS SVG ===== */

function EyeOpenIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function EyeClosedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M2 12s4-7.5 10-7.5c2.2 0 4.1.7 5.7 1.7M22 12s-1.5 2.8-4.2 4.9C15.9 18.6 14 19.5 12 19.5c-6.5 0-10-7.5-10-7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** ===== Modal base ===== */
function ModalShell({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal open={open} title={title} description={description} size="md" onClose={onClose} panelClassName="eg-users-modal">
      {children}
    </Modal>
  );
}

/** ✅ Modal crear */
function CreateUserModal({
  open,
  initialUser,
  canManageUsers,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  initialUser: User | null;
  canManageUsers: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (u: User) => void;
}) {
  const [draft, setDraft] = useState<User | null>(null);

  useEffect(() => {
    if (open && initialUser) setDraft({ ...initialUser });
    if (!open) setDraft(null);
  }, [open, initialUser]);

  const patch = (p: Partial<User>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next: User = { ...prev, ...p };

      if (next.role === "CLIENT") {
        next.branch = "";
        next._isStaff = false;
      } else {
        next._isStaff = true;
        if (next.role === "GM" && !next.branch) next.branch = "Nuñez";
        if (next.role === "ADMIN_GENERAL") next.branch = "";
      }

      return next;
    });
  };

  return <Modal
    open={open}
    title="Nuevo usuario"
    description="Creá un usuario y configurá su acceso al sistema."
    size="lg"
    panelClassName="eg-users-modal eg-users-create-modal"
    onClose={onClose}
    footer={draft ? <><Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button><Button variant="primary" loading={busy} onClick={() => { if (!canManageUsers) return alert("No autorizado."); onSave(draft); }}>Crear usuario</Button></> : undefined}
  >
    {draft && <div className="eg-users-form">
      <section className="eg-users-form__section">
        <div className="eg-users-form__heading"><strong>Información personal</strong><span>Datos básicos de identificación</span></div>
        <div className="eg-users-form__grid">
          <Input id="user-first-name" label="Nombre" value={draft.firstName} onChange={(event) => patch({ firstName: event.target.value })} placeholder="Nombre" autoFocus spellCheck={false} />
          <Input id="user-last-name" label="Apellido" value={draft.lastName} onChange={(event) => patch({ lastName: event.target.value })} placeholder="Apellido" spellCheck={false} />
          <Input id="user-email" className="eg-users-form__wide" label="Mail" type="email" value={draft.email} onChange={(event) => patch({ email: event.target.value })} placeholder="mail@dominio.com" spellCheck={false} />
          {draft.role === "CLIENT" && <Input id="user-alias" label="Alias" value={draft.alias} onChange={(event) => patch({ alias: event.target.value })} placeholder="Alias del cliente" spellCheck={false} />}
        </div>
      </section>
      <section className="eg-users-form__section">
        <div className="eg-users-form__heading"><strong>Acceso</strong><span>Rol y alcance administrativo</span></div>
        <div className="eg-users-form__grid">
          <Select id="user-role" label="Rol" value={draft.role} onChange={(event) => patch({ role: safeRole(event.target.value) })}>
            <option value="CLIENT">Cliente</option><option value="GM">Game Master</option><option value="ADMIN_GENERAL">Admin General</option>
          </Select>
          {draft.role === "GM" && <Select id="user-branch" label="Sucursal" value={draft.branch} onChange={(event) => patch({ branch: event.target.value as Branch })}>{BRANCHES.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</Select>}
          <Card padding="sm" className="eg-users-form__note">
            {draft.role === "CLIENT" ? "Se generará una contraseña temporal y se mostrará una única vez al finalizar." : <>Se enviará una invitación a <strong>{draft.email || "el mail indicado"}</strong> para configurar la contraseña.</>}
          </Card>
          {draft.role === "GM" && <Card padding="sm" className="eg-users-form__note">El Game Master se crea con los permisos predeterminados del rol. Los permisos exclusivos de Admin General permanecen bloqueados.</Card>}
        </div>
      </section>
    </div>}
  </Modal>;
}

export default function Users() {
  const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

  /* Base del link que viaja en el mail de invitación.
     window.location.origin alcanza en producción (es la URL que el admin tiene
     abierta). VITE_ADMIN_URL es el escape para cuando ese origin NO sirve como
     destino público: dev en localhost o un preview deploy, donde Supabase
     descarta el redirect_to por no estar en su allow-list y manda al Site URL. */
  const ADMIN_URL =
    (import.meta.env.VITE_ADMIN_URL as string | undefined)?.trim().replace(/\/+$/, "") ||
    window.location.origin;

  const [, setMyRole] = useState<UserRole | "">("");

  const canManageUsers = useMemo(() => {
    const superFlag =
      localStorage.getItem("eg_admin_is_super") === "true" ||
      localStorage.getItem("eg_admin_role") === "ADMIN_GENERAL";

    if (superFlag) return true;

    try {
      const raw = localStorage.getItem("eg_admin_permissions");
      const parsed = raw ? JSON.parse(raw) : {};
      return !!parsed?.canManageUsers;
    } catch {
      return false;
    }
  }, []);

  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [branchFilter, setBranchFilter] = useState<Branch | "">("");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState<User | null>(null);

  const [permModal, setPermModal] = useState<{ open: boolean; user: User | null }>({
    open: false,
    user: null,
  });
  const [resetModal, setResetModal] = useState<{ open: boolean; user: User | null }>({
    open: false,
    user: null,
  });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; user: User | null }>({
    open: false,
    user: null,
  });

  /** Sólo para altas con contraseña temporal (Cliente). Los GM/Admin van por invite. */
  const [tempPassModal, setTempPassModal] = useState<{
    open: boolean;
    mail: string;
    tempPassword: string | null;
    existed: boolean;
  }>({ open: false, mail: "", tempPassword: null, existed: false });

  const closeTempPass = () =>
    setTempPassModal({ open: false, mail: "", tempPassword: null, existed: false });

  /* ---------- Golden Ticket ---------- */

  const { toasts, toast, dismiss } = useToasts();

  const [goldenModal, setGoldenModal] = useState<{ open: boolean; user: User | null }>({
    open: false,
    user: null,
  });
  const [goldenInfo, setGoldenInfo] = useState<GoldenTicketInfo | null>(null);
  const [goldenLoading, setGoldenLoading] = useState(false);
  const [goldenErr, setGoldenErr] = useState("");
  const [goldenBusy, setGoldenBusy] = useState(false);
  const [goldenConfirmRevoke, setGoldenConfirmRevoke] = useState(false);
  const [reviewRequest, setReviewRequest] = useState<PendingRequest | null>(null);

  const [resetPass1, setResetPass1] = useState("");
  const [resetPass2, setResetPass2] = useState("");
  const [showResetPass1, setShowResetPass1] = useState(false);
  const [showResetPass2, setShowResetPass2] = useState(false);

  const [busy, setBusy] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  /** Kill switch del FAB del clip en la app cliente (app_config.rating_upload_enabled). */
  const [ratingUpload, setRatingUpload] = useState(true);
  const [ratingLoading, setRatingLoading] = useState(true);
  const [ratingSaving, setRatingSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const cfg = await fetchAppConfig();
        if (mounted) setRatingUpload(cfg.ratingUploadEnabled);
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setRatingLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const toggleRatingUpload = async () => {
    if (ratingSaving || ratingLoading) return;

    const next = !ratingUpload;
    setRatingSaving(true);

    try {
      const applied = await setRatingUploadEnabled(next);
      setRatingUpload(applied);

      toast(
        "success",
        applied ? "Subida de capturas activada" : "Subida de capturas desactivada"
      );
    } catch (err: any) {
      console.error(err);
      toast("error", err?.message || "No pude cambiar la configuración.");
    } finally {
      setRatingSaving(false);
    }
  };

  useEffect(() => {
    document.body.classList.add("users-fullwidth");
    return () => document.body.classList.remove("users-fullwidth");
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;

        if (!uid) {
          if (mounted) setMyRole("");
          return;
        }

        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();

        if (!pErr && prof?.role) {
          if (mounted) setMyRole(safeRole(prof.role));
          return;
        }

        const { data: me } = await supabase
          .from("admins")
          .select("is_super")
          .eq("user_id", uid)
          .maybeSingle();

        if (!me) {
          if (mounted) setMyRole("CLIENT");
          return;
        }

        if (mounted) setMyRole(me.is_super ? "ADMIN_GENERAL" : "GM");
      } catch {
        if (mounted) setMyRole("");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: profs, error: e1 } = await supabase
        .from("profiles")
        .select(
          "id,nombre,apellido,alias,mail,role,is_active,created_at,photo_url,golden_ticket_active,golden_ticket_source"
        )
        .order("created_at", { ascending: false });
      if (e1) throw e1;

      const { data: ads, error: e2 } = await supabase
        .from("admins")
        .select("user_id,mail,branch_id,gm_code,is_super,permissions,created_at")
        .order("created_at", { ascending: false });
      if (e2) throw e2;

      const { data: brs, error: e3 } = await supabase.from("branches").select("id,name,active");
      if (e3) throw e3;

      const branchById = new Map<string, string>();
      (brs ?? []).forEach((b: any) => {
        if (b?.id && b?.name) branchById.set(String(b.id), String(b.name));
      });

      const profilesById = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const adminsById = new Map((ads ?? []).map((a: any) => [a.user_id, a]));

      const mappedStaff: User[] = (ads ?? []).map((a: any) => {
        const p = profilesById.get(a.user_id);
        const role: UserRole = a.is_super ? "ADMIN_GENERAL" : "GM";
        const branchName = role === "GM" ? branchById.get(String(a.branch_id || "")) || "" : "";

        return {
          id: a.user_id,
          firstName: p?.nombre || "",
          lastName: p?.apellido || "",
          alias: "",
          email: a.mail || p?.mail || "",
          avatarUrl: p?.photo_url || "",
          role,
          branch: (branchName as Branch) || "",
          active: p?.is_active ?? true,
          permissions: { ...defaultPermsForRole(role), ...(a.permissions || {}) },
          goldenActive: p?.golden_ticket_active === true,
          goldenSource: normalizeGoldenTicketSource(p?.golden_ticket_source),
          _isStaff: true,
        };
      });

      const mappedClients: User[] = (profs ?? [])
        .filter((p: any) => !adminsById.has(p.id))
        .map((p: any) => ({
          id: p.id,
          firstName: p?.nombre || "",
          lastName: p?.apellido || "",
          alias: p?.alias || "",
          email: p?.mail || "",
          avatarUrl: p?.photo_url || "",
          role: "CLIENT" as UserRole,
          branch: "",
          active: p?.is_active ?? true,
          permissions: defaultPermsForRole("CLIENT"),
          goldenActive: p?.golden_ticket_active === true,
          goldenSource: normalizeGoldenTicketSource(p?.golden_ticket_source),
          _isStaff: false,
        }));

      setItems([...mappedStaff, ...mappedClients]);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No pude cargar usuarios. Revisá RLS / policies.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeMenu = () => {
    setMenuOpenId(null);
  };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuOpenId) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;

      const insideBtn = t.closest?.('[data-menu-btn="1"]');
      const insidePopup = t.closest?.('[data-menu-popup="1"]');
      if (insideBtn || insidePopup) return;

      closeMenu();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
        setCreateModalOpen(false);
        setPermModal({ open: false, user: null });
        setResetModal({ open: false, user: null });
        setDeleteModal({ open: false, user: null });
        closeTempPass();
      }
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpenId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((u) => {
      const full = `${u.firstName} ${u.lastName} ${u.email} ${u.alias}`.toLowerCase();
      const okSearch = !s ? true : full.includes(s);
      const okRole = !roleFilter ? true : u.role === roleFilter;
      const okBranch = !branchFilter ? true : u.branch === branchFilter;
      return okSearch && okRole && okBranch;
    });
  }, [items, q, roleFilter, branchFilter]);

  const totals = useMemo(() => {
    const totalUsers = filtered.length;
    const activeUsers = filtered.filter((u) => u.active).length;
    const gmCount = filtered.filter((u) => u.role === "GM").length;
    const adminGeneralCount = filtered.filter((u) => u.role === "ADMIN_GENERAL").length;

    return {
      totalUsers,
      activeUsers,
      gmCount,
      adminGeneralCount,
    };
  }, [filtered]);

  const getValidAccessToken = async (): Promise<string> => {
    const { data: s1, error: e1 } = await supabase.auth.getSession();
    if (e1) console.warn("getSession error:", e1);

    let session = s1.session;
    if (!session) throw new Error("Unauthorized (sin sesión).");

    const expiresAt = (session.expires_at ?? 0) * 1000;
    const now = Date.now();
    const leeway = 60_000;

    if (expiresAt && now > expiresAt - leeway) {
      const { data: s2, error: e2 } = await supabase.auth.refreshSession();
      if (e2) throw e2;
      if (!s2.session?.access_token) throw new Error("No pude refrescar sesión.");
      session = s2.session;
    }

    if (!session.access_token) throw new Error("Unauthorized (sin token).");
    return session.access_token;
  };

  const invokeEdge = async <T,>(fnName: string, body: any): Promise<T> => {
    if (!SUPABASE_URL || !ANON_KEY) {
      throw new Error("Faltan envs: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
    }

    const token = await getValidAccessToken();

    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
    });

    const text = await res.text();

    if (!res.ok) {
      try {
        const j = JSON.parse(text);
        throw new Error(j?.message || j?.error || text || `HTTP ${res.status}`);
      } catch {
        throw new Error(text || `HTTP ${res.status}`);
      }
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  };

  const startCreate = () => {
    closeMenu();
    setCreateInitial(newUserTemplate());
    setCreateModalOpen(true);
  };

  const createSave = async (u: User) => {
    if (!canManageUsers) return alert("No autorizado.");

    if (!u.firstName.trim()) return alert("Falta el nombre.");
    if (!u.lastName.trim()) return alert("Falta el apellido.");
    if (!u.email.trim()) return alert("Falta el mail.");
    if (u.role === "CLIENT" && !u.alias.trim()) return alert("Para Cliente, falta el alias.");
    if (u.role === "GM" && !u.branch) return alert("Para GM, elegí sucursal.");

    const staff = isStaffRole(u.role);

    setBusy(true);
    try {
      const body: any = {
        nombre: u.firstName.trim(),
        apellido: u.lastName.trim(),
        mail: u.email.trim(),
        role: u.role,
      };

      if (u.role === "CLIENT") body.alias = u.alias.trim();
      if (u.role === "GM") body.branch_id = String(u.branch || "Nuñez");

      if (staff) {
        // GM / Admin General: invitación por mail, sin contraseña temporal.
        // Nunca mandamos `permissions`: manda defaultPermissionsForRole() del server.
        body.send_invite = true;
        body.redirect_to = `${ADMIN_URL}/set-password`;
      } else {
        // Cliente: se mantiene el alta con contraseña temporal.
        body.send_invite = false;
      }

      type CreateUserResp = {
        mail?: string;
        tempPassword?: string | null;
        userId?: string;
        existed?: boolean;
        method?: "invite" | "password";
        permissions?: Record<string, boolean> | null;
      };

      const data = await invokeEdge<CreateUserResp>("create-user", body);

      setCreateModalOpen(false);
      setCreateInitial(null);

      await fetchUsers();

      const mail = data?.mail ?? u.email.trim();
      const method = data?.method ?? (staff ? "invite" : "password");

      if (method === "invite") {
        toast(
          "success",
          `Invitación enviada a ${mail}. El usuario recibirá un email para configurar su contraseña.`,
          8000
        );
        return;
      }

      setTempPassModal({
        open: true,
        mail,
        tempPassword: data?.tempPassword ?? null,
        existed: !!data?.existed,
      });
    } catch (err: any) {
      console.error(err);
      toast("error", humanizeEdgeError(err), 8000);
    } finally {
      setBusy(false);
    }
  };

  const openReset = (u: User) => {
    closeMenu();
    setResetPass1("");
    setResetPass2("");
    setShowResetPass1(false);
    setShowResetPass2(false);
    setResetModal({ open: true, user: { ...u } });
  };

  const openDelete = (u: User) => {
    closeMenu();
    setDeleteModal({ open: true, user: { ...u } });
  };

  /* ---------- Golden Ticket ---------- */

  const loadGoldenInfo = async (userId: string) => {
    setGoldenLoading(true);
    setGoldenErr("");

    try {
      const info = await fetchGoldenTicketInfo(userId);
      setGoldenInfo(info);
    } catch (err: any) {
      console.error(err);
      setGoldenErr(err?.message || "No pude leer el Golden Ticket.");
      setGoldenInfo(null);
    } finally {
      setGoldenLoading(false);
    }
  };

  const openGolden = (u: User) => {
    closeMenu();
    setGoldenInfo(null);
    setGoldenErr("");
    setGoldenConfirmRevoke(false);
    setGoldenModal({ open: true, user: { ...u } });
    loadGoldenInfo(u.id);
  };

  const closeGolden = () => {
    setGoldenModal({ open: false, user: null });
    setGoldenInfo(null);
    setGoldenErr("");
    setGoldenConfirmRevoke(false);
  };

  const doRevokeGolden = async () => {
    const u = goldenModal.user;
    if (!u || goldenBusy) return;

    setGoldenBusy(true);

    try {
      await revokeGoldenTicket(u.id);
      toast("success", "Golden Ticket deshabilitado");
      setGoldenConfirmRevoke(false);
      await loadGoldenInfo(u.id);
    } catch (err: any) {
      console.error(err);
      toast("error", err?.message || "No pude deshabilitar el Golden Ticket.");
    } finally {
      setGoldenBusy(false);
    }
  };

  /** Abre el viewer de la Tarea 2 reusando los datos ya cargados. */
  const openPendingReview = () => {
    const u = goldenModal.user;
    if (!u || !goldenInfo) return;

    setReviewRequest({
      id: u.id,
      alias: u.alias || null,
      nombre: u.firstName || null,
      apellido: u.lastName || null,
      mail: u.email || null,
      photo_url: u.avatarUrl || null,
      rating_screenshot_url: goldenInfo.screenshotUrl,
      rating_screenshot_uploaded_at: goldenInfo.screenshotUploadedAt,
    });
  };

  const patchPerm = (key: keyof UserPermissions, value: boolean) => {
    setPermModal((prev) => {
      if (!prev.user) return prev;
      return {
        open: true,
        user: { ...prev.user, permissions: { ...prev.user.permissions, [key]: value } },
      };
    });
  };

  const savePerms = async () => {
    const u = permModal.user;
    if (!u) return;

    if (!canManageUsers) return alert("No autorizado.");
    if (!u._isStaff) return alert("Permisos solo aplican a GM/Admin General (tabla admins).");

    const permsToSave: UserPermissions = sanitizePermsForRole(u.role, u.permissions);

    setBusy(true);
    try {
      const { error } = await supabase.from("admins").update({ permissions: permsToSave }).eq("user_id", u.id);
      if (error) throw error;

      setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, permissions: permsToSave } : x)));
      setPermModal({ open: false, user: null });
      alert("Permisos guardados.");
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No pude guardar permisos (RLS/policies).");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    const u = resetModal.user;
    if (!u) return;

    if (!canManageUsers) return alert("No autorizado.");

    if (resetPass1.length < 6) return alert("La contraseña debe tener mínimo 6 caracteres.");
    if (resetPass1 !== resetPass2) return alert("Las contraseñas no coinciden.");

    setBusy(true);
    try {
      await invokeEdge<{ ok?: boolean }>("reset-user-password", {
        user_id: u.id,
        new_password: resetPass1,
      });
      setResetModal({ open: false, user: null });
      alert("Contraseña reseteada.");
    } catch (err: any) {
      console.error(err);
      alert(humanizeEdgeError(err));
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async () => {
    const u = deleteModal.user;
    if (!u) return;

    if (!canManageUsers) return alert("No autorizado.");
    setBusy(true);
    try {
      await invokeEdge<{ ok?: boolean }>("delete-user", { user_id: u.id });
      setItems((prev) => prev.filter((x) => x.id !== u.id));
      setDeleteModal({ open: false, user: null });
      alert("Usuario eliminado.");
    } catch (err: any) {
      console.error(err);
      alert(humanizeEdgeError(err));
    } finally {
      setBusy(false);
    }
  };

  const ensureAndCopyGmCode = async (u: User) => {
    if (!canManageUsers) return;
    if (u.role !== "GM" && u.role !== "ADMIN_GENERAL") return;

    closeMenu();
    setBusy(true);
    try {
      const { data: row, error: e1 } = await supabase.from("admins").select("gm_code").eq("user_id", u.id).maybeSingle();
      if (e1) throw e1;

      let code = String(row?.gm_code || "").trim();

      if (!code) {
        for (let tries = 0; tries < 6; tries++) {
          const next = genGmCode();
          const { error: e2 } = await supabase.from("admins").update({ gm_code: next }).eq("user_id", u.id);

          if (!e2) {
            code = next;
            break;
          }

          const msg = String((e2 as any)?.message || "").toLowerCase();
          if (msg.includes("duplicate") || msg.includes("unique")) continue;
          throw e2;
        }

        if (!code) throw new Error("No pude generar un código único. Reintentá.");
      }

      const ok = await copyToClipboard(code);
      alert(ok ? `Código GM copiado: ${code}` : `Código GM: ${code}`);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No pude obtener/generar el Código GM (RLS/policies).");
    } finally {
      setBusy(false);
    }
  };

  const roleLabelOf = (r: UserRole) =>
    r === "CLIENT" ? "Cliente" : r === "GM" ? "Game Master" : "Admin General";

  const userColumns: DataTableColumn<User>[] = [
    {
      key: "user",
      header: "Usuario",
      className: "eg-users-table__user-col",
      render: (user) => {
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Sin nombre";
        const initial = (user.firstName?.[0] || user.email?.[0] || "U").toUpperCase();
        return <div className="eg-users-user">
          <span className="eg-users-avatar">
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initial}
          </span>
          <span className="eg-users-user__copy"><strong>{name}</strong><small>{user.alias ? `@${user.alias}` : user.email}</small></span>
        </div>;
      },
    },
    {
      key: "mail",
      header: "Mail",
      className: "eg-users-table__mail-col",
      render: (user) => <span className="eg-users-mail" title={user.email}>{user.email || "—"}</span>,
    },
    {
      key: "role",
      header: "Rol",
      render: (user) => <Badge tone={user.role === "ADMIN_GENERAL" ? "accent" : user.role === "GM" ? "info" : "neutral"} small>{roleLabelOf(user.role)}</Badge>,
    },
    {
      key: "golden",
      header: "Golden Ticket",
      align: "center",
      render: (user) => <span title={user.goldenActive ? `Golden Ticket activo · Origen: ${describeGoldenTicketSource(user.goldenSource)}` : "Sin Golden Ticket"}>
        <Badge tone={user.goldenActive ? "warning" : "neutral"} small>{user.goldenActive ? "Sí" : "—"}</Badge>
      </span>,
    },
    {
      key: "branch",
      header: "Sucursal",
      align: "center",
      render: (user) => <span className="eg-users-muted">{user.role === "GM" ? user.branch || "—" : "—"}</span>,
    },
    {
      key: "status",
      header: "Estado",
      align: "center",
      render: (user) => <Badge tone={user.active ? "success" : "neutral"} dot small>{user.active ? "Activo" : "Inactivo"}</Badge>,
    },
    {
      key: "actions",
      header: "Acciones",
      align: "center",
      render: (user) => canManageUsers ? <ActionMenu items={[
        ...(user._isStaff && (user.role === "GM" || user.role === "ADMIN_GENERAL") ? [{ key: "gm-code", label: "Código GM", icon: "copy" as const, disabled: busy, onSelect: () => ensureAndCopyGmCode(user) }] : []),
        { key: "permissions", label: "Permisos", icon: "settings", disabled: busy, onSelect: () => setPermModal({ open: true, user: { ...user, permissions: { ...user.permissions } } }) },
        { key: "password", label: "Resetear contraseña", icon: "refresh", disabled: busy, onSelect: () => openReset(user) },
        ...(user.role === "CLIENT" ? [{ key: "golden", label: "Golden Ticket", icon: "ticket" as const, disabled: busy, onSelect: () => openGolden(user) }] : []),
        { key: "delete", label: "Eliminar usuario", icon: "trash", danger: true, separatorBefore: true, disabled: busy, onSelect: () => openDelete(user) },
      ]} /> : <span className="eg-users-muted">—</span>,
    },
  ];

  return (
    <div className="eg-users-page">
      <div className="eg-users-page__inner">
        <PageHeader
          title="Usuarios"
          subtitle="Administrá usuarios, roles y permisos."
          action={canManageUsers ? <Button variant="primary" icon="plus" onClick={startCreate} disabled={busy}>Nuevo usuario</Button> : undefined}
        />

        <Card padding="sm" className="eg-users-config">
          <div className="eg-users-config__copy">
            <UiIcon name="ticket" size={18} />
            <span><strong>Capturas de Golden Ticket</strong><small>Botón “Subir captura” para todos los clientes</small></span>
          </div>
          <Toggle
            label={ratingLoading ? "Cargando..." : ratingUpload ? "Activado" : "Desactivado"}
            checked={ratingUpload}
            onChange={toggleRatingUpload}
            disabled={ratingLoading || ratingSaving}
          />
        </Card>

        <Card padding="sm" className="eg-users-filters">
          <SearchInput value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar por nombre, mail o alias..." aria-label="Buscar usuarios" />
          <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as UserRole | "")} aria-label="Filtrar por rol">
            <option value="">Todos los roles</option>
            <option value="CLIENT">Cliente</option>
            <option value="GM">Game Master</option>
            <option value="ADMIN_GENERAL">Admin General</option>
          </Select>
          <Select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value as Branch | "")} aria-label="Filtrar por sucursal">
            <option value="">Todas las sucursales</option>
            {BRANCHES.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
          </Select>
        </Card>

        <div className="eg-users-stats">
          <StatCard value={totals.totalUsers} label="Usuarios visibles" loading={loading} />
          <StatCard value={totals.activeUsers} label="Usuarios activos" tone="success" loading={loading} />
          <StatCard value={totals.gmCount} label="Game Masters" loading={loading} />
          <StatCard value={totals.adminGeneralCount} label="Admin General" tone="accent" loading={loading} />
        </div>

        <Card padding="none" className="eg-users-table-card">
          <DataTable
            columns={userColumns}
            rows={filtered}
            rowKey={(user) => user.id}
            loading={loading}
            loadingLabel="Cargando usuarios..."
            rowClassName={(user) => user.active ? undefined : "eg-users-row--inactive"}
            empty={<EmptyState
              icon="users"
              title={items.length === 0 ? "Todavía no hay usuarios" : "No encontramos usuarios con estos filtros"}
              description={items.length === 0 ? "Los usuarios aparecerán acá cuando estén disponibles." : "Probá modificando la búsqueda, el rol o la sucursal."}
            />}
          />
        </Card>

        <CreateUserModal
          open={createModalOpen}
          initialUser={createInitial}
          canManageUsers={canManageUsers}
          busy={busy}
          onClose={() => {
            setCreateModalOpen(false);
            setCreateInitial(null);
          }}
          onSave={createSave}
        />

        <ModalShell open={tempPassModal.open} title="Usuario creado" description={`${tempPassModal.mail}${tempPassModal.existed ? " · usuario existente actualizado" : ""}`} onClose={closeTempPass}>
          <Card padding="md" className="eg-users-temp-password">
            <span>Contraseña temporal</span>
            <strong>{tempPassModal.tempPassword ?? "—"}</strong>
            <small>Guardala ahora: no se vuelve a mostrar.</small>
          </Card>
          <div className="eg-users-modal__actions">
            <Button variant="secondary" onClick={closeTempPass}>Cerrar</Button>
            <Button variant="primary" icon="copy"
              disabled={!tempPassModal.tempPassword}
              onClick={async () => {
                if (!tempPassModal.tempPassword) return;
                const ok = await copyToClipboard(tempPassModal.tempPassword);
                toast(
                  ok ? "success" : "error",
                  ok ? "Contraseña copiada al portapapeles." : "No pude copiar al portapapeles."
                );
              }}
            >Copiar contraseña</Button>
          </div>
        </ModalShell>

        <ModalShell open={goldenModal.open} title="Golden Ticket" description={goldenModal.user ? goldenModal.user.email || goldenModal.user.alias : undefined} onClose={closeGolden}>
          {goldenModal.user ? (
            <>
              {goldenLoading ? (
                <Card padding="md" className="eg-users-modal__notice">Cargando…</Card>
              ) : goldenErr ? (
                <Card padding="md" className="eg-users-golden__error">{goldenErr}</Card>
              ) : goldenInfo?.active ? (
                <>
                  <Card padding="md" className="eg-users-golden__active">
                    <div className="eg-users-golden__title">
                      Golden Ticket #{goldenInfo.number ?? "—"}
                    </div>

                    <div className="eg-users-golden__meta">
                      Origen: {describeGoldenTicketSource(goldenInfo.source)}
                    </div>
                    <div className="eg-users-golden__meta">
                      Otorgado el {formatDateDDMMYYYY(goldenInfo.grantedAt) || "—"}
                    </div>
                    <div className="eg-users-golden__meta">
                      Vence: {formatDateDDMMYYYY(goldenInfo.expiresAt) || "—"}
                    </div>
                    <div className="eg-users-golden__meta">
                      Redimido:{" "}
                      {goldenInfo.redeemedAt
                        ? formatDateDDMMYYYY(goldenInfo.redeemedAt)
                        : "No"}
                    </div>
                  </Card>

                  {goldenConfirmRevoke ? (
                    <Card padding="md" className="eg-users-delete-warning">
                      <div>
                        ¿Deshabilitar el Golden Ticket de este usuario? Va a dejar de
                        verlo en la app.
                      </div>

                      <div className="eg-users-modal__actions">
                        <Button variant="secondary"
                          onClick={() => setGoldenConfirmRevoke(false)}
                          disabled={goldenBusy}
                        >Cancelar</Button>

                        <Button variant="danger"
                          onClick={doRevokeGolden}
                          disabled={goldenBusy}
                          loading={goldenBusy}
                        >Confirmar</Button>
                      </div>
                    </Card>
                  ) : (
                    <div className="eg-users-modal__actions">
                      <Button variant="danger"
                        onClick={() => setGoldenConfirmRevoke(true)}
                        disabled={goldenBusy}
                      >Deshabilitar</Button>
                    </div>
                  )}
                </>
              ) : goldenInfo?.screenshotStatus === "REJECTED" ? (
                <Card padding="md" className="eg-users-golden__error">
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>
                    Última captura rechazada
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                    Motivo: {goldenInfo.rejectionReason || "sin motivo registrado"}
                  </div>
                </Card>
              ) : goldenInfo?.screenshotStatus === "PENDING" ? (
                <Card padding="md" className="eg-users-modal__notice">
                  <div style={{ marginBottom: 10, fontSize: 13.5 }}>
                    Este usuario tiene una captura esperando revisión.
                  </div>

                  <Button variant="secondary" size="sm" onClick={openPendingReview}>Revisar captura pendiente</Button>
                </Card>
              ) : (
                <Card padding="md" className="eg-users-modal__notice">Sin Golden Ticket.</Card>
              )}
            </>
          ) : null}
        </ModalShell>

        <GoldenTicketReviewModal
          open={!!reviewRequest}
          request={reviewRequest}
          onClose={() => setReviewRequest(null)}
          onDone={() => {
            if (goldenModal.user) loadGoldenInfo(goldenModal.user.id);
          }}
          toast={toast}
        />

        <ToastStack toasts={toasts} onDismiss={dismiss} />

        <ModalShell
          open={permModal.open}
          title="Permisos"
          description={permModal.user ? `${permModal.user.email} · ${roleLabelOf(permModal.user.role)}` : undefined}
          onClose={() => setPermModal({ open: false, user: null })}
        >
          {permModal.user ? (
            <>
              {permModal.user.role === "ADMIN_GENERAL" ? (
                <Card padding="sm" className="eg-users-modal__notice">
                  Admin General: por diseño no usamos permisos finos acá.
                </Card>
              ) : (
                <div className="eg-users-permissions">
                  {(
                    [
                      ["canManageRooms", "Gestionar salas"],
                      ["canManageNews", "Gestionar novedades"],
                      ["canManageUsers", "Gestionar usuarios"],
                      ["canEditRankings", "Editar rankings"],
                      ["canAwardKeys", "Otorgar llaves"],
                      ["canResetClientPassword", "Reset pass cliente"],
                    ] as const
                  ).map(([k, label]) => {
                    const locked =
                      permModal.user?.role === "GM" &&
                      (ADMIN_ONLY_PERMS as readonly string[]).includes(k);

                    return (
                      <Toggle
                        key={k}
                        label={label}
                        description={locked ? "Exclusivo de Admin General" : undefined}
                        title={locked ? "Exclusivo de Admin General." : undefined}
                        checked={!locked && !!permModal.user?.permissions?.[k]}
                        disabled={locked}
                        onChange={(e) => patchPerm(k, e.target.checked)}
                      />
                    );
                  })}
                </div>
              )}

              <div className="eg-users-modal__actions">
                <Button variant="secondary" onClick={() => setPermModal({ open: false, user: null })} disabled={busy}>Cancelar</Button>
                <Button variant="primary" onClick={savePerms} loading={busy}>Guardar cambios</Button>
              </div>
            </>
          ) : null}
        </ModalShell>

        <ModalShell
          open={resetModal.open}
          title="Restablecer contraseña"
          description={resetModal.user ? `Definí una nueva contraseña para ${resetModal.user.email}.` : undefined}
          onClose={() => {
            setShowResetPass1(false);
            setShowResetPass2(false);
            setResetModal({ open: false, user: null });
          }}
        >
          {resetModal.user ? (
            <>
              <div className="eg-users-password-form">
                <label className="eg-field"><span className="eg-field__label">Nueva contraseña</span><div className="eg-users-password-field">
                  <input
                    className="eg-input"
                    type={showResetPass1 ? "text" : "password"}
                    value={resetPass1}
                    onChange={(e) => setResetPass1(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPass1((v) => !v)}
                    aria-label={showResetPass1 ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="eg-users-password-field__toggle"
                  >
                    {showResetPass1 ? <EyeOpenIcon /> : <EyeClosedIcon />}
                  </button>
                </div></label>

                <label className="eg-field"><span className="eg-field__label">Repetir contraseña</span><div className="eg-users-password-field">
                  <input
                    className="eg-input"
                    type={showResetPass2 ? "text" : "password"}
                    value={resetPass2}
                    onChange={(e) => setResetPass2(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPass2((v) => !v)}
                    aria-label={showResetPass2 ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="eg-users-password-field__toggle"
                  >
                    {showResetPass2 ? <EyeOpenIcon /> : <EyeClosedIcon />}
                  </button>
                </div></label>
              </div>

              <div className="eg-users-modal__actions">
                <Button variant="secondary"
                  onClick={() => {
                    setShowResetPass1(false);
                    setShowResetPass2(false);
                    setResetModal({ open: false, user: null });
                  }}
                  disabled={busy}
                >Cancelar</Button>
                <Button variant="primary" onClick={resetPassword} loading={busy}>Restablecer contraseña</Button>
              </div>
            </>
          ) : null}
        </ModalShell>

        <ModalShell
          open={deleteModal.open}
          title="Eliminar usuario"
          description="Esta acción utiliza el proceso de eliminación existente del sistema."
          onClose={() => setDeleteModal({ open: false, user: null })}
        >
          {deleteModal.user ? (
            <>
              <Card padding="md" className="eg-users-delete-warning">¿Seguro que querés eliminar a <strong>{deleteModal.user.email}</strong>?</Card>

              <div className="eg-users-modal__actions">
                <Button variant="secondary"
                  onClick={() => setDeleteModal({ open: false, user: null })}
                  disabled={busy}
                >Cancelar</Button>
                <Button variant="danger" onClick={deleteUser} loading={busy}>Eliminar usuario</Button>
              </div>
            </>
          ) : null}
        </ModalShell>
      </div>
    </div>
  );
}

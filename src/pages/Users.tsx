import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

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
  role: UserRole;
  branch: Branch | "";
  active: boolean;
  permissions: UserPermissions;
  _isStaff: boolean;
};

const defaultPerms = (): UserPermissions => ({
  canManageRooms: false,
  canManageNews: false,
  canManageUsers: false,
  canEditRankings: false,
  canAwardKeys: false,
  canResetClientPassword: true,
});

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
  if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("invalid jwt"))
    return "No autorizado (401). Token inválido para la Edge Function (probable validación mal implementada en la Function).";
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
    role: "CLIENT",
    branch: "",
    active: true,
    permissions: defaultPerms(),
    _isStaff: false,
  };
}

/** ======= UI helpers (modal) ======= */
function ModalShell({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="modalOverlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        className="modalCard"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)",
          background: "#0f0f12",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,.5)",
        }}
      >
        <div
          style={{
            padding: 14,
            borderBottom: "1px solid rgba(255,255,255,.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
          <button className="ghostBtn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "160px minmax(0, 1fr)",
        gap: 10,
        alignItems: "center",
        marginBottom: 10,
      }}
    >
      <div style={{ opacity: 0.85, fontSize: 13 }}>{label}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** ✅ Modal separado con state local */
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

  return (
    <ModalShell open={open} title="Crear usuario" onClose={onClose}>
      {!draft ? null : (
        <>
          <div style={{ marginBottom: 14, opacity: 0.8, fontSize: 13 }}>
            Completá los datos y guardá. Para GM elegís sucursal. Para Cliente pedimos alias.
          </div>

          <FieldRow label="Nombre">
            <input
              className="input"
              style={{ width: "100%", minWidth: 0 }}
              value={draft.firstName}
              onChange={(e) => patch({ firstName: e.target.value })}
              placeholder="Nombre"
              autoFocus
              spellCheck={false}
            />
          </FieldRow>

          <FieldRow label="Apellido">
            <input
              className="input"
              style={{ width: "100%", minWidth: 0 }}
              value={draft.lastName}
              onChange={(e) => patch({ lastName: e.target.value })}
              placeholder="Apellido"
              spellCheck={false}
            />
          </FieldRow>

          <FieldRow label="Mail">
            <input
              className="input"
              style={{ width: "100%", minWidth: 0 }}
              value={draft.email}
              onChange={(e) => patch({ email: e.target.value })}
              placeholder="mail@dominio.com"
              spellCheck={false}
            />
          </FieldRow>

          <FieldRow label="Rol">
            <select
              className="input"
              style={{ width: "100%", minWidth: 0 }}
              value={draft.role}
              onChange={(e) => patch({ role: safeRole(e.target.value) })}
            >
              <option value="CLIENT">Cliente</option>
              <option value="GM">Game Master</option>
              <option value="ADMIN_GENERAL">Admin General</option>
            </select>
          </FieldRow>

          {draft.role === "CLIENT" ? (
            <FieldRow label="Alias (Cliente)">
              <input
                className="input"
                style={{ width: "100%", minWidth: 0 }}
                value={draft.alias}
                onChange={(e) => patch({ alias: e.target.value })}
                placeholder="Alias del cliente"
                spellCheck={false}
              />
            </FieldRow>
          ) : null}

          {draft.role === "GM" ? (
            <FieldRow label="Sucursal (GM)">
              <select
                className="input"
                style={{ width: "100%", minWidth: 0 }}
                value={draft.branch}
                onChange={(e) => patch({ branch: e.target.value as any })}
              >
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </FieldRow>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
            <button className="ghostBtn" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button
              className="btnSmall"
              onClick={() => {
                if (!canManageUsers) return alert("No autorizado.");
                onSave(draft);
              }}
              disabled={busy}
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

export default function Users() {
  const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

  const [myRole, setMyRole] = useState<UserRole | "">("");
  const canManageUsers = myRole === "ADMIN_GENERAL";

  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [branchFilter, setBranchFilter] = useState<Branch | "">("");

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState<User | null>(null);

  const [permModal, setPermModal] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });
  const [resetModal, setResetModal] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });

  const [resetPass1, setResetPass1] = useState("");
  const [resetPass2, setResetPass2] = useState("");
  const [busy, setBusy] = useState(false);

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

        const { data: prof, error: pErr } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
        if (!pErr && prof?.role) {
          if (mounted) setMyRole(safeRole(prof.role));
          return;
        }

        const { data: me } = await supabase.from("admins").select("is_super").eq("user_id", uid).maybeSingle();
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
        .select("id,nombre,apellido,alias,mail,role,is_active,created_at")
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
          role,
          branch: (branchName as Branch) || "",
          active: p?.is_active ?? true,
          permissions: { ...defaultPerms(), ...(a.permissions || {}) },
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
          role: "CLIENT",
          branch: "",
          active: p?.is_active ?? true,
          permissions: defaultPerms(),
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

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuOpenId) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest(".sheetActions")) return;
      setMenuOpenId(null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpenId(null);
        setCreateModalOpen(false);
        setPermModal({ open: false, user: null });
        setResetModal({ open: false, user: null });
        setDeleteModal({ open: false, user: null });
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

  /** ✅ token válido */
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

  /** ✅ fetch directo a Functions */
  const invokeEdge = async <T,>(fnName: string, body: any): Promise<T> => {
    if (!SUPABASE_URL || !ANON_KEY) throw new Error("Faltan envs: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");

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
      return (text as unknown) as T;
    }
  };

  // ===== acciones =====

  const startCreate = () => {
    setMenuOpenId(null);
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

      type CreateUserResp = { mail?: string; tempPassword?: string | null; existed?: boolean };
      const data = await invokeEdge<CreateUserResp>("create-user", body);

      setCreateModalOpen(false);
      setCreateInitial(null);

      alert(
        `Usuario creado.\nMail: ${data?.mail ?? u.email}\nPass temporal: ${data?.tempPassword ?? "-"}${
          data?.existed ? "\n(Ya existía, se actualizó)" : ""
        }`
      );

      await fetchUsers();
    } catch (err: any) {
      console.error(err);
      alert(humanizeEdgeError(err));
    } finally {
      setBusy(false);
    }
  };

  const openReset = (u: User) => {
    setMenuOpenId(null);
    setResetPass1("");
    setResetPass2("");
    setResetModal({ open: true, user: { ...u } });
  };

  const openDelete = (u: User) => {
    setMenuOpenId(null);
    setDeleteModal({ open: true, user: { ...u } });
  };

  const patchPerm = (key: keyof UserPermissions, value: boolean) => {
    setPermModal((prev) => {
      if (!prev.user) return prev;
      return { open: true, user: { ...prev.user, permissions: { ...prev.user.permissions, [key]: value } } };
    });
  };

  const savePerms = async () => {
    const u = permModal.user;
    if (!u) return;

    if (!canManageUsers) return alert("No autorizado.");
    if (!u._isStaff) return alert("Permisos solo aplican a GM/Admin General (tabla admins).");

    const permsToSave: UserPermissions = u.role === "ADMIN_GENERAL" ? defaultPerms() : u.permissions;

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

    const ok = confirm(`¿Seguro que querés resetear la contraseña de ${u.email}?`);
    if (!ok) return;

    setBusy(true);
    try {
      await invokeEdge<{ ok?: boolean }>("reset-user-password", { user_id: u.id, new_password: resetPass1 });
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
    const ok = confirm(`¿Seguro que querés borrar a "${u.email}"?`);
    if (!ok) return;

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

    setMenuOpenId(null);
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

  // ===== UI =====

  const roleLabelOf = (r: UserRole) => (r === "CLIENT" ? "Cliente" : r === "GM" ? "Game Master" : "Admin General");

  return (
    <div className="page">
      <div
        className="pageHeadRow"
        style={{ gap: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div>
          <div className="pageTitle">Usuarios</div>
          {/* ✅ Leyenda eliminada */}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {canManageUsers ? (
            <button className="btnSmall" onClick={startCreate}>
              + Nuevo usuario
            </button>
          ) : null}
        </div>
      </div>

      <div className="toolbarRow" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre / mail / alias…"
          style={{ flex: 1, minWidth: 0 }}
        />

        <select className="input" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as any)} style={{ width: 200 }}>
          <option value="">Todos los roles</option>
          <option value="CLIENT">Cliente</option>
          <option value="GM">Game Master</option>
          <option value="ADMIN_GENERAL">Admin General</option>
        </select>

        <select
          className="input"
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value as any)}
          style={{ width: 220 }}
        >
          <option value="">Todas las sucursales</option>
          {BRANCHES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 16 }}>
          Cargando usuarios…
        </div>
      ) : (
        <div className="usersGridScroll">
          <div className="usersSheet" role="table" aria-label="Usuarios">
            <div className="usersRow usersHeader" role="row">
              <div className="usersCell colName" role="columnheader">Nombre</div>
              <div className="usersCell colLast" role="columnheader">Apellido</div>
              <div className="usersCell colAlias" role="columnheader">Alias (cliente)</div>
              <div className="usersCell colMail" role="columnheader">Mail</div>
              <div className="usersCell colRole" role="columnheader">Rol</div>
              <div className="usersCell colBranch" role="columnheader">Sucursal (GM)</div>
              <div className="usersCell colStatus" role="columnheader">Estado</div>
            </div>

            {filtered.map((u) => {
              const canShowGmCode = u._isStaff && (u.role === "GM" || u.role === "ADMIN_GENERAL");


              return (
                <div
                  className={`usersRow ${!u.active ? "isOff" : ""}`}
                  role="row"
                  key={u.id}
                  style={{ position: "relative" }}
                >
                  <div className="usersCell colName" role="cell">
                    <input className="sheetInput" value={u.firstName} disabled />
                  </div>

                  <div className="usersCell colLast" role="cell">
                    <input className="sheetInput" value={u.lastName} disabled />
                  </div>

                  <div className="usersCell colAlias" role="cell">
                    <input className="sheetInput" value={u.role === "CLIENT" ? u.alias : ""} disabled />
                  </div>

                  <div className="usersCell colMail" role="cell">
                    <input className="sheetInput" value={u.email} disabled />
                  </div>

                  <div className="usersCell colRole" role="cell">
                    <input className="sheetInput" value={roleLabelOf(u.role)} disabled />
                  </div>

                  <div className="usersCell colBranch" role="cell">
                    <input className="sheetInput" value={u.role === "GM" ? u.branch || "" : ""} disabled />
                  </div>

                  <div className="usersCell colStatus" role="cell">
                    <button className={u.active ? "ghostBtn sheetBtn" : "btnSmall sheetBtn"} disabled>
                      {u.active ? "Activo" : "Inactivo"}
                    </button>
                  </div>

                  <div className="sheetActions">
                    <button
                      className="sheetDots"
                      onClick={() => setMenuOpenId((cur) => (cur === u.id ? null : u.id))}
                      aria-label="Opciones"
                      title="Opciones"
                      disabled={!canManageUsers}
                    >
                      ⋯
                    </button>

                    {menuOpenId === u.id ? (
                      <div className="sheetMenu" onMouseDown={(e) => e.stopPropagation()}>
                        {canShowGmCode ? (
                          <button className="sheetMenuItem" onClick={() => ensureAndCopyGmCode(u)} disabled={busy}>
                            Código GM
                          </button>
                        ) : null}

                        <button
                          className="sheetMenuItem"
                          onClick={() =>
                            setPermModal({ open: true, user: { ...u, permissions: { ...u.permissions } } })
                          }
                          disabled={busy}
                        >
                          Permisos
                        </button>

                        <button className="sheetMenuItem" onClick={() => openReset(u)} disabled={busy}>
                          Resetear contraseña
                        </button>

                        <button className="sheetMenuItem danger" onClick={() => openDelete(u)} disabled={busy}>
                          Eliminar usuario
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {!filtered.length ? (
              <div className="panel" style={{ padding: 16, marginTop: 12 }}>
                No hay usuarios con ese filtro.
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ✅ MODAL CREAR */}
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

      {/* ===== PERMISOS ===== */}
      <ModalShell open={permModal.open} title="Permisos" onClose={() => setPermModal({ open: false, user: null })}>
        {permModal.user ? (
          <>
            <div style={{ marginBottom: 12, opacity: 0.8, fontSize: 13 }}>
              Usuario: <b>{permModal.user.email}</b> — Rol: <b>{permModal.user.role}</b>
            </div>

            {permModal.user.role === "ADMIN_GENERAL" ? (
              <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
                Admin General: por diseño no usamos permisos finos acá (queda en defaults).
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {(
                  [
                    ["canManageRooms", "Gestionar salas"],
                    ["canManageNews", "Gestionar novedades"],
                    ["canManageUsers", "Gestionar usuarios"],
                    ["canEditRankings", "Editar rankings"],
                    ["canAwardKeys", "Otorgar llaves"],
                    ["canResetClientPassword", "Reset pass cliente"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!permModal.user?.permissions?.[k]}
                      onChange={(e) => patchPerm(k, e.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button className="ghostBtn" onClick={() => setPermModal({ open: false, user: null })} disabled={busy}>
                Cancelar
              </button>
              <button className="btnSmall" onClick={savePerms} disabled={busy}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </>
        ) : null}
      </ModalShell>

      {/* ===== RESET PASS ===== */}
      <ModalShell open={resetModal.open} title="Resetear contraseña" onClose={() => setResetModal({ open: false, user: null })}>
        {resetModal.user ? (
          <>
            <div style={{ marginBottom: 12, opacity: 0.8, fontSize: 13 }}>
              Usuario: <b>{resetModal.user.email}</b>
            </div>

            <FieldRow label="Nueva contraseña">
              <input
                className="input"
                style={{ width: "100%", minWidth: 0 }}
                type="password"
                value={resetPass1}
                onChange={(e) => setResetPass1(e.target.value)}
              />
            </FieldRow>

            <FieldRow label="Repetir contraseña">
              <input
                className="input"
                style={{ width: "100%", minWidth: 0 }}
                type="password"
                value={resetPass2}
                onChange={(e) => setResetPass2(e.target.value)}
              />
            </FieldRow>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button className="ghostBtn" onClick={() => setResetModal({ open: false, user: null })} disabled={busy}>
                Cancelar
              </button>
              <button className="btnSmall" onClick={resetPassword} disabled={busy}>
                {busy ? "Reseteando…" : "Resetear"}
              </button>
            </div>
          </>
        ) : null}
      </ModalShell>

      {/* ===== DELETE ===== */}
      <ModalShell open={deleteModal.open} title="Eliminar usuario" onClose={() => setDeleteModal({ open: false, user: null })}>
        {deleteModal.user ? (
          <>
            <div className="panel" style={{ padding: 12 }}>
              Vas a borrar a: <b>{deleteModal.user.email}</b>
              <div style={{ marginTop: 8, opacity: 0.85 }}>
                Ojo: esto es irreversible si tu Edge Function elimina auth + filas relacionadas.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button className="ghostBtn" onClick={() => setDeleteModal({ open: false, user: null })} disabled={busy}>
                Cancelar
              </button>
              <button className="btnSmall danger" onClick={deleteUser} disabled={busy}>
                {busy ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </>
        ) : null}
      </ModalShell>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
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

/** ✅ Solo estos 3 */
type UserRole = "CLIENT" | "GM" | "ADMIN_GENERAL";

type UserPermissions = {
  canManageRooms: boolean; // ✅ crear/editar salas (incluye "nueva sala")
  canManageNews: boolean;
  canManageUsers: boolean;
  canEditRankings: boolean; // ✅ modificar ranking
  canAwardKeys: boolean;
  canResetClientPassword: boolean;
};

type User = {
  id: string; // auth.users.id === profiles.id === admins.user_id
  firstName: string;
  lastName: string;
  alias: string; // cliente
  email: string;
  role: UserRole;
  branch: Branch | ""; // solo GM
  active: boolean;
  permissions: UserPermissions; // solo staff (admins.permissions). Para CLIENT queda default.
  _isStaff: boolean; // helper UI
};

const defaultPerms = (): UserPermissions => ({
  canManageRooms: false,
  canManageNews: false,
  canManageUsers: false,
  canEditRankings: false,
  canAwardKeys: false,
  canResetClientPassword: true,
});

/** ✅ branch_id -> Branch soportando 0-based y 1-based */
function branchFromId(id: any): Branch | "" {
  if (id === null || id === undefined) return "";
  const n = Number(id);
  if (!Number.isFinite(n)) return "";

  // 0-based: 0..10
  const zero = BRANCHES[n];
  if (zero) return zero as Branch;

  // 1-based: 1..11
  const one = BRANCHES[n - 1];
  if (one) return one as Branch;

  return "";
}

function safeRole(v: any): UserRole {
  return v === "CLIENT" || v === "GM" || v === "ADMIN_GENERAL" ? v : "CLIENT";
}

/** ✅ Código GM: 10 chars A-Z0-9 */
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

  if (msg.includes("failed to fetch")) {
    return "No pude contactar la Edge Function. Revisá que esté DEPLOYADA y que no haya bloqueos (CORS/red).";
  }

  if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("invalid jwt")) {
    return "No autorizado (401). Tu token no está llegando bien a la Edge Function. Cerrá sesión, recargá la página y volvé a entrar.";
  }

  if (msg.includes("jwt")) return "Token inválido/expirado. Cerrá sesión y volvé a entrar.";
  return raw || "Error inesperado.";
}

function newUserTemplate(): User {
  return {
    id: crypto.randomUUID(), // placeholder para el modal
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

export default function Users() {
  /** ✅ mi rol sale de admins.is_super */
  const [myRole, setMyRole] = useState<UserRole | "">("");
  const canManageUsers = myRole === "ADMIN_GENERAL";

  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [branchFilter, setBranchFilter] = useState<Branch | "">("");

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  /** modales */
  const [createModal, setCreateModal] = useState<{ open: boolean; user: User | null }>({
    open: false,
    user: null,
  });

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

  const [resetPass1, setResetPass1] = useState("");
  const [resetPass2, setResetPass2] = useState("");
  const [busy, setBusy] = useState(false);

  /** ✅ full width solo en /usuarios */
  useEffect(() => {
    document.body.classList.add("users-fullwidth");
    return () => document.body.classList.remove("users-fullwidth");
  }, []);

  /** ============================
   *  Detectar mi rol desde admins
   *  ============================ */
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

        const { data: me, error } = await supabase
          .from("admins")
          .select("is_super")
          .eq("user_id", uid)
          .maybeSingle();

        if (error) throw error;

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

  /** ============================
   *  Fetch: staff + clientes
   *  ============================ */
  const fetchUsers = async () => {
    setLoading(true);
    try {
      // 1) profiles (clientes + también nombres de staff)
      const { data: profs, error: e1 } = await supabase
        .from("profiles")
        .select("id,nombre,apellido,alias,mail,role,is_active,created_at")
        .order("created_at", { ascending: false });

      if (e1) throw e1;

      // 2) admins (staff) ✅ OJO: NO embebemos branches acá (evita PGRST201)
      const { data: ads, error: e2 } = await supabase
        .from("admins")
        .select("user_id,mail,branch_id,gm_code,is_super,permissions,created_at")
        .order("created_at", { ascending: false });

      if (e2) throw e2;

      const profilesById = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const adminsById = new Map((ads ?? []).map((a: any) => [a.user_id, a]));

      // STAFF (admins + datos desde profiles si están)
      const mappedStaff: User[] = (ads ?? []).map((a: any) => {
        const p = profilesById.get(a.user_id);
        const role: UserRole = a.is_super ? "ADMIN_GENERAL" : "GM";

        return {
          id: a.user_id,
          firstName: p?.nombre || "",
          lastName: p?.apellido || "",
          alias: "",
          email: a.mail || p?.mail || "",
          role,
          branch: role === "GM" ? branchFromId(a.branch_id) : "",
          active: p?.is_active ?? true,
          permissions: { ...defaultPerms(), ...(a.permissions || {}) },
          _isStaff: true,
        };
      });

      // CLIENTES (profiles que NO están en admins)
      const mappedClients: User[] = (profs ?? [])
        .filter((p: any) => !adminsById.has(p.id))
        .map((p: any) => {
          const role: UserRole = "CLIENT";
          return {
            id: p.id,
            firstName: p?.nombre || "",
            lastName: p?.apellido || "",
            alias: p?.alias || "",
            email: p?.mail || "",
            role,
            branch: "",
            active: p?.is_active ?? true,
            permissions: defaultPerms(),
            _isStaff: false,
          };
        });

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

  /** click afuera para cerrar menú y Esc para cerrar modales */
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
        closeAllModals();
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

  const closeAllModals = () => {
    setCreateModal({ open: false, user: null });
    setPermModal({ open: false, user: null });
    setResetModal({ open: false, user: null });
    setDeleteModal({ open: false, user: null });
  };

  /** ✅ INVOKE CORRECTO: llama Edge Function y muestra logs para ver si hay sesión/token */
  const invokeEdge = async <T,>(fnName: string, body: any): Promise<T> => {
    const { data: sessData, error: sessErr } = await supabase.auth.getSession();

    console.log("getSession error:", sessErr);
    console.log("session exists:", !!sessData.session);
    console.log("caller id:", sessData.session?.user?.id);
    console.log("token length:", sessData.session?.access_token?.length);
    console.log("token head:", sessData.session?.access_token?.slice(0, 25));

    const token = sessData.session?.access_token;
    if (!token) throw new Error("Unauthorized (sin sesión).");

    const { data: respData, error: fnErr } = await supabase.functions.invoke(fnName, {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });

    if (fnErr) throw new Error(fnErr.message || "Error al invocar Edge Function.");
    if ((respData as any)?.error) throw new Error(String((respData as any)?.error));

    return (respData ?? {}) as T;
  };

  const openPerms = (u: User) => {
    setMenuOpenId(null);
    setPermModal({ open: true, user: { ...u, permissions: { ...u.permissions } } });
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

  /** ✅ Código GM (solo GM, solo admin general) */
  const ensureAndCopyGmCode = async (u: User) => {
    if (!canManageUsers) return;
    if (!u._isStaff || u.role !== "GM") return;

    setMenuOpenId(null);
    setBusy(true);
    try {
      const { data: row, error: e1 } = await supabase
        .from("admins")
        .select("gm_code")
        .eq("user_id", u.id)
        .maybeSingle();
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

  /** ✅ Crear usuario (modal) */
  const startCreate = () => {
    setMenuOpenId(null);
    setCreateModal({ open: true, user: newUserTemplate() });
  };

  const updateCreateUser = (patch: Partial<User>) => {
    setCreateModal((prev) => {
      if (!prev.user) return prev;
      const next: User = { ...prev.user, ...patch };

      // reglas de rol
      if (next.role === "CLIENT") {
        next.branch = "";
        next._isStaff = false;
      } else {
        next._isStaff = true;
        if (next.role === "GM" && !next.branch) next.branch = "Nuñez";
        if (next.role === "ADMIN_GENERAL") next.branch = "";
      }

      return { open: true, user: next };
    });
  };

  /** ✅ Crear => Edge Function create-user */
  const createSave = async () => {
    const u = createModal.user;
    if (!u) return;

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

      // ✅ branch_id: guardamos 0-based (como Rooms soporta 0/1)
      if (u.role === "GM") {
        const idx = BRANCHES.indexOf((u.branch || "Nuñez") as Branch);
        body.branch_id = idx >= 0 ? idx : 0;
      }

      if (u.role === "ADMIN_GENERAL") body.is_super = true;

      type CreateUserResp = { mail?: string; tempPassword?: string };

      const data = await invokeEdge<CreateUserResp>("create-user", body);

      closeAllModals();
      alert(`Usuario creado.\nMail: ${data?.mail ?? u.email}\nPass temporal: ${data?.tempPassword ?? "-"}`);

      await fetchUsers();
    } catch (err: any) {
      console.error(err);
      alert(humanizeEdgeError(err));
    } finally {
      setBusy(false);
    }
  };

  /** ✅ Guardar permisos en DB: admins.permissions (solo GM) */
  const savePerms = async () => {
    const u = permModal.user;
    if (!u) return;

    if (!canManageUsers) return alert("No autorizado.");
    if (!u._isStaff) {
      closeAllModals();
      return alert("Permisos solo aplican a GM/Admin General (tabla admins).");
    }

    const permsToSave: UserPermissions = u.role === "ADMIN_GENERAL" ? defaultPerms() : u.permissions;

    setBusy(true);
    try {
      const { error } = await supabase.from("admins").update({ permissions: permsToSave }).eq("user_id", u.id);
      if (error) throw error;

      setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, permissions: permsToSave } : x)));

      closeAllModals();
      alert("Permisos guardados.");
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No pude guardar permisos (RLS/policies).");
    } finally {
      setBusy(false);
    }
  };

  /** ✅ Reset password => Edge Function reset-user-password */
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
      type ResetResp = { ok?: boolean };

      await invokeEdge<ResetResp>("reset-user-password", {
        user_id: u.id,
        new_password: resetPass1,
      });

      closeAllModals();
      alert("Contraseña reseteada.");
    } catch (err: any) {
      console.error(err);
      alert(humanizeEdgeError(err));
    } finally {
      setBusy(false);
    }
  };

  /** ✅ Delete => Edge Function delete-user */
  const deleteUser = async () => {
    const u = deleteModal.user;
    if (!u) return;

    if (!canManageUsers) return alert("No autorizado.");

    const ok = confirm(`¿Seguro que querés borrar a "${u.email}"?`);
    if (!ok) return;

    setBusy(true);
    try {
      type DeleteResp = { ok?: boolean };

      await invokeEdge<DeleteResp>("delete-user", { user_id: u.id });

      setItems((prev) => prev.filter((x) => x.id !== u.id));
      closeAllModals();
      alert("Usuario eliminado.");
    } catch (err: any) {
      console.error(err);
      alert(humanizeEdgeError(err));
    } finally {
      setBusy(false);
    }
  };

  /** ✅ editar permisos en modal */
  const patchPerm = (key: keyof UserPermissions, value: boolean) => {
    setPermModal((prev) => {
      if (!prev.user) return prev;
      return {
        open: true,
        user: { ...prev.user, permissions: { ...prev.user.permissions, [key]: value } },
      };
    });
  };

  return (
    <div className="page">
      <div className="pageHeadRow" style={{ gap: 12 }}>
        <div>
          <div className="pageTitle">Usuarios</div>
          <div className="pageSub">Staff + clientes. Acciones por fila (⋯).</div>
        </div>

        {canManageUsers ? (
          <button className="btnSmall" onClick={startCreate}>
            + Nuevo usuario
          </button>
        ) : null}
      </div>

      <div className="toolbarRow" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre / mail / alias…"
          style={{ flex: 1 }}
        />

        <select className="input" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as any)} style={{ width: 200 }}>
          <option value="">Todos los roles</option>
          <option value="CLIENT">Cliente</option>
          <option value="GM">Game Master</option>
          <option value="ADMIN_GENERAL">Admin General</option>
        </select>

        <select className="input" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value as any)} style={{ width: 220 }}>
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
              const canShowGmCode = u._isStaff && u.role === "GM";
              const roleLabel = u.role === "CLIENT" ? "Cliente" : u.role === "GM" ? "Game Master" : "Admin General";

              return (
                <div className={`usersRow ${!u.active ? "isOff" : ""}`} role="row" key={u.id} style={{ position: "relative" }}>
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
                    <input className="sheetInput" value={roleLabel} disabled />
                  </div>

                  <div className="usersCell colBranch" role="cell">
                    <input className="sheetInput" value={u.role === "GM" ? (u.branch || "") : ""} disabled />
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

                        <button className="sheetMenuItem" onClick={() => openPerms(u)} disabled={busy}>
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

      {/* =========================
          MODAL: CREAR USUARIO
      ========================== */}
      {createModal.open && createModal.user ? (
        <>
          <div className="backdrop show" onMouseDown={closeAllModals} />
          <div className="modalCenter" onMouseDown={closeAllModals}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHead">
                <div className="modalTitle">Nuevo usuario</div>
                <button className="iconBtn" onClick={closeAllModals} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <div className="modalBody">
                <div className="formGrid2">
                  <label className="field">
                    <span className="label">Nombre</span>
                    <input className="input" value={createModal.user.firstName} onChange={(e) => updateCreateUser({ firstName: e.target.value })} placeholder="Nombre…" />
                  </label>

                  <label className="field">
                    <span className="label">Apellido</span>
                    <input className="input" value={createModal.user.lastName} onChange={(e) => updateCreateUser({ lastName: e.target.value })} placeholder="Apellido…" />
                  </label>

                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Mail</span>
                    <input className="input" value={createModal.user.email} onChange={(e) => updateCreateUser({ email: e.target.value })} inputMode="email" placeholder="mail@dominio.com" />
                  </label>

                  <label className="field">
                    <span className="label">Rol</span>
                    <select className="input" value={createModal.user.role} onChange={(e) => updateCreateUser({ role: safeRole(e.target.value) })}>
                      <option value="CLIENT">Cliente</option>
                      <option value="GM">Game Master</option>
                      <option value="ADMIN_GENERAL">Admin General</option>
                    </select>
                  </label>

                  {createModal.user.role === "CLIENT" ? (
                    <label className="field">
                      <span className="label">Alias (cliente)</span>
                      <input className="input" value={createModal.user.alias} onChange={(e) => updateCreateUser({ alias: e.target.value })} placeholder="Alias…" />
                    </label>
                  ) : (
                    <div />
                  )}

                  {createModal.user.role === "GM" ? (
                    <label className="field" style={{ gridColumn: "1 / -1" }}>
                      <span className="label">Sucursal (GM)</span>
                      <select className="input" value={createModal.user.branch} onChange={(e) => updateCreateUser({ branch: e.target.value as any })}>
                        <option value="">Elegir…</option>
                        {BRANCHES.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <div className="panel" style={{ padding: 12, gridColumn: "1 / -1" }}>
                    <div style={{ opacity: 0.85, fontSize: 12 }}>
                      Se crea el usuario en <b>Auth</b> y se escribe en <b>profiles</b>. Si es GM/Admin General, también se agrega a <b>admins</b>.
                    </div>
                  </div>
                </div>
              </div>

              <div className="modalFoot">
                <button className="ghostBtn" onClick={closeAllModals} disabled={busy}>
                  Cancelar
                </button>
                <button className="btnSmall" onClick={createSave} disabled={busy}>
                  {busy ? "Guardando…" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* =========================
          MODAL: PERMISOS
      ========================== */}
      {permModal.open && permModal.user ? (
        <>
          <div className="backdrop show" onMouseDown={closeAllModals} />
          <div className="modalCenter" onMouseDown={closeAllModals}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHead">
                <div className="modalTitle">Permisos</div>
                <button className="iconBtn" onClick={closeAllModals} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <div className="modalBody">
                <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
                  <div style={{ fontWeight: 900 }}>{permModal.user.email}</div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>
                    {permModal.user.role === "GM"
                      ? `Game Master • ${permModal.user.branch || "sin sucursal"}`
                      : permModal.user.role === "ADMIN_GENERAL"
                      ? "Admin General"
                      : "Cliente"}
                  </div>
                </div>

                {!permModal.user._isStaff ? (
                  <div className="panel" style={{ padding: 12 }}>
                    <div style={{ opacity: 0.85, fontSize: 12 }}>
                      Los permisos aplican solo a staff (tabla <b>admins</b>).
                    </div>
                  </div>
                ) : permModal.user.role === "ADMIN_GENERAL" ? (
                  <div className="panel" style={{ padding: 12 }}>
                    <div style={{ opacity: 0.85, fontSize: 12 }}>Admin General tiene permisos implícitos.</div>
                  </div>
                ) : (
                  <div className="panel" style={{ padding: 12 }}>
                    <div style={{ fontWeight: 900, marginBottom: 10 }}>Permisos (GM)</div>

                    <div className="permGrid">
                      <div className="panel" style={{ padding: 10, gridColumn: "1 / -1" }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>Salas</div>

                        <label className="permItem">
                          <input
                            type="checkbox"
                            checked={Boolean(permModal.user?.permissions?.canEditRankings)}
                            onChange={(e) => patchPerm("canEditRankings", e.target.checked)}
                            disabled={!canManageUsers || busy}
                          />
                          <span>Modificar ranking</span>
                        </label>

                        <label className="permItem">
                          <input
                            type="checkbox"
                            checked={Boolean(permModal.user?.permissions?.canManageRooms)}
                            onChange={(e) => patchPerm("canManageRooms", e.target.checked)}
                            disabled={!canManageUsers || busy}
                          />
                          <span>Crear / editar salas (incluye “Nueva sala”)</span>
                        </label>
                      </div>

                      <div className="panel" style={{ padding: 10, gridColumn: "1 / -1" }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>Contenido</div>

                        <label className="permItem">
                          <input
                            type="checkbox"
                            checked={Boolean(permModal.user?.permissions?.canManageNews)}
                            onChange={(e) => patchPerm("canManageNews", e.target.checked)}
                            disabled={!canManageUsers || busy}
                          />
                          <span>Novedades</span>
                        </label>
                      </div>

                      <div className="panel" style={{ padding: 10, gridColumn: "1 / -1" }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>Usuarios</div>

                        <label className="permItem">
                          <input
                            type="checkbox"
                            checked={Boolean(permModal.user?.permissions?.canManageUsers)}
                            onChange={(e) => patchPerm("canManageUsers", e.target.checked)}
                            disabled={!canManageUsers || busy}
                          />
                          <span>Acceso a panel de usuarios</span>
                        </label>
                      </div>

                      <div className="panel" style={{ padding: 10, gridColumn: "1 / -1" }}>
                        <div style={{ fontWeight: 900, marginBottom: 8 }}>Extras</div>

                        <label className="permItem">
                          <input
                            type="checkbox"
                            checked={Boolean(permModal.user?.permissions?.canAwardKeys)}
                            onChange={(e) => patchPerm("canAwardKeys", e.target.checked)}
                            disabled={!canManageUsers || busy}
                          />
                          <span>Otorgar llaves</span>
                        </label>

                        <label className="permItem">
                          <input
                            type="checkbox"
                            checked={Boolean(permModal.user?.permissions?.canResetClientPassword)}
                            onChange={(e) => patchPerm("canResetClientPassword", e.target.checked)}
                            disabled={!canManageUsers || busy}
                          />
                          <span>Resetear contraseña cliente</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="modalFoot">
                <button className="ghostBtn" onClick={closeAllModals} disabled={busy}>
                  Cancelar
                </button>
                <button className="btnSmall" onClick={savePerms} disabled={busy || !canManageUsers}>
                  {busy ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* =========================
          MODAL: RESET
      ========================== */}
      {resetModal.open && resetModal.user ? (
        <>
          <div className="backdrop show" onMouseDown={closeAllModals} />
          <div className="modalCenter" onMouseDown={closeAllModals}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHead">
                <div className="modalTitle">Resetear contraseña</div>
                <button className="iconBtn" onClick={closeAllModals} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <div className="modalBody">
                <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
                  <div style={{ fontWeight: 900 }}>{resetModal.user.email}</div>
                </div>

                <div className="formGrid2">
                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Nueva contraseña</span>
                    <input className="input" type="password" value={resetPass1} onChange={(e) => setResetPass1(e.target.value)} placeholder="Mínimo 6 caracteres" />
                  </label>

                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Confirmar contraseña</span>
                    <input className="input" type="password" value={resetPass2} onChange={(e) => setResetPass2(e.target.value)} placeholder="Repetí la contraseña" />
                  </label>
                </div>
              </div>

              <div className="modalFoot">
                <button className="ghostBtn" onClick={closeAllModals} disabled={busy}>
                  Cancelar
                </button>
                <button className="btnSmall" onClick={resetPassword} disabled={busy || !canManageUsers}>
                  {busy ? "Aplicando…" : "Resetear"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* =========================
          MODAL: DELETE
      ========================== */}
      {deleteModal.open && deleteModal.user ? (
        <>
          <div className="backdrop show" onMouseDown={closeAllModals} />
          <div className="modalCenter" onMouseDown={closeAllModals}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHead">
                <div className="modalTitle">Eliminar usuario</div>
                <button className="iconBtn" onClick={closeAllModals} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <div className="modalBody">
                <div className="panel" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>{deleteModal.user.email}</div>
                  <div style={{ marginTop: 10, color: "rgba(255,255,255,.75)", fontSize: 12 }}>
                    ¿Seguro? Esto borra el usuario (Auth + tablas) vía Edge Function.
                  </div>
                </div>
              </div>

              <div className="modalFoot">
                <button className="ghostBtn" onClick={closeAllModals} disabled={busy}>
                  Cancelar
                </button>
                <button className="dangerBtnInline" onClick={deleteUser} disabled={busy || !canManageUsers}>
                  {busy ? "Borrando…" : "Eliminar"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

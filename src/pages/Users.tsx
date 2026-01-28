import React, { useEffect, useMemo, useRef, useState } from "react";

// ✅ mismas sucursales que Rooms
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

type UserRole = "CLIENT" | "GM" | "ADMIN";

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
  alias: string; // solo CLIENT
  email: string;
  role: UserRole;
  branch: Branch | ""; // solo GM
  active: boolean;
  permissions: UserPermissions;
};

const defaultPerms = (): UserPermissions => ({
  canManageRooms: false,
  canManageNews: false,
  canManageUsers: false,
  canEditRankings: false,
  canAwardKeys: false,
  canResetClientPassword: true,
});

// ✅ mock inicial (después se conecta a Supabase)
const MOCK_USERS: User[] = [
  {
    id: "u_admin_1",
    firstName: "Admin",
    lastName: "General",
    alias: "",
    email: "admin@escapegames.com",
    role: "ADMIN",
    branch: "",
    active: true,
    permissions: {
      canManageRooms: true,
      canManageNews: true,
      canManageUsers: true,
      canEditRankings: true,
      canAwardKeys: true,
      canResetClientPassword: true,
    },
  },
  {
    id: "u_gm_1",
    firstName: "Sofi",
    lastName: "GM",
    alias: "",
    email: "gm.nunez@escapegames.com",
    role: "GM",
    branch: "Nuñez",
    active: true,
    permissions: {
      canManageRooms: false,
      canManageNews: false,
      canManageUsers: false,
      canEditRankings: true,
      canAwardKeys: true,
      canResetClientPassword: true,
    },
  },
  {
    id: "u_client_1",
    firstName: "Marcos",
    lastName: "Pérez",
    alias: "marcos.p",
    email: "marcos@mail.com",
    role: "CLIENT",
    branch: "",
    active: true,
    permissions: defaultPerms(),
  },
];

function safeRole(v: any): UserRole {
  return v === "CLIENT" || v === "GM" || v === "ADMIN" ? v : "CLIENT";
}

function newUserTemplate(): User {
  const id = crypto.randomUUID();
  return {
    id,
    firstName: "",
    lastName: "",
    alias: "",
    email: "",
    role: "CLIENT",
    branch: "",
    active: true,
    permissions: defaultPerms(),
  };
}

export default function Users() {
  // ✅ por ahora: asumimos admin general logueado
  const isAdmin = true;

  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [branchFilter, setBranchFilter] = useState<Branch | "">("");

  // menú ⋯ por fila
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // modales
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

  // ✅ crear usuario
  const [createModal, setCreateModal] = useState<{ open: boolean; user: User | null }>({
    open: false,
    user: null,
  });

  const [resetPass1, setResetPass1] = useState("");
  const [resetPass2, setResetPass2] = useState("");
  const [busy, setBusy] = useState(false);

  // ✅ SOLO EN USUARIOS: full width
  useEffect(() => {
    document.body.classList.add("users-fullwidth");
    return () => document.body.classList.remove("users-fullwidth");
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const data = MOCK_USERS;
      if (!mounted) return;
      setItems(data);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // ✅ click afuera para cerrar menú ⋯ (sin refs que se pisan)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuOpenId) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;

      // si clickeo dentro de acciones/menu, no cierro
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

  const patchUser = (id: string, patch: Partial<User>) => {
    setItems((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u;
        const next: User = { ...u, ...patch };

        if (next.role !== "CLIENT") next.alias = "";
        if (next.role !== "GM") next.branch = "";
        if (next.role === "GM" && !next.branch) next.branch = "Nuñez";

        return next;
      })
    );
  };

  const patchPerms = (id: string, patch: Partial<UserPermissions>) => {
    setItems((prev) =>
      prev.map((u) => (u.id === id ? { ...u, permissions: { ...u.permissions, ...patch } } : u))
    );
  };

  const closeAllModals = () => {
    setPermModal({ open: false, user: null });
    setResetModal({ open: false, user: null });
    setDeleteModal({ open: false, user: null });
    setCreateModal({ open: false, user: null });
  };

  const openPerms = (u: User) => {
    setMenuOpenId(null);
    setPermModal({ open: true, user: { ...u } });
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

  const toggleActive = (u: User) => {
    patchUser(u.id, { active: !u.active });
  };

  const savePerms = async () => {
    if (!permModal.user) return;
    setBusy(true);
    try {
      // en front ya se refleja por patchPerms/patchUser
      closeAllModals();
      alert("Permisos guardados (front). Después lo conectamos a DB.");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    const u = resetModal.user;
    if (!u) return;

    if (resetPass1.length < 6) return alert("La contraseña debe tener mínimo 6 caracteres.");
    if (resetPass1 !== resetPass2) return alert("Las contraseñas no coinciden.");

    const ok = confirm(`¿Seguro que querés resetear la contraseña de ${u.email}?`);
    if (!ok) return;

    setBusy(true);
    try {
      closeAllModals();
      alert("Listo (front). Después va con Edge Function / Admin API.");
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async () => {
    const u = deleteModal.user;
    if (!u) return;

    const ok = confirm(`¿Seguro que querés borrar a "${u.firstName} ${u.lastName}"?`);
    if (!ok) return;

    setBusy(true);
    try {
      setItems((prev) => prev.filter((x) => x.id !== u.id));
      closeAllModals();
    } finally {
      setBusy(false);
    }
  };

  // ✅ Crear usuario
  const startCreate = () => {
    setMenuOpenId(null);
    setCreateModal({ open: true, user: newUserTemplate() });
  };

  const createSave = async () => {
    const u = createModal.user;
    if (!u) return;

    if (!u.firstName.trim()) return alert("Falta el nombre.");
    if (!u.lastName.trim()) return alert("Falta el apellido.");
    if (!u.email.trim()) return alert("Falta el mail.");

    if (u.role === "CLIENT" && !u.alias.trim()) {
      return alert("Para cliente, el alias no puede estar vacío.");
    }
    if (u.role === "GM" && !u.branch) {
      return alert("Para GM, elegí sucursal.");
    }

    setBusy(true);
    try {
      setItems((prev) => [u, ...prev]);
      closeAllModals();
      alert("Usuario creado (front). Después lo conectamos a DB.");
    } finally {
      setBusy(false);
    }
  };

  const updateCreateUser = (patch: Partial<User>) => {
    setCreateModal((prev) => {
      if (!prev.user) return prev;
      const next = { ...prev.user, ...patch };

      if (next.role !== "CLIENT") next.alias = "";
      if (next.role !== "GM") next.branch = "";
      if (next.role === "GM" && !next.branch) next.branch = "Nuñez";

      return { open: true, user: next };
    });
  };

  const updatePermModalUser = (patch: Partial<User>) => {
    setPermModal((prev) => {
      if (!prev.user) return prev;
      const next = { ...prev.user, ...patch };

      if (next.role !== "CLIENT") next.alias = "";
      if (next.role !== "GM") next.branch = "";
      if (next.role === "GM" && !next.branch) next.branch = "Nuñez";

      // reflejo en grilla
      patchUser(next.id, { role: next.role, alias: next.alias, branch: next.branch });

      return { open: true, user: next };
    });
  };

  return (
    <div className="page">
      {/* ✅ header con botón arriba a la derecha, fuera de la grilla */}
      <div className="pageHeadRow" style={{ gap: 12 }}>
        <div>
          <div className="pageTitle">Usuarios</div>
          <div className="pageSub">Grilla tipo Excel + acciones por fila (⋯).</div>
        </div>

        {isAdmin ? (
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

        <select
          className="input"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
          style={{ width: 180 }}
        >
          <option value="">Todos los roles</option>
          <option value="CLIENT">Cliente</option>
          <option value="GM">Game Master</option>
          <option value="ADMIN">Administrador</option>
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
            {/* HEADER */}
            <div className="usersRow usersHeader" role="row">
              <div className="usersCell colName" role="columnheader">
                Nombre
              </div>
              <div className="usersCell colLast" role="columnheader">
                Apellido
              </div>
              <div className="usersCell colAlias" role="columnheader">
                Alias (cliente)
              </div>
              <div className="usersCell colMail" role="columnheader">
                Mail
              </div>
              <div className="usersCell colRole" role="columnheader">
                Rol
              </div>
              <div className="usersCell colBranch" role="columnheader">
                Sucursal (GM)
              </div>
              <div className="usersCell colStatus" role="columnheader">
                Estado
              </div>
            </div>

            {/* ROWS */}
            {filtered.map((u) => {
              return (
                <div
                  className={`usersRow ${!u.active ? "isOff" : ""}`}
                  role="row"
                  key={u.id}
                  style={{ position: "relative" }} // ✅ para poder pegar el ⋯ al costado
                >
                  <div className="usersCell colName" role="cell">
                    <input
                      className="sheetInput"
                      value={u.firstName}
                      onChange={(e) => patchUser(u.id, { firstName: e.target.value })}
                      disabled={!isAdmin}
                    />
                  </div>

                  <div className="usersCell colLast" role="cell">
                    <input
                      className="sheetInput"
                      value={u.lastName}
                      onChange={(e) => patchUser(u.id, { lastName: e.target.value })}
                      disabled={!isAdmin}
                    />
                  </div>

                  <div className="usersCell colAlias" role="cell">
                    <input
                      className="sheetInput"
                      value={u.role === "CLIENT" ? u.alias : ""}
                      onChange={(e) => patchUser(u.id, { alias: e.target.value })}
                      disabled={!isAdmin || u.role !== "CLIENT"}
                      placeholder={u.role === "CLIENT" ? "alias…" : "—"}
                    />
                  </div>

                  <div className="usersCell colMail" role="cell">
                    <input
                      className="sheetInput"
                      value={u.email}
                      onChange={(e) => patchUser(u.id, { email: e.target.value })}
                      disabled={!isAdmin}
                    />
                  </div>

                  <div className="usersCell colRole" role="cell">
                    <select
                      className="sheetSelect"
                      value={u.role}
                      onChange={(e) => patchUser(u.id, { role: safeRole(e.target.value) })}
                      disabled={!isAdmin}
                    >
                      <option value="CLIENT">Cliente</option>
                      <option value="GM">Game Master</option>
                      <option value="ADMIN">Administrador</option>
                    </select>
                  </div>

                  <div className="usersCell colBranch" role="cell">
                    <select
                      className="sheetSelect"
                      value={u.role === "GM" ? u.branch : ""}
                      onChange={(e) => patchUser(u.id, { branch: e.target.value as any })}
                      disabled={!isAdmin || u.role !== "GM"}
                    >
                      <option value="">{u.role === "GM" ? "Elegir…" : "—"}</option>
                      {BRANCHES.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="usersCell colStatus" role="cell">
                    <button
                      className={u.active ? "ghostBtn sheetBtn" : "btnSmall sheetBtn"}
                      onClick={() => toggleActive(u)}
                      disabled={busy}
                      title="Activar/Desactivar"
                    >
                      {u.active ? "Activo" : "Inactivo"}
                    </button>
                  </div>

                  {/* ✅ ⋯ pegado al costado, NO columna */}
                  <div className="sheetActions">
                    <button
                      className="sheetDots"
                      onClick={() => setMenuOpenId((cur) => (cur === u.id ? null : u.id))}
                      aria-label="Opciones"
                      title="Opciones"
                    >
                      ⋯
                    </button>

                    {menuOpenId === u.id ? (
                      <div
                        className="sheetMenu"
                        onMouseDown={(e) => e.stopPropagation()} // ✅ que no se cierre antes del click
                      >
                        <button className="sheetMenuItem" onClick={() => openPerms(u)}>
                          Permisos
                        </button>
                        <button className="sheetMenuItem" onClick={() => openReset(u)}>
                          Resetear contraseña
                        </button>
                        <button className="sheetMenuItem danger" onClick={() => openDelete(u)}>
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
                    <input
                      className="input"
                      value={createModal.user.firstName}
                      onChange={(e) => updateCreateUser({ firstName: e.target.value })}
                    />
                  </label>

                  <label className="field">
                    <span className="label">Apellido</span>
                    <input
                      className="input"
                      value={createModal.user.lastName}
                      onChange={(e) => updateCreateUser({ lastName: e.target.value })}
                    />
                  </label>

                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Mail</span>
                    <input
                      className="input"
                      value={createModal.user.email}
                      onChange={(e) => updateCreateUser({ email: e.target.value })}
                      inputMode="email"
                    />
                  </label>

                  <label className="field">
                    <span className="label">Rol</span>
                    <select
                      className="input"
                      value={createModal.user.role}
                      onChange={(e) => updateCreateUser({ role: safeRole(e.target.value) })}
                    >
                      <option value="CLIENT">Cliente</option>
                      <option value="GM">Game Master</option>
                      <option value="ADMIN">Administrador</option>
                    </select>
                  </label>

                  {createModal.user.role === "CLIENT" ? (
                    <label className="field">
                      <span className="label">Alias (cliente)</span>
                      <input
                        className="input"
                        value={createModal.user.alias}
                        onChange={(e) => updateCreateUser({ alias: e.target.value })}
                      />
                    </label>
                  ) : (
                    <div />
                  )}

                  {createModal.user.role === "GM" ? (
                    <label className="field" style={{ gridColumn: "1 / -1" }}>
                      <span className="label">Sucursal (GM)</span>
                      <select
                        className="input"
                        value={createModal.user.branch}
                        onChange={(e) => updateCreateUser({ branch: e.target.value as any })}
                      >
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
                    <div style={{ fontWeight: 900, marginBottom: 10 }}>Permisos iniciales</div>
                    <div className="permGrid">
                      {[
                        ["canManageRooms", "Gestionar salas"],
                        ["canManageNews", "Gestionar novedades"],
                        ["canManageUsers", "Gestionar usuarios y permisos"],
                        ["canEditRankings", "Editar rankings (GM)"],
                        ["canAwardKeys", "Otorgar llaves (GM)"],
                        ["canResetClientPassword", "Resetear contraseña cliente"],
                      ].map(([key, label]) => {
                        const k = key as keyof UserPermissions;
                        const checked = createModal.user!.permissions[k];
                        return (
                          <label key={key} className="permItem">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setCreateModal((prev) => {
                                  if (!prev.user) return prev;
                                  return {
                                    open: true,
                                    user: {
                                      ...prev.user,
                                      permissions: { ...prev.user.permissions, [k]: e.target.checked },
                                    },
                                  };
                                })
                              }
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
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
                  <div style={{ fontWeight: 900 }}>
                    {permModal.user.firstName} {permModal.user.lastName}
                  </div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>{permModal.user.email}</div>
                </div>

                <div className="formGrid2">
                  <label className="field">
                    <span className="label">Rol</span>
                    <select
                      className="input"
                      value={permModal.user.role}
                      onChange={(e) => updatePermModalUser({ role: safeRole(e.target.value) })}
                      disabled={!isAdmin}
                    >
                      <option value="CLIENT">Cliente</option>
                      <option value="GM">Game Master</option>
                      <option value="ADMIN">Administrador</option>
                    </select>
                  </label>

                  {permModal.user.role === "GM" ? (
                    <label className="field">
                      <span className="label">Sucursal</span>
                      <select
                        className="input"
                        value={permModal.user.branch}
                        onChange={(e) => updatePermModalUser({ branch: e.target.value as any })}
                        disabled={!isAdmin}
                      >
                        <option value="">Elegir…</option>
                        {BRANCHES.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div />
                  )}

                  <div className="panel" style={{ padding: 12, gridColumn: "1 / -1" }}>
                    <div style={{ fontWeight: 900, marginBottom: 10 }}>Permisos</div>

                    <div className="permGrid">
                      {[
                        ["canManageRooms", "Gestionar salas"],
                        ["canManageNews", "Gestionar novedades"],
                        ["canManageUsers", "Gestionar usuarios y permisos"],
                        ["canEditRankings", "Editar rankings (GM)"],
                        ["canAwardKeys", "Otorgar llaves (GM)"],
                        ["canResetClientPassword", "Resetear contraseña cliente"],
                      ].map(([key, label]) => {
                        const k = key as keyof UserPermissions;
                        const checked = permModal.user!.permissions[k];
                        return (
                          <label key={key} className="permItem">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const v = e.target.checked;
                                patchPerms(permModal.user!.id, { [k]: v } as any);
                                setPermModal((prev) => {
                                  if (!prev.user) return prev;
                                  return {
                                    open: true,
                                    user: {
                                      ...prev.user,
                                      permissions: { ...prev.user.permissions, [k]: v },
                                    },
                                  };
                                });
                              }}
                              disabled={!isAdmin}
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="modalFoot">
                <button className="ghostBtn" onClick={closeAllModals} disabled={busy}>
                  Cancelar
                </button>
                <button className="btnSmall" onClick={savePerms} disabled={busy}>
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
                  <div style={{ fontWeight: 900 }}>
                    {resetModal.user.firstName} {resetModal.user.lastName}
                  </div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>{resetModal.user.email}</div>
                </div>

                <div className="formGrid2">
                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Nueva contraseña</span>
                    <input
                      className="input"
                      type="password"
                      value={resetPass1}
                      onChange={(e) => setResetPass1(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </label>

                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Confirmar contraseña</span>
                    <input
                      className="input"
                      type="password"
                      value={resetPass2}
                      onChange={(e) => setResetPass2(e.target.value)}
                      placeholder="Repetí la contraseña"
                    />
                  </label>
                </div>
              </div>

              <div className="modalFoot">
                <button className="ghostBtn" onClick={closeAllModals} disabled={busy}>
                  Cancelar
                </button>
                <button className="btnSmall" onClick={resetPassword} disabled={busy}>
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
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>
                    {deleteModal.user.firstName} {deleteModal.user.lastName}
                  </div>
                  <div style={{ opacity: 0.85, fontSize: 12 }}>{deleteModal.user.email}</div>
                  <div style={{ marginTop: 10, color: "rgba(255,255,255,.75)", fontSize: 12 }}>
                    ¿Seguro? Esta acción no se puede deshacer.
                  </div>
                </div>
              </div>

              <div className="modalFoot">
                <button className="ghostBtn" onClick={closeAllModals} disabled={busy}>
                  Cancelar
                </button>
                <button className="dangerBtnInline" onClick={deleteUser} disabled={busy}>
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


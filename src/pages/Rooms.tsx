import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type RoomCategory = "WOW" | "CLASICO" | "DESPEDIDA";
type RoomLevel = "FACIL" | "INTERMEDIO" | "AVANZADO";

// ✅ sucursales fijas (admin only)
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

// ✅ Temáticas múltiples (hasta 4)
const ROOM_THEMES_MULTI = [
  "magia",
  "hallazgo",
  "mision secreta",
  "espacial",
  "allanamiento",
  "maldicion",
  "fantasia",
  "Terror Psicologico",
  "accion",
  "surrealista",
  "humor",
  "fuga policial",
  "venganza",
  "fuga",
  "Terror",
  "suspenso",
  "aventura",
  "rescate",
  "investigación",
  "thriller",
  "problemas",
  "clandestina",
  "zombies",
  "psicologico",
  "paranormal",
  "robo",
  "enredos",
  "policial",
] as const;

// ✅ helpers
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const isMMSS = (v: string) => /^\d{2}:\d{2}$/.test(v);
const isBranch = (v: any): v is Branch => BRANCHES.includes(v);

const uniq = (arr: string[]) => Array.from(new Set(arr));
const normalizeThemes = (arr: string[]) => uniq(arr.map((x) => (x || "").trim()).filter(Boolean)).slice(0, 4);

const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

type Room = {
  id: string;
  photo: string;
  photoPosition: number;
  name: string;
  description: string;

  category: RoomCategory;

  // ✅ sucursal
  branch: Branch;

  // ✅ OJO: en DB se guarda en `tags` (text[])
  tags: string[];

  // ✅ NUEVO: link reserva (DB: reserve_url)
  reserveUrl: string;

  playersMin: number;
  playersMax: number;

  difficulty: number;
  level: RoomLevel;
  surprise: number;
  record1: string;
  record2: string;
  points: 1 | 2 | 3;
  active: boolean;
};

const CAT_LABEL: Record<RoomCategory, string> = {
  WOW: "WOW",
  CLASICO: "Clásico (20%)",
  DESPEDIDA: "Despedida",
};

const LEVEL_LABEL: Record<RoomLevel, string> = {
  FACIL: "Fácil",
  INTERMEDIO: "Intermedio",
  AVANZADO: "Avanzado",
};

function Dots({ total, value }: { total: number; value: number }) {
  const v = clamp(value, 0, total);
  return (
    <div className="dots">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={i < v ? "dot on" : "dot"} />
      ))}
    </div>
  );
}

function fromDb(row: any): Room {
  return {
    id: row.id,
    photo: row.photo_url || "",
    photoPosition: typeof row.photo_position === "number" ? Math.round(row.photo_position) : 50,
    name: row.name || "",
    description: row.description || "",
    category: row.category as RoomCategory,
    branch: isBranch(row.branch) ? row.branch : "Nuñez",

    // ✅ temáticas múltiples: vienen de tags
    tags: Array.isArray(row.tags) ? normalizeThemes(row.tags.map(String)) : [],

    // ✅ NUEVO
    reserveUrl: String(row.reserve_url || ""),

    playersMin: Number(row.players_min ?? 1),
    playersMax: Number(row.players_max ?? 6),

    difficulty: Number(row.difficulty ?? 5),
    level: row.level as RoomLevel,
    surprise: Number(row.surprise ?? 5),
    record1: row.record1 || "00:00",
    record2: row.record2 || "00:00",
    points: Number(row.points ?? 1) as 1 | 2 | 3,
    active: Boolean(row.active),
  };
}

function toDb(room: Room) {
  return {
    id: room.id,
    photo_url: room.photo || null,
    photo_position: Math.round(clamp(room.photoPosition, 0, 100)),

    name: room.name,
    description: room.description || null,
    category: room.category,

    branch: room.branch,

    // ✅ temáticas múltiples a DB: tags text[]
    tags: normalizeThemes(room.tags || []),

    // ✅ NUEVO: link reserva
    reserve_url: room.reserveUrl ? room.reserveUrl.trim() : null,

    players_min: clamp(Number(room.playersMin ?? 1), 1, 6),
    players_max: clamp(Number(room.playersMax ?? 6), 1, 6),

    difficulty: clamp(Number(room.difficulty ?? 5), 1, 10),
    level: room.level,
    surprise: clamp(Number(room.surprise ?? 5), 1, 10),

    record1: room.record1,
    record2: room.record2,

    points: room.points,
    active: room.active,
    updated_at: new Date().toISOString(),
  };
}

async function uploadRoomImage(file: File, roomId: string): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
  const path = `rooms/${roomId}/${Date.now()}.${safeExt}`;

  const { error: upErr } = await supabase.storage.from("rooms").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from("rooms").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("No pude obtener la URL pública de la imagen.");
  return data.publicUrl;
}

export default function Rooms() {
  const [items, setItems] = useState<Room[]>([]);
  const [q, setQ] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [editingPhotoFile, setEditingPhotoFile] = useState<File | null>(null);
  const [tempPreviewUrl, setTempPreviewUrl] = useState<string | null>(null);

  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const dragStartRef = useRef<{ y: number; startPos: number; h: number } | null>(null);

  // ✅ Multi-select temáticas (guardan en tags)
  const [themesOpen, setThemesOpen] = useState(false);
  const themesWrapRef = useRef<HTMLDivElement | null>(null);

  const selectedThemes = normalizeThemes(editing?.tags || []);
  const atThemesLimit = selectedThemes.length >= 4;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!themesOpen) return;
      const el = themesWrapRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setThemesOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setThemesOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [themesOpen]);

  const toggleTheme = (t: string) => {
    if (!editing) return;
    const current = normalizeThemes(editing.tags || []);
    const has = current.includes(t);

    let next = current;
    if (has) next = current.filter((x) => x !== t);
    else {
      if (current.length >= 4) return;
      next = [...current, t];
    }

    setEditing({ ...editing, tags: next });
  };

  const clearThemes = () => {
    if (!editing) return;
    setEditing({ ...editing, tags: [] });
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((r) => {
      const okSearch = !s ? true : r.name.toLowerCase().includes(s);
      const okBranch = !branchFilter ? true : r.branch === branchFilter;
      return okSearch && okBranch;
    });
  }, [items, q, branchFilter]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("rooms_v2").select("*").order("created_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error(error);
        alert("Error cargando salas. Revisá conexión o RLS.");
        setItems([]);
      } else {
        setItems((data ?? []).map(fromDb));
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
      if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeModal = () => {
    setOpen(false);
    setEditing(null);
    setEditingPhotoFile(null);
    setThemesOpen(false);
    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const startCreate = () => {
    const id = crypto.randomUUID();
    setEditing({
      id,
      photo: "",
      photoPosition: 50,
      name: "",
      description: "",
      category: "WOW",
      branch: "Nuñez",

      tags: [],

      // ✅ NUEVO
      reserveUrl: "",

      playersMin: 1,
      playersMax: 6,

      difficulty: 5,
      level: "FACIL",
      surprise: 5,
      record1: "00:00",
      record2: "00:00",
      points: 1,
      active: true,
    });
    setEditingPhotoFile(null);
    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);
    setOpen(true);
  };

  const startEdit = (r: Room) => {
    setEditing({
      ...r,
      playersMin: r.playersMin ?? 1,
      branch: r.branch ?? "Nuñez",
      tags: Array.isArray(r.tags) ? normalizeThemes(r.tags) : [],
      reserveUrl: r.reserveUrl || "",
    });
    setEditingPhotoFile(null);
    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);
    setOpen(true);
  };

  const onPickImage = () => fileRef.current?.click();

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Elegí una imagen (JPG/PNG/WebP).");
      e.target.value = "";
      return;
    }

    setEditingPhotoFile(file);

    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    const url = URL.createObjectURL(file);
    setTempPreviewUrl(url);

    setEditing((prev) => (prev ? { ...prev, photo: url, photoPosition: prev.photoPosition ?? 50 } : prev));
  };

  const removeImage = () => {
    setEditingPhotoFile(null);
    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);
    setEditing((prev) => (prev ? { ...prev, photo: "" } : prev));
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPreviewMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!editing?.photo) return;

    const el = previewWrapRef.current;
    if (!el) return;

    draggingRef.current = true;
    const rect = el.getBoundingClientRect();
    dragStartRef.current = {
      y: e.clientY,
      startPos: editing.photoPosition ?? 50,
      h: Math.max(1, rect.height),
    };
  };

  const onPreviewMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!draggingRef.current || !dragStartRef.current || !editing) return;

    const dy = e.clientY - dragStartRef.current.y;
    const delta = (dy / dragStartRef.current.h) * 100;
    const next = Math.round(clamp(dragStartRef.current.startPos + delta, 0, 100));

    setEditing({ ...editing, photoPosition: next });
  };

  const endDrag = () => {
    draggingRef.current = false;
    dragStartRef.current = null;
  };

  const save = async () => {
    if (!editing) return;

    if (!editing.name.trim()) return alert("Poné el nombre de la sala.");
    if (!isMMSS(editing.record1) || !isMMSS(editing.record2)) {
      return alert("Récord debe ser MM:SS (ej: 12:34).");
    }

    // ✅ valida link si está
    if (editing.reserveUrl && !isHttpUrl(editing.reserveUrl)) {
      return alert("El link de reserva debe empezar con http/https (ej: https://...).");
    }

    const isNew = !items.some((x) => x.id === editing.id);
    if (isNew && !editingPhotoFile && !editing.photo) {
      return alert("Seleccioná una imagen para la sala.");
    }

    setSaving(true);
    try {
      let finalPhotoUrl = editing.photo;

      if (editingPhotoFile) {
        finalPhotoUrl = await uploadRoomImage(editingPhotoFile, editing.id);
      } else {
        if (finalPhotoUrl && !/^https?:\/\//i.test(finalPhotoUrl)) finalPhotoUrl = "";
      }

      const payload = toDb({
        ...editing,
        photo: finalPhotoUrl,
        playersMin: editing.playersMin ?? 1,
        branch: (editing.branch ?? "Nuñez") as Branch,
        tags: normalizeThemes(editing.tags || []),
        reserveUrl: (editing.reserveUrl || "").trim(),
      });

      const { data, error } = await supabase.from("rooms_v2").upsert(payload, { onConflict: "id" }).select("*").single();
      if (error) throw error;

      const saved = fromDb(data);

      setItems((prev) => {
        const exists = prev.some((p) => p.id === saved.id);
        return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev];
      });

      closeModal();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Error guardando sala.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string) => {
    const current = items.find((x) => x.id === id);
    if (!current) return;

    const next = { ...current, active: !current.active };
    setItems((prev) => prev.map((p) => (p.id === id ? next : p)));

    const { error } = await supabase.from("rooms_v2").update({ active: next.active }).eq("id", id);
    if (error) {
      console.error(error);
      alert("No pude actualizar estado (revisá rol admin / policies).");
      setItems((prev) => prev.map((p) => (p.id === id ? current : p)));
    }
  };

  // ✅ NUEVO: borrar sala (DB + intento de borrar imagen)
  const deleteRoom = async (room: Room) => {
    const ok = confirm(`¿Seguro que querés borrar "${room.name}"? Esta acción no se puede deshacer.`);
    if (!ok) return;

    const prev = items;
    setItems((p) => p.filter((x) => x.id !== room.id));

    try {
      // (Opcional) intento borrar la imagen del bucket "rooms" si viene de publicUrl del mismo bucket
      if (room.photo && room.photo.includes("/storage/v1/object/public/rooms/")) {
        const idx = room.photo.indexOf("/storage/v1/object/public/rooms/");
        const path = room.photo.slice(idx + "/storage/v1/object/public/rooms/".length).split("?")[0];

        const { error: storageErr } = await supabase.storage.from("rooms").remove([path]);
        if (storageErr) console.warn("No pude borrar imagen en storage:", storageErr);
      }

      const { error } = await supabase.from("rooms_v2").delete().eq("id", room.id);
      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No pude borrar la sala (revisá RLS / permisos).");
      setItems(prev); // rollback
    }
  };

  return (
    <div className="page">
      <div className="pageHeadRow">
        <div>
          <div className="pageTitle">Salas</div>
          <div className="pageSub">Panel conectado a Supabase (DB + Storage).</div>
        </div>

        <button className="btnSmall" onClick={startCreate}>
          + Nueva sala
        </button>
      </div>

      <div className="toolbarRow" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre…" style={{ flex: 1 }} />

        <select className="input" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} style={{ width: 220 }}>
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
          Cargando salas…
        </div>
      ) : (
        <div className="roomsScroll">
          <div className="roomsGrid">
            {filtered.map((r) => (
              <div key={r.id} className="roomCard">
                <div className="roomImgWrap">
                  <img
                    src={r.photo || "https://picsum.photos/seed/placeholder/900/520"}
                    alt={r.name}
                    style={{ objectFit: "cover", objectPosition: `50% ${r.photoPosition}%` }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "https://picsum.photos/seed/placeholder/900/520";
                    }}
                  />
                  <div className="roomBadge">{CAT_LABEL[r.category]}</div>
                  {!r.active && <div className="roomBadge off">INACTIVA</div>}
                </div>

                <div className="roomBody">
                  <div className="roomTitle">{r.name}</div>

                  <div style={{ opacity: 0.82, fontSize: 12, marginBottom: 8, lineHeight: 1.3 }}>
                    <b>Sucursal:</b> {r.branch}
                  </div>

                  {/* ✅ NUEVO: mostrar link (solo visual) */}
                  {r.reserveUrl ? (
                    <div style={{ opacity: 0.82, fontSize: 12, marginBottom: 8, lineHeight: 1.3 }}>
                      <b>Reserva:</b> {r.reserveUrl.length > 48 ? r.reserveUrl.slice(0, 48) + "…" : r.reserveUrl}
                    </div>
                  ) : null}

                  {Array.isArray(r.tags) && r.tags.length ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      {r.tags.slice(0, 4).map((t) => (
                        <span key={t} className="tagChip">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {r.description ? <div style={{ opacity: 0.82, fontSize: 12, marginBottom: 8, lineHeight: 1.3 }}>{r.description}</div> : null}

                  <div className="roomMeta">
                    <div className="metaRow">
                      <span className="metaLabel">Jugadores</span>
                      <Dots total={6} value={r.playersMax} />
                      <span className="metaValue">
                        {r.playersMin}–{r.playersMax}
                      </span>
                    </div>

                    <div className="metaRow">
                      <span className="metaLabel">Dificultad</span>
                      <Dots total={10} value={r.difficulty} />
                      <span className="metaValue">{r.difficulty}/10</span>
                    </div>

                    <div className="metaMini">
                      <span>✨ Sorpresa {r.surprise}/10</span>
                      <span>🏆 {r.record1}</span>
                      <span>🥈 {r.record2}</span>
                      <span>🎖️ {r.points}/3</span>
                      <span>📌 {LEVEL_LABEL[r.level]}</span>
                    </div>
                  </div>

                  <div className="roomActions">
                    <button className="ghostBtn" onClick={() => startEdit(r)}>
                      Editar
                    </button>

                    <button className={r.active ? "dangerBtnInline" : "btnSmall"} onClick={() => toggleActive(r.id)}>
                      {r.active ? "Desactivar" : "Activar"}
                    </button>

                    <button className="dangerBtnInline" onClick={() => deleteRoom(r)}>
                      Borrar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {open && editing && (
        <>
          <div className="backdrop show" onMouseDown={closeModal} />
          <div className="modalCenter" onMouseDown={closeModal}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHead">
                <div className="modalTitle">{items.some((x) => x.id === editing.id) ? "Editar sala" : "Nueva sala"}</div>
                <button className="iconBtn" onClick={closeModal} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <div className="modalBody">
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />

                <div className="formGrid2">
                  <label className="field">
                    <span className="label">Nombre</span>
                    <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  </label>

                  <label className="field">
                    <span className="label">Categoría</span>
                    <select className="input" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as RoomCategory })}>
                      <option value="WOW">WOW</option>
                      <option value="CLASICO">Clásico (20%)</option>
                      <option value="DESPEDIDA">Despedida</option>
                    </select>
                  </label>

                  {/* ✅ NUEVO: Link de reserva (manual) */}
                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Link de reserva</span>
                    <input
                      className="input"
                      value={editing.reserveUrl}
                      onChange={(e) => setEditing({ ...editing, reserveUrl: e.target.value })}
                      placeholder="https://..."
                      inputMode="url"
                    />
                  </label>

                  {/* ✅ Temáticas multi (hasta 4) - guardan en tags */}
                  <div className="field" ref={themesWrapRef}>
                    <span className="label">Temáticas (hasta 4)</span>

                    <button type="button" className="input multiSelectBtn" onClick={() => setThemesOpen((v) => !v)} aria-expanded={themesOpen}>
                      {selectedThemes.length ? (
                        <span className="multiSelectValue">
                          {selectedThemes.map((t) => (
                            <span key={t} className="tagChip">
                              {t}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span style={{ opacity: 0.75 }}>Elegí hasta 4…</span>
                      )}
                      <span className="multiSelectCaret">▾</span>
                    </button>

                    {themesOpen && (
                      <div className="multiSelectPanel">
                        <div className="multiSelectTop">
                          <div style={{ opacity: 0.85, fontSize: 12 }}>
                            Seleccionadas: <b>{selectedThemes.length}</b>/4
                          </div>
                          <button type="button" className="ghostBtn" onClick={clearThemes} disabled={!selectedThemes.length}>
                            Limpiar
                          </button>
                        </div>

                        <div className="multiSelectList">
                          {ROOM_THEMES_MULTI.map((t) => {
                            const checked = selectedThemes.includes(t);
                            const disabled = !checked && atThemesLimit;
                            return (
                              <label key={t} className={`multiSelectItem ${disabled ? "disabled" : ""}`}>
                                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleTheme(t)} />
                                <span>{t}</span>
                              </label>
                            );
                          })}
                        </div>

                        {atThemesLimit ? <div className="multiSelectHint">Llegaste al máximo de 4 temáticas.</div> : null}
                      </div>
                    )}
                  </div>

                  {/* ✅ Sucursal */}
                  <label className="field">
                    <span className="label">Sucursal</span>
                    <select className="input" value={editing.branch} onChange={(e) => setEditing({ ...editing, branch: e.target.value as Branch })}>
                      {BRANCHES.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Descripción (breve)</span>
                    <textarea
                      className="input"
                      value={editing.description}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      rows={3}
                      placeholder="Ej: Terror psicológico, luces bajas, mucho susto…"
                      style={{ resize: "vertical" }}
                    />
                  </label>

                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Foto de la sala</span>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <button type="button" className="btnSmall" onClick={onPickImage}>
                        Elegir imagen…
                      </button>

                      {editing.photo ? (
                        <button type="button" className="ghostBtn" onClick={removeImage}>
                          Quitar
                        </button>
                      ) : (
                        <span style={{ opacity: 0.8, fontSize: 12 }}>No hay imagen seleccionada</span>
                      )}
                    </div>

                    {editing.photo ? (
                      <div
                        ref={previewWrapRef}
                        onMouseDown={onPreviewMouseDown}
                        onMouseMove={onPreviewMouseMove}
                        onMouseUp={endDrag}
                        onMouseLeave={endDrag}
                        style={{
                          marginTop: 10,
                          borderRadius: 14,
                          overflow: "hidden",
                          border: "1px solid rgba(255,255,255,.12)",
                          background: "rgba(0,0,0,.25)",
                          cursor: "grab",
                          userSelect: "none",
                        }}
                      >
                        <img
                          src={editing.photo}
                          alt="Preview"
                          style={{
                            width: "100%",
                            height: 220,
                            objectFit: "cover",
                            objectPosition: `50% ${editing.photoPosition}%`,
                            display: "block",
                            pointerEvents: "none",
                          }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <label className="field">
                    <span className="label">Jugadores (1–6)</span>
                    <input
                      className="input"
                      value={String(editing.playersMax)}
                      onChange={(e) => setEditing({ ...editing, playersMax: clamp(Number(e.target.value || 1), 1, 6) })}
                      inputMode="numeric"
                    />
                  </label>

                  <label className="field">
                    <span className="label">Dificultad (1–10)</span>
                    <input
                      className="input"
                      value={String(editing.difficulty)}
                      onChange={(e) => setEditing({ ...editing, difficulty: clamp(Number(e.target.value || 1), 1, 10) })}
                      inputMode="numeric"
                    />
                  </label>

                  <label className="field">
                    <span className="label">Nivel</span>
                    <select className="input" value={editing.level} onChange={(e) => setEditing({ ...editing, level: e.target.value as RoomLevel })}>
                      <option value="FACIL">Fácil</option>
                      <option value="INTERMEDIO">Intermedio</option>
                      <option value="AVANZADO">Avanzado</option>
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Factor Sorpresa (1–10)</span>
                    <input
                      className="input"
                      value={String(editing.surprise)}
                      onChange={(e) => setEditing({ ...editing, surprise: clamp(Number(e.target.value || 1), 1, 10) })}
                      inputMode="numeric"
                    />
                  </label>

                  <label className="field">
                    <span className="label">Récord 1 (copa) MM:SS</span>
                    <input className="input" value={editing.record1} onChange={(e) => setEditing({ ...editing, record1: e.target.value })} placeholder="12:34" />
                  </label>

                  <label className="field">
                    <span className="label">Récord 2 (medalla) MM:SS</span>
                    <input className="input" value={editing.record2} onChange={(e) => setEditing({ ...editing, record2: e.target.value })} placeholder="14:10" />
                  </label>

                  <label className="field">
                    <span className="label">Puntaje (1–3)</span>
                    <input
                      className="input"
                      value={String(editing.points)}
                      onChange={(e) => setEditing({ ...editing, points: clamp(Number(e.target.value || 1), 1, 3) as 1 | 2 | 3 })}
                      inputMode="numeric"
                    />
                  </label>
                </div>
              </div>

              <div className="modalFoot">
                <button className="ghostBtn" onClick={closeModal} disabled={saving}>
                  Cancelar
                </button>
                <button className="btnSmall" onClick={save} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { QRCodeCanvas } from "qrcode.react";

type RoomCategory = "WOW" | "CLASICO" | "DESPEDIDA";
type RoomLevel = "FACIL" | "INTERMEDIO" | "AVANZADO";

// ✅ sucursales fijas
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

// ✅ Bomb Ticket QR (beneficio)
const BOMB_TICKET_QR = "EG-BOMB-2026-NUÑEZ";
const BOMB_CANVAS_ID = "qr_canvas_bomb_ticket";

// ✅ helpers
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const isBranch = (v: any): v is Branch => BRANCHES.includes(v);
// MM:SS (00:00 a 99:59)
const isMMSS = (v: string) => /^\d{2}:\d{2}$/.test(v);

const uniq = (arr: string[]) => Array.from(new Set(arr));
const normalizeThemes = (arr: string[]) =>
  uniq(arr.map((x) => (x || "").trim()).filter(Boolean)).slice(0, 4);

const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

// ✅ QR estable por sala
const makeRoomQr = (roomId: string) => `EG-ROOM-${roomId}`;

type Room = {
  id: string;
  branch_id?: number | null; // ✅ NUEVO: para scoping real
  photo: string;
  photoPosition: number;
  name: string;
  description: string;
  category: RoomCategory;
  branch: Branch;
  tags: string[];
  reserveUrl: string;
  whatsappPhone: string;
  playersMin: number;
  playersMax: number;
  difficulty: number;
  level: RoomLevel;
  surprise: number;
  record1: string;
  record2: string;
  points: 1 | 2 | 3;
  qrCode: string;
  active: boolean;
};

type StaffPerms = {
  canManageRooms: boolean;
  canEditRankings: boolean;
};

type MyAuth = {
  isAuthed: boolean;
  isSuper: boolean;
  // “GM” clásico por gm_code
  isGM: boolean;
  // scoped = no super y con branch asignada (aunque gm_code sea null)
  isBranchScoped: boolean;
  branchId: number | null;
  branchLabel: Branch | "";
  perms: StaffPerms;
  ready: boolean; // ✅ auth loaded
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
  const qr = String(row.qr_code || "").trim();
  return {
    id: row.id,
    branch_id: row.branch_id ?? null, // ✅ NUEVO
    photo: row.photo_url || "",
    photoPosition: typeof row.photo_position === "number" ? Math.round(row.photo_position) : 50,
    name: row.name || "",
    description: row.description || "",
    category: row.category as RoomCategory,
    branch: isBranch(row.branch) ? row.branch : "Nuñez",
    tags: Array.isArray(row.tags) ? normalizeThemes(row.tags.map(String)) : [],
    reserveUrl: String(row.reserve_url || ""),
    whatsappPhone: String(row.whatsapp_phone || ""),
    playersMin: Number(row.players_min ?? 1),
    playersMax: Number(row.players_max ?? 6),
    difficulty: Number(row.difficulty ?? 5),
    level: row.level as RoomLevel,
    surprise: Number(row.surprise ?? 5),
    record1: row.record1 || "00:00",
    record2: row.record2 || "00:00",
    points: Number(row.points ?? 1) as 1 | 2 | 3,
    qrCode: qr || makeRoomQr(String(row.id)),
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

    tags: normalizeThemes(room.tags || []),
    reserve_url: room.reserveUrl ? room.reserveUrl.trim() : null,
    whatsapp_phone: room.whatsappPhone ? room.whatsappPhone.trim() : null,

    players_min: clamp(Number(room.playersMin ?? 1), 1, 6),
    players_max: clamp(Number(room.playersMax ?? 6), 1, 6),

    difficulty: clamp(Number(room.difficulty ?? 5), 1, 10),
    level: room.level,
    surprise: clamp(Number(room.surprise ?? 5), 1, 10),

    record1: room.record1,
    record2: room.record2,

    points: room.points,
    qr_code: room.qrCode ? room.qrCode.trim() : null,

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

function downloadPngFromCanvas(canvasId: string, filename: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return alert("No encontré el QR (canvas) para exportar.");

  const dataUrl = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function printPngFromCanvas(canvasId: string, title: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return alert("No encontré el QR (canvas) para imprimir.");

  const dataUrl = canvas.toDataURL("image/png");

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return alert("No pude abrir el frame de impresión.");
  }

  const safeTitle = String(title || "").replace(/[<>]/g, "");

  doc.open();
  doc.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${safeTitle}</title>
        <style>
          body { font-family: system-ui; padding: 24px; }
          .wrap { display:flex; flex-direction:column; gap:12px; align-items:flex-start; }
          img { width: 320px; height: 320px; image-rendering: pixelated; }
          h2 { margin: 0; }
          .hint { opacity:.7; font-size:12px; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h2>${safeTitle}</h2>
          <img id="qrimg" src="${dataUrl}" />
          <div class="hint">Imprimí al 100% (sin “ajustar a página”) para mejor lectura.</div>
        </div>
        <script>
          const img = document.getElementById("qrimg");
          img.onload = () => setTimeout(() => window.print(), 120);
        </script>
      </body>
    </html>
  `);
  doc.close();

  const remove = () => {
    try {
      document.body.removeChild(iframe);
    } catch {}
  };
  iframe.contentWindow?.addEventListener("afterprint", remove);
  setTimeout(remove, 15000);
}

type BombCardState = {
  title: string;
  description: string;
  imageUrl: string;
};

const BOMB_STORAGE_KEY = "eg_admin_bomb_card_v1";

function loadBombCard(): BombCardState {
  try {
    const raw = localStorage.getItem(BOMB_STORAGE_KEY);
    if (!raw) throw new Error("no data");
    const parsed = JSON.parse(raw);
    return {
      title: String(parsed.title || "Bomb Ticket (50% OFF)"),
      description: String(parsed.description || "QR para imprimir y entregar al cliente."),
      imageUrl: String(parsed.imageUrl || ""),
    };
  } catch {
    return {
      title: "Bomb Ticket (50% OFF)",
      description: "QR para imprimir y entregar al cliente.",
      imageUrl: "",
    };
  }
}

function saveBombCard(next: BombCardState) {
  try {
    localStorage.setItem(BOMB_STORAGE_KEY, JSON.stringify(next));
  } catch {}
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

  const [themesOpen, setThemesOpen] = useState(false);
  const themesWrapRef = useRef<HTMLDivElement | null>(null);

  const [bombEditing, setBombEditing] = useState(false);
  const [bomb, setBomb] = useState<BombCardState>(() => loadBombCard());
  const bombFileRef = useRef<HTMLInputElement | null>(null);

  const [descModal, setDescModal] = useState<{ title: string; text: string } | null>(null);

  const [recordsModal, setRecordsModal] = useState<{
    roomId: string;
    roomName: string;
    record1: string;
    record2: string;
  } | null>(null);

  const [me, setMe] = useState<MyAuth>({
    isAuthed: false,
    isSuper: false,
    isGM: false,
    isBranchScoped: false,
    branchId: null,
    branchLabel: "",
    perms: { canManageRooms: false, canEditRankings: false },
    ready: false,
  });

  const selectedThemes = normalizeThemes(editing?.tags || []);
  const atThemesLimit = selectedThemes.length >= 4;

  const canCreateRoom = me.isSuper || me.perms.canManageRooms;
  const canManageRoomFull = me.isSuper || me.perms.canManageRooms;
  const canEditRankings = me.isSuper || me.perms.canEditRankings;

  // ✅ sucursal efectiva para scoping (GM o staff con branch)
  const scopedBranch: Branch | "" = me.isBranchScoped ? me.branchLabel : "";

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!themesOpen) return;
      const el = themesWrapRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setThemesOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setThemesOpen(false);
      setBombEditing(false);
      setDescModal(null);
      setRecordsModal(null);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [themesOpen]);

  useEffect(() => {
    saveBombCard(bomb);
  }, [bomb]);

  // ✅ cargar rol/permisos desde admins
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;

        if (!uid) {
          if (mounted) setMe((p) => ({ ...p, isAuthed: false, ready: true }));
          return;
        }

        const { data: row, error } = await supabase
          .from("admins")
          .select("is_super, branch_id, permissions, gm_code")
          .eq("user_id", uid)
          .maybeSingle();

        if (error) throw error;

        if (!row) {
          if (mounted) {
            setMe({
              isAuthed: true,
              isSuper: false,
              isGM: false,
              isBranchScoped: false,
              branchId: null,
              branchLabel: "",
              perms: { canManageRooms: false, canEditRankings: false },
              ready: true,
            });
          }
          return;
        }

        const isSuper = Boolean(row.is_super);
        const branchId = row.branch_id != null ? Number(row.branch_id) : null;

        // soporta branch_id 0-based o 1-based
        const branchLabel = (() => {
          if (branchId == null) return "";
          const zeroBased = BRANCHES[branchId as number];
          if (zeroBased) return zeroBased as any;
          const oneBased = BRANCHES[(branchId as number) - 1];
          if (oneBased) return oneBased as any;
          return "";
        })();

        const isGM = !isSuper && Boolean(row.gm_code);

        // ✅ CLAVE: si NO es super y tiene branch asignada => usuario “scoped”
        // (sea GM o un admin de sucursal con permisos)
        const isBranchScoped = !isSuper && isBranch(branchLabel) && branchLabel !== "";

        const permsRaw = (row.permissions || {}) as Partial<StaffPerms>;
        const perms: StaffPerms = {
          canManageRooms: Boolean((permsRaw as any).canManageRooms),
          canEditRankings: Boolean((permsRaw as any).canEditRankings),
        };

        if (mounted) {
          setMe({
            isAuthed: true,
            isSuper,
            isGM,
            isBranchScoped,
            branchId,
            branchLabel: isBranch(branchLabel) ? branchLabel : "",
            perms,
            ready: true,
          });
        }
      } catch (e) {
        console.error("load me failed", e);
        if (mounted) setMe((p) => ({ ...p, isAuthed: false, ready: true }));
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

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

  // ✅ cargar salas (FILTRADO DESDE LA QUERY si está “scoped”)
  useEffect(() => {
    if (!me.ready) return;

    let mounted = true;

    (async () => {
      setLoading(true);

      try {
        let query = supabase.from("rooms_v2").select("*").order("created_at", { ascending: false });

        // ✅ si el usuario es “scoped”, traemos SOLO su branch_id (si no hay => nada)
        if (me.isBranchScoped) {
          if (me.branchId == null) {
            if (mounted) {
              setItems([]);
              setLoading(false);
            }
            return;
          }
          query = query.eq("branch_id", me.branchId);
        }

        const { data, error } = await query;

        if (!mounted) return;

        if (error) {
          console.error(error);
          alert("Error cargando salas. Revisá conexión o RLS.");
          setItems([]);
        } else {
          setItems((data ?? []).map(fromDb));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.ready, me.isBranchScoped, me.branchId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return items.filter((r) => {
      const okSearch = !s ? true : r.name.toLowerCase().includes(s);

      // ✅ filtro UI (solo para NO scoped)
      const okBranch = !branchFilter ? true : r.branch === branchFilter;

      // ✅ scoped (doble seguridad REAL por branch_id)
      const okScoped =
        me.isBranchScoped && me.branchId != null ? r.branch_id === me.branchId : true;

      return okSearch && okBranch && okScoped;
    });
  }, [items, q, branchFilter, me.isBranchScoped, me.branchId, scopedBranch]);

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
    if (!canCreateRoom) return alert("No tenés permiso para crear salas.");

    // si está scoped, la sucursal debe existir
    if (me.isBranchScoped && !me.branchLabel) {
      return alert("Tenés permisos, pero tu usuario no tiene sucursal asignada.");
    }

    const id = crypto.randomUUID();
    setEditing({
      id,
      branch_id: me.isBranchScoped ? me.branchId ?? null : null, // ✅ NO rompe nada
      photo: "",
      photoPosition: 50,
      name: "",
      description: "",
      category: "WOW",
      branch: me.isBranchScoped && me.branchLabel ? me.branchLabel : "Nuñez",
      tags: [],
      reserveUrl: "",
      whatsappPhone: "",
      playersMin: 1,
      playersMax: 6,
      difficulty: 5,
      level: "FACIL",
      surprise: 5,
      record1: "00:00",
      record2: "00:00",
      points: 1,
      qrCode: makeRoomQr(id),
      active: true,
    });

    setEditingPhotoFile(null);
    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);
    setOpen(true);
  };

  // ✅ modal chico de récords
  const openRecordsEditor = (r: Room) => {
    if (!canEditRankings) return alert("No tenés permiso para editar récords.");

    if (me.isBranchScoped) {
      if (me.branchId == null) return alert("Tu usuario no tiene sucursal asignada.");
      if (r.branch_id !== me.branchId) return alert("No podés editar salas de otra sucursal.");
    }

    setRecordsModal({
      roomId: r.id,
      roomName: r.name || "Sala",
      record1: r.record1 || "00:00",
      record2: r.record2 || "00:00",
    });
  };

  const saveRecords = async () => {
    if (!recordsModal) return;

    const r1 = String(recordsModal.record1 || "").trim();
    const r2 = String(recordsModal.record2 || "").trim();

    if (!isMMSS(r1) || !isMMSS(r2)) return alert("Formato inválido. Usá MM:SS (ej: 12:34).");

    setSaving(true);
    try {
      const payload = {
        record1: r1,
        record2: r2,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("rooms_v2")
        .update(payload)
        .eq("id", recordsModal.roomId)
        .select("*")
        .single();

      if (error) throw error;

      const saved = fromDb(data);
      setItems((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      setRecordsModal(null);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Error guardando récords.");
    } finally {
      setSaving(false);
    }
  };

  const startEditFull = (r: Room) => {
    if (!canManageRoomFull) return openRecordsEditor(r);

    if (me.isBranchScoped) {
      if (me.branchId == null) return alert("Tu usuario no tiene sucursal asignada.");
      if (r.branch_id !== me.branchId) return alert("No podés editar salas de otra sucursal.");
    }

    setEditing({
      ...r,
      playersMin: r.playersMin ?? 1,
      playersMax: r.playersMax ?? 6,
      branch: (r.branch ?? "Nuñez") as Branch,
      tags: Array.isArray(r.tags) ? normalizeThemes(r.tags) : [],
      reserveUrl: r.reserveUrl || "",
      whatsappPhone: r.whatsappPhone || "",
      qrCode: (r.qrCode || "").trim() || makeRoomQr(r.id),
    });

    setEditingPhotoFile(null);
    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);
    setOpen(true);
  };

  const onPickImage = () => fileRef.current?.click();

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    if (!canManageRoomFull) {
      e.target.value = "";
      return alert("No tenés permiso para cambiar la imagen.");
    }

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

    setEditing((prev) =>
      prev ? { ...prev, photo: url, photoPosition: prev.photoPosition ?? 50 } : prev
    );
  };

  const removeImage = () => {
    if (!canManageRoomFull) return alert("No tenés permiso para quitar imagen.");

    setEditingPhotoFile(null);
    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);
    setEditing((prev) => (prev ? { ...prev, photo: "" } : prev));
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPreviewMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!editing?.photo) return;
    if (!canManageRoomFull) return;

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
    if (!canManageRoomFull) return;

    const dy = e.clientY - dragStartRef.current.y;
    const delta = (dy / dragStartRef.current.h) * 100;
    const next = Math.round(clamp(dragStartRef.current.startPos + delta, 0, 100));
    setEditing({ ...editing, photoPosition: next });
  };

  const endDrag = () => {
    draggingRef.current = false;
    dragStartRef.current = null;
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {}
    }
  };

  const save = async () => {
    if (!editing) return;
    const isNew = !items.some((x) => x.id === editing.id);

    if (!canManageRoomFull) return alert("No tenés permiso para crear/editar salas completas.");

    if (me.isBranchScoped) {
      if (me.branchId == null) return alert("Tu usuario no tiene sucursal asignada.");

      // ✅ chequeo real
      if (editing.branch_id != null && editing.branch_id !== me.branchId) {
        return alert("No podés crear/editar en otra sucursal.");
      }
      // si venía null, lo fijamos
      if (editing.branch_id == null) {
        editing.branch_id = me.branchId;
      }

      // además mantenemos el label para mostrar
      if (editing.branch !== me.branchLabel) {
        return alert("No podés crear/editar en otra sucursal.");
      }
    }

    if (!editing.name.trim()) return alert("Poné el nombre de la sala.");
    if (editing.reserveUrl && !isHttpUrl(editing.reserveUrl)) {
      return alert("El link de reserva debe empezar con http/https (ej: https://...).");
    }
    if (!String(editing.qrCode || "").trim()) return alert("El QR único no puede quedar vacío.");
    if (!isMMSS(editing.record1) || !isMMSS(editing.record2)) {
      return alert("Récord debe ser MM:SS (ej: 12:34).");
    }
    if (isNew && !editingPhotoFile && !editing.photo) {
      return alert("Seleccioná una imagen para la sala.");
    }

    setSaving(true);
    try {
      let finalPhotoUrl = String(editing.photo || "").trim();

      if (editingPhotoFile) finalPhotoUrl = await uploadRoomImage(editingPhotoFile, editing.id);
      if (finalPhotoUrl && !/^https?:\/\//i.test(finalPhotoUrl)) finalPhotoUrl = "";

      if (isNew && !finalPhotoUrl) {
        return alert(
          "No pude generar la URL pública de la imagen. Revisá Storage/Policies y volvé a subir."
        );
      }

      // ✅ payload sin romper tu esquema: si tu tabla tiene branch_id int, viaja.
      // Si NO la tiene, se ignora en DB (pero ojo: supabase update con columna inexistente tira error).
      // Como vos ya la tenés, va bien.
      const payload = {
        ...toDb({
          ...editing,
          photo: finalPhotoUrl,
          playersMin: clamp(Number(editing.playersMin ?? 1), 1, 6),
          playersMax: clamp(Number(editing.playersMax ?? 6), 1, 6),
          difficulty: clamp(Number(editing.difficulty ?? 5), 1, 10),
          surprise: clamp(Number(editing.surprise ?? 5), 1, 10),
          points: clamp(Number(editing.points ?? 1), 1, 3) as 1 | 2 | 3,
          branch: (editing.branch ?? "Nuñez") as Branch,
          tags: normalizeThemes(editing.tags || []),
          reserveUrl: (editing.reserveUrl || "").trim(),
          whatsappPhone: (editing.whatsappPhone || "").trim(),
          qrCode: String(editing.qrCode || "").trim(),
        }),
        branch_id: editing.branch_id ?? null, // ✅ NUEVO
      };

      const { data, error } = await supabase
        .from("rooms_v2")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single();

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
    if (!canManageRoomFull) return alert("No tenés permiso para activar/desactivar salas.");

    const current = items.find((x) => x.id === id);
    if (!current) return;

    if (me.isBranchScoped && me.branchId != null && current.branch_id !== me.branchId) {
      return alert("No podés cambiar estado de otra sucursal.");
    }

    const next = { ...current, active: !current.active };
    setItems((prev) => prev.map((p) => (p.id === id ? next : p)));

    const { error } = await supabase.from("rooms_v2").update({ active: next.active }).eq("id", id);
    if (error) {
      console.error(error);
      alert("No pude actualizar estado (revisá rol / policies).");
      setItems((prev) => prev.map((p) => (p.id === id ? current : p)));
    }
  };

  const deleteRoom = async (room: Room) => {
    if (!canManageRoomFull) return alert("No tenés permiso para borrar salas.");

    if (me.isBranchScoped && me.branchId != null && room.branch_id !== me.branchId) {
      return alert("No podés borrar salas de otra sucursal.");
    }

    const ok = confirm(`¿Seguro que querés borrar "${room.name}"? Esta acción no se puede deshacer.`);
    if (!ok) return;

    const prev = items;
    setItems((p) => p.filter((x) => x.id !== room.id));

    try {
      if (room.photo && room.photo.includes("/storage/v1/object/public/rooms/")) {
        const idx = room.photo.indexOf("/storage/v1/object/public/rooms/");
        const path = room.photo
          .slice(idx + "/storage/v1/object/public/rooms/".length)
          .split("?")[0];

        const { error: storageErr } = await supabase.storage.from("rooms").remove([path]);
        if (storageErr) console.warn("No pude borrar imagen en storage:", storageErr);
      }

      const { error } = await supabase.from("rooms_v2").delete().eq("id", room.id);
      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No pude borrar la sala (revisá RLS / permisos).");
      setItems(prev);
    }
  };

  const onBombPickImage = () => bombFileRef.current?.click();
  const onBombFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Elegí una imagen (JPG/PNG/WebP).");
      e.target.value = "";
      return;
    }

    const url = URL.createObjectURL(file);
    setBomb((prev) => ({ ...prev, imageUrl: url }));
    e.target.value = "";
  };

  // Bomb solo admin/super o manage rooms, pero NO branch-scoped
  const canEditBomb = !me.isBranchScoped && (me.isSuper || me.perms.canManageRooms);

  return (
    <div className="page">
      <div className="pageHeadRow" style={{ gap: 12 }}>
        <div>
          <div className="pageTitle">Salas</div>
          <div className="pageSub">Panel conectado a Supabase (DB + Storage).</div>
        </div>

        {canCreateRoom ? (
          <button className="btnSmall" onClick={startCreate}>
            + Nueva sala
          </button>
        ) : null}
      </div>

      <div className="toolbarRow" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre…"
          style={{ flex: 1 }}
        />

        {!me.isBranchScoped ? (
          <select
            className="input"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            style={{ width: 220 }}
          >
            <option value="">Todas las sucursales</option>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        ) : (
          <div
            className="input"
            style={{ width: 220, opacity: 0.85, display: "flex", alignItems: "center" }}
          >
            {me.branchLabel ? `Sucursal: ${me.branchLabel}` : "Sucursal: sin asignar"}
          </div>
        )}
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 16 }}>
          Cargando salas…
        </div>
      ) : (
        <div className="roomsScroll">
          <div className="roomsGrid">
            {/* ✅ CARD: BOMB TICKET (SIEMPRE) */}
            <div className="roomCard">
              <div className="roomImgWrap" style={{ position: "relative" }}>
                <img
                  src={bomb.imageUrl || "https://picsum.photos/seed/bombticket/900/520"}
                  alt={bomb.title}
                  style={{ objectFit: "cover", width: "100%", height: "100%" }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      "https://picsum.photos/seed/bombticket/900/520";
                  }}
                />
                <div className="roomBadge">Beneficio</div>
              </div>

              <div className="roomBody">
                <div className="roomTitle">{bomb.title}</div>

                {bomb.description ? (
                  <div
                    className="descClamp2"
                    style={{ opacity: 0.82, fontSize: 12, marginBottom: 10, lineHeight: 1.3 }}
                    title="Click para ver completa"
                    onClick={() => setDescModal({ title: bomb.title, text: bomb.description })}
                  >
                    {bomb.description}
                  </div>
                ) : null}

                <div className="qrBlock">
                  <div className="qrBox">
                    <QRCodeCanvas
                      id={BOMB_CANVAS_ID}
                      value={BOMB_TICKET_QR}
                      size={130}
                      includeMargin
                      bgColor="#ffffff"
                      fgColor="#000000"
                    />
                  </div>

                  <div className="qrActions">
                    <button className="ghostBtn" onClick={() => copy(BOMB_TICKET_QR)}>
                      Copiar
                    </button>

                    <button
                      className="ghostBtn"
                      onClick={() =>
                        downloadPngFromCanvas(BOMB_CANVAS_ID, `bomb-ticket-${Date.now()}.png`)
                      }
                      title="Descargar PNG"
                    >
                      PNG
                    </button>

                    <button
                      className="ghostBtn"
                      onClick={() => printPngFromCanvas(BOMB_CANVAS_ID, bomb.title)}
                      title="Imprimir"
                    >
                      Imprimir
                    </button>
                  </div>
                </div>

                <div className="roomActions">
                  {canEditBomb ? (
                    <button className="ghostBtn" onClick={() => setBombEditing(true)}>
                      Editar
                    </button>
                  ) : null}
                </div>

                {bombEditing && canEditBomb ? (
                  <>
                    <div className="backdrop show" onMouseDown={() => setBombEditing(false)} />
                    <div className="modalCenter" onMouseDown={() => setBombEditing(false)}>
                      <div className="modalBox" onMouseDown={(e) => e.stopPropagation()}>
                        <div className="modalHead">
                          <div className="modalTitle">Editar Bomb Ticket</div>
                          <button
                            className="iconBtn"
                            onClick={() => setBombEditing(false)}
                            aria-label="Cerrar"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="modalBody">
                          <input
                            ref={bombFileRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={onBombFileChange}
                          />

                          <div className="formGrid2">
                            <label className="field" style={{ gridColumn: "1 / -1" }}>
                              <span className="label">Título</span>
                              <input
                                className="input"
                                value={bomb.title}
                                onChange={(e) => setBomb((p) => ({ ...p, title: e.target.value }))}
                              />
                            </label>

                            <label className="field" style={{ gridColumn: "1 / -1" }}>
                              <span className="label">Descripción</span>
                              <textarea
                                className="input"
                                rows={3}
                                value={bomb.description}
                                onChange={(e) => setBomb((p) => ({ ...p, description: e.target.value }))}
                                style={{ resize: "vertical" }}
                              />
                            </label>

                            <div className="field" style={{ gridColumn: "1 / -1" }}>
                              <span className="label">Imagen</span>
                              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                <button type="button" className="btnSmall" onClick={onBombPickImage}>
                                  Elegir imagen…
                                </button>
                                {bomb.imageUrl ? (
                                  <button
                                    type="button"
                                    className="ghostBtn"
                                    onClick={() => setBomb((p) => ({ ...p, imageUrl: "" }))}
                                  >
                                    Quitar
                                  </button>
                                ) : (
                                  <span style={{ opacity: 0.8, fontSize: 12 }}>Sin imagen (placeholder)</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="modalFoot">
                          <button className="ghostBtn" onClick={() => setBombEditing(false)}>
                            Listo
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {/* ✅ CARDS DE SALAS */}
            {filtered.map((r) => {
              const canvasId = `qr_canvas_room_${r.id}`;
              const qrValue = String(r.qrCode || "").trim() || makeRoomQr(r.id);

              return (
                <div key={r.id} className="roomCard">
                  <div className="roomImgWrap">
                    <img
                      src={r.photo || "https://picsum.photos/seed/placeholder/900/520"}
                      alt={r.name}
                      style={{ objectFit: "cover", objectPosition: `50% ${r.photoPosition}%` }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "https://picsum.photos/seed/placeholder/900/520";
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

                    {Array.isArray(r.tags) && r.tags.length ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                        {r.tags.slice(0, 4).map((t) => (
                          <span key={t} className="tagChip">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {r.description ? (
                      <div
                        className="descClamp2"
                        style={{ opacity: 0.82, fontSize: 12, marginBottom: 8, lineHeight: 1.3 }}
                        title="Click para ver completa"
                        onClick={() => setDescModal({ title: r.name, text: r.description })}
                      >
                        {r.description}
                      </div>
                    ) : null}

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

                      <div className="qrBlock">
                        <div className="qrBox">
                          <QRCodeCanvas
                            id={canvasId}
                            value={qrValue}
                            size={120}
                            includeMargin
                            bgColor="#ffffff"
                            fgColor="#000000"
                          />
                        </div>

                        <div className="qrActions">
                          <button className="ghostBtn" onClick={() => copy(qrValue)} title="Copiar">
                            Copiar
                          </button>

                          <button
                            className="ghostBtn"
                            onClick={() => downloadPngFromCanvas(canvasId, `qr-${r.id}.png`)}
                            title="Descargar PNG"
                          >
                            PNG
                          </button>

                          <button
                            className="ghostBtn"
                            onClick={() => printPngFromCanvas(canvasId, r.name || "QR Sala")}
                            title="Imprimir"
                          >
                            Imprimir
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="roomActions">
                      {/* ✅ si NO tiene manage rooms pero sí rankings: modal chico */}
                      {!canManageRoomFull && canEditRankings ? (
                        <button className="ghostBtn" onClick={() => openRecordsEditor(r)}>
                          Editar récords
                        </button>
                      ) : null}

                      {/* ✅ full manage */}
                      {canManageRoomFull ? (
                        <>
                          <button className="ghostBtn" onClick={() => startEditFull(r)}>
                            Editar
                          </button>

                          <button
                            className={r.active ? "dangerBtnInline" : "btnSmall"}
                            onClick={() => toggleActive(r.id)}
                          >
                            {r.active ? "Desactivar" : "Activar"}
                          </button>

                          <button className="dangerBtnInline" onClick={() => deleteRoom(r)}>
                            Borrar
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ✅ Modal descripción completa */}
      {descModal ? (
        <>
          <div className="backdrop show" onMouseDown={() => setDescModal(null)} />
          <div className="modalCenter" onMouseDown={() => setDescModal(null)}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHead">
                <div className="modalTitle">{descModal.title || "Descripción"}</div>
                <button className="iconBtn" onClick={() => setDescModal(null)} aria-label="Cerrar">
                  ✕
                </button>
              </div>
              <div className="modalBody">
                <div style={{ textAlign: "left", whiteSpace: "pre-wrap", lineHeight: 1.45, fontSize: 14 }}>
                  {descModal.text}
                </div>
              </div>
              <div className="modalFoot">
                <button className="ghostBtn" onClick={() => setDescModal(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* ✅ Modal chico: récords */}
      {recordsModal ? (
        <>
          <div className="backdrop show" onMouseDown={() => setRecordsModal(null)} />
          <div className="modalCenter" onMouseDown={() => setRecordsModal(null)}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHead">
                <div className="modalTitle">Editar récords — {recordsModal.roomName}</div>
                <button className="iconBtn" onClick={() => setRecordsModal(null)} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <div className="modalBody">
                <div className="formGrid2">
                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Récord 1 (MM:SS)</span>
                    <input
                      className="input"
                      value={recordsModal.record1}
                      onChange={(e) => setRecordsModal((p) => (p ? { ...p, record1: e.target.value } : p))}
                      placeholder="12:34"
                      inputMode="numeric"
                    />
                  </label>

                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Récord 2 (MM:SS)</span>
                    <input
                      className="input"
                      value={recordsModal.record2}
                      onChange={(e) => setRecordsModal((p) => (p ? { ...p, record2: e.target.value } : p))}
                      placeholder="14:10"
                      inputMode="numeric"
                    />
                  </label>

                  <div style={{ gridColumn: "1 / -1", opacity: 0.75, fontSize: 12 }}>
                    Formato válido: <b>MM:SS</b> (ej: 08:45).
                  </div>
                </div>
              </div>

              <div className="modalFoot">
                <button className="ghostBtn" onClick={() => setRecordsModal(null)} disabled={saving}>
                  Cancelar
                </button>
                <button className="btnSmall" onClick={saveRecords} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* ✅ Modal full: crear/editar sala */}
      {open && editing ? (
        <>
          <div className="backdrop show" onMouseDown={closeModal} />
          <div className="modalCenter" onMouseDown={closeModal}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHead">
                <div className="modalTitle">
                  {items.some((x) => x.id === editing.id) ? "Editar sala" : "Nueva sala"}
                </div>
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
                    <select
                      className="input"
                      value={editing.category}
                      onChange={(e) => setEditing({ ...editing, category: e.target.value as RoomCategory })}
                    >
                      <option value="WOW">WOW</option>
                      <option value="CLASICO">Clásico (20%)</option>
                      <option value="DESPEDIDA">Despedida</option>
                    </select>
                  </label>

                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">QR único</span>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        className="input"
                        value={editing.qrCode || ""}
                        onChange={(e) => setEditing({ ...editing, qrCode: e.target.value })}
                        placeholder={`Ej: ${makeRoomQr(editing.id)}`}
                        style={{ flex: 1, minWidth: 260, fontFamily: "monospace" }}
                      />
                      <button
                        type="button"
                        className="ghostBtn"
                        onClick={() => setEditing({ ...editing, qrCode: makeRoomQr(editing.id) })}
                        title="Regenerar basado en el ID"
                      >
                        Regenerar
                      </button>
                      <button type="button" className="ghostBtn" onClick={() => editing.qrCode && copy(editing.qrCode)} disabled={!editing.qrCode}>
                        Copiar
                      </button>
                    </div>
                  </label>

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

                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Teléfono WhatsApp</span>
                    <input
                      className="input"
                      value={editing.whatsappPhone}
                      onChange={(e) => setEditing({ ...editing, whatsappPhone: e.target.value })}
                      placeholder="Ej: +54911XXXXXXXX o 54911XXXXXXXX"
                      inputMode="tel"
                    />
                  </label>

                  <div className="field" ref={themesWrapRef}>
                    <span className="label">Temáticas (hasta 4)</span>

                    <button
                      type="button"
                      className="input multiSelectBtn"
                      onClick={() => setThemesOpen((v) => !v)}
                      aria-expanded={themesOpen}
                    >
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

                  <label className="field">
                    <span className="label">Sucursal</span>
                    <select
                      className="input"
                      value={editing.branch}
                      onChange={(e) => setEditing({ ...editing, branch: e.target.value as Branch })}
                      disabled={me.isBranchScoped} // ✅ scoped: fija
                    >
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
                      placeholder="Ej: Terror psicológico..."
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
                    <span className="label">Jugadores mín (1–6)</span>
                    <select
                      className="input"
                      value={String(editing.playersMin ?? 1)}
                      onChange={(e) => {
                        const min = Number(e.target.value);
                        setEditing({ ...editing, playersMin: min, playersMax: Math.max(min, editing.playersMax ?? 6) });
                      }}
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Jugadores máx (1–6)</span>
                    <select
                      className="input"
                      value={String(editing.playersMax ?? 6)}
                      onChange={(e) => {
                        const max = Number(e.target.value);
                        setEditing({ ...editing, playersMax: max, playersMin: Math.min(editing.playersMin ?? 1, max) });
                      }}
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Dificultad (1–10)</span>
                    <select
                      className="input"
                      value={String(editing.difficulty ?? 5)}
                      onChange={(e) => setEditing({ ...editing, difficulty: Number(e.target.value) })}
                    >
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
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
                    <select
                      className="input"
                      value={String(editing.surprise ?? 5)}
                      onChange={(e) => setEditing({ ...editing, surprise: Number(e.target.value) })}
                    >
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Récord 1 (MM:SS)</span>
                    <input className="input" value={editing.record1} onChange={(e) => setEditing({ ...editing, record1: e.target.value })} placeholder="12:34" />
                  </label>

                  <label className="field">
                    <span className="label">Récord 2 (MM:SS)</span>
                    <input className="input" value={editing.record2} onChange={(e) => setEditing({ ...editing, record2: e.target.value })} placeholder="14:10" />
                  </label>

                  <label className="field">
                    <span className="label">Puntaje (1–3)</span>
                    <select
                      className="input"
                      value={String(editing.points ?? 1)}
                      onChange={(e) => setEditing({ ...editing, points: Number(e.target.value) as 1 | 2 | 3 })}
                    >
                      {[1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
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
      ) : null}
    </div>
  );
}
  
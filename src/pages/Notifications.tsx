import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";

type TargetMode = "TEST" | "ALL";
type Status = "DRAFT" | "SENT" | "FAILED";

type NotificationRow = {
  id: string;
  subject: string;
  body: string;
  status: Status;
  target: TargetMode;
  test_email: string | null;
  created_at: string;
  sent_at: string | null;
  image_url?: string | null;
};

type Category = "PROMO" | "DESCUENTO" | "NOVEDAD";

type SortKey = "date" | "time" | "title" | "category" | "status";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

function genId() {
  try {
    // @ts-ignore
    return crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function fmtDateOnly(dt: string | null) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleDateString();
  } catch {
    return String(dt);
  }
}

function fmtTimeOnly(dt: string | null) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function getRowDate(n: NotificationRow) {
  return n.status === "SENT" ? n.sent_at : n.created_at;
}

function dateToTs(dt: string | null) {
  if (!dt) return 0;
  const t = Date.parse(dt);
  return Number.isFinite(t) ? t : 0;
}

function inferCategory(n: Pick<NotificationRow, "subject" | "body">): Category {
  const t = `${n.subject || ""} ${n.body || ""}`.toLowerCase();

  const isDiscount =
    t.includes("descuento") ||
    t.includes("promo") ||
    t.includes("promoción") ||
    t.includes("promocion") ||
    t.includes("off") ||
    t.includes("%") ||
    t.includes("2x1") ||
    t.includes("cuotas") ||
    t.includes("sale");

  if (isDiscount) return "DESCUENTO";

  const isNews =
    t.includes("novedad") ||
    t.includes("nuevo") ||
    t.includes("nueva") ||
    t.includes("actualización") ||
    t.includes("actualizacion") ||
    t.includes("update") ||
    t.includes("lanz") ||
    t.includes("cambio");

  if (isNews) return "NOVEDAD";

  return "PROMO";
}

function toggleSort(prev: SortState, key: SortKey): SortState {
  if (prev.key !== key) return { key, dir: "asc" };
  return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
}

function sortIndicator(current: SortState, key: SortKey) {
  if (current.key !== key) return "";
  return current.dir === "asc" ? " ▲" : " ▼";
}

/* =========================
   SVG ICONS (sin emojis)
========================= */
function Icon({
  name,
  size = 16,
  style,
}: {
  name: "edit" | "eye" | "send" | "trash" | "dots" | "plus";
  size?: number;
  style?: React.CSSProperties;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    style,
  } as any;

  if (name === "plus") {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "dots") {
    return (
      <svg {...common}>
        <circle cx="5" cy="12" r="1.8" fill="currentColor" />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" />
        <circle cx="19" cy="12" r="1.8" fill="currentColor" />
      </svg>
    );
  }

  if (name === "edit") {
    return (
      <svg {...common}>
        <path
          d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-.2-.2a2 2 0 0 0-2.8 0L5 16v4Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M13.5 6.5 17.5 10.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "eye") {
    return (
      <svg {...common}>
        <path
          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "send") {
    return (
      <svg {...common}>
        <path d="M22 2 11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M22 2 15 22l-4-9-9-4L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }

  // trash
  return (
    <svg {...common}>
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 7l1 14h10l1-14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/* =========================
   STORAGE (imagen simple)
========================= */
async function uploadNotificationImage(file: File, notifId: string): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
  const path = `notifications/${notifId}/image_${Date.now()}.${safeExt}`;

  const { error: upErr } = await supabase.storage.from("notifications").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from("notifications").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("No pude obtener la URL pública de la imagen.");
  return data.publicUrl;
}

export default function Notifications() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // filtros + search
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | Status>("");
  const [targetFilter, setTargetFilter] = useState<"" | TargetMode>("");

  // sorting
  const [sort, setSort] = useState<SortState>({ key: "date", dir: "desc" });

  // modal create/edit
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NotificationRow | null>(null);

    /* =========================
     ✅ Mensaje: toolbar + emojis (igual a News)
  ========================= */

  // textarea ref
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // emoji UI
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const emojiPanelRef = useRef<HTMLDivElement | null>(null);
  const [emojiPos, setEmojiPos] = useState<{ top: number; left: number } | null>(null);

  const openEmoji = () => {
    const btn = emojiBtnRef.current;
    if (!btn) {
      setEmojiOpen((v) => !v);
      return;
    }
    const r = btn.getBoundingClientRect();
    setEmojiPos({
      top: r.bottom + 8 + window.scrollY,
      left: Math.max(12, r.right - 360 + window.scrollX),
    });
    setEmojiOpen(true);
  };

  const insertEmoji = (emo: string) => {
    if (!editing) return;
    const el = bodyRef.current;
    if (!el) return;

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value ?? "";
    const next = value.slice(0, start) + emo + value.slice(end);
    const cursor = start + emo.length;

    setEditing({ ...editing, body: next });

    requestAnimationFrame(() => {
      try {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      } catch {}
    });
  };

  // cerrar emoji click afuera / ESC
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!emojiOpen) return;
      const btn = emojiBtnRef.current;
      const panel = emojiPanelRef.current;
      const t = e.target as Node;
      if (btn && btn.contains(t)) return;
      if (panel && panel.contains(t)) return;
      setEmojiOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [emojiOpen, editing]);

  function wrapSelection(el: HTMLTextAreaElement, left: string, right: string) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value ?? "";
    const selected = value.slice(start, end);

    const next = value.slice(0, start) + left + selected + right + value.slice(end);
    const nextCursorStart = start + left.length;
    const nextCursorEnd = end + left.length;

    return { next, nextCursorStart, nextCursorEnd };
  }

  function toggleLinePrefix(el: HTMLTextAreaElement, prefix: string) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value ?? "";

    const before = value.slice(0, start);
    const sel = value.slice(start, end);
    const after = value.slice(end);

    const selLines = sel.split("\n");
    const allHave = selLines.every((l) => l.trim() === "" || l.startsWith(prefix));

    const nextLines = selLines.map((l) => {
      if (l.trim() === "") return l;
      if (allHave) return l.startsWith(prefix) ? l.slice(prefix.length) : l;
      return prefix + l;
    });

    const nextSel = nextLines.join("\n");
    const next = before + nextSel + after;

    return { next };
  }

  function FIcon({ name, size = 16 }: { name: "bold" | "italic" | "underline" | "list"; size?: number }) {
    const common = {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
    } as any;

    if (name === "bold") {
      return (
        <svg {...common}>
          <path d="M7 4h6a4 4 0 0 1 0 8H7V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M7 12h7a4 4 0 0 1 0 8H7v-8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    }
    if (name === "italic") {
      return (
        <svg {...common}>
          <path d="M19 4h-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M13 20H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M15 4 9 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    }
    if (name === "underline") {
      return (
        <svg {...common}>
          <path d="M7 4v7a5 5 0 0 0 10 0V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    }
    return (
      <svg {...common}>
        <path d="M6 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M6 17h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="4" cy="7" r="1" fill="currentColor" />
        <circle cx="4" cy="12" r="1" fill="currentColor" />
        <circle cx="4" cy="17" r="1" fill="currentColor" />
      </svg>
    );
  }

  class EmojiBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) {
      super(props);
      this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
      return { hasError: true };
    }
    componentDidCatch(err: any) {
      console.error("Emoji Picker crashed:", err);
    }
    render() {
      if (this.state.hasError) {
        return <div style={{ padding: 12, fontSize: 12, opacity: 0.9, maxWidth: 360 }}>⚠️ El selector de emojis falló.</div>;
      }
      return this.props.children as any;
    }
  }

  // EmojiPicker lazy
  const EmojiPicker = React.lazy(() => import("emoji-picker-react"));
  type EmojiClickData = any;

  // imagen en modal
  const fileImgRef = useRef<HTMLInputElement | null>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [tempImgPreview, setTempImgPreview] = useState<string | null>(null);

  // modal preview
  const [preview, setPreview] = useState<NotificationRow | null>(null);

  // ✅ menú ⋯ (anclado al botón, portal a body)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const computeMenuPosFromAnchor = () => {
    const btn = menuAnchorRef.current;
    if (!btn) return null;

    const r = btn.getBoundingClientRect();
    const MENU_W = 240;
    const gap = 10;

    // ✅ fixed: top/left en viewport
    let x = r.right + gap;
    const maxX = window.innerWidth - 12 - MENU_W;
    if (x > maxX) x = r.left - gap - MENU_W;

    let y = r.top - 4;
    const maxY = window.innerHeight - 12 - 260;
    if (y > maxY) y = maxY;
    if (y < 12) y = 12;

    return { top: y, left: x };
  };

  const openMenuFor = (id: string, btn: HTMLButtonElement) => {
    menuAnchorRef.current = btn;
    setMenuOpenId(id);
    setMenuPos(computeMenuPosFromAnchor());
  };

  const closeMenu = () => {
    setMenuOpenId(null);
    setMenuPos(null);
    menuAnchorRef.current = null;
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, subject, body, status, target, test_email, created_at, sent_at, image_url")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setItems((data as NotificationRow[]) ?? []);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Error cargando notificaciones.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ✅ cerrar menú click afuera / ESC + recalcular pos en scroll/resize
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
      if (e.key === "Escape") closeMenu();
    };

    const onScrollResize = () => {
      if (!menuOpenId) return;
      const pos = computeMenuPosFromAnchor();
      if (pos) setMenuPos(pos);
      else closeMenu();
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpenId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((n) => {
      const okQ = !s
        ? true
        : (n.subject || "").toLowerCase().includes(s) || (n.body || "").toLowerCase().includes(s);
      const okStatus = !statusFilter ? true : n.status === statusFilter;
      const okTarget = !targetFilter ? true : n.target === targetFilter;
      return okQ && okStatus && okTarget;
    });
  }, [items, q, statusFilter, targetFilter]);

  const sorted = useMemo(() => {
    const dirMul = sort.dir === "asc" ? 1 : -1;
    const arr = [...filtered];

    arr.sort((a, b) => {
      if (sort.key === "date" || sort.key === "time") {
        const ta = dateToTs(getRowDate(a));
        const tb = dateToTs(getRowDate(b));
        return (ta - tb) * dirMul;
      }

      if (sort.key === "title") {
        return String(a.subject || "").toLowerCase().localeCompare(String(b.subject || "").toLowerCase()) * dirMul;
      }

      if (sort.key === "category") {
        return inferCategory(a).localeCompare(inferCategory(b)) * dirMul;
      }

      if (sort.key === "status") {
        return String(a.status || "").toLowerCase().localeCompare(String(b.status || "").toLowerCase()) * dirMul;
      }

      return 0;
    });

    return arr;
  }, [filtered, sort]);

  const resetModalTransient = () => {
    setImgFile(null);
    if (tempImgPreview) {
      try {
        URL.revokeObjectURL(tempImgPreview);
      } catch {}
    }
    setTempImgPreview(null);
    if (fileImgRef.current) fileImgRef.current.value = "";
  };

  const startCreate = () => {
    const id = genId();
    setEditing({
      id,
      subject: "",
      body: "",
      status: "DRAFT",
      target: "TEST",
      test_email: "",
      created_at: new Date().toISOString(),
      sent_at: null,
      image_url: null,
    });
    resetModalTransient();
    setOpen(true);
  };

  const startEdit = (n: NotificationRow) => {
    setEditing({ ...n });
    resetModalTransient();
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditing(null);
    resetModalTransient();
  };

  const onPickImage = () => fileImgRef.current?.click();

  const onImageChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Elegí una imagen (JPG/PNG/WebP).");
      e.target.value = "";
      return;
    }

    setImgFile(file);

    if (tempImgPreview) {
      try {
        URL.revokeObjectURL(tempImgPreview);
      } catch {}
    }
    const url = URL.createObjectURL(file);
    setTempImgPreview(url);
    setEditing((p) => (p ? { ...p, image_url: url } : p));

    e.target.value = "";
  };

  const removeImage = () => {
    setImgFile(null);
    if (tempImgPreview) {
      try {
        URL.revokeObjectURL(tempImgPreview);
      } catch {}
    }
    setTempImgPreview(null);
    setEditing((prev) => (prev ? { ...prev, image_url: null } : prev));
    if (fileImgRef.current) fileImgRef.current.value = "";
  };

  const save = async () => {
    if (!editing) return;

    const subject = String(editing.subject || "").trim();
    const body = String(editing.body || "").trim();

    if (subject.length < 3) return alert("Poné un asunto (mínimo 3 caracteres).");
    if (body.length < 5) return alert("Poné un mensaje (mínimo 5 caracteres).");

    const target = editing.target;
    const testEmail = String(editing.test_email || "").trim();
    if (target === "TEST" && !testEmail.includes("@")) return alert("Para TEST necesitás un email válido.");

    setSaving(true);
    try {
      let finalImageUrl: string | null = editing.image_url ? String(editing.image_url) : null;

      if (imgFile) {
        finalImageUrl = await uploadNotificationImage(imgFile, editing.id);
      } else {
        if (finalImageUrl && finalImageUrl.startsWith("blob:")) finalImageUrl = null;
      }

      const payload = {
        id: editing.id,
        subject,
        body,
        status: editing.status,
        target,
        test_email: target === "TEST" ? testEmail : null,
        image_url: finalImageUrl,
      };

      const { data, error } = await supabase
        .from("notifications")
        .upsert(payload, { onConflict: "id" })
        .select("id, subject, body, status, target, test_email, created_at, sent_at, image_url")
        .single();

      if (error) throw error;

      const saved = data as NotificationRow;

      setItems((prev) => {
        const exists = prev.some((p) => p.id === saved.id);
        return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev];
      });

      closeModal();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Error guardando notificación.");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (n: NotificationRow, status: Status) => {
    setSaving(true);
    try {
      const patch: any = { status };
      patch.sent_at = status === "SENT" ? new Date().toISOString() : null;

      const { data, error } = await supabase
        .from("notifications")
        .update(patch)
        .eq("id", n.id)
        .select("id, subject, body, status, target, test_email, created_at, sent_at, image_url")
        .single();

      if (error) throw error;

      const saved = data as NotificationRow;
      setItems((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      setPreview((p) => (p && p.id === saved.id ? saved : p));
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No pude actualizar el estado.");
    } finally {
      setSaving(false);
    }
  };

  const sendNotification = async (n: NotificationRow) => {
    if (n.status === "SENT") return;
    await setStatus(n, "SENT");
  };

  const deleteRow = async (n: NotificationRow) => {
    const ok = confirm(`¿Borrar "${n.subject}"?`);
    if (!ok) return;

    const prev = items;
    setItems((p) => p.filter((x) => x.id !== n.id));

    try {
      const { error } = await supabase.from("notifications").delete().eq("id", n.id);
      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No pude borrar.");
      setItems(prev);
    }
  };

  /* =========================
     EXCEL-STYLE TABLE (full screen + header fijo siempre)
  ========================= */

  const GRID_COLS = "110px 90px 1.6fr 0.9fr 0.75fr 0.9fr 64px";

 const pageWrap: React.CSSProperties = {
  height: "100vh",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  padding: 0,
  paddingTop: 12,
  boxSizing: "border-box",
  overflow: "hidden",
};

  const topBar: React.CSSProperties = {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 12,
  };

  const inputStyle: React.CSSProperties = {
    height: 40,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(0,0,0,.25)",
    color: "rgba(255,255,255,.92)",
    padding: "0 12px",
    outline: "none",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    paddingRight: 36,
    cursor: "pointer",
  };

  const excelWrapStyle: React.CSSProperties = {
    flex: 1,
    minHeight: 0,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(0,0,0,.22)",
  };

  const excelScrollerStyle: React.CSSProperties = {
    flex: 1,
    minHeight: 0,
    width: "100%",
    overflow: "auto",
  };

  const excelHeaderStyle: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 5,
    display: "grid",
    gridTemplateColumns: GRID_COLS,
    gap: 0,
    alignItems: "stretch",
    background: "rgba(0,0,0,.75)",
    backdropFilter: "blur(6px)",
    borderBottom: "1px solid rgba(255,255,255,.12)",
  };

  const headerCellBase: React.CSSProperties = {
    padding: "12px 10px",
    textAlign: "center",
    fontSize: 14,
    fontWeight: 900,
    opacity: 0.95,
    userSelect: "none",
    borderRight: "1px solid rgba(255,255,255,.10)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    letterSpacing: 0.2,



  // ✅ centrado perfecto
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};

   const headerClickable = (key: SortKey): React.CSSProperties => ({
    ...headerCellBase,
    cursor: "pointer",
  });

  const cellBase: React.CSSProperties = {
    padding: "10px 10px",
    fontSize: 12,
    color: "rgba(255,255,255,.85)",
    borderRight: "1px solid rgba(255,255,255,.08)",
    minWidth: 0,
  };

  const rowBase: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: GRID_COLS,
    gap: 0,
    alignItems: "stretch",
    borderBottom: "1px solid rgba(255,255,255,.08)",
  };

  const renderHeader = () => (
    <div style={excelHeaderStyle}>
      <div style={headerClickable("date")} onClick={() => setSort((p) => toggleSort(p, "date"))} title="Ordenar por fecha">
        Fecha{sortIndicator(sort, "date")}
      </div>

      <div style={headerClickable("time")} onClick={() => setSort((p) => toggleSort(p, "time"))} title="Ordenar por hora">
        Hora{sortIndicator(sort, "time")}
      </div>

      <div style={headerClickable("title")} onClick={() => setSort((p) => toggleSort(p, "title"))} title="Ordenar por título">
        Título{sortIndicator(sort, "title")}
      </div>

      <div
        style={headerClickable("category")}
        onClick={() => setSort((p) => toggleSort(p, "category"))}
        title="Ordenar por categoría"
      >
        Categoría{sortIndicator(sort, "category")}
      </div>

      <div style={headerCellBase} title="Tipo (por ahora bloqueado)">
        Tipo
      </div>

      <div
        style={headerClickable("status")}
        onClick={() => setSort((p) => toggleSort(p, "status"))}
        title="Ordenar por estado"
      >
        Estado{sortIndicator(sort, "status")}
      </div>

      <div style={{ ...headerCellBase, borderRight: "none" }} />
    </div>
  );

  const renderRows = () => {
    if (loading) {
      return <div style={{ padding: 16, opacity: 0.85 }}>Cargando notificaciones…</div>;
    }

    if (sorted.length === 0) {
      return <div style={{ padding: 16, opacity: 0.8 }}>No hay resultados.</div>;
    }

    return (
      <>
        {sorted.map((n, idx) => {
          const d = getRowDate(n);
          const cat = inferCategory(n);
          const isEven = idx % 2 === 0;

          return (
            <div
              key={n.id}
              style={{
                ...rowBase,
                background: isEven ? "rgba(255,255,255,.02)" : "rgba(255,255,255,.00)",
                transition: "background .12s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,.05)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = isEven
                  ? "rgba(255,255,255,.02)"
                  : "rgba(255,255,255,.00)";
              }}
            >
              <div style={{ ...cellBase, opacity: 0.9, textAlign: "center" }}>{fmtDateOnly(d)}</div>
              <div style={{ ...cellBase, opacity: 0.85, textAlign: "center" }}>{fmtTimeOnly(d)}</div>

              <div style={{ ...cellBase }}>
                <div
                  style={{
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={n.subject}
                >
                  {n.subject}
                </div>

                {n.body ? (
                  <div style={{ opacity: 0.78, fontSize: 12, lineHeight: 1.3 }} title={n.body}>
                    {n.body}
                  </div>
                ) : null}

                {n.image_url ? (
                  <div style={{ marginTop: 6, opacity: 0.9, fontSize: 12 }}>
                    <span style={{ opacity: 0.75 }}>Con imagen</span>
                  </div>
                ) : null}

                {n.target === "TEST" && n.test_email ? (
                  <div style={{ opacity: 0.7, fontSize: 12 }}>
                    Test: <b>{n.test_email}</b>
                  </div>
                ) : null}
              </div>

              <div style={{ ...cellBase, opacity: 0.9, textAlign: "center" }}>{cat}</div>

              <div style={{ ...cellBase, opacity: 0.7, textAlign: "center" }}>
                MAIL <span style={{ opacity: 0.55 }}>(bloqueado)</span>
              </div>

              <div style={{ ...cellBase, opacity: 0.95, textAlign: "center" }}>
                {n.status === "DRAFT" ? "BORRADOR" : n.status === "SENT" ? "ENVIADO" : "FALLIDO"}
              </div>

              <div style={{ ...cellBase, borderRight: "none", display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="ghostBtn"
                  style={{ padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}
                  data-menu-btn="1"
                  onClick={(e) => {
                    if (saving) return;
                    const btn = e.currentTarget as HTMLButtonElement;
                    if (menuOpenId === n.id) {
                      closeMenu();
                      return;
                    }
                    openMenuFor(n.id, btn);
                  }}
                  disabled={saving}
                  aria-label="Opciones"
                  title="Opciones"
                >
                  <Icon name="dots" size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div style={pageWrap}>
      {/* TOP BAR */}
      <div style={topBar}>
        <input
          style={{ ...inputStyle, minWidth: 280, flex: 1 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar asunto o mensaje…"
        />

        <select style={selectStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="SENT">Enviado</option>
          <option value="FAILED">Fallido</option>
        </select>

        <select style={selectStyle} value={targetFilter} onChange={(e) => setTargetFilter(e.target.value as any)}>
          <option value="">Todos los destinos</option>
          <option value="TEST">Test</option>
          <option value="ALL">Todos</option>
        </select>

        <button className="ghostBtn" onClick={load} disabled={loading || saving} title="Recargar">
          Recargar
        </button>

        {/* ✅ BOTÓN A LA DERECHA */}
        <div style={{ flex: 1 }} />

        <button className="btnSmall" onClick={startCreate} disabled={saving} title="Nueva notificación">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="plus" size={16} />
            Nueva notificación
          </span>
        </button>
      </div>

      {/* EXCEL TABLE */}
      <div style={excelWrapStyle}>
        <div style={excelScrollerStyle}>
          {/* ✅ Header SIEMPRE, haya o no filas */}
          {renderHeader()}
          <div style={{ width: "100%" }}>{renderRows()}</div>

          {/* ✅ Menú (PORTAL a body) */}
          {menuOpenId && menuPos
            ? createPortal(
                <div
                  data-menu-popup="1"
                  style={{
                    position: "fixed",
                    left: menuPos.left,
                    top: menuPos.top,
                    zIndex: 99999,
                    width: 240,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,.14)",
                    background: "rgba(0,0,0,.94)",
                    boxShadow: "0 12px 34px rgba(0,0,0,.45)",
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {(() => {
                    const n = sorted.find((x) => x.id === menuOpenId);
                    if (!n) return null;

                    const itemStyle: React.CSSProperties = {
                      width: "100%",
                      justifyContent: "flex-start",
                      borderRadius: 0,
                      padding: "10px 12px",
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                    };

                    const iconStyle: React.CSSProperties = { opacity: 0.9 };

                    return (
                      <>
                        <button
                          className="ghostBtn"
                          style={{ ...itemStyle, opacity: n.status === "SENT" ? 0.5 : 1 }}
                          onClick={() => {
                            closeMenu();
                            if (n.status !== "SENT") startEdit(n);
                          }}
                          disabled={saving || n.status === "SENT"}
                        >
                          <Icon name="edit" size={16} style={iconStyle} />
                          Editar
                        </button>

                        <button
                          className="ghostBtn"
                          style={itemStyle}
                          onClick={() => {
                            closeMenu();
                            setPreview(n);
                          }}
                          disabled={saving}
                        >
                          <Icon name="eye" size={16} style={iconStyle} />
                          Vista previa
                        </button>

                        <button
                          className="ghostBtn"
                          style={{ ...itemStyle, opacity: n.status === "SENT" ? 0.5 : 1 }}
                          onClick={async () => {
                            closeMenu();
                            await sendNotification(n);
                          }}
                          disabled={saving || n.status === "SENT"}
                        >
                          <Icon name="send" size={16} style={iconStyle} />
                          Enviar
                        </button>

                        <div style={{ height: 1, background: "rgba(255,255,255,.10)" }} />

                        <button
                          className="dangerBtnInline"
                          style={{ ...itemStyle, textAlign: "left" }}
                          onClick={async () => {
                            closeMenu();
                            await deleteRow(n);
                          }}
                          disabled={saving}
                        >
                          <Icon name="trash" size={16} style={{ opacity: 0.95 }} />
                          Borrar
                        </button>
                      </>
                    );
                  })()}
                </div>,
                document.body
              )
            : null}
        </div>
      </div>

      {/* MODAL PREVIEW */}
      {preview ? (
        <>
          <div className="backdrop show" onMouseDown={() => setPreview(null)} />
          <div className="modalCenter" onMouseDown={() => setPreview(null)}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 920 }}>
              <div className="modalHead">
                <div className="modalTitle">Vista previa</div>
                <button className="iconBtn" onClick={() => setPreview(null)} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <div className="modalBody">
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", opacity: 0.85, fontSize: 12, marginBottom: 10 }}>
                  <div>
                    <span style={{ opacity: 0.7 }}>Categoría:</span> <b>{inferCategory(preview)}</b>
                  </div>
                  <div>
                    <span style={{ opacity: 0.7 }}>Fecha:</span> <b>{fmtDateOnly(getRowDate(preview))}</b>
                  </div>
                  <div>
                    <span style={{ opacity: 0.7 }}>Estado:</span>{" "}
                    <b>{preview.status === "DRAFT" ? "BORRADOR" : preview.status === "SENT" ? "ENVIADO" : "FALLIDO"}</b>
                  </div>
                  <div>
                    <span style={{ opacity: 0.7 }}>Destino:</span> <b>{preview.target}</b>
                  </div>
                </div>

                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>{preview.subject}</div>

                {preview.image_url ? (
                  <div
                    style={{
                      marginBottom: 12,
                      borderRadius: 14,
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,.12)",
                      background: "rgba(0,0,0,.25)",
                    }}
                  >
                    <img
                      src={preview.image_url}
                      alt="Preview"
                      style={{ width: "100%", height: 260, objectFit: "cover", display: "block" }}
                    />
                  </div>
                ) : null}

                <div style={{ textAlign: "left", whiteSpace: "pre-wrap", lineHeight: 1.45, fontSize: 14, opacity: 0.95 }}>
                  {preview.body}
                </div>
              </div>

              <div className="modalFoot">
                <button className="ghostBtn" onClick={() => setPreview(null)} disabled={saving}>
                  Cerrar
                </button>

                {preview.status !== "SENT" ? (
                  <>
                    <button
                      className="ghostBtn"
                      onClick={() => {
                        setPreview(null);
                        startEdit(preview);
                      }}
                      disabled={saving}
                    >
                      Editar
                    </button>

                    <button
                      className="btnSmall"
                      onClick={async () => {
                        await sendNotification(preview);
                        setPreview(null);
                      }}
                      disabled={saving}
                      title="Enviar"
                    >
                      Enviar
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* MODAL CREATE/EDIT */}
      {open && editing ? (
        <>
          <div className="backdrop show" onMouseDown={closeModal} />
          <div className="modalCenter" onMouseDown={closeModal}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 860 }}>
              <div className="modalHead">
                <div className="modalTitle">{items.some((x) => x.id === editing.id) ? "Editar notificación" : "Nueva notificación"}</div>
                <button className="iconBtn" onClick={closeModal} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <div className="modalBody">
                <div className="formGrid2">
                  <input
                    ref={fileImgRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={onImageChange}
                  />

                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Asunto</span>
                    <input
                      className="input"
                      value={editing.subject}
                      onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                      placeholder="Ej: Promo del finde"
                    />
                  </label>

                  <div className="field" style={{ gridColumn: "1 / -1" }}>
  <span className="label">Mensaje</span>

  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
    {/* Negrita */}
    <button
      type="button"
      className="ghostBtn"
      title="Negrita"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        const el = bodyRef.current;
        if (!el || !editing) return;
        const r = wrapSelection(el, "**", "**");
        setEditing({ ...editing, body: r.next });
        requestAnimationFrame(() => {
          try {
            el.focus();
            el.setSelectionRange(r.nextCursorStart, r.nextCursorEnd);
          } catch {}
        });
      }}
      style={{ padding: "6px 10px", lineHeight: 1, display: "inline-flex", gap: 6, alignItems: "center" }}
    >
      <FIcon name="bold" size={16} />
    </button>

    {/* Cursiva */}
    <button
      type="button"
      className="ghostBtn"
      title="Cursiva"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        const el = bodyRef.current;
        if (!el || !editing) return;
        const r = wrapSelection(el, "_", "_");
        setEditing({ ...editing, body: r.next });
        requestAnimationFrame(() => {
          try {
            el.focus();
            el.setSelectionRange(r.nextCursorStart, r.nextCursorEnd);
          } catch {}
        });
      }}
      style={{ padding: "6px 10px", lineHeight: 1, display: "inline-flex", gap: 6, alignItems: "center" }}
    >
      <FIcon name="italic" size={16} />
    </button>

    {/* Subrayado */}
    <button
      type="button"
      className="ghostBtn"
      title="Subrayado"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        const el = bodyRef.current;
        if (!el || !editing) return;
        const r = wrapSelection(el, "__", "__");
        setEditing({ ...editing, body: r.next });
        requestAnimationFrame(() => {
          try {
            el.focus();
            el.setSelectionRange(r.nextCursorStart, r.nextCursorEnd);
          } catch {}
        });
      }}
      style={{ padding: "6px 10px", lineHeight: 1, display: "inline-flex", gap: 6, alignItems: "center" }}
    >
      <FIcon name="underline" size={16} />
    </button>

    {/* Lista */}
    <button
      type="button"
      className="ghostBtn"
      title="Lista"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        const el = bodyRef.current;
        if (!el || !editing) return;
        const r = toggleLinePrefix(el, "• ");
        setEditing({ ...editing, body: r.next });
        requestAnimationFrame(() => {
          try {
            el.focus();
          } catch {}
        });
      }}
      style={{ padding: "6px 10px", lineHeight: 1, display: "inline-flex", gap: 6, alignItems: "center" }}
    >
      <FIcon name="list" size={16} />
    </button>

    <div style={{ width: 1, height: 22, background: "rgba(255,255,255,.12)", marginInline: 4 }} />

    {/* Emoji */}
    <button
      ref={emojiBtnRef}
      type="button"
      className="ghostBtn"
      onClick={() => (emojiOpen ? setEmojiOpen(false) : openEmoji())}
      title="Emojis"
      style={{ padding: "6px 10px", lineHeight: 1 }}
    >
      😀
    </button>
  </div>

  {/* Popup emojis (portal) */}
  {emojiOpen && emojiPos
    ? createPortal(
        <div
          ref={emojiPanelRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: emojiPos.top,
            left: emojiPos.left,
            zIndex: 99999,
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(0,0,0,.9)",
          }}
        >
          <EmojiBoundary>
            <React.Suspense fallback={<div style={{ padding: 12, fontSize: 12, opacity: 0.9 }}>Cargando emojis…</div>}>
              <EmojiPicker
                theme={"dark" as any}
                width={360}
                height={420}
                searchPlaceHolder="Buscar emoji…"
                onEmojiClick={(emojiData: EmojiClickData) => {
                  const emo = (emojiData as any)?.emoji || "";
                  if (!emo) return;
                  insertEmoji(emo);
                }}
              />
            </React.Suspense>
          </EmojiBoundary>
        </div>,
        document.body
      )
    : null}

  <textarea
    ref={bodyRef}
    className="input"
    rows={6}
    value={editing.body}
    onChange={(e) => setEditing({ ...editing, body: e.target.value })}
    style={{ resize: "vertical", whiteSpace: "pre-wrap" }}
    placeholder="Escribí el contenido…"
  />
</div>

                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Imagen</span>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                      <button type="button" className="ghostBtn" onClick={onPickImage}>
                        Elegir imagen…
                      </button>
                      {editing.image_url ? (
                        <button type="button" className="ghostBtn" onClick={removeImage}>
                          Quitar
                        </button>
                      ) : null}
                    </div>

                    {editing.image_url ? (
                      <div
                        style={{
                          marginTop: 10,
                          borderRadius: 14,
                          overflow: "hidden",
                          border: "1px solid rgba(255,255,255,.12)",
                          background: "rgba(0,0,0,.25)",
                        }}
                      >
                        <img
                          src={editing.image_url}
                          alt="Preview"
                          style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <label className="field">
                    <span className="label">Destino</span>
                    <select
                      className="input"
                      value={editing.target}
                      onChange={(e) => {
                        const v = e.target.value as TargetMode;
                        setEditing((p) => (p ? { ...p, target: v, test_email: v === "TEST" ? (p.test_email || "") : null } : p));
                      }}
                    >
                      <option value="TEST">Test</option>
                      <option value="ALL">Todos</option>
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Estado</span>
                    <select className="input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Status })}>
                      <option value="DRAFT">DRAFT</option>
                      <option value="SENT">SENT</option>
                      <option value="FAILED">FAILED</option>
                    </select>
                  </label>

                  {editing.target === "TEST" ? (
                    <label className="field" style={{ gridColumn: "1 / -1" }}>
                      <span className="label">Email de prueba</span>
                      <input
                        className="input"
                        value={String(editing.test_email || "")}
                        onChange={(e) => setEditing({ ...editing, test_email: e.target.value })}
                        placeholder="vos@dominio.com"
                        inputMode="email"
                      />
                    </label>
                  ) : null}

                  <div style={{ gridColumn: "1 / -1", opacity: 0.75, fontSize: 12 }}>
                    Hoy esto solo guarda en DB y marca estado. El envío real lo enchufamos después con Edge Function.
                  </div>
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
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";

// ✅ Emoji picker (compatible) — lazy para no romper el admin si algo falla
import type { EmojiClickData } from "emoji-picker-react";
const EmojiPicker = React.lazy(() => import("emoji-picker-react"));

/** ✅ ErrorBoundary para que el picker NO te deje pantalla en blanco si explota */
class EmojiBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any) {
    console.error("Emoji Picker crashed:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 12, fontSize: 12, opacity: 0.9, maxWidth: 360 }}>
          ⚠️ El selector de emojis falló. La página sigue funcionando.
        </div>
      );
    }
    return this.props.children as any;
  }
}

type TargetMode = "TEST" | "ALL";
type Status = "DRAFT" | "SENT" | "FAILED";

// ✅ UI-only: Tipo (mail/sms). No lo persistimos en DB todavía.
type Channel = "MAIL" | "SMS";

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

function fmt(dt: string | null) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return String(dt);
  }
}

function fmtDateOnly(dt: string | null) {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    return d.toLocaleDateString();
  } catch {
    return String(dt);
  }
}

function fmtTimeOnly(dt: string | null) {
  if (!dt) return "";
  try {
    const d = new Date(dt);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

function genId() {
  try {
    // @ts-ignore
    return crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

/* =========================
   STORAGE HELPERS
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

function safeName(name: string) {
  return String(name || "archivo")
    .replace(/[^a-z0-9\.\-\_]+/gi, "_")
    .slice(0, 80);
}

async function uploadAttachment(file: File, notifId: string): Promise<string> {
  const clean = safeName(file.name);
  const path = `notifications/${notifId}/attachments/${Date.now()}_${clean}`;

  const { error: upErr } = await supabase.storage.from("notifications").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from("notifications").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("No pude obtener la URL pública del archivo.");
  return data.publicUrl;
}

/* =========================
   CROP POPUP (igual a Salas)
========================= */

const CROP_ASPECT = 900 / 520;

type CropModalState = {
  open: boolean;
  srcUrl: string;
  originalFile: File;
};

type NatImg = { w: number; h: number };
type CropRect = { x: number; y: number; w: number; h: number };
type Handle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
type DragMode = "move" | "resize" | null;

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function toJpegName(fileName: string) {
  const base = (fileName || "image").replace(/\.[a-z0-9]+$/i, "");
  return `${base}.jpg`;
}

function clampRectToImage(r: CropRect, nat: NatImg, minSize = 80): CropRect {
  let w = Math.max(minSize, Math.min(r.w, nat.w));
  let h = Math.max(minSize, Math.min(r.h, nat.h));

  let x = r.x;
  let y = r.y;

  x = Math.max(0, Math.min(x, nat.w - w));
  y = Math.max(0, Math.min(y, nat.h - h));

  return { x, y, w, h };
}

function rectCenter(r: CropRect) {
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
}

function zoomRect(r: CropRect, nat: NatImg, factor: number, minSize = 80): CropRect {
  const { cx, cy } = rectCenter(r);
  const nw = r.w * factor;
  const nh = r.h * factor;
  const next: CropRect = { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
  return clampRectToImage(next, nat, minSize);
}

function applyAspectFromAnchor(
  rect: CropRect,
  nat: NatImg,
  handle: Handle,
  aspect: number,
  minSize = 80
): CropRect {
  let r = { ...rect };
  const controlsW = handle.includes("e") || handle.includes("w");
  if (controlsW) r.h = r.w / aspect;
  else r.w = r.h * aspect;

  if (handle.includes("n")) r.y = r.y + (rect.h - r.h);
  if (handle.includes("w")) r.x = r.x + (rect.w - r.w);

  return clampRectToImage(r, nat, minSize);
}

/* =========================
   TEXT TOOLBAR (markdown)
========================= */

function wrapSelection(el: HTMLInputElement | HTMLTextAreaElement, before: string, after: string) {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const value = el.value ?? "";
  const sel = value.slice(start, end);

  const next = value.slice(0, start) + before + sel + after + value.slice(end);
  const nextCursor = start + before.length + sel.length + after.length;

  return { next, nextCursorStart: start + before.length, nextCursorEnd: nextCursor };
}

function insertAtCursor(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const value = el.value ?? "";

  const next = value.slice(0, start) + text + value.slice(end);
  const cursor = start + text.length;
  return { next, cursor };
}

/* =========================
   CATEGORY (promo/descuento/novedad)
========================= */

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

/* =========================
   SORTING
========================= */

type SortKey = "date" | "time" | "title" | "category" | "status";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

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
  name: "edit" | "eye" | "send" | "trash" | "dots";
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
        <path
          d="M13.5 6.5 17.5 10.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
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
        <path
          d="M22 2 15 22l-4-9-9-4L22 2Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
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

  // UI-only channel
  const [channel, setChannel] = useState<Channel>("MAIL");

  // modal preview
  const [preview, setPreview] = useState<NotificationRow | null>(null);

  // modal preview body completo
  const [bodyModal, setBodyModal] = useState<{ title: string; text: string } | null>(null);

  // emojis (toolbar)
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const emojiPanelRef = useRef<HTMLDivElement | null>(null);
  const [emojiPos, setEmojiPos] = useState<{ top: number; left: number } | null>(null);
  const lastFocusRef = useRef<"subject" | "body">("body");

  // refs para toolbar
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // imagen + crop
  const fileImgRef = useRef<HTMLInputElement | null>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [tempImgPreview, setTempImgPreview] = useState<string | null>(null);

  const [cropModal, setCropModal] = useState<CropModalState | null>(null);
  const [natImg, setNatImg] = useState<NatImg | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);

  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const dragModeRef = useRef<DragMode>(null);
  const dragHandleRef = useRef<Handle | null>(null);
  const dragStartRef = useRef<{ px: number; py: number; rect: CropRect } | null>(null);
  const cursorRef = useRef<string>("default");

  // adjunto
  const fileAttachRef = useRef<HTMLInputElement | null>(null);

  // ✅ menú ⋯ (anclado al botón, portal a body)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const computeMenuPosFromAnchor = () => {
    const btn = menuAnchorRef.current;
    if (!btn) return null;

    const r = btn.getBoundingClientRect();
    const top = r.top + window.scrollY; // ✅ absoluto al documento
    const left = r.right + window.scrollX;

    // Menú al costado derecho; si no entra, lo mandamos a la izquierda
    const MENU_W = 240;
    const gap = 10;

    let x = left + gap;
    const maxX = window.scrollX + window.innerWidth - 12 - MENU_W;
    if (x > maxX) x = r.left + window.scrollX - gap - MENU_W;

    // Alineado al botón
    let y = top - 4;

    // Evitar que se vaya demasiado abajo
    const maxY = window.scrollY + window.innerHeight - 12 - 260;
    if (y > maxY) y = maxY;

    // Evitar que se vaya arriba
    const minY = window.scrollY + 12;
    if (y < minY) y = minY;

    return { top: y, left: x };
  };

  const openMenuFor = (id: string, btn: HTMLButtonElement) => {
    menuAnchorRef.current = btn;
    const pos = computeMenuPosFromAnchor();
    setMenuOpenId(id);
    setMenuPos(pos);
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
      const okQ =
        !s
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
      if (sort.key === "date") {
        const ta = dateToTs(getRowDate(a));
        const tb = dateToTs(getRowDate(b));
        return (ta - tb) * dirMul;
      }

      if (sort.key === "time") {
        const ta = dateToTs(getRowDate(a));
        const tb = dateToTs(getRowDate(b));
        return (ta - tb) * dirMul;
      }

      if (sort.key === "title") {
        const sa = String(a.subject || "").toLowerCase();
        const sb = String(b.subject || "").toLowerCase();
        return sa.localeCompare(sb) * dirMul;
      }

      if (sort.key === "category") {
        const ca = inferCategory(a);
        const cb = inferCategory(b);
        return ca.localeCompare(cb) * dirMul;
      }

      if (sort.key === "status") {
        const sa = String(a.status || "").toLowerCase();
        const sb = String(b.status || "").toLowerCase();
        return sa.localeCompare(sb) * dirMul;
      }

      return 0;
    });

    return arr;
  }, [filtered, sort]);

  const closeCropModal = () => {
    if (cropModal?.srcUrl) {
      try {
        URL.revokeObjectURL(cropModal.srcUrl);
      } catch {}
    }
    setCropModal(null);
    setNatImg(null);
    setCropRect(null);
    dragModeRef.current = null;
    dragHandleRef.current = null;
    dragStartRef.current = null;
    cursorRef.current = "default";
  };

  const resetModalTransient = () => {
    setEmojiOpen(false);
    setEmojiPos(null);

    setImgFile(null);
    if (tempImgPreview) {
      try {
        URL.revokeObjectURL(tempImgPreview);
      } catch {}
    }
    setTempImgPreview(null);
    if (fileImgRef.current) fileImgRef.current.value = "";
    if (fileAttachRef.current) fileAttachRef.current.value = "";

    closeCropModal();
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
    setChannel("MAIL"); // UI-only
    lastFocusRef.current = "body";
    resetModalTransient();
    setOpen(true);
  };

  const startEdit = (n: NotificationRow) => {
    setEditing({ ...n });
    setChannel("MAIL"); // UI-only
    lastFocusRef.current = "body";
    resetModalTransient();
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditing(null);
    resetModalTransient();
  };

  /* =========================
     EMOJI (toolbar) ✅
  ========================= */

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
  }, [emojiOpen]);

  const insertEmoji = (emo: string) => {
    const target = lastFocusRef.current;
    const el = target === "subject" ? subjectRef.current : bodyRef.current;
    if (!el) return;

    const { next, cursor } = insertAtCursor(el, emo);
    if (target === "subject") {
      setEditing((p) => (p ? { ...p, subject: next } : p));
    } else {
      setEditing((p) => (p ? { ...p, body: next } : p));
    }

    requestAnimationFrame(() => {
      try {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      } catch {}
    });
  };

  /* =========================
     TEXT TOOLBAR
  ========================= */

  const applyTool = (tool: "bold" | "italic" | "underline" | "strike" | "link" | "bullets") => {
    const target = lastFocusRef.current;
    const el = target === "subject" ? subjectRef.current : bodyRef.current;
    if (!el) return;

    if (tool === "bullets") {
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const value = el.value ?? "";
      const sel = value.slice(start, end) || "";
      const lines = (sel || "")
        .split("\n")
        .map((x) => (x.trim() ? `- ${x}` : x));
      const block = lines.join("\n");
      const { next, cursor } = insertAtCursor(el, block || "- ");
      if (target === "subject") setEditing((p) => (p ? { ...p, subject: next } : p));
      else setEditing((p) => (p ? { ...p, body: next } : p));

      requestAnimationFrame(() => {
        try {
          el.focus();
          el.setSelectionRange(cursor, cursor);
        } catch {}
      });
      return;
    }

    if (tool === "link") {
      const url = prompt("Pegá el link (https://...)");
      if (!url) return;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const value = el.value ?? "";
      const sel = value.slice(start, end) || "link";

      const text = `[${sel}](${url})`;
      const nextValue = value.slice(0, start) + text + value.slice(end);

      if (target === "subject") setEditing((p) => (p ? { ...p, subject: nextValue } : p));
      else setEditing((p) => (p ? { ...p, body: nextValue } : p));

      const cursor = start + text.length;
      requestAnimationFrame(() => {
        try {
          el.focus();
          el.setSelectionRange(cursor, cursor);
        } catch {}
      });
      return;
    }

    const wrap =
      tool === "bold"
        ? ["**", "**"]
        : tool === "italic"
        ? ["*", "*"]
        : tool === "underline"
        ? ["__", "__"]
        : ["~~", "~~"];

    const { next, nextCursorStart, nextCursorEnd } = wrapSelection(el, wrap[0], wrap[1]);

    if (target === "subject") setEditing((p) => (p ? { ...p, subject: next } : p));
    else setEditing((p) => (p ? { ...p, body: next } : p));

    requestAnimationFrame(() => {
      try {
        el.focus();
        el.setSelectionRange(nextCursorStart, nextCursorEnd);
      } catch {}
    });
  };

  /* =========================
     IMAGE PICK + CROP (igual a Salas)
  ========================= */

  const onPickImage = () => fileImgRef.current?.click();

  const openCropperForFile = (file: File) => {
    const url = URL.createObjectURL(file);

    setNatImg(null);
    setCropRect(null);
    dragModeRef.current = null;
    dragHandleRef.current = null;
    dragStartRef.current = null;

    setCropModal({ open: true, srcUrl: url, originalFile: file });

    const img = new Image();
    img.onload = () => {
      const nat = { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
      setNatImg(nat);

      const margin = 0.1;
      const init = {
        x: nat.w * margin,
        y: nat.h * margin,
        w: nat.w * (1 - margin * 2),
        h: nat.h * (1 - margin * 2),
      };

      setCropRect(clampRectToImage(init, nat, 80));
    };
    img.onerror = () => {
      alert("No pude leer la imagen para recortar.");
      try {
        URL.revokeObjectURL(url);
      } catch {}
      setCropModal(null);
    };
    img.src = url;
  };

  const onImageChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Elegí una imagen (JPG/PNG/WebP).");
      e.target.value = "";
      return;
    }

    openCropperForFile(file);
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

  const getContainBox = () => {
    if (!natImg) return null;
    const stage = cropStageRef.current;
    if (!stage) return null;
    const r = stage.getBoundingClientRect();

    const sw = Math.max(1, r.width);
    const sh = Math.max(1, r.height);

    const scale = Math.min(sw / natImg.w, sh / natImg.h);
    const rw = natImg.w * scale;
    const rh = natImg.h * scale;

    const ox = (sw - rw) / 2;
    const oy = (sh - rh) / 2;

    return { sw, sh, rw, rh, ox, oy, scale };
  };

  const natToScreenRect = (rect: CropRect) => {
    const box = getContainBox();
    if (!box) return null;
    return {
      left: box.ox + rect.x * box.scale,
      top: box.oy + rect.y * box.scale,
      width: rect.w * box.scale,
      height: rect.h * box.scale,
    };
  };

  const screenToNatPoint = (px: number, py: number) => {
    const box = getContainBox();
    if (!box || !natImg) return null;

    const xIn = clamp(px - box.ox, 0, box.rw);
    const yIn = clamp(py - box.oy, 0, box.rh);

    const nx = xIn / box.scale;
    const ny = yIn / box.scale;

    return { x: clamp(nx, 0, natImg.w), y: clamp(ny, 0, natImg.h) };
  };

  const hitTestHandle = (mx: number, my: number): { handle: Handle | null; inside: boolean } => {
    if (!cropRect) return { handle: null, inside: false };
    const sr = natToScreenRect(cropRect);
    if (!sr) return { handle: null, inside: false };

    const pad = 10;
    const x1 = sr.left;
    const y1 = sr.top;
    const x2 = sr.left + sr.width;
    const y2 = sr.top + sr.height;

    const nearL = Math.abs(mx - x1) <= pad;
    const nearR = Math.abs(mx - x2) <= pad;
    const nearT = Math.abs(my - y1) <= pad;
    const nearB = Math.abs(my - y2) <= pad;

    const inside = mx >= x1 && mx <= x2 && my >= y1 && my <= y2;

    if (nearL && nearT) return { handle: "nw", inside };
    if (nearR && nearT) return { handle: "ne", inside };
    if (nearL && nearB) return { handle: "sw", inside };
    if (nearR && nearB) return { handle: "se", inside };

    if (nearT && inside) return { handle: "n", inside };
    if (nearB && inside) return { handle: "s", inside };
    if (nearL && inside) return { handle: "w", inside };
    if (nearR && inside) return { handle: "e", inside };

    return { handle: null, inside };
  };

  const cursorForHandle = (h: Handle | null, inside: boolean) => {
    if (h === "nw" || h === "se") return "nwse-resize";
    if (h === "ne" || h === "sw") return "nesw-resize";
    if (h === "n" || h === "s") return "ns-resize";
    if (h === "e" || h === "w") return "ew-resize";
    if (inside) return "move";
    return "default";
  };

  const applyMaxCrop = () => {
    if (!natImg) return;
    const full: CropRect = { x: 0, y: 0, w: natImg.w, h: natImg.h };
    setCropRect(clampRectToImage(full, natImg, 80));
  };

  const onCropStageMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!natImg || !cropRect) return;
    const stage = cropStageRef.current;
    if (!stage) return;

    const r = stage.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;

    const hit = hitTestHandle(mx, my);
    const cursor = cursorForHandle(hit.handle, hit.inside);

    if (hit.handle) {
      dragModeRef.current = "resize";
      dragHandleRef.current = hit.handle;
    } else if (hit.inside) {
      dragModeRef.current = "move";
      dragHandleRef.current = null;
    } else {
      const p = screenToNatPoint(mx, my);
      if (p) {
        const { w, h } = cropRect;
        const next: CropRect = { x: p.x - w / 2, y: p.y - h / 2, w, h };
        setCropRect(clampRectToImage(next, natImg, 80));
      }
      dragModeRef.current = null;
      dragHandleRef.current = null;
      cursorRef.current = cursor;
      stage.style.cursor = cursor;
      return;
    }

    dragStartRef.current = { px: mx, py: my, rect: cropRect };
    cursorRef.current = cursor;
    stage.style.cursor = cursor;
  };

  const onCropStageMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const stage = cropStageRef.current;
    if (!stage) return;

    if (!natImg || !cropRect) {
      stage.style.cursor = "default";
      return;
    }

    const r = stage.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;

    if (dragModeRef.current && dragStartRef.current) {
      const start = dragStartRef.current;
      const dx = mx - start.px;
      const dy = my - start.py;

      const box = getContainBox();
      if (!box) return;

      const ndx = dx / box.scale;
      const ndy = dy / box.scale;

      if (dragModeRef.current === "move") {
        const next: CropRect = {
          x: start.rect.x + ndx,
          y: start.rect.y + ndy,
          w: start.rect.w,
          h: start.rect.h,
        };
        setCropRect(clampRectToImage(next, natImg, 80));
        return;
      }

      const h = dragHandleRef.current;
      if (!h) return;

      let next = { ...start.rect };

      if (h.includes("e")) next.w = start.rect.w + ndx;
      if (h.includes("s")) next.h = start.rect.h + ndy;

      if (h.includes("w")) {
        next.x = start.rect.x + ndx;
        next.w = start.rect.w - ndx;
      }
      if (h.includes("n")) {
        next.y = start.rect.y + ndy;
        next.h = start.rect.h - ndy;
      }

      next = clampRectToImage(next, natImg, 80);

      if (e.shiftKey) {
        next = applyAspectFromAnchor(next, natImg, h, CROP_ASPECT, 80);
      }

      setCropRect(next);
      return;
    }

    const hit = hitTestHandle(mx, my);
    const cursor = cursorForHandle(hit.handle, hit.inside);
    if (cursorRef.current !== cursor) {
      cursorRef.current = cursor;
      stage.style.cursor = cursor;
    }
  };

  const endCropDrag = () => {
    dragModeRef.current = null;
    dragHandleRef.current = null;
    dragStartRef.current = null;

    const stage = cropStageRef.current;
    if (stage) stage.style.cursor = cursorRef.current || "default";
  };

  const onCropWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (!natImg || !cropRect) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    const factor = dir > 0 ? 1.06 : 0.94;
    setCropRect(zoomRect(cropRect, natImg, factor, 80));
  };

  const onCropDoubleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    applyMaxCrop();
  };

  const confirmCrop = async () => {
    if (!cropModal || !natImg || !cropRect || !editing) return;
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("No pude cargar la imagen para recortar."));
        img.src = cropModal.srcUrl;
      });

      const rect = clampRectToImage(cropRect, natImg, 80);

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(rect.w);
      canvas.height = Math.round(rect.h);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No pude abrir canvas para recortar.");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("No pude exportar el recorte."))),
          "image/jpeg",
          0.9
        );
      });

      const croppedFile = new File([blob], toJpegName(cropModal.originalFile.name), {
        type: "image/jpeg",
      });

      setImgFile(croppedFile);

      if (tempImgPreview) {
        try {
          URL.revokeObjectURL(tempImgPreview);
        } catch {}
      }
      const prevUrl = URL.createObjectURL(croppedFile);
      setTempImgPreview(prevUrl);

      setEditing((prev) => (prev ? { ...prev, image_url: prevUrl } : prev));

      closeCropModal();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Error recortando imagen.");
    }
  };

  const cropRectStyle = useMemo(() => {
    if (!natImg || !cropRect || !cropModal?.open) return null;
    const sr = natToScreenRect(cropRect);
    if (!sr) return null;
    return {
      left: sr.left,
      top: sr.top,
      width: sr.width,
      height: sr.height,
    } as React.CSSProperties;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natImg, cropRect, cropModal?.open]);

  /* =========================
     ATTACH BUTTON
  ========================= */

  const onPickAttachment = () => fileAttachRef.current?.click();

  const onAttachChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0] || null;
    if (!file || !editing) return;

    setSaving(true);
    try {
      const url = await uploadAttachment(file, editing.id);
      const line = `\n📎 ${file.name}: ${url}\n`;

      const el = bodyRef.current;
      if (el) {
        const { next, cursor } = insertAtCursor(el, line);
        setEditing((p) => (p ? { ...p, body: next } : p));
        requestAnimationFrame(() => {
          try {
            el.focus();
            el.setSelectionRange(cursor, cursor);
          } catch {}
        });
      } else {
        setEditing((p) => (p ? { ...p, body: (p.body || "") + line } : p));
      }

      alert("Adjunto subido. Te dejé el link insertado en el mensaje.");
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No pude subir el archivo. Revisá Storage/Policies.");
    } finally {
      setSaving(false);
      e.target.value = "";
    }
  };

  /* =========================
     SAVE + STATUS + DELETE
  ========================= */

  const save = async () => {
    if (!editing) return;

    const subject = String(editing.subject || "").trim();
    const body = String(editing.body || "").trim();
    if (subject.length < 3) return alert("Poné un asunto (mínimo 3 caracteres).");
    if (body.length < 5) return alert("Poné un mensaje (mínimo 5 caracteres).");

    const target = editing.target;
    const testEmail = String(editing.test_email || "").trim();

    if (target === "TEST" && !testEmail.includes("@")) {
      return alert("Para TEST necesitás un email válido.");
    }

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
      if (status === "SENT") patch.sent_at = new Date().toISOString();
      else patch.sent_at = null;

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
     EXCEL-STYLE TABLE ✅ FIX
  ========================= */

/* =========================
   EXCEL-STYLE TABLE ✅ FIX
========================= */

// columnas más compactas (como lista)
const GRID_COLS = "95px 75px 1.6fr 0.9fr 0.75fr 0.9fr 60px";

// altura tipo lista compacta
const ROW_MIN_H = 38;
const CELL_FONT = 13;

const headerCellBase: React.CSSProperties = {
  padding: "10px 8px",
  textAlign: "center",
  fontSize: 14,
  fontWeight: 800,
  opacity: 0.95,
  userSelect: "none",
  borderRight: "1px solid rgba(255,255,255,.10)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  letterSpacing: 0.2,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const headerClickable = (key: SortKey): React.CSSProperties => ({
  ...headerCellBase,
  cursor: "pointer",
});

// ✅ celdas centradas vertical y horizontal
const cellBase: React.CSSProperties = {
  padding: "5px 8px",
  borderRight: "1px solid rgba(255,255,255,.08)",
  minWidth: 0,
  display: "flex",
  alignItems: "center",      // ✅ centro vertical
  justifyContent: "center",  // ✅ centro horizontal
  fontSize: CELL_FONT,       // ✅ mismo tamaño para todo
  lineHeight: 1.2,
  width: "100%",
  height: "100%",
  textAlign: "center",
};

// ✅ filas compactas tipo lista
const rowBase: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: GRID_COLS,
  gap: 0,
  alignItems: "stretch",
  borderBottom: "1px solid rgba(255,255,255,.08)",
  minHeight: ROW_MIN_H,
};

  return (
    <div className="page">
      <div className="pageHeadRow" style={{ gap: 12 }}>
        <div>
          <div className="pageTitle">Notificaciones</div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            Panel con orden y menú ⋯. El envío real lo conectamos cuando cerremos SMTP/dominio.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="ghostBtn" onClick={load} disabled={loading || saving}>
            Refrescar
          </button>

          <button className="btnSmall" onClick={startCreate} disabled={loading || saving}>
            + Nueva notificación
          </button>
        </div>
      </div>

      <div className="toolbarRow" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título o contenido…"
          style={{ flex: 1 }}
        />

        <select
          className="input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          style={{ width: 200 }}
        >
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="SENT">Enviado</option>
          <option value="FAILED">Fallido</option>
        </select>

        <select
          className="input"
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value as any)}
          style={{ width: 220 }}
        >
          <option value="">Todos los destinos</option>
          <option value="TEST">Test</option>
          <option value="ALL">Todos</option>
        </select>
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 16 }}>
          Cargando notificaciones…
        </div>
      ) : (
        <div
          className="panel"
          style={{
            padding: 0,
            width: "100%",
            height: "calc(100vh - 260px)",
            overflow: "auto",
          }}
        >
          {sorted.length === 0 ? (
            <div style={{ padding: 16, opacity: 0.8 }}>No hay resultados.</div>
          ) : (
            <div style={{ width: "100%" }}>
              {/* ✅ Header sticky estilo excel */}
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 5,
                  display: "grid",
                  gridTemplateColumns: GRID_COLS,
                  gap: 0,
                  alignItems: "stretch",
                  background: "rgba(0,0,0,.70)",
                  backdropFilter: "blur(6px)",
                  borderBottom: "1px solid rgba(255,255,255,.12)",
                  borderTop: "1px solid rgba(255,255,255,.08)",
                }}
              >
                <div
                  style={headerClickable("date")}
                  onClick={() => setSort((p) => toggleSort(p, "date"))}
                  title="Ordenar por fecha"
                >
                  Fecha{sortIndicator(sort, "date")}
                </div>

                <div
                  style={headerClickable("time")}
                  onClick={() => setSort((p) => toggleSort(p, "time"))}
                  title="Ordenar por hora"
                >
                  Hora{sortIndicator(sort, "time")}
                </div>

                <div
                  style={headerClickable("title")}
                  onClick={() => setSort((p) => toggleSort(p, "title"))}
                  title="Ordenar por título"
                >
                  Título{sortIndicator(sort, "title")}
                </div>

                <div
                  style={headerClickable("category")}
                  onClick={() => setSort((p) => toggleSort(p, "category"))}
                  title="Ordenar por categoría"
                >
                  Categoría{sortIndicator(sort, "category")}
                </div>

                <div style={headerCellBase} title="Tipo (por ahora bloqueado en la grilla)">
                  Tipo
                </div>

                <div
                  style={headerClickable("status")}
                  onClick={() => setSort((p) => toggleSort(p, "status"))}
                  title="Ordenar por estado"
                >
                  Estado{sortIndicator(sort, "status")}
                </div>

                {/* ✅ sin ⋯ en el header */}
                <div style={{ ...headerCellBase, borderRight: "none" }} />
              </div>

              {/* ✅ Rows */}
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
                    {/* ✅ Fecha (MISMO font) */}
                    <div style={{ ...cellBase, opacity: 0.9, textAlign: "center" }}>
                      {fmtDateOnly(d)}
                    </div>

                    {/* ✅ Hora (MISMO font) */}
                    <div style={{ ...cellBase, opacity: 0.85, textAlign: "center" }}>
                      {fmtTimeOnly(d)}
                    </div>

                    {/* ✅ Título: SOLO subject + centrado vertical REAL */}
                    <div style={{ ...cellBase, justifyContent: "center" }}>
                      <div
                        style={{
                          width: "100%",
                          textAlign: "left",
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={n.subject}
                      >
                        {n.subject}
                      </div>
                    </div>

                    <div style={{ ...cellBase, opacity: 0.9, textAlign: "center" }}>{cat}</div>

                    <div style={{ ...cellBase, opacity: 0.7, textAlign: "center" }}>
                      MAIL <span style={{ opacity: 0.55 }}>(bloqueado)</span>
                    </div>

                    <div style={{ ...cellBase, opacity: 0.95, textAlign: "center" }}>
                      {n.status === "DRAFT" ? "BORRADOR" : n.status === "SENT" ? "ENVIADO" : "FALLIDO"}
                    </div>

                    {/* ✅ ⋯ solo filas, centrado en altura */}
                    <div style={{ ...cellBase, borderRight: "none", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="ghostBtn"
                        style={{
                          padding: "6px 10px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
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

              {/* ✅ Menú (PORTAL a body) — aparece al lado de la fila SIEMPRE */}
              {menuOpenId && menuPos
                ? createPortal(
                    <div
                      data-menu-popup="1"
                      style={{
                        position: "absolute",
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
                          justifyContent: "flex-start" as any,
                          borderRadius: 0,
                          padding: "10px 12px",
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                        };

                        const iconStyle: React.CSSProperties = {
                          opacity: 0.9,
                        };

                        return (
                          <>
                            <button
                              className="ghostBtn"
                              style={{
                                ...itemStyle,
                                opacity: n.status === "SENT" ? 0.5 : 1,
                              }}
                              onClick={() => {
                                closeMenu();
                                if (n.status !== "SENT") startEdit(n);
                              }}
                              disabled={saving || n.status === "SENT"}
                              title={n.status === "SENT" ? "No se puede editar una enviada" : "Editar"}
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
                              style={{
                                ...itemStyle,
                                opacity: n.status === "SENT" ? 0.5 : 1,
                              }}
                              onClick={async () => {
                                closeMenu();
                                await sendNotification(n);
                              }}
                              disabled={saving || n.status === "SENT"}
                              title={n.status === "SENT" ? "Ya está enviada" : "Enviar"}
                            >
                              <Icon name="send" size={16} style={iconStyle} />
                              Enviar
                            </button>

                            <div style={{ height: 1, background: "rgba(255,255,255,.10)" }} />

                            <button
                              className="dangerBtnInline"
                              style={{
                                ...itemStyle,
                                textAlign: "left",
                              }}
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
          )}
        </div>
      )}

      {/* ✅ Modal vista previa */}
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
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                    opacity: 0.85,
                    fontSize: 12,
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <span style={{ opacity: 0.7 }}>Categoría:</span> <b>{inferCategory(preview)}</b>
                  </div>
                  <div>
                    <span style={{ opacity: 0.7 }}>Fecha:</span> <b>{fmt(getRowDate(preview))}</b>
                  </div>
                  <div>
                    <span style={{ opacity: 0.7 }}>Estado:</span>{" "}
                    <b>
                      {preview.status === "DRAFT"
                        ? "BORRADOR"
                        : preview.status === "SENT"
                        ? "ENVIADO"
                        : "FALLIDO"}
                    </b>
                  </div>
                  <div>
                    <span style={{ opacity: 0.7 }}>Tipo:</span> <b>MAIL</b>
                  </div>
                  <div>
                    <span style={{ opacity: 0.7 }}>Destino:</span> <b>{preview.target}</b>
                  </div>
                </div>

                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>{preview.subject}</div>

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

                <div
                  style={{
                    textAlign: "left",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.45,
                    fontSize: 14,
                    opacity: 0.95,
                  }}
                >
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

      {/* Modal ver body completo */}
      {bodyModal ? (
        <>
          <div className="backdrop show" onMouseDown={() => setBodyModal(null)} />
          <div className="modalCenter" onMouseDown={() => setBodyModal(null)}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 860 }}>
              <div className="modalHead">
                <div className="modalTitle">{bodyModal.title || "Mensaje"}</div>
                <button className="iconBtn" onClick={() => setBodyModal(null)} aria-label="Cerrar">
                  ✕
                </button>
              </div>
              <div className="modalBody">
                <div style={{ textAlign: "left", whiteSpace: "pre-wrap", lineHeight: 1.45, fontSize: 14 }}>
                  {bodyModal.text}
                </div>
              </div>
              <div className="modalFoot">
                <button className="ghostBtn" onClick={() => setBodyModal(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* Modal crear/editar */}
      {open && editing ? (
        <>
          <div className="backdrop show" onMouseDown={closeModal} />
          <div className="modalCenter" onMouseDown={closeModal}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 860 }}>
              <div className="modalHead">
                <div className="modalTitle">
                  {items.some((x) => x.id === editing.id) ? "Editar notificación" : "Nueva notificación"}
                </div>
                <button className="iconBtn" onClick={closeModal} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <div className="modalBody">
                <div className="formGrid2">
                  {/* inputs ocultos */}
                  <input
                    ref={fileImgRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={onImageChange}
                  />
                  <input ref={fileAttachRef} type="file" style={{ display: "none" }} onChange={onAttachChange} />

                  {/* Toolbar: emojis + texto + adjunto + imagen */}
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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

                    <button type="button" className="ghostBtn" onClick={() => applyTool("bold")} title="Negrita" style={{ padding: "6px 10px" }}>
                      <b>B</b>
                    </button>
                    <button type="button" className="ghostBtn" onClick={() => applyTool("italic")} title="Cursiva" style={{ padding: "6px 10px" }}>
                      <i>I</i>
                    </button>
                    <button type="button" className="ghostBtn" onClick={() => applyTool("underline")} title="Subrayado" style={{ padding: "6px 10px" }}>
                      <span style={{ textDecoration: "underline" }}>U</span>
                    </button>
                    <button type="button" className="ghostBtn" onClick={() => applyTool("strike")} title="Tachado" style={{ padding: "6px 10px" }}>
                      <span style={{ textDecoration: "line-through" }}>S</span>
                    </button>
                    <button type="button" className="ghostBtn" onClick={() => applyTool("link")} title="Link" style={{ padding: "6px 10px" }}>
                      🔗
                    </button>
                    <button type="button" className="ghostBtn" onClick={() => applyTool("bullets")} title="Lista" style={{ padding: "6px 10px" }}>
                      ••
                    </button>

                    <div style={{ flex: 1 }} />

                    <button type="button" className="ghostBtn" onClick={onPickAttachment} title="Adjuntar archivo" style={{ padding: "6px 10px" }}>
                      📎
                    </button>

                    <button type="button" className="btnSmall" onClick={onPickImage} title="Elegir imagen">
                      🖼️ Imagen…
                    </button>
                  </div>

                  {/* Emoji popup */}
                  {emojiOpen && emojiPos ? (
                    <div
                      ref={emojiPanelRef}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute",
                        top: emojiPos.top,
                        left: emojiPos.left,
                        zIndex: 9999,
                        borderRadius: 12,
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,.12)",
                        background: "rgba(0,0,0,.9)",
                      }}
                    >
                      <EmojiBoundary>
                        <Suspense fallback={<div style={{ padding: 12, fontSize: 12, opacity: 0.9 }}>Cargando emojis…</div>}>
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
                        </Suspense>
                      </EmojiBoundary>
                    </div>
                  ) : null}

                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Asunto</span>
                    <input
                      ref={subjectRef}
                      className="input"
                      value={editing.subject}
                      onFocus={() => (lastFocusRef.current = "subject")}
                      onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                      placeholder="Ej: Promo del finde 🎉"
                    />
                  </label>

                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Mensaje</span>
                    <textarea
                      ref={bodyRef}
                      className="input"
                      rows={5}
                      value={editing.body}
                      onFocus={() => (lastFocusRef.current = "body")}
                      onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                      style={{ resize: "vertical" }}
                      placeholder="Escribí el contenido…"
                    />
                  </label>

                  {editing.image_url ? (
                    <div className="field" style={{ gridColumn: "1 / -1" }}>
                      <span className="label">Imagen</span>

                      <div
                        style={{
                          marginTop: 10,
                          borderRadius: 14,
                          overflow: "hidden",
                          border: "1px solid rgba(255,255,255,.12)",
                          background: "rgba(0,0,0,.25)",
                        }}
                      >
                        <img src={editing.image_url} alt="Preview" style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }} />
                      </div>

                      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                        <button type="button" className="ghostBtn" onClick={removeImage}>
                          Quitar
                        </button>
                        <button type="button" className="ghostBtn" onClick={() => onPickImage()} title="Reemplazar imagen">
                          Reemplazar…
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <label className="field">
                    <span className="label">Destino</span>
                    <select
                      className="input"
                      value={editing.target}
                      onChange={(e) => {
                        const v = e.target.value as TargetMode;
                        setEditing((p) =>
                          p ? { ...p, target: v, test_email: v === "TEST" ? (p.test_email || "") : null } : p
                        );
                      }}
                    >
                      <option value="TEST">Test</option>
                      <option value="ALL">Todos</option>
                    </select>
                  </label>

                  <label className="field">
  <span className="label">Estado</span>
  <select
    className="input"
    value={editing.status}
    onChange={(e) => setEditing({ ...editing, status: e.target.value as Status })}
  >
    <option value="DRAFT">Borrador</option>
    <option value="SENT">Enviar</option>
    <option value="FAILED">Fallido</option>
  </select>
</label>

                  {/* ✅ Si es TEST: Email + Tipo al lado */}
                  {editing.target === "TEST" ? (
                    <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 220px", gap: 10, alignItems: "end" }}>
                      <label className="field" style={{ margin: 0 }}>
                        <span className="label">Email de prueba</span>
                        <input
                          className="input"
                          value={String(editing.test_email || "")}
                          onChange={(e) => setEditing({ ...editing, test_email: e.target.value })}
                          placeholder="vos@dominio.com"
                          inputMode="email"
                        />
                      </label>

                      <label className="field" style={{ margin: 0 }}>
                        <span className="label">Tipo</span>
                        <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                          <option value="MAIL">MAIL</option>
                          <option value="SMS">SMS</option>
                        </select>
                      </label>
                    </div>
                  ) : (
                    // ✅ Si es ALL: igual tiene que poder elegir Tipo
                    <label className="field" style={{ gridColumn: "1 / -1" }}>
                      <span className="label">Tipo</span>
                      <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                        <option value="MAIL">MAIL</option>
                        <option value="SMS">SMS</option>
                      </select>
                    </label>
                  )}

                  <div style={{ gridColumn: "1 / -1", opacity: 0.75, fontSize: 12 }}>
                    Hoy esto solo guarda en DB y marca estado. El envío real lo enchufamos con Edge Function cuando cerremos SMTP/dominio.
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

      {/* CROP POPUP */}
      {cropModal?.open ? (
        <>
          <div className="backdrop show" onMouseDown={closeCropModal} style={{ zIndex: 9998 }} />
          <div className="modalCenter" onMouseDown={closeCropModal} style={{ zIndex: 9999 }}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 980 }}>
              <div className="modalHead">
                <div className="modalTitle">Recortar imagen</div>
                <button className="iconBtn" onClick={closeCropModal} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <div className="modalBody">
                <div style={{ opacity: 0.78, fontSize: 12, marginBottom: 10 }}>
                  Mouse: <b>mover</b> arrastrando dentro, <b>resize</b> arrastrando bordes/esquinas. Ruedita = zoom. Doble click = máximo. <b>Shift</b> = ratio.
                </div>

                <div
                  ref={cropStageRef}
                  onMouseDown={onCropStageMouseDown}
                  onMouseMove={onCropStageMouseMove}
                  onMouseUp={endCropDrag}
                  onMouseLeave={endCropDrag}
                  onWheel={onCropWheel}
                  onDoubleClick={onCropDoubleClick}
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "min(58vh, 560px)",
                    borderRadius: 14,
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,.12)",
                    background: "rgba(0,0,0,.25)",
                    userSelect: "none",
                  }}
                >
                  <img
                    src={cropModal.srcUrl}
                    alt="Crop"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      display: "block",
                      pointerEvents: "none",
                    }}
                  />

                  {natImg && cropRectStyle ? (
                    <>
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.35)" }} />
                      <div
                        style={{
                          position: "absolute",
                          ...cropRectStyle,
                          boxShadow: "0 0 0 9999px rgba(0,0,0,.35)",
                          border: "2px solid rgba(255,255,255,.9)",
                          borderRadius: 12,
                          pointerEvents: "none",
                        }}
                      />
                    </>
                  ) : (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.8 }}>
                      Cargando imagen…
                    </div>
                  )}
                </div>
              </div>

              <div className="modalFoot">
                <button className="ghostBtn" onClick={closeCropModal}>
                  Cancelar
                </button>
                <button className="btnSmall" onClick={confirmCrop} disabled={!natImg || !cropRect}>
                  Usar recorte
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
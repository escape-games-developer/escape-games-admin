// News.tsx (ADMIN) — mantener tu UI/UX base
// ✅ Descripción: formato + emojis (picker sin libs, React 19 OK)
// ✅ Imagen: popup con imagen completa (contain) + recorte con cursor “tipo Paint” (mover/resize/zoom)
// ✅ Confirmar recorte => genera JPG + preview + se sube el recorte
// ✅ Vista previa (cliente) funcionando (modal)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

/* =======================
   TIPOS
======================= */

type NewsType = "PROMO" | "DESTACADO" | "EVENTO" | "PROXIMAMENTE";
type CtaMode = "CONSULTAR" | "VER_DETALLE";

type NewsItem = {
  id: string;

  title: string;
  description: string;

  type: NewsType;
  publishedAt: string; // YYYY-MM-DD

  image: string;
  imagePosition: number;

  ctaMode: CtaMode;
  ctaLink: string;

  active: boolean;
  createdAt?: string;
};

const TYPE_LABEL: Record<NewsType, string> = {
  PROMO: "Promo",
  DESTACADO: "Destacado",
  EVENTO: "Evento",
  PROXIMAMENTE: "Próximamente",
};

const CTA_LABEL: Record<CtaMode, string> = {
  CONSULTAR: "Consultar",
  VER_DETALLE: "Ver detalle",
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

const NEWS_BUCKET = "news";

const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const openDatePicker = (el: HTMLInputElement | null) => {
  if (!el) return;
  const anyEl = el as HTMLInputElement & { showPicker?: () => void };
  if (typeof anyEl.showPicker === "function") anyEl.showPicker();
};

/* =======================
   SANITIZE HTML
======================= */

const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "BR", "P", "DIV", "SPAN"]);

function sanitizeHtml(input: string) {
  const html = String(input || "");
  if (!html) return "";

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.body;

    const walk = (node: Node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toUpperCase();

        if (!ALLOWED_TAGS.has(tag)) {
          const text = doc.createTextNode(el.textContent || "");
          el.replaceWith(text);
          return;
        }

        const attrs = Array.from(el.attributes);
        for (const a of attrs) el.removeAttribute(a.name);

        Array.from(el.childNodes).forEach(walk);
      } else if (node.nodeType === Node.COMMENT_NODE) {
        node.parentNode?.removeChild(node);
      }
    };

    Array.from(body.childNodes).forEach(walk);
    return body.innerHTML || "";
  } catch {
    return stripHtml(input);
  }
}

function stripHtml(input: string) {
  const s = String(input || "");
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/* =======================
   DB MAPPERS
======================= */

function fromDb(row: any): NewsItem {
  const fallbackDate = new Date().toISOString().slice(0, 10);

  const type = (row.type as NewsType) || "DESTACADO";
  const ctaMode: CtaMode =
    (row.cta_mode as CtaMode) || (type === "PROMO" ? "CONSULTAR" : "VER_DETALLE");

  return {
    id: row.id,

    title: row.title || "",
    description: row.description || "",

    type,
    publishedAt: row.published_at ? String(row.published_at) : fallbackDate,

    image: row.image_url || "",
    imagePosition: typeof row.image_position === "number" ? Math.round(row.image_position) : 50,

    ctaMode,
    ctaLink: row.cta_link || "",

    active: Boolean(row.active),
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}

function toDb(n: NewsItem) {
  return {
    id: n.id,

    title: (n.title || "").trim(),
    description: sanitizeHtml(n.description || ""),

    type: n.type,
    published_at: n.publishedAt,

    image_url: n.image || null,
    image_position: Math.round(clamp(n.imagePosition ?? 50, 0, 100)),

    cta_mode: n.ctaMode,
    cta_link: n.ctaLink ? n.ctaLink : null,

    active: Boolean(n.active),
    updated_at: new Date().toISOString(),
  };
}

/* =======================
   STORAGE UPLOAD
======================= */

async function uploadNewsImage(file: File, newsId: string): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
  const path = `news/${newsId}/${Date.now()}.${safeExt}`;

  const { error: upErr } = await supabase.storage.from(NEWS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || undefined,
  });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from(NEWS_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("No pude obtener la URL pública de la imagen.");
  return data.publicUrl;
}

/* =======================
   EMOJI PICKER
======================= */

type EmojiCat = { key: string; label: string; emojis: string[] };

const EMOJI_CATS: EmojiCat[] = [
  { key: "rec", label: "Recientes", emojis: [] },
  {
    key: "smileys",
    label: "Caras",
    emojis: ["😀", "😁", "😂", "🤣", "😅", "😆", "😉", "😊", "😍", "😘", "😎", "🤩", "🥳", "😭", "😤", "😡", "🤯", "😴", "🤔", "🙃", "😬", "🤗"],
  },
  {
    key: "gestures",
    label: "Manos",
    emojis: ["👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "👏", "🙌", "🫶", "🙏", "👊", "✊", "🤜", "🤛", "💪", "🖐️", "✋", "👋"],
  },
  {
    key: "symbols",
    label: "Símbolos",
    emojis: ["✅", "❌", "⚠️", "🔥", "⭐", "✨", "💥", "💯", "🎉", "🎊", "📢", "📌", "📍", "⏳", "⌛", "💬", "💡", "🔒", "🔓", "⚡"],
  },
  {
    key: "objects",
    label: "Objetos",
    emojis: ["🎮", "🕹️", "🧩", "🎟️", "🎫", "🎁", "💰", "💳", "📱", "💻", "🖥️", "🖱️", "⌨️", "📷", "🎥", "🎧", "🎤"],
  },
  {
    key: "places",
    label: "Lugar",
    emojis: ["🏠", "🏢", "🏙️", "🗺️", "🚪", "🚻", "📍", "🧭", "🚗", "🚌", "🚇"],
  },
];

const RECENTS_KEY = "escape_news_emoji_recents_v1";

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeRecents(list: string[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {}
}

/* =======================
   RICH TEXT
======================= */

function RichTextEditor({
  valueHtml,
  onChangeHtml,
}: {
  valueHtml: string;
  onChangeHtml: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const composingRef = useRef(false);
  const focusedRef = useRef(false);

  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState("");
  const [cat, setCat] = useState("smileys");
  const [recents, setRecents] = useState<string[]>(() => readRecents());

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (focusedRef.current) return;
    if (composingRef.current) return;

    const incoming = String(valueHtml || "");
    if (el.innerHTML !== incoming) el.innerHTML = incoming;
  }, [valueHtml]);

  const push = () => {
    const el = ref.current;
    if (!el) return;
    onChangeHtml(el.innerHTML);
  };

  const exec = (cmd: "bold" | "italic" | "underline") => {
    ref.current?.focus();
    document.execCommand(cmd);
    push();
  };

  const insertTextAtCursor = (text: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand("insertText", false, text);
    } catch {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
      } else {
        el.innerText = (el.innerText || "") + text;
      }
    }
    push();
  };

  const pickEmoji = (e: string) => {
    insertTextAtCursor(e);
    const next = [e, ...recents.filter((x) => x !== e)].slice(0, 30);
    setRecents(next);
    writeRecents(next);
    setEmojiOpen(false);
    setEmojiQuery("");
  };

  const onPaste: React.ClipboardEventHandler<HTMLDivElement> = (ev) => {
    ev.preventDefault();
    const text = ev.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    push();
  };

  const cats = useMemo(() => {
    const base = EMOJI_CATS.map((c) => ({ ...c }));
    base[0].emojis = recents.length ? recents : ["🔥", "🎉", "✅", "⚡", "🎮", "💥", "⭐", "😎"];
    return base;
  }, [recents]);

  const currentList = useMemo(() => {
    const s = emojiQuery.trim().toLowerCase();
    const source =
      cat === "rec"
        ? cats.find((c) => c.key === "rec")?.emojis || []
        : cats.find((c) => c.key === cat)?.emojis || [];

    if (!s) return source;

    const alias: Record<string, string[]> = {
      fuego: ["🔥"],
      ok: ["✅"],
      check: ["✅"],
      error: ["❌"],
      cruz: ["❌"],
      warning: ["⚠️"],
      estrella: ["⭐", "✨"],
      party: ["🎉", "🎊", "🥳"],
      musica: ["🎧", "🎤"],
      juego: ["🎮", "🕹️"],
      plata: ["💰", "💳"],
      reloj: ["⏳", "⌛"],
      punto: ["📍", "📌"],
      like: ["👍"],
      corazon: ["🫶"],
    };

    const mapped = alias[s];
    if (mapped) return Array.from(new Set([...mapped, ...source]));
    return source;
  }, [emojiQuery, cat, cats]);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest?.("[data-emoji-pop]")) setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btnSmall" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")} title="Negrita">
          <b>B</b>
        </button>
        <button type="button" className="btnSmall" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")} title="Cursiva">
          <i>I</i>
        </button>
        <button type="button" className="btnSmall" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")} title="Subrayado">
          <u>U</u>
        </button>

        <div style={{ position: "relative" }} data-emoji-pop>
          <button
            type="button"
            className="btnSmall"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEmojiOpen((v) => !v)}
            title="Emojis"
          >
            😀 Emojis
          </button>

          {emojiOpen && (
            <div
              style={{
                position: "absolute",
                zIndex: 9999,
                top: "110%",
                left: 0,
                width: 340,
                borderRadius: 14,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(0,0,0,0.92)",
                padding: 10,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  className="input"
                  value={emojiQuery}
                  onChange={(e) => setEmojiQuery(e.target.value)}
                  placeholder="Buscar (ej: fuego, ok, party, like)…"
                  style={{ flex: 1 }}
                />
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {cats.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={cat === c.key ? "btnSmall" : "ghostBtn"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setCat(c.key)}
                    style={{ padding: "6px 10px", borderRadius: 12 }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div
                style={{
                  maxHeight: 220,
                  overflow: "auto",
                  display: "grid",
                  gridTemplateColumns: "repeat(10, 1fr)",
                  gap: 6,
                  padding: 4,
                }}
              >
                {currentList.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="ghostBtn"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => pickEmoji(e)}
                    style={{ padding: 8, borderRadius: 12, fontSize: 18, lineHeight: 1 }}
                    title={e}
                  >
                    {e}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
                Tip: clickeás un emoji y lo inserta donde está el cursor.
              </div>
            </div>
          )}
        </div>

        <span style={{ opacity: 0.7, fontSize: 12 }}>Tip: escribí normal y aplicá formato.</span>
      </div>

      <div
        className="input"
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        tabIndex={0}
        spellCheck
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          push();
        }}
        onCompositionStart={() => (composingRef.current = true)}
        onCompositionEnd={() => (composingRef.current = false)}
        onInput={() => push()}
        onPaste={onPaste}
        style={{
          minHeight: 110,
          padding: 12,
          borderRadius: 14,
          lineHeight: 1.35,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          pointerEvents: "auto",
          userSelect: "text",
          cursor: "text",
          position: "relative",
          zIndex: 2,
        }}
      />
    </div>
  );
}

/* =======================
   CROPPER “cursor only” (como Salas) ✅
   - Drag dentro: move
   - Drag bordes/esquinas: resize
   - Ruedita: zoom del recorte
   - Doble click: recorte full
   - SHIFT: mantener ratio card
======================= */

const NEWS_CARD_ASPECT = 900 / 520;

type NatImg = { w: number; h: number };
type CropRect = { x: number; y: number; w: number; h: number };
type Handle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
type DragMode = "move" | "resize" | null;

const clampRectToImage = (r: CropRect, nat: NatImg, minSize = 80): CropRect => {
  let w = Math.max(minSize, Math.min(r.w, nat.w));
  let h = Math.max(minSize, Math.min(r.h, nat.h));

  let x = r.x;
  let y = r.y;

  x = Math.max(0, Math.min(x, nat.w - w));
  y = Math.max(0, Math.min(y, nat.h - h));

  return { x, y, w, h };
};

const rectCenter = (r: CropRect) => ({ cx: r.x + r.w / 2, cy: r.y + r.h / 2 });

const zoomRect = (r: CropRect, nat: NatImg, factor: number, minSize = 80): CropRect => {
  const { cx, cy } = rectCenter(r);
  const nw = r.w * factor;
  const nh = r.h * factor;
  const next: CropRect = {
    x: cx - nw / 2,
    y: cy - nh / 2,
    w: nw,
    h: nh,
  };
  return clampRectToImage(next, nat, minSize);
};

const applyAspectFromAnchor = (
  rect: CropRect,
  nat: NatImg,
  handle: Handle,
  aspect: number,
  minSize = 80
): CropRect => {
  let r = { ...rect };

  const controlsW = handle.includes("e") || handle.includes("w");
  if (controlsW) r.h = r.w / aspect;
  else r.w = r.h * aspect;

  if (handle.includes("n")) r.y = r.y + (rect.h - r.h);
  if (handle.includes("w")) r.x = r.x + (rect.w - r.w);

  return clampRectToImage(r, nat, minSize);
};

function toJpegName(fileName: string) {
  const base = (fileName || "image").replace(/\.[a-z0-9]+$/i, "");
  return `${base}.jpg`;
}

function CropperModal({
  open,
  sourceUrl,
  originalFileName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  sourceUrl: string | null;
  originalFileName: string;
  onClose: () => void;
  onConfirm: (file: File, previewUrl: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [natImg, setNatImg] = useState<NatImg | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);

  const dragModeRef = useRef<DragMode>(null);
  const dragHandleRef = useRef<Handle | null>(null);
  const dragStartRef = useRef<{ px: number; py: number; rect: CropRect } | null>(null);
  const cursorRef = useRef<string>("default");

  useEffect(() => {
    if (!open) {
      setNatImg(null);
      setCropRect(null);
      dragModeRef.current = null;
      dragHandleRef.current = null;
      dragStartRef.current = null;
      cursorRef.current = "default";
      return;
    }

    if (!sourceUrl) return;

    setNatImg(null);
    setCropRect(null);

    const img = new Image();
    img.onload = () => {
      const nat = { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
      setNatImg(nat);

      const margin = 0.08;
      const init: CropRect = {
        x: nat.w * margin,
        y: nat.h * margin,
        w: nat.w * (1 - margin * 2),
        h: nat.h * (1 - margin * 2),
      };
      setCropRect(clampRectToImage(init, nat, 80));
    };
    img.onerror = () => {
      alert("No pude leer la imagen para recortar.");
      onClose();
    };
    img.src = sourceUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceUrl]);

  const getContainBox = () => {
    if (!natImg) return null;
    const stage = stageRef.current;
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

  const endCropDrag = () => {
    dragModeRef.current = null;
    dragHandleRef.current = null;
    dragStartRef.current = null;

    const stage = stageRef.current;
    if (stage) stage.style.cursor = cursorRef.current || "default";
  };

  const onStageMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!natImg || !cropRect) return;
    const stage = stageRef.current;
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

  const onStageMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const stage = stageRef.current;
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
        next = applyAspectFromAnchor(next, natImg, h, NEWS_CARD_ASPECT, 80);
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

  const onStageWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (!natImg || !cropRect) return;
    e.preventDefault();

    const dir = e.deltaY > 0 ? 1 : -1;
    const factor = dir > 0 ? 1.06 : 0.94;
    setCropRect(zoomRect(cropRect, natImg, factor, 80));
  };

  const onStageDoubleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    applyMaxCrop();
  };

  const cropRectStyle = useMemo(() => {
    if (!natImg || !cropRect || !open) return null;
    const sr = natToScreenRect(cropRect);
    if (!sr) return null;

    return {
      left: sr.left,
      top: sr.top,
      width: sr.width,
      height: sr.height,
    } as React.CSSProperties;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natImg, cropRect, open]);

  const confirmCrop = async () => {
    if (!sourceUrl || !natImg || !cropRect) return;

    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("No pude cargar la imagen para recortar."));
        img.src = sourceUrl;
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

      // ✅ JPG (liviano, sin drama)
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("No pude exportar el recorte."))),
          "image/jpeg",
          0.9
        );
      });

      const file = new File([blob], toJpegName(originalFileName), { type: "image/jpeg" });
      const previewUrl = URL.createObjectURL(blob);

      onConfirm(file, previewUrl);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Error recortando imagen.");
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="backdrop show" style={{ zIndex: 9999 }} onMouseDown={onClose} />
      <div className="modalCenter" style={{ zIndex: 9999 }} onMouseDown={onClose}>
        <div className="modalBox" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 980 }}>
          <div className="modalHead">
            <div className="modalTitle">Recortar imagen</div>
            <button className="iconBtn" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </div>

          <div className="modalBody">
            <div style={{ opacity: 0.78, fontSize: 12, marginBottom: 10 }}>
              Mouse: <b>mover</b> arrastrando dentro, <b>resize</b> arrastrando bordes/esquinas. Ruedita = zoom del recorte. Doble click = máximo. Mantener <b>Shift</b> = ratio card.
            </div>

            <div
              ref={stageRef}
              onMouseDown={onStageMouseDown}
              onMouseMove={onStageMouseMove}
              onMouseUp={endCropDrag}
              onMouseLeave={endCropDrag}
              onWheel={onStageWheel}
              onDoubleClick={onStageDoubleClick}
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
              {sourceUrl ? (
                <img
                  src={sourceUrl}
                  alt="Crop"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block",
                    pointerEvents: "none",
                    background: "rgba(0,0,0,.55)",
                  }}
                />
              ) : null}

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
            <button className="ghostBtn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btnSmall" onClick={confirmCrop} disabled={!natImg || !cropRect}>
              Usar recorte
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* =======================
   PREVIEW (como card cliente)
======================= */

function ClientCardPreview({
  item,
  onClose,
}: {
  item: {
    title: string;
    descriptionHtml: string;
    type: NewsType;
    publishedAt: string;
    imageUrl: string;
    ctaMode: CtaMode;
    ctaLink: string;
    active: boolean;
  };
  onClose: () => void;
}) {
  return (
    <div className="backdrop show" style={{ zIndex: 9998 }} onMouseDown={onClose}>
      <div className="modalCenter" onMouseDown={onClose}>
        <div className="modalBox" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
          <div className="modalHead">
            <div className="modalTitle">Vista previa (cliente)</div>
            <button className="iconBtn" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </div>

          <div className="modalBody">
            <div
              style={{
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "rgba(255,255,255,0.16)",
                backgroundColor: "rgba(0,0,0,0.42)",
                borderRadius: 18,
                overflow: "hidden",
              }}
            >
              <div style={{ width: "100%", height: 140, overflow: "hidden" }}>
                <img
                  src={item.imageUrl || "https://picsum.photos/seed/news-placeholder/900/520"}
                  alt={item.title || TYPE_LABEL[item.type]}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>

              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {item.type === "DESTACADO" ? (
                      <div style={{ padding: "6px 10px", borderRadius: 999, background: "rgba(255,165,0,0.18)" }}>
                        <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>DESTACADO</span>
                      </div>
                    ) : null}

                    <div style={{ padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,0.10)" }}>
                      <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>
                        {TYPE_LABEL[item.type].toUpperCase()}
                      </span>
                    </div>

                    {!item.active ? (
                      <div style={{ padding: "6px 10px", borderRadius: 999, background: "rgba(255,0,0,0.16)" }}>
                        <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>INACTIVA</span>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{item.publishedAt}</div>
                </div>

                <div style={{ color: "#fff", fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{item.title}</div>

                <div
                  style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, lineHeight: "18px" }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.descriptionHtml) }}
                />

                {item.ctaLink ? (
                  <div
                    style={{
                      marginTop: 12,
                      display: "inline-block",
                      padding: "10px 14px",
                      borderRadius: 14,
                      backgroundColor: "rgba(0,255,242,0.14)",
                      border: "1px solid rgba(0,255,242,0.45)",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 800,
                      letterSpacing: 0.4,
                    }}
                  >
                    {CTA_LABEL[item.ctaMode]}
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
              Nota: acá no abre links (solo preview visual).
            </div>
          </div>

          <div className="modalFoot">
            <button className="ghostBtn" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =======================
   COMPONENTE PRINCIPAL
======================= */

export default function News() {
  const nav = useNavigate();

  // ✅ PERMISO: ADMIN_GENERAL siempre, GM/ADMIN solo si canManageNews
  const canManageNews = useMemo(() => {
    const isSuper =
      localStorage.getItem("eg_admin_is_super") === "true" ||
      localStorage.getItem("eg_admin_role") === "ADMIN_GENERAL";
    if (isSuper) return true;

    try {
      const raw = localStorage.getItem("eg_admin_permissions");
      const parsed = raw ? JSON.parse(raw) : {};
      return !!parsed?.canManageNews;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!canManageNews) nav("/salas", { replace: true });
  }, [canManageNews, nav]);

  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const fromRef = useRef<HTMLInputElement | null>(null);
  const toRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const publishedRef = useRef<HTMLInputElement | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const [editingImageFile, setEditingImageFile] = useState<File | null>(null);
  const [tempPreviewUrl, setTempPreviewUrl] = useState<string | null>(null);

  // Crop popup state
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const cropTempObjectUrlRef = useRef<string | null>(null);
  const cropOriginalNameRef = useRef<string>("image.jpg");

  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("news_v1")
        .select("*")
        .order("published_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error(error);
        alert("Error cargando novedades. Revisá conexión o RLS.");
        setItems([]);
      } else {
        setItems((data ?? []).map(fromDb));
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;

      if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);

      if (cropTempObjectUrlRef.current) {
        URL.revokeObjectURL(cropTempObjectUrlRef.current);
        cropTempObjectUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return items.filter((n) => {
      const descText = stripHtml(n.description || "").toLowerCase();

      const okSearch = !s
        ? true
        : n.title.toLowerCase().includes(s) ||
          descText.includes(s) ||
          TYPE_LABEL[n.type].toLowerCase().includes(s) ||
          CTA_LABEL[n.ctaMode].toLowerCase().includes(s);

      const okType = !typeFilter ? true : n.type === typeFilter;

      const okStatus =
        !statusFilter
          ? true
          : statusFilter === "active"
          ? n.active
          : statusFilter === "inactive"
          ? !n.active
          : true;

      const d = n.publishedAt;
      const okFrom = !fromDate ? true : d >= fromDate;
      const okTo = !toDate ? true : d <= toDate;

      return okSearch && okType && okStatus && okFrom && okTo;
    });
  }, [items, q, typeFilter, statusFilter, fromDate, toDate]);

  const groupedByMonth = useMemo(() => {
    const map = new Map<string, NewsItem[]>();
    filtered.forEach((n) => {
      const key = (n.publishedAt || "").slice(0, 7) || "Sin fecha";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    });
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const closeCrop = () => {
    setCropOpen(false);
    setCropSourceUrl(null);

    if (cropTempObjectUrlRef.current) {
      URL.revokeObjectURL(cropTempObjectUrlRef.current);
      cropTempObjectUrlRef.current = null;
    }
  };

  const closeModal = () => {
    setOpen(false);
    setEditing(null);
    setEditingImageFile(null);

    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);

    if (fileRef.current) fileRef.current.value = "";

    closeCrop();
    setPreviewOpen(false);
  };

  const startCreate = () => {
    if (!canManageNews) return;

    const id = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);

    setEditing({
      id,
      title: "",
      description: "",

      type: "DESTACADO",
      publishedAt: today,

      image: "",
      imagePosition: 50,

      ctaMode: "VER_DETALLE",
      ctaLink: "",

      active: true,
    });

    setEditingImageFile(null);
    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";

    setOpen(true);
  };

  const startEdit = (n: NewsItem) => {
    if (!canManageNews) return;

    setEditing({
      ...n,
      imagePosition: n.imagePosition ?? 50,
      ctaLink: n.ctaLink || "",
      title: n.title || "",
      description: n.description || "",
    });

    setEditingImageFile(null);
    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";

    setOpen(true);
  };

  const onPickImage = () => fileRef.current?.click();

  const setLocalPreview = (url: string) => {
    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(url);
    setEditing((prev) => (prev ? { ...prev, image: url } : prev));
  };

  const openCropperWithUrl = async (url: string, originalName = "image.jpg") => {
    try {
      if (!url) return;

      cropOriginalNameRef.current = originalName;

      // Limpio el objectURL anterior si existía
      if (cropTempObjectUrlRef.current) {
        URL.revokeObjectURL(cropTempObjectUrlRef.current);
        cropTempObjectUrlRef.current = null;
      }

      // Si ya es un object url (o data), lo uso directo
      if (!/^https?:\/\//i.test(url)) {
        setCropSourceUrl(url);
        setCropOpen(true);
        return;
      }

      // Si es remoto, lo bajo a blob para evitar canvas taint
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("No pude descargar la imagen para recortarla.");

      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      cropTempObjectUrlRef.current = objUrl;

      setCropSourceUrl(objUrl);
      setCropOpen(true);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No pude abrir el recorte de esa imagen.");
    }
  };

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Elegí una imagen (JPG/PNG/WebP).");
      e.target.value = "";
      return;
    }

    // guardo nombre original para el JPG final
    cropOriginalNameRef.current = file.name;

    const url = URL.createObjectURL(file);

    // ⚠️ no guardo el file original, porque vamos a guardar el recorte
    // setEditingImageFile(file);  <-- NO: queremos subir el recorte, no el original
    setLocalPreview(url);

    openCropperWithUrl(url, file.name);

    e.target.value = "";
  };

  const removeImage = () => {
    setEditingImageFile(null);

    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);

    setEditing((prev) => (prev ? { ...prev, image: "" } : prev));
    if (fileRef.current) fileRef.current.value = "";
  };

  const onCropConfirm = (file: File, previewUrl: string) => {
    // ✅ el recorte es lo que se sube
    setEditingImageFile(file);

    // preview del recorte
    setLocalPreview(previewUrl);

    // reseteo posición (ya viene recortada)
    setEditing((prev) => (prev ? { ...prev, imagePosition: 50 } : prev));

    closeCrop();
  };

  const save = async () => {
    if (!canManageNews) return;
    if (!editing) return;

    if (!editing.title.trim()) return alert("Poné un título.");
    if (!stripHtml(editing.description || "").trim()) return alert("Poné una descripción.");
    if (!editing.publishedAt) return alert("Elegí fecha de publicación.");
    if (!editing.type) return alert("Elegí el tipo de novedad.");

    if (editing.ctaLink && !isHttpUrl(editing.ctaLink)) {
      return alert("El link debe ser una URL válida con http/https (ej: https://...).");
    }

    const isNew = !items.some((x) => x.id === editing.id);
    if (isNew && !editingImageFile && !editing.image) {
      return alert("Seleccioná una imagen.");
    }

    setSaving(true);
    try {
      let finalImageUrl = editing.image;

      // ✅ si hay recorte nuevo, subimos recorte
      if (editingImageFile) {
        finalImageUrl = await uploadNewsImage(editingImageFile, editing.id);
      } else {
        // si no hay file, tiene que ser URL http(s) o vacío
        if (finalImageUrl && !/^https?:\/\//i.test(finalImageUrl)) finalImageUrl = "";
      }

      const normalized: NewsItem = {
        ...editing,
        title: (editing.title || "").trim(),
        description: sanitizeHtml(editing.description || ""),
        image: finalImageUrl,
        ctaMode: editing.ctaMode || (editing.type === "PROMO" ? "CONSULTAR" : "VER_DETALLE"),
        ctaLink: (editing.ctaLink || "").trim(),
      };

      const payload = toDb(normalized);

      const { data, error } = await supabase
        .from("news_v1")
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
      alert(err?.message || "Error guardando novedad.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string) => {
    if (!canManageNews) return;

    const current = items.find((x) => x.id === id);
    if (!current) return;

    const next = { ...current, active: !current.active };
    setItems((prev) => prev.map((p) => (p.id === id ? next : p)));

    const { error } = await supabase.from("news_v1").update({ active: next.active }).eq("id", id);
    if (error) {
      console.error(error);
      alert("No pude actualizar estado (revisá rol admin / policies).");
      setItems((prev) => prev.map((p) => (p.id === id ? current : p)));
    }
  };

  const remove = async (id: string) => {
    if (!canManageNews) return;

    const current = items.find((x) => x.id === id);
    if (!current) return;

    const ok = confirm("¿Borrar esta novedad? Esto no se puede deshacer.");
    if (!ok) return;

    setItems((prev) => prev.filter((p) => p.id !== id));

    const { error } = await supabase.from("news_v1").delete().eq("id", id);
    if (error) {
      console.error(error);
      alert("No pude borrar (revisá RLS/policies).");
      setItems((prev) => [current, ...prev].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)));
    }
  };

  const currentPreviewData = useMemo(() => {
    if (!editing) return null;
    return {
      title: editing.title || "",
      descriptionHtml: editing.description || "",
      type: editing.type,
      publishedAt: editing.publishedAt,
      imageUrl: editing.image && editing.image.trim() ? editing.image : "https://picsum.photos/seed/news-placeholder/900/520",
      ctaMode: editing.ctaMode,
      ctaLink: editing.ctaLink,
      active: editing.active,
    };
  }, [editing]);

  return (
    <div className="page">
      <div className="pageHeadRow">
        <div>
          <div className="pageTitle">Novedades</div>
        </div>

        {canManageNews ? (
          <button className="btnSmall" onClick={startCreate}>
            + Nueva novedad
          </button>
        ) : null}
      </div>

      <div className="toolbarRow" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título, descripción, tipo o CTA…"
          style={{ flex: 1, minWidth: 240 }}
        />

        <select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 200 }}>
          <option value="">Todos los tipos</option>
          <option value="PROMO">Promo</option>
          <option value="DESTACADO">Destacado</option>
          <option value="EVENTO">Evento</option>
          <option value="PROXIMAMENTE">Próximamente</option>
        </select>

        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 200 }}>
          <option value="">Activos + Inactivos</option>
          <option value="active">Solo activos</option>
          <option value="inactive">Solo inactivos</option>
        </select>

        <input
          ref={fromRef}
          className="input"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          onFocus={() => openDatePicker(fromRef.current)}
          onClick={() => openDatePicker(fromRef.current)}
          style={{ width: 170 }}
        />
        <input
          ref={toRef}
          className="input"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          onFocus={() => openDatePicker(toRef.current)}
          onClick={() => openDatePicker(toRef.current)}
          style={{ width: 170 }}
        />
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 16 }}>
          Cargando novedades…
        </div>
      ) : (
        <div className="roomsScroll">
          {groupedByMonth.length === 0 ? (
            <div className="panel" style={{ padding: 16 }}>
              No hay novedades con estos filtros.
            </div>
          ) : (
            groupedByMonth.map(([month, list]) => (
              <div key={month} style={{ marginBottom: 16 }}>
                <div style={{ opacity: 0.85, fontSize: 12, margin: "6px 0 10px" }}>
                  <b>Historial:</b> {month}
                </div>

                <div className="roomsGrid" style={{ alignItems: "start", gridAutoRows: "max-content" }}>
                  {list.map((n) => (
                    <div
                      key={n.id}
                      className="roomCard"
                      style={{ height: "fit-content", alignSelf: "start", minHeight: 0 }}
                    >
                      <div className="roomImgWrap">
                        <img
                          src={n.image || "https://picsum.photos/seed/news-placeholder/900/520"}
                          alt={n.title || TYPE_LABEL[n.type]}
                          style={{ objectFit: "cover", objectPosition: `50% ${n.imagePosition}%` }}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = "https://picsum.photos/seed/news-placeholder/900/520";
                          }}
                        />
                        <div className="roomBadge">{TYPE_LABEL[n.type]}</div>
                        {!n.active && <div className="roomBadge off">INACTIVA</div>}
                      </div>

                      <div className="roomBody" style={{ display: "flex", flexDirection: "column", height: "auto", flex: "0 0 auto" }}>
                        <div className="roomTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <span>{n.title || TYPE_LABEL[n.type]}</span>
                          <span style={{ fontSize: 12, opacity: 0.8 }}>{n.publishedAt}</span>
                        </div>

                        <div style={{ opacity: 0.75, fontSize: 11, marginBottom: 6 }}>{TYPE_LABEL[n.type]}</div>

                        {n.description ? (
                          <div
                            style={{ opacity: 0.82, fontSize: 12, marginBottom: 6, lineHeight: 1.3 }}
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.description) }}
                          />
                        ) : null}

                        <div style={{ opacity: 0.7, fontSize: 11, marginTop: 2, marginBottom: 8 }}>
                          Botón: <b>{CTA_LABEL[n.ctaMode]}</b>
                          {n.ctaLink ? (
                            <>
                              {" "}
                              · Link:{" "}
                              <span style={{ opacity: 0.95 }}>
                                {n.ctaLink.length > 38 ? n.ctaLink.slice(0, 38) + "…" : n.ctaLink}
                              </span>
                            </>
                          ) : null}
                        </div>

                        {canManageNews ? (
                          <div className="roomActions" style={{ marginTop: 0 }}>
                            <button className="ghostBtn" onClick={() => startEdit(n)}>
                              Editar
                            </button>

                            <button className={n.active ? "dangerBtnInline" : "btnSmall"} onClick={() => toggleActive(n.id)}>
                              {n.active ? "Desactivar" : "Activar"}
                            </button>

                            <button className="dangerBtnInline" onClick={() => remove(n.id)}>
                              Borrar
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MODAL EDIT/CREATE */}
      {open && editing && (
        <>
          <div className="backdrop show" onMouseDown={closeModal} />
          <div className="modalCenter" onMouseDown={closeModal}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHead">
                <div className="modalTitle">{items.some((x) => x.id === editing.id) ? "Editar novedad" : "Nueva novedad"}</div>
                <button className="iconBtn" onClick={closeModal} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              <div className="modalBody">
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />

                <div className="formGrid2">
                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Título</span>
                    <input
                      className="input"
                      value={editing.title}
                      onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      placeholder="Ej: 2x1 esta semana"
                    />
                  </label>

                  <label className="field">
                    <span className="label">Tipo</span>
                    <select
                      className="input"
                      value={editing.type}
                      onChange={(e) => {
                        const nextType = e.target.value as NewsType;
                        const suggested: CtaMode = nextType === "PROMO" ? "CONSULTAR" : "VER_DETALLE";
                        setEditing({
                          ...editing,
                          type: nextType,
                          ctaMode: editing.ctaMode || suggested,
                        });
                      }}
                    >
                      <option value="PROMO">Promo</option>
                      <option value="DESTACADO">Destacado</option>
                      <option value="EVENTO">Evento</option>
                      <option value="PROXIMAMENTE">Próximamente</option>
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Fecha de publicación</span>
                    <input
                      ref={publishedRef}
                      className="input"
                      type="date"
                      value={editing.publishedAt}
                      onChange={(e) => setEditing({ ...editing, publishedAt: e.target.value })}
                      onFocus={() => openDatePicker(publishedRef.current)}
                      onClick={() => openDatePicker(publishedRef.current)}
                    />
                  </label>

                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Descripción</span>
                    <RichTextEditor
                      valueHtml={editing.description}
                      onChangeHtml={(html) => setEditing((prev) => (prev ? { ...prev, description: html } : prev))}
                    />
                  </label>

                  <label className="field">
                    <span className="label">Botón (CTA) en cliente</span>
                    <select
                      className="input"
                      value={editing.ctaMode}
                      onChange={(e) => setEditing({ ...editing, ctaMode: e.target.value as CtaMode })}
                    >
                      <option value="CONSULTAR">Consultar</option>
                      <option value="VER_DETALLE">Ver detalle</option>
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Link del botón</span>
                    <input
                      className="input"
                      value={editing.ctaLink}
                      onChange={(e) => setEditing({ ...editing, ctaLink: e.target.value })}
                      placeholder="https://..."
                      inputMode="url"
                    />
                  </label>

                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Imagen</span>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <button type="button" className="btnSmall" onClick={onPickImage}>
                        Elegir imagen…
                      </button>

                      {editing.image ? (
                        <button type="button" className="ghostBtn" onClick={removeImage}>
                          Quitar
                        </button>
                      ) : (
                        <span style={{ opacity: 0.8, fontSize: 12 }}>No hay imagen seleccionada</span>
                      )}
                    </div>

                    {editing.image ? (
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
                          src={editing.image}
                          alt="Preview"
                          onClick={() => openCropperWithUrl(editing.image, cropOriginalNameRef.current)}
                          title="Click para recortar"
                          style={{
                            width: "100%",
                            height: 220,
                            objectFit: "cover",
                            objectPosition: `50% ${editing.imagePosition}%`,
                            display: "block",
                            cursor: "pointer",
                          }}
                        />
                      </div>
                    ) : null}

                    {editing.image ? (
                      <div style={{ marginTop: 8, opacity: 0.75, fontSize: 12 }}>
                        Tip: elegís imagen y se abre el recorte. Para re-recortar después: click en la preview.
                      </div>
                    ) : null}
                  </div>

                  <label className="field">
                    <span className="label">Estado</span>
                    <select
                      className="input"
                      value={editing.active ? "1" : "0"}
                      onChange={(e) => setEditing({ ...editing, active: e.target.value === "1" })}
                    >
                      <option value="1">Activa</option>
                      <option value="0">Inactiva</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="modalFoot">
                <button className="ghostBtn" onClick={closeModal} disabled={saving}>
                  Cancelar
                </button>

                <button className="btnSmall" onClick={() => setPreviewOpen(true)} disabled={saving} type="button">
                  Vista previa
                </button>

                <button className="btnSmall" onClick={save} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>

          {/* Cropper */}
          <CropperModal
            open={cropOpen}
            sourceUrl={cropSourceUrl}
            originalFileName={cropOriginalNameRef.current}
            onClose={closeCrop}
            onConfirm={onCropConfirm}
          />

          {/* Preview cliente */}
          {previewOpen && currentPreviewData ? (
            <ClientCardPreview item={currentPreviewData as any} onClose={() => setPreviewOpen(false)} />
          ) : null}
        </>
      )}
    </div>
  );
}

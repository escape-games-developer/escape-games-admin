// News.tsx (ADMIN) — UI/UX base + LISTADO TIPO EXCEL ✅
// ✅ Acciones SOLO en menú ⋯ por fila (Editar / Activar-Desactivar / Vista previa / Borrar)
// ✅ Descripción estilo Notificaciones: toolbar arriba (formatos + emoji + imagen) + textarea
// ✅ Excel: columna Título solo título (sin tipo); Tipo en su columna; CTA -> Link (solo link, sin modo)

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

/** ✅ Emoji picker (compatible) — lazy para no romper el admin si algo falla */
import type { EmojiClickData } from "emoji-picker-react";
const EmojiPicker = React.lazy(() => import("emoji-picker-react"));

/* =======================
   TIPOS
======================= */

type NewsType = "PROMO" | "DESTACADO" | "EVENTO" | "PROXIMAMENTE";
type CtaMode = "CONSULTAR" | "VER_DETALLE";

type NewsItem = {
  id: string;

  title: string;
  description: string; // texto plano (pre-wrap)

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

function stripHtml(input: string) {
  const s = String(input || "");
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\r/g, "");
}

/** Para compat con data vieja (si description venía con HTML) */
function htmlToPlainText(input: string) {
  return stripHtml(String(input || "")).trim();
}

const ellipsize = (s: string, n: number) => {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n) + "…" : t;
};

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
    imagePosition:
      typeof row.image_position === "number" ? Math.round(row.image_position) : 50,

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
    description: (n.description || "").trim(),

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
   Emoji Boundary
======================= */

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

/* =======================
   SIMPLE TEXT FORMAT (para textarea)
======================= */

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
  // Aplica al/los renglones seleccionados (markdown-like)
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

/* =======================
   CROPPER
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
  const next: CropRect = { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
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
      if (e.shiftKey) next = applyAspectFromAnchor(next, natImg, h, NEWS_CARD_ASPECT, 80);

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
    return { left: sr.left, top: sr.top, width: sr.width, height: sr.height } as React.CSSProperties;
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
              Mouse: <b>mover</b> arrastrando dentro, <b>resize</b> arrastrando bordes/esquinas. Ruedita = zoom
              del recorte. Doble click = máximo. Mantener <b>Shift</b> = ratio card.
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
   PREVIEW (cliente)
======================= */

function ClientCardPreview({
  item,
  onClose,
}: {
  item: {
    title: string;
    descriptionText: string;
    type: NewsType;
    publishedAt: string;
    imageUrl: string;
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
                      <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>{TYPE_LABEL[item.type].toUpperCase()}</span>
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

                <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, lineHeight: "18px", whiteSpace: "pre-wrap" }}>
                  {item.descriptionText}
                </div>

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
                    Abrir link
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>Nota: acá no abre links (solo preview visual).</div>
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
   ICONOS SVG (menú ⋯)
======================= */

function Icon({
  name,
  size = 16,
  style,
}: {
  name: "dots" | "edit" | "eye" | "toggle" | "trash";
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
        <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (name === "eye") {
    return (
      <svg {...common}>
        <path d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "toggle") {
    return (
      <svg {...common}>
        <path d="M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="10" cy="12" r="3" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 7l1 14h10l1-14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/* =======================
   ICONOS SVG (toolbar formato)
======================= */

function FIcon({
  name,
  size = 16,
}: {
  name: "bold" | "italic" | "underline" | "list";
  size?: number;
}) {
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

/* =======================
   COMPONENTE PRINCIPAL
======================= */

export default function News() {
  const nav = useNavigate();

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

  // Preview (cliente) global (desde ⋯)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<NewsItem | null>(null);

  // ✅ menú ⋯ por fila (portal a body)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  // ✅ Emoji picker: inserta donde esté el cursor (textarea)
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const emojiPanelRef = useRef<HTMLDivElement | null>(null);
  const [emojiPos, setEmojiPos] = useState<{ top: number; left: number } | null>(null);

  const descRef = useRef<HTMLTextAreaElement | null>(null);

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
    const el = descRef.current;
    if (!el) return;

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value ?? "";
    const next = value.slice(0, start) + emo + value.slice(end);
    const cursor = start + emo.length;

    setEditing((p) => (p ? { ...p, description: next } : p));

    requestAnimationFrame(() => {
      try {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      } catch {}
    });
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
      const descText = htmlToPlainText(n.description || "").toLowerCase();

      const okSearch = !s
        ? true
        : (n.title || "").toLowerCase().includes(s) ||
          descText.includes(s) ||
          TYPE_LABEL[n.type].toLowerCase().includes(s);

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

  const computeMenuPosFromAnchor = () => {
    const btn = menuAnchorRef.current;
    if (!btn) return null;

    const r = btn.getBoundingClientRect();
    const top = r.top + window.scrollY;
    const left = r.right + window.scrollX;

    const MENU_W = 260;
    const gap = 10;

    let x = left + gap;
    const maxX = window.scrollX + window.innerWidth - 12 - MENU_W;
    if (x > maxX) x = r.left + window.scrollX - gap - MENU_W;

    let y = top - 6;
    const maxY = window.scrollY + window.innerHeight - 12 - 260;
    if (y > maxY) y = maxY;

    const minY = window.scrollY + 12;
    if (y < minY) y = minY;

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
        setPreviewOpen(false);
        setPreviewItem(null);
      }
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

    setEmojiOpen(false);
    setEmojiPos(null);

    closeCrop();
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
      description: htmlToPlainText(n.description || ""),
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

      if (cropTempObjectUrlRef.current) {
        URL.revokeObjectURL(cropTempObjectUrlRef.current);
        cropTempObjectUrlRef.current = null;
      }

      if (!/^https?:\/\//i.test(url)) {
        setCropSourceUrl(url);
        setCropOpen(true);
        return;
      }

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

    cropOriginalNameRef.current = file.name;

    const url = URL.createObjectURL(file);

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
    setEditingImageFile(file);
    setLocalPreview(previewUrl);
    setEditing((prev) => (prev ? { ...prev, imagePosition: 50 } : prev));
    closeCrop();
  };

  const save = async () => {
    if (!canManageNews) return;
    if (!editing) return;

    if (!editing.title.trim()) return alert("Poné un título.");
    if (!String(editing.description || "").trim()) return alert("Poné una descripción.");
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

      if (editingImageFile) {
        finalImageUrl = await uploadNewsImage(editingImageFile, editing.id);
      } else {
        if (finalImageUrl && !/^https?:\/\//i.test(finalImageUrl)) finalImageUrl = "";
      }

      const normalized: NewsItem = {
        ...editing,
        title: (editing.title || "").trim(),
        description: String(editing.description || "").trim(),
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

  const openCardPreview = (n: NewsItem) => {
    setPreviewItem(n);
    setPreviewOpen(true);
  };

  const previewData = useMemo(() => {
    const n = previewItem;
    if (!n) return null;
    return {
      title: n.title || "",
      descriptionText: htmlToPlainText(n.description || ""),
      type: n.type,
      publishedAt: n.publishedAt,
      imageUrl: n.image && n.image.trim() ? n.image : "https://picsum.photos/seed/news-placeholder/900/520",
      ctaLink: n.ctaLink,
      active: n.active,
    };
  }, [previewItem]);

  // ✅ estilos tabla tipo Excel
  const tableWrapStyle: React.CSSProperties = {
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(0,0,0,.25)",
  };

  const scrollerStyle: React.CSSProperties = {
    width: "100%",
    overflow: "auto",
    maxHeight: "calc(100vh - 240px)",
  };

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    tableLayout: "fixed",
    minWidth: 980,
  };

  const thStyle: React.CSSProperties = {
    position: "sticky" as any,
    top: 0,
    zIndex: 5,
    background: "rgba(10,10,10,.92)",
    backdropFilter: "blur(6px)",
    borderBottom: "1px solid rgba(255,255,255,.12)",
    padding: "12px 10px",
    fontSize: 13,
    fontWeight: 900,
    textAlign: "left" as any,
    letterSpacing: 0.3,
    color: "rgba(255,255,255,.92)",
  };

  const tdBase: React.CSSProperties = {
    borderBottom: "1px solid rgba(255,255,255,.08)",
    padding: "10px 10px",
    verticalAlign: "top",
    fontSize: 12,
    color: "rgba(255,255,255,.85)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const badge = (txt: string, kind: "type" | "on" | "off" | "hot" = "type") => {
    const bg =
      kind === "hot" ? "rgba(255,165,0,0.18)"
      : kind === "on" ? "rgba(0,255,242,0.12)"
      : kind === "off" ? "rgba(255,0,0,0.16)"
      : "rgba(255,255,255,0.10)";
    const br =
      kind === "on" ? "1px solid rgba(0,255,242,0.28)"
      : kind === "off" ? "1px solid rgba(255,0,0,0.22)"
      : "1px solid rgba(255,255,255,0.10)";
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderRadius: 999,
          background: bg,
          border: br,
          fontSize: 11,
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {txt}
      </span>
    );
  };

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
          placeholder="Buscar por título, descripción o tipo…"
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
        <div style={tableWrapStyle}>
          <div style={scrollerStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 74 }}>Imagen</th>
                  <th style={{ ...thStyle, width: 260 }}>Título</th>
                  <th style={{ ...thStyle, width: 190 }}>Descripción</th>
                  <th style={{ ...thStyle, width: 150 }}>Tipo</th>
                  <th style={{ ...thStyle, width: 120 }}>Fecha</th>
                  <th style={{ ...thStyle, width: 240 }}>Link</th>
                  <th style={{ ...thStyle, width: 110 }}>Estado</th>
                  <th style={{ ...thStyle, width: 70, textAlign: "center" }}>⋯</th>
                </tr>
              </thead>

              <tbody>
                {groupedByMonth.length === 0 ? (
                  <tr>
                    <td style={{ ...tdBase, padding: 16 }} colSpan={8}>
                      No hay novedades con estos filtros.
                    </td>
                  </tr>
                ) : (
                  groupedByMonth.map(([month, list]) => (
                    <React.Fragment key={month}>
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            ...tdBase,
                            padding: "10px 12px",
                            background: "rgba(0,0,0,.35)",
                            fontSize: 12,
                            fontWeight: 900,
                            color: "rgba(255,255,255,.9)",
                          }}
                        >
                          Historial: {month}
                        </td>
                      </tr>

                      {list.map((n, idx) => {
                        const desc = htmlToPlainText(n.description || "");
                        const rowBg = idx % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.00)";

                        return (
                          <tr
                            key={n.id}
                            style={{ background: rowBg }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.04)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLTableRowElement).style.background = rowBg;
                            }}
                          >
                            <td style={{ ...tdBase, padding: 8 }}>
                              <div style={{ width: 56, height: 38, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,.12)", background: "rgba(0,0,0,.35)" }}>
                                <img
                                  src={n.image || "https://picsum.photos/seed/news-placeholder/900/520"}
                                  alt={n.title || TYPE_LABEL[n.type]}
                                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `50% ${n.imagePosition}%`, display: "block" }}
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src = "https://picsum.photos/seed/news-placeholder/900/520";
                                  }}
                                />
                              </div>
                            </td>

                            {/* ✅ SOLO título (sin tipo) */}
                            <td style={{ ...tdBase }} title={n.title || ""}>
                              <div style={{ fontWeight: 900, fontSize: 13, color: "rgba(255,255,255,.92)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {n.title || "—"}
                              </div>
                            </td>

                            <td style={{ ...tdBase }} title={desc}>
                              {ellipsize(desc, 120) || "—"}
                            </td>

                            {/* ✅ Tipo en su propia columna */}
                            <td style={{ ...tdBase }}>{badge(TYPE_LABEL[n.type].toUpperCase(), n.type === "DESTACADO" ? "hot" : "type")}</td>

                            <td style={{ ...tdBase, fontSize: 12, opacity: 0.9 }}>{n.publishedAt}</td>

                            {/* ✅ Link solamente */}
                            <td style={{ ...tdBase }} title={n.ctaLink || ""}>
                              {n.ctaLink ? ellipsize(n.ctaLink, 54) : <span style={{ opacity: 0.7 }}>Sin link</span>}
                            </td>

                            <td style={{ ...tdBase }}>{n.active ? badge("ACTIVA", "on") : badge("INACTIVA", "off")}</td>

                            <td style={{ ...tdBase, textAlign: "center", padding: 8 }}>
                              {canManageNews ? (
                                <button
                                  type="button"
                                  className="ghostBtn"
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
                                  style={{
                                    padding: "8px 10px",
                                    borderRadius: 12,
                                    background: "rgba(0,0,0,0.55)",
                                    border: "1px solid rgba(255,255,255,0.14)",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                  title="Opciones"
                                  aria-label="Opciones"
                                >
                                  <Icon name="dots" size={16} />
                                </button>
                              ) : (
                                <span style={{ opacity: 0.5 }}>—</span>
                              )}

                              {menuOpenId === n.id && menuPos
                                ? createPortal(
                                    <div
                                      data-menu-popup="1"
                                      style={{
                                        position: "fixed",
                                        left: menuPos.left,
                                        top: menuPos.top,
                                        zIndex: 99999,
                                        width: 260,
                                        borderRadius: 12,
                                        overflow: "hidden",
                                        border: "1px solid rgba(255,255,255,.14)",
                                        background: "rgba(0,0,0,.94)",
                                        boxShadow: "0 12px 34px rgba(0,0,0,.45)",
                                      }}
                                      onMouseDown={(ev) => ev.stopPropagation()}
                                    >
                                      {(() => {
                                        const itemStyle: React.CSSProperties = {
                                          width: "100%",
                                          justifyContent: "flex-start" as any,
                                          borderRadius: 0,
                                          padding: "10px 12px",
                                          display: "flex",
                                          gap: 10,
                                          alignItems: "center",
                                        };
                                        const iconStyle: React.CSSProperties = { opacity: 0.92 };

                                        return (
                                          <>
                                            <button className="ghostBtn" style={itemStyle} onClick={() => { closeMenu(); startEdit(n); }} disabled={saving}>
                                              <Icon name="edit" size={16} style={iconStyle} />
                                              Editar
                                            </button>

                                            <button className="ghostBtn" style={itemStyle} onClick={() => { closeMenu(); openCardPreview(n); }} disabled={saving}>
                                              <Icon name="eye" size={16} style={iconStyle} />
                                              Vista previa
                                            </button>

                                            <button className="ghostBtn" style={itemStyle} onClick={() => { closeMenu(); toggleActive(n.id); }} disabled={saving} title={n.active ? "Desactivar" : "Activar"}>
                                              <Icon name="toggle" size={16} style={iconStyle} />
                                              {n.active ? "Desactivar" : "Activar"}
                                            </button>

                                            <div style={{ height: 1, background: "rgba(255,255,255,.10)" }} />

                                            <button className="dangerBtnInline" style={{ ...itemStyle, textAlign: "left" }} onClick={() => { closeMenu(); remove(n.id); }} disabled={saving}>
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
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL EDIT/CREATE */}
      {open && editing && (
        <>
          <div className="backdrop show" onMouseDown={closeModal} />
          <div className="modalCenter" onMouseDown={closeModal}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()} style={{ position: "relative" }}>
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
                    <input className="input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Ej: 2x1 esta semana" />
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

                  {/* ✅ Descripción: toolbar con formatos + emoji + SOLO 1 icono imagen (acá arriba) */}
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Descripción</span>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                      {/* Formatos (aplican markdown simple en textarea) */}
                      <button
                        type="button"
                        className="ghostBtn"
                        title="Negrita"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          const el = descRef.current;
                          if (!el || !editing) return;
                          const r = wrapSelection(el, "**", "**");
                          setEditing({ ...editing, description: r.next });
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

                      <button
                        type="button"
                        className="ghostBtn"
                        title="Cursiva"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          const el = descRef.current;
                          if (!el || !editing) return;
                          const r = wrapSelection(el, "_", "_");
                          setEditing({ ...editing, description: r.next });
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

                      <button
                        type="button"
                        className="ghostBtn"
                        title="Subrayado (marca con __texto__)"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          const el = descRef.current;
                          if (!el || !editing) return;
                          const r = wrapSelection(el, "__", "__");
                          setEditing({ ...editing, description: r.next });
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

                      <button
                        type="button"
                        className="ghostBtn"
                        title="Lista (• )"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          const el = descRef.current;
                          if (!el || !editing) return;
                          const r = toggleLinePrefix(el, "• ");
                          setEditing({ ...editing, description: r.next });
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

                      {/* Solo 1 botón imagen (acá) */}
                      <button type="button" className="btnSmall" onClick={onPickImage} title="Elegir imagen">
                        Imagen…
                      </button>
                    </div>

                    {/* Emoji popup */}
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
                          </div>,
                          document.body
                        )
                      : null}

                    <textarea
                      ref={descRef}
                      className="input"
                      rows={6}
                      value={editing.description || ""}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      style={{ resize: "vertical", whiteSpace: "pre-wrap" }}
                      placeholder="Escribí el contenido…"
                    />
                  </div>

                  {/* Link (CTA) */}
                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Link</span>
                    <input className="input" value={editing.ctaLink} onChange={(e) => setEditing({ ...editing, ctaLink: e.target.value })} placeholder="https://..." inputMode="url" />
                    <div style={{ marginTop: 6, opacity: 0.65, fontSize: 12 }}>Tip: si no querés botón en cliente, dejalo vacío.</div>
                  </label>

                  <label className="field">
                    <span className="label">Estado</span>
                    <select className="input" value={editing.active ? "1" : "0"} onChange={(e) => setEditing({ ...editing, active: e.target.value === "1" })}>
                      <option value="1">Activa</option>
                      <option value="0">Inactiva</option>
                    </select>
                  </label>

                  {/* Preview imagen + recorte */}
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <span className="label">Imagen</span>

                    {editing.image ? (
                      <div
                        style={{
                          marginTop: 6,
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
                    ) : (
                      <div style={{ marginTop: 6, opacity: 0.75, fontSize: 12 }}>No hay imagen seleccionada.</div>
                    )}

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                      {editing.image ? (
                        <button type="button" className="ghostBtn" onClick={removeImage}>
                          Quitar imagen
                        </button>
                      ) : null}
                    </div>

                    {editing.image ? (
                      <div style={{ marginTop: 8, opacity: 0.75, fontSize: 12 }}>Tip: para re-recortar después: click en la preview.</div>
                    ) : null}
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

          {/* Cropper */}
          <CropperModal open={cropOpen} sourceUrl={cropSourceUrl} originalFileName={cropOriginalNameRef.current} onClose={closeCrop} onConfirm={onCropConfirm} />
        </>
      )}

      {/* Preview cliente (global, desde ⋯) */}
      {previewOpen && previewData ? (
        <ClientCardPreview
          item={previewData as any}
          onClose={() => {
            setPreviewOpen(false);
            setPreviewItem(null);
          }}
        />
      ) : null}
    </div>
  );
}
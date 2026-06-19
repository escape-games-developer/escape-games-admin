import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

import type { EmojiClickData } from "emoji-picker-react";
const EmojiPicker = React.lazy(() => import("emoji-picker-react"));

type NewsType = "PROMO" | "DESTACADO" | "EVENTO" | "PROXIMAMENTE";
type CtaMode = "CONSULTAR" | "VER_DETALLE";

type NewsItem = {
  id: string;
  title: string;
  description: string;
  type: NewsType;
  publishedAt: string;
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
const NEWS_IMAGE_WIDTH = 1200;
const NEWS_IMAGE_HEIGHT = 500;
const NEWS_CARD_ASPECT = NEWS_IMAGE_WIDTH / NEWS_IMAGE_HEIGHT;

const defaultNews = (): NewsItem => ({
  id: crypto.randomUUID(),
  title: "",
  description: "",
  type: "DESTACADO",
  publishedAt: new Date().toISOString().slice(0, 10),
  image: "",
  imagePosition: 50,
  ctaMode: "VER_DETALLE",
  ctaLink: "",
  active: true,
});

function isHttpUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function openDatePicker(el: HTMLInputElement | null) {
  if (!el) return;
  const anyEl = el as HTMLInputElement & { showPicker?: () => void };
  if (typeof anyEl.showPicker === "function") anyEl.showPicker();
}

function stripHtml(input: string) {
  const s = String(input || "");
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\r/g, "");
}

function htmlToPlainText(input: string) {
  return stripHtml(String(input || "")).trim();
}

function ellipsize(s: string, n: number) {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n) + "…" : t;
}

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

      const margin = 0.06;
      let w = nat.w * (1 - margin * 2);
      let h = w / NEWS_CARD_ASPECT;

      if (h > nat.h * (1 - margin * 2)) {
        h = nat.h * (1 - margin * 2);
        w = h * NEWS_CARD_ASPECT;
      }

      const init: CropRect = {
        x: (nat.w - w) / 2,
        y: (nat.h - h) / 2,
        w,
        h,
      };

      setCropRect(clampRectToImage(init, nat, 80));
    };
    img.onerror = () => {
      alert("No pude leer la imagen para recortar.");
      onClose();
    };
    img.src = sourceUrl;
  }, [open, sourceUrl, onClose]);

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
      next = applyAspectFromAnchor(next, natImg, h, NEWS_CARD_ASPECT, 80);

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
      canvas.width = NEWS_IMAGE_WIDTH;
      canvas.height = NEWS_IMAGE_HEIGHT;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No pude abrir canvas para recortar.");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, NEWS_IMAGE_WIDTH, NEWS_IMAGE_HEIGHT);

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
      <div style={styles.overlay} onMouseDown={onClose} />
      <div style={styles.modalCenter} onMouseDown={onClose}>
        <div style={{ ...styles.modal, maxWidth: 980 }} onMouseDown={(e) => e.stopPropagation()}>
          <div style={styles.modalHeader}>
            <h2 style={styles.modalTitle}>Recortar imagen</h2>
            <button className="ghostBtn" onClick={onClose}>✕</button>
          </div>

          <div style={{ padding: 22 }}>
            <div style={{ opacity: 0.78, fontSize: 12, marginBottom: 10 }}>
              Mouse: mover arrastrando dentro, resize arrastrando bordes/esquinas. Ruedita = zoom del recorte. Doble click = máximo.
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

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button className="ghostBtn" onClick={onClose}>Cancelar</button>
              <button className="btnSmall" onClick={confirmCrop} disabled={!natImg || !cropRect}>
                Usar recorte
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

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
    <div style={styles.overlay} onMouseDown={onClose}>
      <div style={styles.modalCenter} onMouseDown={onClose}>
        <div style={{ ...styles.modal, maxWidth: 560 }} onMouseDown={(e) => e.stopPropagation()}>
          <div style={styles.modalHeader}>
            <h2 style={styles.modalTitle}>Vista previa</h2>
            <button className="ghostBtn" onClick={onClose}>✕</button>
          </div>

          <div style={{ padding: 22 }}>
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.16)",
                backgroundColor: "rgba(0,0,0,0.42)",
                borderRadius: 18,
                overflow: "hidden",
              }}
            >
              <div style={{ width: "100%", height: 160, overflow: "hidden", background: "#000" }}>
                <img
                  src={item.imageUrl || "https://picsum.photos/seed/news-placeholder/900/520"}
                  alt={item.title || TYPE_LABEL[item.type]}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>

              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={styles.typeBadge}>{TYPE_LABEL[item.type]}</span>
                    {!item.active ? <span style={styles.statusBadgeOff}>Inactiva</span> : <span style={styles.statusBadgeActive}>Activa</span>}
                  </div>

                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{item.publishedAt}</div>
                </div>

                <div style={{ color: "#fff", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{item.title}</div>

                <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 14, lineHeight: "20px", whiteSpace: "pre-wrap" }}>
                  {item.descriptionText}
                </div>

                {item.ctaLink ? (
                  <div style={{ marginTop: 12 }}>
                    <span style={styles.actionBtnMini}>Abrir link</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  document.body.classList.add("news-fullwidth");
  return () => document.body.classList.remove("news-fullwidth");
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
  const publishedRef = useRef<HTMLInputElement | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [sendPushOnSave, setSendPushOnSave] = useState(true);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [editingImageFile, setEditingImageFile] = useState<File | null>(null);
  const [tempPreviewUrl, setTempPreviewUrl] = useState<string | null>(null);

  const [cropOpen, setCropOpen] = useState(false);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const cropTempObjectUrlRef = useRef<string | null>(null);
  const cropOriginalNameRef = useRef<string>("image.jpg");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<NewsItem | null>(null);

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

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

  const totals = useMemo(() => {
    return {
      total: filtered.length,
      active: filtered.filter((n) => n.active).length,
      inactive: filtered.filter((n) => !n.active).length,
      featured: filtered.filter((n) => n.type === "DESTACADO").length,
    };
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
    setSendPushOnSave(true);
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
    setEditing(defaultNews());
    setEditingImageFile(null);
    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
    setSendPushOnSave(true);
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

    setSendPushOnSave(false);
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

  const notifyNewsPublished = async (item: NewsItem) => {
    try {
      const { data, error } = await supabase.functions.invoke("send-news-push", {
        body: {
          newsId: item.id,
          title: item.title,
          description: item.description,
          type: item.type,
          publishedAt: item.publishedAt,
          imageUrl: item.image || "",
          ctaLink: item.ctaLink || "",
        },
      });

      if (error) {
        console.error("Push function error:", error);
        return;
      }

      console.log("Push enviada correctamente:", data);
    } catch (err: any) {
      console.error("Unexpected push invoke error:", err);
    }
  };

  const save = async () => {
    if (!canManageNews || !editing) return;

    if (!editing.title.trim()) return alert("Poné un título.");
    if (!String(editing.description || "").trim()) return alert("Poné una descripción.");
    if (!editing.publishedAt) return alert("Elegí fecha de publicación.");
    if (!editing.type) return alert("Elegí el tipo de novedad.");

    if (editing.ctaLink && !isHttpUrl(editing.ctaLink)) {
      return alert("El link debe ser una URL válida con http/https.");
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

      if (saved.active && sendPushOnSave) {
        await notifyNewsPublished(saved);
      }

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
      alert("No pude actualizar estado.");
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
      alert("No pude borrar.");
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

  const applyInlineFormat = (kind: "bold" | "italic" | "underline" | "list") => {
    if (!editing || !descRef.current) return;
    const el = descRef.current;

    if (kind === "bold") {
      const { next, nextCursorStart, nextCursorEnd } = wrapSelection(el, "**", "**");
      setEditing((prev) => (prev ? { ...prev, description: next } : prev));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(nextCursorStart, nextCursorEnd);
      });
      return;
    }

    if (kind === "italic") {
      const { next, nextCursorStart, nextCursorEnd } = wrapSelection(el, "_", "_");
      setEditing((prev) => (prev ? { ...prev, description: next } : prev));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(nextCursorStart, nextCursorEnd);
      });
      return;
    }

    if (kind === "underline") {
      const { next, nextCursorStart, nextCursorEnd } = wrapSelection(el, "<u>", "</u>");
      setEditing((prev) => (prev ? { ...prev, description: next } : prev));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(nextCursorStart, nextCursorEnd);
      });
      return;
    }

    const { next } = toggleLinePrefix(el, "• ");
    setEditing((prev) => (prev ? { ...prev, description: next } : prev));
    requestAnimationFrame(() => {
      el.focus();
    });
  };

  return (
    <div style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerWrap}>
          <div style={styles.headerText}>
            <h1 style={styles.title}>Novedades</h1>
            <p style={styles.subtitle}></p>
          </div>

          <div style={styles.headerActions}>
            {canManageNews ? (
              <button className="btnSmall" onClick={startCreate}>
                + Nueva novedad
              </button>
            ) : null}
          </div>
        </div>

        <div style={styles.filtersRowNews}>
          <div style={styles.searchBox}>
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título, descripción o tipo"
              style={styles.searchInput}
            />
          </div>

          <select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={styles.filterSelect}>
            <option value="">Todos los tipos</option>
            <option value="PROMO">Promo</option>
            <option value="DESTACADO">Destacado</option>
            <option value="EVENTO">Evento</option>
            <option value="PROXIMAMENTE">Próximamente</option>
          </select>

          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={styles.filterSelect}>
            <option value="">Todos los estados</option>
            <option value="active">Solo activas</option>
            <option value="inactive">Solo inactivas</option>
          </select>

          <input
            ref={fromRef}
            className="input"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            onFocus={() => openDatePicker(fromRef.current)}
            onClick={() => openDatePicker(fromRef.current)}
            style={styles.filterDate}
          />

          <input
            ref={toRef}
            className="input"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            onFocus={() => openDatePicker(toRef.current)}
            onClick={() => openDatePicker(toRef.current)}
            style={styles.filterDate}
          />
        </div>

        <div style={styles.cardsGrid}>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Novedades visibles</span>
            <strong style={styles.cardValue}>{totals.total}</strong>
          </div>

          <div style={styles.card}>
            <span style={styles.cardLabel}>Activas</span>
            <strong style={styles.cardValue}>{totals.active}</strong>
          </div>

          <div style={styles.card}>
            <span style={styles.cardLabel}>Inactivas</span>
            <strong style={styles.cardValue}>{totals.inactive}</strong>
          </div>

          <div style={styles.card}>
            <span style={styles.cardLabel}>Destacadas</span>
            <strong style={styles.cardValue}>{totals.featured}</strong>
          </div>
        </div>

        {loading ? (
          <div style={styles.loadingPanel}>Cargando novedades…</div>
        ) : (
          <div style={styles.tableOuter}>
            <div style={styles.tableWrapNews}>
              <div style={styles.tableHeaderNews}>
                <div style={{ ...styles.th, ...styles.colImg }}>Imagen</div>
                <div style={{ ...styles.th, ...styles.colTitle }}>Título</div>
                <div style={{ ...styles.th, ...styles.colDesc }}>Descripción</div>
                <div style={{ ...styles.thCenter, ...styles.colType }}>Tipo</div>
                <div style={{ ...styles.thCenter, ...styles.colDate }}>Fecha</div>
                <div style={{ ...styles.th, ...styles.colLink }}>Link</div>
                <div style={{ ...styles.thCenter, ...styles.colStatus }}>Estado</div>
                <div style={{ ...styles.thCenter, ...styles.colAction }}>Acciones</div>
              </div>

              {filtered.length === 0 ? (
                <div style={styles.emptyState}>No hay novedades con esos filtros.</div>
              ) : (
                filtered.map((n, idx) => {
                  const desc = htmlToPlainText(n.description || "");
                  const rowBg = idx % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.00)";

                  return (
                    <div
                      key={n.id}
                      style={{ ...styles.rowNews, background: rowBg }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = rowBg;
                      }}
                    >
                      <div style={{ ...styles.td, ...styles.colImg, padding: 8 }}>
                        <div style={styles.newsThumb}>
                          <img
                            src={n.image || "https://picsum.photos/seed/news-placeholder/900/520"}
                            alt={n.title || TYPE_LABEL[n.type]}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              objectPosition: `50% ${n.imagePosition}%`,
                              display: "block",
                            }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src =
                                "https://picsum.photos/seed/news-placeholder/900/520";
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ ...styles.td, ...styles.colTitle }} title={n.title || ""}>
                        <div style={styles.newsTitleCell}>{n.title || "—"}</div>
                      </div>

                      <div style={{ ...styles.td, ...styles.colDesc }} title={desc}>
                        {ellipsize(desc, 120) || "—"}
                      </div>

                      <div style={{ ...styles.tdCenter, ...styles.colType }}>
                        <span style={styles.typeBadge}>{TYPE_LABEL[n.type]}</span>
                      </div>

                      <div style={{ ...styles.tdCenter, ...styles.colDate }}>{n.publishedAt}</div>

                      <div style={{ ...styles.td, ...styles.colLink }} title={n.ctaLink || ""}>
                        {n.ctaLink ? ellipsize(n.ctaLink, 54) : <span style={{ opacity: 0.7 }}>Sin link</span>}
                      </div>

                      <div style={{ ...styles.tdCenter, ...styles.colStatus }}>
                        {n.active ? (
                          <span style={styles.statusBadgeActive}>Activa</span>
                        ) : (
                          <span style={styles.statusBadgeOff}>Inactiva</span>
                        )}
                      </div>

                      <div style={{ ...styles.tdCenter, ...styles.colAction }}>
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
                            style={styles.actionBtnIcon}
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
                                style={styles.portalMenu(menuPos.left, menuPos.top)}
                                onMouseDown={(ev) => ev.stopPropagation()}
                              >
                                <button className="ghostBtn" style={styles.portalItem} onClick={() => { closeMenu(); startEdit(n); }} disabled={saving}>
                                  <Icon name="edit" size={16} />
                                  Editar
                                </button>

                                <button className="ghostBtn" style={styles.portalItem} onClick={() => { closeMenu(); openCardPreview(n); }} disabled={saving}>
                                  <Icon name="eye" size={16} />
                                  Vista previa
                                </button>

                                <button className="ghostBtn" style={styles.portalItem} onClick={() => { closeMenu(); toggleActive(n.id); }} disabled={saving}>
                                  <Icon name="toggle" size={16} />
                                  {n.active ? "Desactivar" : "Activar"}
                                </button>

                                <div style={styles.portalDivider} />

                                <button className="ghostBtn" style={{ ...styles.portalItem, ...styles.portalDangerItem }} onClick={() => { closeMenu(); remove(n.id); }} disabled={saving}>
                                  <Icon name="trash" size={16} />
                                  Borrar
                                </button>
                              </div>,
                              document.body
                            )
                          : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {open && editing && (
          <>
            <div style={styles.overlay} onMouseDown={closeModal} />
            <div style={styles.modalCenter} onMouseDown={closeModal}>
              <div style={{ ...styles.modal, maxWidth: 1120 }} onMouseDown={(e) => e.stopPropagation()}>
                <div style={styles.modalHeader}>
                  <h2 style={styles.modalTitle}>
                    {items.some((x) => x.id === editing.id) ? "Editar novedad" : "Nueva novedad"}
                  </h2>
                  <button className="ghostBtn" onClick={closeModal}>✕</button>
                </div>

                <div style={{ padding: 22 }}>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={onFileChange}
                  />

                  <div style={styles.formGridNews}>
                    <label style={styles.fieldNews}>
                      <span style={styles.labelNews}>Título</span>
                      <input
                        className="input"
                        value={editing.title}
                        onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                        placeholder="Título"
                      />
                    </label>

                    <label style={styles.fieldNews}>
                      <span style={styles.labelNews}>Tipo</span>
                      <select
                        className="input"
                        value={editing.type}
                        onChange={(e) => {
                          const nextType = e.target.value as NewsType;
                          setEditing({
                            ...editing,
                            type: nextType,
                            ctaMode: nextType === "PROMO" ? "CONSULTAR" : "VER_DETALLE",
                          });
                        }}
                      >
                        <option value="PROMO">Promo</option>
                        <option value="DESTACADO">Destacado</option>
                        <option value="EVENTO">Evento</option>
                        <option value="PROXIMAMENTE">Próximamente</option>
                      </select>
                    </label>

                    <label style={styles.fieldNews}>
                      <span style={styles.labelNews}>Fecha</span>
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

                    <label style={{ ...styles.fieldNews, gridColumn: "1 / -1" }}>
                      <span style={styles.labelNews}>Link CTA</span>
                      <input
                        className="input"
                        value={editing.ctaLink}
                        onChange={(e) => setEditing({ ...editing, ctaLink: e.target.value })}
                        placeholder="https://..."
                      />
                    </label>

                    <div style={{ ...styles.fieldNews, gridColumn: "1 / -1" }}>
                      <span style={styles.labelNews}>Descripción</span>

                      <div style={styles.formatToolbar}>
                        <button type="button" className="ghostBtn" style={styles.toolbarBtn} onClick={() => applyInlineFormat("bold")} title="Negrita">
                          <FIcon name="bold" />
                        </button>

                        <button type="button" className="ghostBtn" style={styles.toolbarBtn} onClick={() => applyInlineFormat("italic")} title="Itálica">
                          <FIcon name="italic" />
                        </button>

                        <button type="button" className="ghostBtn" style={styles.toolbarBtn} onClick={() => applyInlineFormat("underline")} title="Subrayado">
                          <FIcon name="underline" />
                        </button>

                        <button type="button" className="ghostBtn" style={styles.toolbarBtn} onClick={() => applyInlineFormat("list")} title="Lista">
                          <FIcon name="list" />
                        </button>

                        <div style={styles.toolbarDivider} />

                        <button
                          ref={emojiBtnRef}
                          type="button"
                          className="ghostBtn"
                          onClick={() => (emojiOpen ? setEmojiOpen(false) : openEmoji())}
                          title="Emojis"
                          style={styles.toolbarBtn}
                        >
                          😀
                        </button>

                        <button type="button" className="btnSmall" onClick={onPickImage}>
                          Imagen…
                        </button>

                        {editing.image ? (
                          <button type="button" className="ghostBtn" onClick={removeImage}>
                            Quitar imagen
                          </button>
                        ) : null}
                      </div>

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
                        rows={8}
                        value={editing.description || ""}
                        onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                        style={{
                          resize: "vertical",
                          whiteSpace: "pre-wrap",
                          minHeight: 180,
                          width: "100%",
                          boxSizing: "border-box",
                          paddingTop: 14,
                        }}
                        placeholder="Escribí el contenido…"
                      />
                    </div>

                    <div style={{ ...styles.fieldNews, gridColumn: "1 / -1" }}>
                      <span style={styles.labelNews}>Vista previa</span>

                      {editing.image ? (
                        <div style={styles.editorPreviewWrap}>
                          <img
                            src={editing.image}
                            alt="Preview"
                            style={{
                              width: "100%",
                              height: 260,
                              objectFit: "cover",
                              objectPosition: `50% ${editing.imagePosition}%`,
                              display: "block",
                            }}
                          />

                          <div style={styles.sliderWrap}>
                            <span style={styles.sliderLabel}>Posición vertical</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              value={editing.imagePosition ?? 50}
                              onChange={(e) =>
                                setEditing({ ...editing, imagePosition: Number(e.target.value) })
                              }
                              style={{ width: "100%" }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div style={styles.previewPlaceholder}>Todavía no hay imagen seleccionada.</div>
                      )}
                    </div>

                    <label style={{ ...styles.fieldNews, gridColumn: "1 / -1" }}>
                      <span style={styles.labelNews}>Opciones</span>
                      <div style={styles.optionsRowNews}>
                        <label style={styles.checkRow}>
                          <input
                            type="checkbox"
                            checked={editing.active}
                            onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                          />
                          <span>Activa</span>
                        </label>

                        <label style={styles.checkRow}>
                          <input
                            type="checkbox"
                            checked={sendPushOnSave}
                            onChange={(e) => setSendPushOnSave(e.target.checked)}
                          />
                          <span>Enviar push al guardar</span>
                        </label>
                      </div>
                    </label>
                  </div>

                  <div style={styles.modalFooter}>
                    <button className="ghostBtn" onClick={closeModal} disabled={saving}>
                      Cancelar
                    </button>
                    <button className="btnSmall" onClick={save} disabled={saving}>
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        <CropperModal
          open={cropOpen}
          sourceUrl={cropSourceUrl}
          originalFileName={cropOriginalNameRef.current}
          onClose={closeCrop}
          onConfirm={onCropConfirm}
        />

        {previewOpen && previewData ? (
          <ClientCardPreview item={previewData} onClose={() => { setPreviewOpen(false); setPreviewItem(null); }} />
        ) : null}
      </div>
    </div>
  );
}

const styles: Record<string, any> = {
  page: {
  width: "100%",
  minHeight: "100vh",
  background: "#0f172a",
  color: "#e5e7eb",
  boxSizing: "border-box",
  },

  pageInner: {
  width: "100%",
  maxWidth: "100%",
  minHeight: "100vh",
  margin: 0,
  padding: "14px 18px 18px",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  },

  headerWrap: {
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 14,
  },

  headerText: {
    flex: "1 1 420px",
    minWidth: 280,
  },

  title: {
    margin: 0,
    fontSize: 32,
    fontWeight: 800,
    color: "#ffffff",
    lineHeight: 1.1,
  },

  subtitle: {
    margin: "8px 0 0 0",
    fontSize: 14,
    color: "#94a3b8",
    maxWidth: 760,
  },

  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  filtersRowNews: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1.8fr) minmax(180px, 220px) minmax(180px, 220px) minmax(150px, 170px) minmax(150px, 170px)",
    gap: 12,
    marginBottom: 16,
    alignItems: "center",
  },

  searchBox: {
    minWidth: 0,
  },

  searchInput: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    boxSizing: "border-box",
  },

  filterSelect: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    boxSizing: "border-box",
  },

  filterDate: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    boxSizing: "border-box",
  },

  cardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 18,
    width: "100%",
  },

  card: {
    background: "linear-gradient(180deg, #111827 0%, #0b1220 100%)",
    border: "1px solid #1f2937",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 10px 24px rgba(0,0,0,0.16)",
    minHeight: 82,
    boxSizing: "border-box",
  },

  cardLabel: {
    display: "block",
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 8,
  },

  cardValue: {
    fontSize: 22,
    fontWeight: 800,
    color: "#ffffff",
    lineHeight: 1,
  },

  loadingPanel: {
    border: "1px solid #1f2937",
    borderRadius: 18,
    background: "#0b1220",
    padding: 18,
    color: "#cbd5e1",
  },

  tableOuter: {
  width: "100%",
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  borderRadius: 18,
  background: "#0b1220",
  },

  tableWrapNews: {
    width: "100%",
    minWidth: 1280,
    border: "1px solid #1f2937",
    borderRadius: 18,
    overflow: "hidden",
    background: "#0b1220",
    boxSizing: "border-box",
  },

  tableHeaderNews: {
    display: "grid",
    gridTemplateColumns: "90px 2fr 2.1fr 1.1fr 0.9fr 2fr 1fr 84px",
    gap: 12,
    padding: "16px 18px",
    background: "#111827",
    borderBottom: "1px solid #1f2937",
    boxSizing: "border-box",
    alignItems: "center",
    position: "sticky",
    top: 0,
    zIndex: 5,
  },

  rowNews: {
    display: "grid",
    gridTemplateColumns: "90px 2fr 2.1fr 1.1fr 0.9fr 2fr 1fr 84px",
    gap: 12,
    padding: "14px 18px",
    borderBottom: "1px solid #172033",
    alignItems: "center",
    boxSizing: "border-box",
  },

  th: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94a3b8",
    fontWeight: 700,
    minWidth: 0,
  },

  thCenter: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94a3b8",
    fontWeight: 700,
    textAlign: "center",
    minWidth: 0,
  },

  td: {
    fontSize: 14,
    color: "#e5e7eb",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  tdCenter: {
    fontSize: 14,
    color: "#e5e7eb",
    textAlign: "center",
    minWidth: 0,
  },

  colImg: { minWidth: 80 },
  colTitle: { minWidth: 220 },
  colDesc: { minWidth: 280 },
  colType: { minWidth: 130 },
  colDate: { minWidth: 110 },
  colLink: { minWidth: 240 },
  colStatus: { minWidth: 120 },
  colAction: { minWidth: 70 },

  newsThumb: {
    width: 56,
    height: 38,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(0,0,0,.35)",
  },

  newsTitleCell: {
    fontWeight: 800,
    color: "#fff",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  typeBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
    padding: "0 12px",
    borderRadius: 999,
    background: "#1e293b",
    border: "1px solid #334155",
    fontWeight: 700,
    fontSize: 12,
    whiteSpace: "nowrap",
  },

  statusBadgeActive: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
    padding: "0 12px",
    borderRadius: 999,
    background: "rgba(34,197,94,0.12)",
    color: "#4ade80",
    border: "1px solid rgba(34,197,94,0.3)",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },

  statusBadgeOff: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
    padding: "0 12px",
    borderRadius: 999,
    background: "rgba(248,113,113,0.12)",
    color: "#fca5a5",
    border: "1px solid rgba(248,113,113,0.28)",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },

  actionBtnIcon: {
    padding: "8px 10px",
    borderRadius: 12,
    background: "rgba(249,115,22,0.12)",
    border: "1px solid rgba(249,115,22,0.24)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
  },

  actionBtnMini: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
    padding: "0 14px",
    borderRadius: 12,
    background: "linear-gradient(180deg, rgba(249,115,22,0.22) 0%, rgba(249,115,22,0.12) 100%)",
    border: "1px solid rgba(249,115,22,0.35)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
  },

  emptyState: {
    padding: 28,
    textAlign: "center" as const,
    color: "#94a3b8",
    fontSize: 15,
  },

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(2,6,23,0.72)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 1000,
    boxSizing: "border-box",
  },

  modalCenter: {
    position: "fixed",
    inset: 0,
    zIndex: 1001,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    boxSizing: "border-box",
  },

  modal: {
    width: "100%",
    maxWidth: 980,
    maxHeight: "92vh",
    overflowY: "auto" as const,
    borderRadius: 22,
    background: "#0b1220",
    border: "1px solid #1f2937",
    boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
    boxSizing: "border-box",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    padding: "22px 22px 0",
  },

  modalTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    color: "#fff",
  },

  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },

  formGridNews: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
    alignItems: "start",
  },

  fieldNews: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },

  labelNews: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: 700,
  },

  formatToolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 8,
  },

  toolbarBtn: {
    padding: "8px 10px",
    lineHeight: 1,
  },

  toolbarDivider: {
    width: 1,
    height: 22,
    background: "rgba(255,255,255,0.12)",
    marginInline: 4,
  },

  editorPreviewWrap: {
    marginTop: 6,
    borderRadius: 14,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.3)",
  },

  sliderWrap: {
    padding: 12,
    borderTop: "1px solid rgba(255,255,255,0.10)",
  },

  sliderLabel: {
    display: "block",
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
  },

  previewPlaceholder: {
    marginTop: 6,
    minHeight: 120,
    borderRadius: 14,
    border: "1px dashed rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.03)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#94a3b8",
    fontSize: 14,
    padding: 16,
  },

  optionsRowNews: {
    display: "flex",
    gap: 18,
    flexWrap: "wrap",
    alignItems: "center",
  },

  checkRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "#e5e7eb",
    fontSize: 14,
  },

  portalMenu: (left: number, top: number): React.CSSProperties => ({
    position: "fixed",
    left,
    top,
    zIndex: 99999,
    width: 260,
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid #1f2937",
    background: "linear-gradient(180deg, #111827 0%, #0b1220 100%)",
    boxShadow: "0 20px 40px rgba(0,0,0,0.28)",
    backdropFilter: "blur(10px)",
  }),

  portalItem: {
    width: "100%",
    justifyContent: "flex-start",
    borderRadius: 0,
    padding: "12px 14px",
    display: "flex",
    gap: 10,
    alignItems: "center",
    background: "transparent",
    color: "#e5e7eb",
    border: "none",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },

  portalDivider: {
    height: 1,
    background: "#1f2937",
  },

  portalDangerItem: {
    color: "#fca5a5",
  },
};
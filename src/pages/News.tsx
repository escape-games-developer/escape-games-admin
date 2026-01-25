// News.tsx (ADMIN) — listo para producción (sin tocar tu UI/UX base)
// ✅ Descripción con emojis + formato (negrita/cursiva/subrayado)
// ✅ Flujo simple: Elegir imagen -> popup con imagen completa -> recortar -> confirmar
// ✅ Cropper “tipo Paint” con mouse (ratio fijo a card) y se sube el recorte
// ✅ Botón "Vista previa" al lado de Cancelar (preview como lo ve el cliente)
// ✅ Menos botones para imagen: solo "Elegir imagen" + "Quitar" (re-crop: click en preview)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

/* =======================
   TIPOS
======================= */

type NewsType = "PROMO" | "DESTACADO" | "EVENTO" | "PROXIMAMENTE";
type CtaMode = "CONSULTAR" | "VER_DETALLE";

type NewsItem = {
  id: string;

  title: string;
  // guardamos HTML (con whitelist) para soportar negrita/cursiva/subrayado + emojis
  description: string;

  type: NewsType;
  publishedAt: string; // YYYY-MM-DD

  image: string; // public url o objectURL local
  imagePosition: number; // 0-100 (queda por compat)

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

// abre calendario nativo si el browser lo soporta
const openDatePicker = (el: HTMLInputElement | null) => {
  if (!el) return;
  const anyEl = el as HTMLInputElement & { showPicker?: () => void };
  if (typeof anyEl.showPicker === "function") anyEl.showPicker();
};

/* =======================
   SANITIZE HTML (simple + seguro)
   Permitimos: b/strong, i/em, u, br, p, div, span
   Sin atributos
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
   RICH TEXT (toolbar simple)
======================= */

function RichTextEditor({
  valueHtml,
  onChangeHtml,
}: {
  valueHtml: string;
  onChangeHtml: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const incoming = String(valueHtml || "");
    const current = el.innerHTML;

    if (current !== incoming) el.innerHTML = incoming;
  }, [valueHtml]);

  const exec = (cmd: "bold" | "italic" | "underline") => {
    try {
      document.execCommand(cmd);
      const el = ref.current;
      if (!el) return;
      onChangeHtml(el.innerHTML);
    } catch {}
  };

  const insertEmoji = (emo: string) => {
    const el = ref.current;
    if (!el) return;

    el.focus();
    try {
      document.execCommand("insertText", false, emo);
    } catch {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(emo));
        range.collapse(false);
      } else {
        el.innerText = (el.innerText || "") + emo;
      }
    }
    onChangeHtml(el.innerHTML);
    setEmojiOpen(false);
  };

  const onInput = () => {
    const el = ref.current;
    if (!el) return;
    onChangeHtml(el.innerHTML);
  };

  const onPaste: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    try {
      document.execCommand("insertText", false, text);
    } catch {
      const el = ref.current;
      if (!el) return;
      el.innerText = (el.innerText || "") + text;
    }
    onInput();
  };

  const EMOJIS = ["🔥", "🎉", "✅", "⚡", "🕹️", "🎮", "💥", "⭐", "😎", "🤝", "📢", "💰", "⏳", "📍", "🧩"];

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btnSmall" onClick={() => exec("bold")} title="Negrita">
          <b>B</b>
        </button>
        <button type="button" className="btnSmall" onClick={() => exec("italic")} title="Cursiva">
          <i>I</i>
        </button>
        <button type="button" className="btnSmall" onClick={() => exec("underline")} title="Subrayado">
          <u>U</u>
        </button>

        <div style={{ position: "relative" }}>
          <button type="button" className="btnSmall" onClick={() => setEmojiOpen((v) => !v)} title="Emojis">
            😀 Emoji
          </button>

          {emojiOpen && (
            <div
              style={{
                position: "absolute",
                zIndex: 50,
                top: "110%",
                left: 0,
                background: "rgba(0,0,0,0.92)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 12,
                padding: 10,
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                width: 220,
              }}
            >
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="ghostBtn"
                  style={{ padding: "6px 10px", borderRadius: 10 }}
                  onClick={() => insertEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        <span style={{ opacity: 0.7, fontSize: 12 }}>Tip: escribí normal y aplicá formato.</span>
      </div>

      <div
        ref={ref}
        className="input"
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onPaste={onPaste}
        style={{
          minHeight: 110,
          padding: 12,
          borderRadius: 14,
          lineHeight: 1.35,
          overflow: "auto",
          whiteSpace: "pre-wrap",
        }}
      />
    </div>
  );
}

/* =======================
   CROPPER “tipo Paint”
   - selección con mouse
   - ratio fijo como card (900/520)
   - MUESTRA IMAGEN COMPLETA (contain)
   - confirma => genera File PNG (crop)
   - soporta URL remota (fetch->blob) para evitar canvas tainted
======================= */

const CARD_RATIO = 900 / 520;

function CropperModal({
  open,
  sourceUrl,
  onClose,
  onConfirm,
}: {
  open: boolean;
  sourceUrl: string | null;
  onClose: () => void;
  onConfirm: (file: File, previewUrl: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragMode, setDragMode] = useState<null | "draw" | "move">(null);
  const startRef = useRef<{ x: number; y: number; ox?: number; oy?: number } | null>(null);

  // mapping imagen->contenedor (contain)
  const mapRef = useRef<{
    offX: number;
    offY: number;
    drawW: number;
    drawH: number;
    scale: number; // contenedor px / imagen px
    natW: number;
    natH: number;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setRect(null);
      setDragMode(null);
      startRef.current = null;
      mapRef.current = null;
      setLoading(true);
    }
  }, [open]);

  const normalizeRect = (r: { x: number; y: number; w: number; h: number }) => {
    const x = Math.min(r.x, r.x + r.w);
    const y = Math.min(r.y, r.y + r.h);
    const w = Math.abs(r.w);
    const h = Math.abs(r.h);
    return { x, y, w, h };
  };

  const computeMap = () => {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img) return;

    const natW = img.naturalWidth || 0;
    const natH = img.naturalHeight || 0;

    const wrapW = wrap.clientWidth;
    const wrapH = wrap.clientHeight;

    if (!natW || !natH || !wrapW || !wrapH) return;

    // ✅ contain (muestra la imagen completa)
    const scale = Math.min(wrapW / natW, wrapH / natH);
    const drawW = natW * scale;
    const drawH = natH * scale;

    const offX = (wrapW - drawW) / 2;
    const offY = (wrapH - drawH) / 2;

    mapRef.current = { offX, offY, drawW, drawH, scale, natW, natH };
  };

  const isInsideImageArea = (x: number, y: number) => {
    const map = mapRef.current;
    if (!map) return false;
    return (
      x >= map.offX &&
      x <= map.offX + map.drawW &&
      y >= map.offY &&
      y <= map.offY + map.drawH
    );
  };

  const onMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!open) return;
    const wrap = wrapRef.current;
    if (!wrap) return;

    const bounds = wrap.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;

    // si todavía no mapeó o cliqueás fuera del área real de la imagen, no arranca
    if (!mapRef.current || !isInsideImageArea(x, y)) return;

    // click adentro del rect => mover
    if (rect) {
      const r = normalizeRect(rect);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        setDragMode("move");
        startRef.current = { x, y, ox: r.x, oy: r.y };
        return;
      }
    }

    // draw nuevo
    setDragMode("draw");
    startRef.current = { x, y };
    setRect({ x, y, w: 0, h: 0 });
  };

  const onMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!dragMode) return;
    const wrap = wrapRef.current;
    const map = mapRef.current;
    if (!wrap || !map) return;

    const bounds = wrap.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;

    if (!startRef.current) return;

    const minX = map.offX;
    const minY = map.offY;
    const maxX = map.offX + map.drawW;
    const maxY = map.offY + map.drawH;

    if (dragMode === "draw") {
      const sx = startRef.current.x;
      const sy = startRef.current.y;

      // clamp del puntero al área de la imagen
      const cx = clamp(x, minX, maxX);
      const cy = clamp(y, minY, maxY);

      let w = cx - sx;
      let h = cy - sy;

      // ratio fijo tipo card
      const signW = w >= 0 ? 1 : -1;
      const signH = h >= 0 ? 1 : -1;

      const absW = Math.abs(w);
      const absH = Math.abs(h);

      if (absW / Math.max(1, absH) > CARD_RATIO) {
        h = signH * (absW / CARD_RATIO);
      } else {
        w = signW * (absH * CARD_RATIO);
      }

      // clamp final para que quede dentro del área de imagen
      const nx = clamp(sx, minX, maxX);
      const ny = clamp(sy, minY, maxY);
      let ex = clamp(nx + w, minX, maxX);
      let ey = clamp(ny + h, minY, maxY);

      const rw = Math.abs(ex - nx);
      const rh = rw / CARD_RATIO;

      // ajustamos ey respetando ratio, según dirección
      ey = h >= 0 ? ny + rh : ny - rh;
      ey = clamp(ey, minY, maxY);

      const finalW = rw;
      const finalH = Math.abs(ey - ny);

      // reconstruimos w/h con signo
      const fw = signW * finalW;
      const fh = signH * finalH;

      setRect({ x: nx, y: ny, w: fw, h: fh });
    }

    if (dragMode === "move" && rect) {
      const r = normalizeRect(rect);
      const dx = x - startRef.current.x;
      const dy = y - startRef.current.y;

      let nx = (startRef.current.ox || 0) + dx;
      let ny = (startRef.current.oy || 0) + dy;

      // clamp para no sacar el rect de la imagen
      nx = clamp(nx, minX, maxX - r.w);
      ny = clamp(ny, minY, maxY - r.h);

      setRect({ x: nx, y: ny, w: r.w, h: r.h });
    }
  };

  const endDrag = () => {
    setDragMode(null);
    startRef.current = null;
  };

  const confirmCrop = async () => {
    const img = imgRef.current;
    const map = mapRef.current;
    const wrap = wrapRef.current;
    if (!img || !map || !wrap || !rect) return;

    const r = normalizeRect(rect);

    if (r.w < 20 || r.h < 20) {
      alert("El recorte es muy chico. Marcá un área más grande.");
      return;
    }

    // clamp al área visible de imagen (coords contenedor)
    const minX = map.offX;
    const minY = map.offY;
    const maxX = map.offX + map.drawW;
    const maxY = map.offY + map.drawH;

    const cx1 = clamp(r.x, minX, maxX);
    const cy1 = clamp(r.y, minY, maxY);
    const cx2 = clamp(r.x + r.w, minX, maxX);
    const cy2 = clamp(r.y + r.h, minY, maxY);

    const cw = Math.max(2, cx2 - cx1);
    const ch = Math.max(2, cy2 - cy1);

    if (cw < 20 || ch < 20) {
      alert("El recorte quedó fuera de la imagen. Arrancá el recorte dentro de la foto.");
      return;
    }

    // coords en la imagen original
    const ix = (cx1 - map.offX) / map.scale;
    const iy = (cy1 - map.offY) / map.scale;
    const iw = cw / map.scale;
    const ih = ch / map.scale;

    const out = document.createElement("canvas");
    out.width = Math.max(2, Math.round(iw));
    out.height = Math.max(2, Math.round(ih));

    const ctx = out.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      img,
      Math.round(ix),
      Math.round(iy),
      Math.round(iw),
      Math.round(ih),
      0,
      0,
      out.width,
      out.height
    );

    const blob: Blob | null = await new Promise((resolve) =>
      out.toBlob((b) => resolve(b), "image/png", 0.92)
    );

    if (!blob) {
      alert(
        "No pude generar el recorte. Si la imagen es remota y bloquea CORS, volvé a subirla desde tu PC."
      );
      return;
    }

    const file = new File([blob], `crop_${Date.now()}.png`, { type: "image/png" });
    const previewUrl = URL.createObjectURL(blob);

    onConfirm(file, previewUrl);
  };

  if (!open) return null;

  return (
    <div className="backdrop show" style={{ zIndex: 9999 }} onMouseDown={onClose}>
      <div className="modalCenter" onMouseDown={onClose}>
        <div className="modalBox" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 860 }}>
          <div className="modalHead">
            <div className="modalTitle">Recortar imagen</div>
            <button className="iconBtn" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </div>

          <div className="modalBody">
            <div style={{ opacity: 0.8, fontSize: 12, marginBottom: 10 }}>
              Arrastrá para marcar el recorte (ratio igual a la card). Podés mover el recorte agarrándolo.
            </div>

            <div
              ref={wrapRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
              style={{
                width: "100%",
                height: 420,
                borderRadius: 14,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,.12)",
                background: "rgba(0,0,0,.25)",
                position: "relative",
                userSelect: "none",
                cursor: dragMode ? "grabbing" : rect ? "grab" : "crosshair",
              }}
            >
              {sourceUrl ? (
                <img
                  ref={imgRef}
                  src={sourceUrl}
                  alt="Crop source"
                  onLoad={() => {
                    setLoading(false);
                    requestAnimationFrame(() => {
                      computeMap();
                      const wrap = wrapRef.current;
                      const map = mapRef.current;
                      if (wrap && map && !rect) {
                        // rect default centrado dentro del área real de la imagen
                        const rw = Math.min(map.drawW * 0.9, wrap.clientWidth * 0.78);
                        const rh = rw / CARD_RATIO;
                        const x = map.offX + (map.drawW - rw) / 2;
                        const y = map.offY + (map.drawH - rh) / 2;
                        setRect({ x, y, w: rw, h: rh });
                      }
                    });
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain", // ✅ imagen completa
                    background: "rgba(0,0,0,.55)",
                    display: "block",
                    pointerEvents: "none",
                  }}
                />
              ) : null}

              {loading ? (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                  <div style={{ opacity: 0.8 }}>Cargando imagen…</div>
                </div>
              ) : null}

              {rect ? (
                (() => {
                  const r = normalizeRect(rect);
                  return (
                    <div
                      style={{
                        position: "absolute",
                        left: r.x,
                        top: r.y,
                        width: r.w,
                        height: r.h,
                        border: "2px solid rgba(0,255,242,0.9)",
                        background: "rgba(0,255,242,0.10)",
                        boxSizing: "border-box",
                        pointerEvents: "none",
                      }}
                    />
                  );
                })()
              ) : null}
            </div>
          </div>

          <div className="modalFoot">
            <button className="ghostBtn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btnSmall" onClick={confirmCrop}>
              Confirmar recorte
            </button>
          </div>
        </div>
      </div>
    </div>
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
                      <div
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "rgba(255,165,0,0.18)",
                        }}
                      >
                        <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>DESTACADO</span>
                      </div>
                    ) : null}

                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.10)",
                      }}
                    >
                      <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>
                        {TYPE_LABEL[item.type].toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{item.publishedAt}</div>
                </div>

                <div style={{ color: "#fff", fontSize: 16, fontWeight: 800, marginBottom: 6 }}>
                  {item.title}
                </div>

                <div
                  style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, lineHeight: 18 }}
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
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // buscador + filtros
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>(""); // "", "active", "inactive"

  // historial / calendario (rango)
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const fromRef = useRef<HTMLInputElement | null>(null);
  const toRef = useRef<HTMLInputElement | null>(null);

  // modal
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const publishedRef = useRef<HTMLInputElement | null>(null);

  // image upload + preview
  const fileRef = useRef<HTMLInputElement | null>(null);

  // lo que se sube al guardar (si existe)
  const [editingImageFile, setEditingImageFile] = useState<File | null>(null);

  // preview local (objectURL) para ver la imagen/crop antes de subir
  const [tempPreviewUrl, setTempPreviewUrl] = useState<string | null>(null);

  // cropper
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const cropTempObjectUrlRef = useRef<string | null>(null);

  // preview cliente
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      console.log("UPLOAD ROLE:", data.session ? "authenticated" : "anon");
    })();
  }, []);

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

  const closeModal = () => {
    setOpen(false);
    setEditing(null);
    setEditingImageFile(null);

    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);

    if (fileRef.current) fileRef.current.value = "";

    if (cropTempObjectUrlRef.current) {
      URL.revokeObjectURL(cropTempObjectUrlRef.current);
      cropTempObjectUrlRef.current = null;
    }
    setCropOpen(false);
    setCropSourceUrl(null);

    setPreviewOpen(false);
  };

  const startCreate = () => {
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

  // ✅ Abre el recorte, soporta URL remota (fetch -> blob) para evitar canvas tainted
  const openCropperWithUrl = async (url: string) => {
    try {
      if (!url) return;

      if (cropTempObjectUrlRef.current) {
        URL.revokeObjectURL(cropTempObjectUrlRef.current);
        cropTempObjectUrlRef.current = null;
      }

      // local (blob:...) directo
      if (!/^https?:\/\//i.test(url)) {
        setCropSourceUrl(url);
        setCropOpen(true);
        return;
      }

      // remoto -> blob -> objectURL
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

  // ✅ Flujo simple: al elegir imagen, abre el popup inmediatamente
  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Elegí una imagen (JPG/PNG/WebP).");
      e.target.value = "";
      return;
    }

    // guardo el original (si cancelás el crop, igual queda seleccionado)
    setEditingImageFile(file);

    const url = URL.createObjectURL(file);
    setLocalPreview(url);

    // ✅ popup con imagen completa, recortás ahí y confirmás
    openCropperWithUrl(url);
  };

  const removeImage = () => {
    setEditingImageFile(null);

    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);

    setEditing((prev) => (prev ? { ...prev, image: "" } : prev));
    if (fileRef.current) fileRef.current.value = "";
  };

  const onCropConfirm = (file: File, previewUrl: string) => {
    setEditingImageFile(file); // se sube el recorte
    setLocalPreview(previewUrl); // se ve el recorte

    setEditing((prev) => (prev ? { ...prev, imagePosition: 50 } : prev));

    setCropOpen(false);
    setCropSourceUrl(null);

    if (cropTempObjectUrlRef.current) {
      URL.revokeObjectURL(cropTempObjectUrlRef.current);
      cropTempObjectUrlRef.current = null;
    }
  };

  const save = async () => {
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

      if (editingImageFile) {
        finalImageUrl = await uploadNewsImage(editingImageFile, editing.id);
      } else {
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
      imageUrl:
        editing.image && editing.image.trim()
          ? editing.image
          : "https://picsum.photos/seed/news-placeholder/900/520",
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
          <div className="pageSub">Cards del cliente: imagen + tipo + fecha + título + descripción + botón + link.</div>
        </div>

        <button className="btnSmall" onClick={startCreate}>
          + Nueva novedad
        </button>
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

                <div className="roomsGrid">
                  {list.map((n) => (
                    <div key={n.id} className="roomCard">
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

                      <div className="roomBody">
                        <div className="roomTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <span>{n.title || TYPE_LABEL[n.type]}</span>
                          <span style={{ fontSize: 12, opacity: 0.8 }}>{n.publishedAt}</span>
                        </div>

                        <div style={{ opacity: 0.75, fontSize: 11, marginBottom: 6 }}>{TYPE_LABEL[n.type]}</div>

                        {n.description ? (
                          <div
                            style={{ opacity: 0.82, fontSize: 12, marginBottom: 8, lineHeight: 1.3 }}
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.description) }}
                          />
                        ) : null}

                        <div className="roomActions">
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

                        <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8 }}>
                          Botón en cliente: <b>{CTA_LABEL[n.ctaMode]}</b>
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

                  {/* ✅ Imagen: simple (Elegir + Quitar). Re-crop: click en la preview */}
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
                          onClick={() => openCropperWithUrl(editing.image)}
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
            onClose={() => {
              setCropOpen(false);
              setCropSourceUrl(null);

              if (cropTempObjectUrlRef.current) {
                URL.revokeObjectURL(cropTempObjectUrlRef.current);
                cropTempObjectUrlRef.current = null;
              }
            }}
            onConfirm={onCropConfirm}
          />

          {/* Vista previa cliente */}
          {previewOpen && currentPreviewData ? (
            <ClientCardPreview item={currentPreviewData as any} onClose={() => setPreviewOpen(false)} />
          ) : null}
        </>
      )}
    </div>
  );
}

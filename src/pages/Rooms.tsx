import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { QRCodeCanvas } from "qrcode.react";
import { TEMPLATE_URLS } from "../lib/imageTemplates";
import { readImageSize, aspectMatches } from "../lib/imageAspect";
import { useToasts, ToastStack } from "../components/Toast";
import GoldenTicketManagementModal from "../components/GoldenTicketManagementModal";
import {
  fetchGrantedCount,
  GOLDEN_TICKET_IMAGE_URL,
  GOLDEN_TICKET_LIMIT,
} from "../lib/goldenTickets";

type RoomCategory = "WOW" | "CLASICO" | "DESPEDIDA";

const ROOM_CATEGORY_LABEL: Record<RoomCategory, string> = {
  WOW: "WOW",
  CLASICO: "Clásico",
  DESPEDIDA: "Despedida",
};
type RoomLevel = "FACIL" | "INTERMEDIO" | "AVANZADO";

type BranchRow = { id: string; name: string };

type Room = {
  id: string;
  branch_id?: string | null;

  cardPhoto: string;
  bannerPhoto: string;

  name: string;
  slug?: string;
  description: string;

  category: RoomCategory;
  level: RoomLevel;

  branch: string;

  tags: string[];
  reserveUrl: string;
  whatsappPhone: string;

  playersMin: number;
  playersMax: number;
  difficulty: number;
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
  canManageUsers: boolean;
};

type MyAuth = {
  isAuthed: boolean;
  isSuper: boolean;
  isGM: boolean;
  isBranchScoped: boolean;
  branchId: string | null;
  perms: StaffPerms;
  ready: boolean;
};

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

const clamp =(n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const isMMSS = (v: string) => /^\d{2}:\d{2}$/.test(v);

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

const makeRoomQr = (roomId: string) => `EG-ROOM-${roomId}`;

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

function fromDb(row: any): Room {
  const qr = String(row.qr_code || "").trim();
  return {
    id: row.id,
    branch_id: row.branch_id ?? null,

    cardPhoto: String(row.card_photo_url || row.photo_url || ""),
    bannerPhoto: String(row.banner_photo_url || row.photo_url || ""),

    name: row.name || "",
    slug: row.slug || "",
    description: row.description || "",

    category: (row.category as RoomCategory) || "WOW",
    level: (row.level as RoomLevel) || "FACIL",

    branch: String(row.branch || "").trim(),

    tags: Array.isArray(row.tags) ? normalizeThemes(row.tags.map(String)) : [],

    reserveUrl: String(row.reserve_url || ""),
    whatsappPhone: String(row.whatsapp_phone || ""),

    playersMin: Number(row.players_min ?? 1),
    playersMax: Number(row.players_max ?? 6),

    difficulty: Number(row.difficulty ?? 5),
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

    name: room.name,
    slug: room.slug || null,
    description: room.description || null,

    category: room.category,
    level: room.level,

    branch: room.branch || null,
    branch_id: room.branch_id ?? null,

    tags: normalizeThemes(room.tags || []),

    reserve_url: room.reserveUrl ? room.reserveUrl.trim() : null,
    whatsapp_phone: room.whatsappPhone ? room.whatsappPhone.trim() : null,

    players_min: clamp(Number(room.playersMin ?? 1), 1, 50),
    players_max: clamp(Number(room.playersMax ?? 6), 1, 50),

    difficulty: clamp(Number(room.difficulty ?? 5), 1, 10),
    surprise: clamp(Number(room.surprise ?? 5), 1, 10),

    record1: room.record1,
    record2: room.record2,

    points: clamp(Number(room.points ?? 1), 1, 3),

    photo_url: room.bannerPhoto || room.cardPhoto || null,
    card_photo_url: room.cardPhoto || null,
    banner_photo_url: room.bannerPhoto || null,

    /* photo_position / photo_zoom son placebo: la app lee photo_position pero
       nunca la aplica al render, y photo_zoom no la lee nunca. No se pueden
       mandar en null porque ambas son NOT NULL en rooms_v2, así que se
       normalizan al default para limpiar valores viejos. */
    photo_position: 50,
    photo_zoom: 1,

    qr_code: room.qrCode ? room.qrCode.trim() : null,

    active: !!room.active,
    updated_at: new Date().toISOString(),
  };
}

async function uploadRoomImage(file: File, roomId: string, kind: "card" | "banner"): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
  const path = `rooms/${roomId}/${kind}-${Date.now()}.${safeExt}`;

  const { error: upErr } = await supabase.storage.from("rooms").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from("rooms").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("No pude obtener la URL pública de la imagen.");
  return data.publicUrl;
}

/* =========================
   QR DE SALA: HOJA PNG + IMPRESIÓN
   ========================================================================
   Tanto el PNG como la impresión salen del mismo layout: título arriba, QR
   grande al medio y código + metadata abajo. El canvas visible del modal es
   de 320px, así que para exportar se usa uno oculto de 480 y no se escala.
========================= */

type RoomQrMeta = {
  name: string;
  code: string;
  branch: string;
  category: string;
};

const QR_SHEET_W = 600;
const QR_SHEET_H = 720;
const QR_SHEET_PAD = 40;
const QR_SHEET_QR = 480;

/** Tamaño del canvas oculto que se usa para exportar/imprimir. */
const QR_EXPORT_SIZE = 480;
/** Tamaño del QR que se ve en pantalla. */
const QR_VIEW_SIZE = 320;

const QR_TITLE_FONT = (px: number) =>
  `800 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
const QR_MONO_FONT = (px: number) =>
  `600 ${px}px ui-monospace, SFMono-Regular, Menlo, monospace`;
const QR_BODY_FONT = (px: number) =>
  `400 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;

const slugify = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "qr-sala";

const roomQrMetaLine = (meta: RoomQrMeta) =>
  [meta.branch, meta.category]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" · ");

const escapeHtml = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Baja el tamaño de fuente hasta que el texto entre en el ancho útil. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  startPx: number,
  minPx: number,
  font: (px: number) => string
) {
  let px = startPx;
  ctx.font = font(px);

  while (px > minPx && ctx.measureText(text).width > maxW) {
    px -= 1;
    ctx.font = font(px);
  }
}

function downloadRoomQrPng(canvasId: string, meta: RoomQrMeta) {
  const src = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!src) return alert("No encontré el QR (canvas) para exportar.");

  const out = document.createElement("canvas");
  out.width = QR_SHEET_W;
  out.height = QR_SHEET_H;

  const ctx = out.getContext("2d");
  if (!ctx) return alert("No pude preparar el canvas de exportación.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, QR_SHEET_W, QR_SHEET_H);

  const cx = QR_SHEET_W / 2;
  const usable = QR_SHEET_W - QR_SHEET_PAD * 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Título
  const name = String(meta.name || "Sala").trim();
  fitFont(ctx, name, usable, 32, 16, QR_TITLE_FONT);
  ctx.fillStyle = "#0f172a";

  const titleBaseline = QR_SHEET_PAD + 32;
  ctx.fillText(name, cx, titleBaseline);

  // QR (sin suavizado: los módulos tienen que quedar duros)
  const qrY = titleBaseline + 24;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, cx - QR_SHEET_QR / 2, qrY, QR_SHEET_QR, QR_SHEET_QR);

  // Código
  let y = qrY + QR_SHEET_QR + 44;
  fitFont(ctx, meta.code, usable, 20, 10, QR_MONO_FONT);
  ctx.fillStyle = "#0f172a";
  ctx.fillText(meta.code, cx, y);

  // Sucursal · categoría
  const metaLine = roomQrMetaLine(meta);
  if (metaLine) {
    y += 30;
    fitFont(ctx, metaLine, usable, 16, 10, QR_BODY_FONT);
    ctx.fillStyle = "#475569";
    ctx.fillText(metaLine, cx, y);
  }

  out.toBlob((blob) => {
    if (!blob) return alert("No pude generar el PNG.");

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(meta.name)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, "image/png");
}

function printRoomQrSheet(canvasId: string, meta: RoomQrMeta) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  if (!canvas) return alert("No encontré el QR (canvas) para imprimir.");

  const dataUrl = canvas.toDataURL("image/png");
  const metaLine = roomQrMetaLine(meta);

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

  doc.open();
  doc.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(meta.name)}</title>
        <style>
          @page { margin: 12mm; }

          html, body { margin:0; padding:0; background:#fff; }

          body {
            font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
            color:#0f172a;
          }

          .sheet {
            width:${QR_SHEET_W}px;
            max-width:100%;
            margin:0 auto;
            padding:${QR_SHEET_PAD}px;
            box-sizing:border-box;
            display:flex;
            flex-direction:column;
            align-items:center;
            text-align:center;
          }

          h1 { margin:0 0 16px 0; font-size:32px; font-weight:800; line-height:1.15; }

          img.qr {
            width:${QR_SHEET_QR}px;
            height:${QR_SHEET_QR}px;
            max-width:100%;
            image-rendering: pixelated;
            display:block;
          }

          .code {
            margin-top:24px;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size:20px;
            font-weight:600;
            word-break:break-all;
          }

          .meta { margin-top:10px; font-size:16px; color:#475569; }

          /* El iframe sólo tiene esta hoja, pero se deja explícito para que no
             se cuele nada del user-agent stylesheet al imprimir. */
          @media print {
            .sheet { padding:0; page-break-inside: avoid; }
            img.qr { image-rendering: pixelated; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <h1>${escapeHtml(meta.name)}</h1>
          <img class="qr" id="qrimg" src="${dataUrl}" alt="" />
          <div class="code">${escapeHtml(meta.code)}</div>
          ${metaLine ? `<div class="meta">${escapeHtml(metaLine)}</div>` : ""}
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
    } catch {
      // ya se sacó
    }
  };

  iframe.contentWindow?.addEventListener("afterprint", remove);
  setTimeout(remove, 15000);
}

/* =========================
   CROP POPUP (SALAS)
========================= */

/* Aspects reales que usa la app cliente.
   card   -> rooms_v2.card_photo_url   (listado + salas realizadas, caja 1:1)
   banner -> rooms_v2.banner_photo_url (vista previa de sala, caja 2.4:1) */
const ROOM_CARD_ASPECT = 1;
const ROOM_BANNER_ASPECT = 2.4;

type ImageSlot = "card" | "banner";

const ROOM_IMAGE_SPECS: Record<
  ImageSlot,
  { aspect: number; ratioLabel: string; sizeLabel: string; w: number; h: number; templateUrl: string }
> = {
  card: {
    aspect: ROOM_CARD_ASPECT,
    ratioLabel: "1:1",
    sizeLabel: "1200 × 1200 px (cuadrado)",
    w: 1200,
    h: 1200,
    templateUrl: TEMPLATE_URLS.roomCard,
  },
  banner: {
    aspect: ROOM_BANNER_ASPECT,
    ratioLabel: "2.4:1",
    sizeLabel: "1440 × 600 px (aspect 2.4:1)",
    w: 1440,
    h: 600,
    templateUrl: TEMPLATE_URLS.roomBanner,
  },
};

/**
 * Previa del recorte final: caja con el aspect exacto de la app y un overlay
 * punteado marcando los bordes de esa caja. Lo que se ve acá es lo que se ve
 * en la app (el crop siempre es centrado, no hay reencuadre del lado cliente).
 */
function CropPreview({ slot, src }: { slot: ImageSlot; src: string }) {
  const spec = ROOM_IMAGE_SPECS[slot];
  const title = slot === "banner" ? "Banner (vista previa de sala)" : "Card (listado)";

  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 6 }}>
        {title} — {spec.ratioLabel}
      </div>

      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: String(spec.aspect),
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(0,0,0,.25)",
        }}
      >
        {src ? (
          <img
            src={src}
            alt={`Previa ${slot}`}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 16,
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Sin imagen {slot === "banner" ? "de banner" : "de card"}.
          </div>
        )}

        {/* Bordes de la caja esperada */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: "1px dashed rgba(125,211,252,.55)",
            borderRadius: 16,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

/** Helper text + link de plantilla + aviso de aspect, por slot. */
function ImageSpecHelp({ slot, warning }: { slot: ImageSlot; warning?: string }) {
  const spec = ROOM_IMAGE_SPECS[slot];

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 12, opacity: 0.78 }}>
        Medidas requeridas: <b>{spec.sizeLabel}</b>
      </div>

      {spec.templateUrl ? (
        <a
          href={spec.templateUrl}
          download
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: "#7dd3fc", textDecoration: "none", width: "fit-content" }}
        >
          📐 Descargar plantilla
        </a>
      ) : null}

      {warning ? (
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.4,
            color: "#fca5a5",
            border: "1px solid #991b1b",
            background: "rgba(63,18,20,.55)",
            borderRadius: 10,
            padding: "8px 10px",
          }}
        >
          ⚠️ {warning}
        </div>
      ) : null}
    </div>
  );
}

type CropModalState = {
  open: boolean;
  srcUrl: string;
  originalFile: File;
};

type NatImg = { w: number; h: number };
type CropRect = { x: number; y: number; w: number; h: number };
type Handle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
type DragMode = "move" | "resize" | null;

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
  const next: CropRect = {
    x: cx - nw / 2,
    y: cy - nh / 2,
    w: nw,
    h: nh,
  };
  return clampRectToImage(next, nat, minSize);
}

/** Rect más grande posible con ese aspect, centrado dentro de la imagen. */
function largestRectForAspect(nat: NatImg, aspect: number): CropRect {
  let w = nat.w;
  let h = w / aspect;

  if (h > nat.h) {
    h = nat.h;
    w = h * aspect;
  }

  return { x: (nat.w - w) / 2, y: (nat.h - h) / 2, w, h };
}

function applyAspectFromAnchor(rect: CropRect, nat: NatImg, handle: Handle, aspect: number, minSize = 80): CropRect {
  let r = { ...rect };
  const controlsW = handle.includes("e") || handle.includes("w");
  if (controlsW) r.h = r.w / aspect;
  else r.w = r.h * aspect;

  if (handle.includes("n")) r.y = r.y + (rect.h - r.h);
  if (handle.includes("w")) r.x = r.x + (rect.w - r.w);

  return clampRectToImage(r, nat, minSize);
}

/* =======================
   ICONOS SVG
======================= */

/* =========================
   ACORDEÓN DEL FORM DE SALA
   ========================================================================
   Sólo reorganiza los campos que ya existían: no hay estado del form acá, el
   `editing` sigue siendo la única fuente de verdad y Guardar manda todo aunque
   haya secciones cerradas.
========================= */

type SectionKey = "general" | "categoria" | "imagenes" | "contacto" | "records";

const FORM_SECTIONS: { key: SectionKey; title: string; hint: string }[] = [
  { key: "general", title: "General", hint: "Nombre, sucursal, estado y descripción" },
  {
    key: "categoria",
    title: "Categoría y dificultad",
    hint: "Tipo, nivel, temáticas, jugadores y puntaje",
  },
  { key: "imagenes", title: "Imágenes", hint: "Card 1200×1200 y banner 1440×600" },
  { key: "contacto", title: "Contacto y reserva", hint: "Teléfono, link de reserva y QR único" },
  { key: "records", title: "Récords históricos", hint: "Mejores tiempos publicados (MM:SS)" },
];

/* Estilos compartidos por los campos del form, para no repetirlos por campo. */
const formLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#cbd5e1",
};

const formFieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 0,
};

const formPanelStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 18,
  background: "rgba(255,255,255,.03)",
  padding: 16,
  minWidth: 0,
};

/* auto-fit + minmax: 2–3 columnas si entran, apilado en mobile. */
const formRowStyle = (min: number): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap: 14,
});

/* Multi-open: abrir una sección no cierra las otras. */
const INITIAL_SECTIONS: Record<SectionKey, boolean> = {
  general: true,
  categoria: false,
  imagenes: false,
  contacto: false,
  records: false,
};

function FormSection({
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 8,
        background: "rgba(255,255,255,.02)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "rgba(255,255,255,.04)",
          border: "none",
          borderBottom: `1px solid ${open ? "rgba(255,255,255,.08)" : "transparent"}`,
          color: "#e2e8f0",
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>{title}</span>
          <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "#94a3b8" }}>
            {hint}
          </span>
        </span>

        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            flex: "0 0 auto",
            color: "#94a3b8",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform .2s ease",
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="egSectionBody" style={{ padding: 20 }}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function Icon({
  name,
  size = 16,
  style,
}: {
  name:
    | "dots"
    | "edit"
    | "eye"
    | "toggle"
    | "trash"
    | "qr"
    | "records"
    | "link"
    | "refresh"
    | "copy"
    | "image";
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
        <path
          d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "toggle") {
    return (
      <svg {...common}>
        <path
          d="M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="12" r="3" fill="currentColor" />
      </svg>
    );
  }

  if (name === "qr") {
    return (
      <svg {...common}>
        <path d="M4 4h6v6H4V4Z" stroke="currentColor" strokeWidth="2" />
        <path d="M14 4h6v6h-6V4Z" stroke="currentColor" strokeWidth="2" />
        <path d="M4 14h6v6H4v-6Z" stroke="currentColor" strokeWidth="2" />
        <path d="M14 14h2v2h-2v-2Z" fill="currentColor" />
        <path d="M18 14h2v2h-2v-2Z" fill="currentColor" />
        <path d="M14 18h2v2h-2v-2Z" fill="currentColor" />
        <path d="M18 18h2v2h-2v-2Z" fill="currentColor" />
      </svg>
    );
  }

  if (name === "records") {
    return (
      <svg {...common}>
        <path d="M6 20V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 20V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M18 20v-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "link") {
    return (
      <svg {...common}>
        <path d="M10.5 13.5 13.5 10.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M8 14a4 4 0 0 1 0-6l1.5-1.5a4 4 0 0 1 6 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M16 10a4 4 0 0 1 0 6L14.5 17.5a4 4 0 0 1-6 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "refresh") {
    return (
      <svg {...common}>
        <path d="M20 11a8 8 0 1 0 2 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === "copy") {
    return (
      <svg {...common}>
        <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" />
        <path
          d="M15 9V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v5a3 3 0 0 0 3 3h2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (name === "image") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="2" />
        <circle cx="9" cy="10" r="1.6" fill="currentColor" />
        <path
          d="M21 16l-4.8-4.8a1.5 1.5 0 0 0-2.1 0L8 17.3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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

export default function Rooms() {
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const branchesById = useMemo(() => {
    const m = new Map<string, string>();
    branches.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [branches]);
  const branchesByName = useMemo(() => {
    const m = new Map<string, string>();
    branches.forEach((b) => m.set(b.name, b.id));
    return m;
  }, [branches]);

  const [items, setItems] = useState<Room[]>([]);
  const [q, setQ] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const cardFileRef = useRef<HTMLInputElement | null>(null);
const bannerFileRef = useRef<HTMLInputElement | null>(null);

const [editingCardPhotoFile, setEditingCardPhotoFile] = useState<File | null>(null);
const [editingBannerPhotoFile, setEditingBannerPhotoFile] = useState<File | null>(null);

const [tempCardPreviewUrl, setTempCardPreviewUrl] = useState<string | null>(null);
const [tempBannerPreviewUrl, setTempBannerPreviewUrl] = useState<string | null>(null);

const [cropTarget, setCropTarget] = useState<ImageSlot | null>(null);

  /** Aviso de aspect ratio del archivo elegido, por slot. */
  const [aspectWarn, setAspectWarn] = useState<Partial<Record<ImageSlot, string>>>({});

  const { toasts, toast, dismiss } = useToasts();

  const [themesOpen, setThemesOpen] = useState(false);
  const themesWrapRef = useRef<HTMLDivElement | null>(null);

  const [descModal, setDescModal] = useState<{ title: string; text: string } | null>(null);

  const [recordsModal, setRecordsModal] = useState<{
    roomId: string;
    roomName: string;
    record1: string;
    record2: string;
  } | null>(null);

  const [qrModal, setQrModal] = useState<{
    name: string;
    value: string;
    /** Canvas visible del modal. */
    canvasId: string;
    /** Canvas oculto a 480px que alimenta el PNG y la impresión. */
    exportCanvasId: string;
    code: string;
    branch: string;
    category: string;
  } | null>(null);

  /* Acordeón del form de sala: multi-open, sin persistir. */
  const [openSections, setOpenSections] =
    useState<Record<SectionKey, boolean>>(INITIAL_SECTIONS);

  /* Para poder saltar al campo que falló la validación aunque su sección esté
     cerrada. */
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

  const toggleSection = (key: SectionKey) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const setFieldRef = (key: string) => (el: HTMLElement | null) => {
    fieldRefs.current[key] = el;
  };

  /**
   * Abre la sección del campo, hace scroll hasta él y lo enfoca. El `alert` de
   * la validación bloquea el hilo, así que el timeout corre recién cuando el
   * usuario lo cierra: para entonces React ya montó la sección.
   */
  const focusFormField = (section: SectionKey, field: string) => {
    setOpenSections((prev) => (prev[section] ? prev : { ...prev, [section]: true }));

    setTimeout(() => {
      const el = fieldRefs.current[field];
      if (!el) return;

      el.scrollIntoView({ behavior: "smooth", block: "center" });

      if (typeof el.focus === "function") el.focus({ preventScroll: true });
    }, 150);
  };

  /** Corta el submit avisando y llevando al campo culpable. */
  const failField = (section: SectionKey, field: string, message: string) => {
    focusFormField(section, field);
    alert(message);
  };

  const [goldenOpen, setGoldenOpen] = useState(false);
  const [goldenGranted, setGoldenGranted] = useState<number | null>(null);
  /* El PNG puede no estar subido todavía: si falla, va el placeholder dorado. */
  const [goldenImgFailed, setGoldenImgFailed] = useState(false);

  const [me, setMe] = useState<MyAuth>({
    isAuthed: false,
    isSuper: false,
    isGM: false,
    isBranchScoped: false,
    branchId: null,
    perms: { canManageRooms: false, canEditRankings: false, canManageUsers: false },
    ready: false,
  });

  const [cropModal, setCropModal] = useState<CropModalState | null>(null);
  const [natImg, setNatImg] = useState<NatImg | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);

  const cropStageRef = useRef<HTMLDivElement | null>(null);

  const dragModeRef = useRef<DragMode>(null);
  const dragHandleRef = useRef<Handle | null>(null);
  const dragStartRef2 = useRef<{ px: number; py: number; rect: CropRect } | null>(null);

  const cursorRef = useRef<string>("default");

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const selectedThemes = normalizeThemes(editing?.tags || []);
  const atThemesLimit = selectedThemes.length >= 4;

  const canCreateRoom = me.isSuper || me.perms.canManageRooms;
  const canManageRoomFull = me.isSuper || me.perms.canManageRooms;

  /* Golden Tickets vive como card clickeable acá adentro; el permiso es el
     mismo que gobernaba la vieja página. */
  const canSeeGoldenTickets = me.isSuper || me.perms.canManageUsers;

const canEditRankings =
  me.isSuper ||
  me.perms.canEditRankings ||
  me.isGM; // 👈 CLAVE

  const myBranchName = me.branchId ? branchesById.get(me.branchId) || "" : "";

  const badge = (txt: string, kind: "type" | "on" | "off" | "hot" = "type") => {
    const bg =
      kind === "hot"
        ? "rgba(255,165,0,0.18)"
        : kind === "on"
        ? "rgba(0,255,242,0.12)"
        : kind === "off"
        ? "rgba(255,0,0,0.16)"
        : "rgba(255,255,255,0.10)";
    const br =
      kind === "on"
        ? "1px solid rgba(0,255,242,0.28)"
        : kind === "off"
        ? "1px solid rgba(255,0,0,0.22)"
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

  const portalMenuStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 9999,
  width: 270,
  borderRadius: 16,
  overflow: "hidden",
  border: "1px solid #1f2937",
  background: "linear-gradient(180deg, #111827 0%, #0b1220 100%)",
  boxShadow: "0 20px 40px rgba(0,0,0,0.28)",
};

const portalItemStyle: React.CSSProperties = {
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
  fontWeight: 400,
  fontSize: 14,
  cursor: "pointer",
  textAlign: "left",
};

const portalDividerStyle: React.CSSProperties = {
  height: 1,
  background: "#1f2937",
};

const portalDangerItemStyle: React.CSSProperties = {
  ...portalItemStyle,
  color: "#fca5a5",
};

const menuItemHoverOn = (el: HTMLButtonElement) => {
  el.style.background = "rgba(255,255,255,0.05)";
};

const menuItemHoverOff = (el: HTMLButtonElement) => {
  el.style.background = "transparent";
};

const menuDangerHoverOn = (el: HTMLButtonElement) => {
  el.style.background = "rgba(248,113,113,0.10)";
};

const menuDangerHoverOff = (el: HTMLButtonElement) => {
  el.style.background = "transparent";
};

  const computeMenuPosFromAnchor = () => {
    const btn = menuAnchorRef.current;
    if (!btn) return null;

    const r = btn.getBoundingClientRect();

    const top = r.top;
    const left = r.right;

    const MENU_W = 270;
    const MENU_H = 300;
    const gap = 10;

    let x = left + gap;
    const maxX = window.innerWidth - 12 - MENU_W;
    if (x > maxX) x = r.left - gap - MENU_W;
    if (x < 12) x = 12;

    let y = top - 6;
    const maxY = window.innerHeight - 12 - MENU_H;
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

  useEffect(() => {
    document.body.classList.add("rooms-fullwidth");
    return () => document.body.classList.remove("rooms-fullwidth");
  }, []);

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
      setDescModal(null);
      setRecordsModal(null);
      setQrModal(null);
      closeMenu();
      if (cropModal?.open) closeCropModal();
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [themesOpen, cropModal?.open]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.from("branches").select("id,name").order("name");
      if (!mounted) return;
      if (error) {
        console.error(error);
        alert("Error cargando sucursales (branches).");
        setBranches([]);
      } else {
        setBranches((data as BranchRow[]) ?? []);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
              perms: {
                canManageRooms: false,
                canEditRankings: false,
                canManageUsers: false,
              },
              ready: true,
            });
          }
          return;
        }

        const isSuper = Boolean(row.is_super);
        const branchId = row.branch_id ? String(row.branch_id) : null;
        const isGM = !isSuper && Boolean(row.gm_code);
        const isBranchScoped = !isSuper && !!branchId;

        const permsRaw = (row.permissions || {}) as Partial<StaffPerms>;
        const perms: StaffPerms = {
          canManageRooms: Boolean((permsRaw as any).canManageRooms),
          canEditRankings: Boolean((permsRaw as any).canEditRankings),
          canManageUsers: Boolean((permsRaw as any).canManageUsers),
        };

        if (mounted) {
          setMe({
            isAuthed: true,
            isSuper,
            isGM,
            isBranchScoped,
            branchId,
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

  useEffect(() => {
    if (!me.ready) return;

    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        let query = supabase.from("rooms_v2").select("*").order("created_at", { ascending: false });

        if (me.isBranchScoped) {
          if (!me.branchId) {
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
    };
  }, [me.ready, me.isBranchScoped, me.branchId]);

  /* Sólo el contador de la stat card: el resto de las queries de Golden Tickets
     (secret, pendientes) se hacen recién al abrir el modal. */
  useEffect(() => {
    if (!me.ready || !canSeeGoldenTickets) return;

    let mounted = true;

    (async () => {
      try {
        const count = await fetchGrantedCount();
        if (mounted) setGoldenGranted(count);
      } catch (e) {
        console.error("golden ticket count failed", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [me.ready, canSeeGoldenTickets]);

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

    const onScrollResize = () => {
      if (!menuOpenId) return;
      const pos = computeMenuPosFromAnchor();
      if (pos) setMenuPos(pos);
      else closeMenu();
    };

    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);

    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [menuOpenId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return items.filter((r) => {
      const name = String(r.name || "").toLowerCase();
      const branchName = String(r.branch || (r.branch_id ? branchesById.get(r.branch_id) || "" : "")).toLowerCase();

      const okSearch = !s ? true : name.includes(s) || branchName.includes(s);
      const okBranch = !branchFilter ? true : (r.branch || "") === branchFilter;
      const okScoped = me.isBranchScoped && me.branchId ? r.branch_id === me.branchId : true;

      return okSearch && okBranch && okScoped;
    });
  }, [items, q, branchFilter, me.isBranchScoped, me.branchId, branchesById]);

  const totals = useMemo(() => ({
    totalRooms: filtered.length,
    activeRooms: filtered.filter((r) => r.active).length,
    inactiveRooms: filtered.filter((r) => !r.active).length,
  }), [filtered]);

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

  const closeModal = () => {
  setOpen(false);
  setEditing(null);

  setEditingCardPhotoFile(null);
  setEditingBannerPhotoFile(null);

  setThemesOpen(false);
  closeMenu();

  if (tempCardPreviewUrl) URL.revokeObjectURL(tempCardPreviewUrl);
  if (tempBannerPreviewUrl) URL.revokeObjectURL(tempBannerPreviewUrl);

  setTempCardPreviewUrl(null);
  setTempBannerPreviewUrl(null);

  if (cardFileRef.current) cardFileRef.current.value = "";
  if (bannerFileRef.current) bannerFileRef.current.value = "";

  setCropTarget(null);

  if (cropModal?.open) closeCropModal();
};

  const startCreate = () => {
    if (!canCreateRoom) return alert("No tenés permiso para crear salas.");

    const defaultBranchName = (me.isBranchScoped ? myBranchName : branches[0]?.name) || "Nuñez";
    const defaultBranchId = (me.isBranchScoped ? me.branchId : branchesByName.get(defaultBranchName) || null) || null;

    if (me.isBranchScoped && !defaultBranchId) {
      return alert("Tenés permisos, pero tu usuario no tiene sucursal asignada.");
    }

    const id = crypto.randomUUID();

    setEditing({
      id,
      branch_id: defaultBranchId,
      branch: defaultBranchName,

      cardPhoto: "",
      bannerPhoto: "",

      name: "",
      slug: "",
      description: "",

      category: "WOW",
      level: "FACIL",

      tags: [],
      reserveUrl: "",
      whatsappPhone: "",

      playersMin: 1,
      playersMax: 6,
      difficulty: 5,
      surprise: 5,

      record1: "00:00",
      record2: "00:00",
      points: 1,

      qrCode: makeRoomQr(id),
      active: true,
    });

    setEditingCardPhotoFile(null);
    setEditingBannerPhotoFile(null);

    if (tempCardPreviewUrl) URL.revokeObjectURL(tempCardPreviewUrl);
    if (tempBannerPreviewUrl) URL.revokeObjectURL(tempBannerPreviewUrl);

    setTempCardPreviewUrl(null);
    setTempBannerPreviewUrl(null);
    setCropTarget(null);

    setOpenSections(INITIAL_SECTIONS);
    fieldRefs.current = {};

    setOpen(true);
  };

  const openRecordsEditor = (r: Room) => {
    if (!canEditRankings) return alert("No tenés permiso para editar récords.");
    if (me.isBranchScoped && me.branchId && r.branch_id !== me.branchId) {
      return alert("No podés editar salas de otra sucursal.");
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

    if (!isMMSS(r1) || !isMMSS(r2)) {
      return alert("Formato inválido. Usá MM:SS (ej: 12:34).");
    }

    setSaving(true);
    try {
      const payload = { record1: r1, record2: r2, updated_at: new Date().toISOString() };

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

    if (me.isBranchScoped && me.branchId && r.branch_id !== me.branchId) {
      return alert("No podés editar salas de otra sucursal.");
    }

    setEditing({
      ...r,
      tags: Array.isArray(r.tags) ? normalizeThemes(r.tags) : [],
      reserveUrl: r.reserveUrl || "",
      whatsappPhone: r.whatsappPhone || "",
      qrCode: (r.qrCode || "").trim() || makeRoomQr(r.id),
      branch: r.branch || (r.branch_id ? branchesById.get(r.branch_id) || "" : ""),
    });

    setEditingCardPhotoFile(null);
    setEditingBannerPhotoFile(null);

    if (tempCardPreviewUrl) URL.revokeObjectURL(tempCardPreviewUrl);
    if (tempBannerPreviewUrl) URL.revokeObjectURL(tempBannerPreviewUrl);

    setTempCardPreviewUrl(null);
    setTempBannerPreviewUrl(null);
    setCropTarget(null);

    setOpenSections(INITIAL_SECTIONS);
    fieldRefs.current = {};

    setOpen(true);
  };
const onPickCardImage = () => {
  setCropTarget("card");
  cardFileRef.current?.click();
};

const onPickBannerImage = () => {
  setCropTarget("banner");
  bannerFileRef.current?.click();
};
  const openCropperForFile = (file: File, slot: ImageSlot) => {
    const url = URL.createObjectURL(file);

    setNatImg(null);
    setCropRect(null);
    dragModeRef.current = null;
    dragHandleRef.current = null;
    dragStartRef2.current = null;

    setCropModal({ open: true, srcUrl: url, originalFile: file });

    const img = new Image();
    img.onload = () => {
      const nat = { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
      setNatImg(nat);

      /* Arranca con el recorte más grande posible que respete el aspect
         del slot, centrado. */
      const init = largestRectForAspect(nat, ROOM_IMAGE_SPECS[slot].aspect);

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

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
  if (!canManageRoomFull) {
    e.target.value = "";
    return toast("error", "No tenés permiso para cambiar la imagen.");
  }

  const file = e.target.files?.[0] || null;
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    e.target.value = "";
    return toast("error", "Elegí una imagen (JPG/PNG/WebP).");
  }

  if (!editing) {
    e.target.value = "";
    return;
  }

  const slot = cropTarget;
  if (!slot) {
    e.target.value = "";
    return toast("error", "No se definió el destino de la imagen.");
  }

  e.target.value = "";

  const spec = ROOM_IMAGE_SPECS[slot];

  let size: { w: number; h: number };
  try {
    size = await readImageSize(file);
  } catch {
    return toast("error", "No pude leer la imagen.");
  }

  const ratio = size.w / size.h;

  if (aspectMatches(ratio, spec.aspect)) {
    setAspectWarn((prev) => ({ ...prev, [slot]: undefined }));
  } else {
    const msg =
      `Aspect ratio inválido. Necesita ${spec.ratioLabel} (ej: ${spec.w}×${spec.h}). ` +
      `La imagen que elegiste es ${size.w}×${size.h} (${ratio.toFixed(2)}:1).`;

    setAspectWarn((prev) => ({ ...prev, [slot]: msg }));
    toast("error", `${msg} Recortala en el editor para poder usarla.`, 8000);
  }

  /* Se abre igual: el recorte queda bloqueado al aspect correcto, así que
     el resultado siempre sale con el ratio que espera la app. */
  openCropperForFile(file, slot);
};

 const removeCardImage = () => {
  if (!canManageRoomFull) return alert("No tenés permiso para quitar imagen.");

  setEditingCardPhotoFile(null);

  if (tempCardPreviewUrl) URL.revokeObjectURL(tempCardPreviewUrl);
  setTempCardPreviewUrl(null);

  setEditing((prev) => (prev ? { ...prev, cardPhoto: "" } : prev));

  if (cardFileRef.current) cardFileRef.current.value = "";
};

const removeBannerImage = () => {
  if (!canManageRoomFull) return alert("No tenés permiso para quitar imagen.");

  setEditingBannerPhotoFile(null);

  if (tempBannerPreviewUrl) URL.revokeObjectURL(tempBannerPreviewUrl);
  setTempBannerPreviewUrl(null);

  setEditing((prev) => (prev ? { ...prev, bannerPhoto: "" } : prev));

  if (bannerFileRef.current) bannerFileRef.current.value = "";
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
    dragStartRef2.current = null;
    cursorRef.current = "default";
  };

  /** Aspect al que está bloqueado el recorte según el slot en edición. */
  const cropAspect = ROOM_IMAGE_SPECS[cropTarget ?? "card"].aspect;

  const applyMaxCrop = () => {
    if (!natImg) return;
    /* "Máximo" respetando el aspect del slot, no la imagen entera. */
    setCropRect(clampRectToImage(largestRectForAspect(natImg, cropAspect), natImg, 80));
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

    dragStartRef2.current = { px: mx, py: my, rect: cropRect };
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

    if (dragModeRef.current && dragStartRef2.current) {
      const start = dragStartRef2.current;
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

      /* El recorte queda siempre bloqueado al aspect del slot: la app no
         puede reencuadrar, así que lo que sale de acá tiene que ser exacto. */
      next = applyAspectFromAnchor(next, natImg, h, cropAspect, 80);

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
    dragStartRef2.current = null;

    const stage = cropStageRef.current;
    if (stage) stage.style.cursor = cursorRef.current || "default";
  };

  const onCropWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (!natImg || !cropRect) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    const factor = dir > 0 ? 1.06 : 0.94;
    const next = zoomRect(cropRect, natImg, factor, 80);
    setCropRect(next);
  };

  const onCropDoubleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    applyMaxCrop();
  };

  const confirmCrop = async () => {
    if (!cropModal || !natImg || !editing || !cropRect) return;

    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("No pude cargar la imagen para recortar."));
        img.src = cropModal.srcUrl;
      });

      const rect = clampRectToImage(cropRect, natImg, 80);

      /* Se exporta a las medidas exactas que espera la app, así el archivo
         que llega al bucket ya tiene el aspect correcto sí o sí. */
      const spec = ROOM_IMAGE_SPECS[cropTarget ?? "card"];

      const canvas = document.createElement("canvas");
      canvas.width = spec.w;
      canvas.height = spec.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No pude abrir canvas para recortar.");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, spec.w, spec.h);

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No pude exportar el recorte."))), "image/jpeg", 0.9);
      });

      const croppedFile = new File([blob], toJpegName(cropModal.originalFile.name), { type: "image/jpeg" });

      const prevUrl = URL.createObjectURL(croppedFile);

if (cropTarget === "card") {
  setEditingCardPhotoFile(croppedFile);

  if (tempCardPreviewUrl) URL.revokeObjectURL(tempCardPreviewUrl);
  setTempCardPreviewUrl(prevUrl);

  setEditing((prev) =>
    prev
      ? {
          ...prev,
          cardPhoto: prevUrl,
        }
      : prev
  );
}

if (cropTarget === "banner") {
  setEditingBannerPhotoFile(croppedFile);

  if (tempBannerPreviewUrl) URL.revokeObjectURL(tempBannerPreviewUrl);
  setTempBannerPreviewUrl(prevUrl);

  setEditing((prev) => (prev ? { ...prev, bannerPhoto: prevUrl } : prev));
}

/* El recorte ya salió con el aspect exacto: se limpia el aviso. */
if (cropTarget) setAspectWarn((prev) => ({ ...prev, [cropTarget]: undefined }));

setCropTarget(null);
      closeCropModal();
    } catch (err: any) {
      console.error(err);
      toast("error", err?.message || "Error recortando imagen.");
    }
  };

    const save = async () => {
    if (!editing) return;
    const isNew = !items.some((x) => x.id === editing.id);

    if (!canManageRoomFull) return alert("No tenés permiso para crear/editar salas completas.");

    const resolvedBranchId = editing.branch_id || (editing.branch ? branchesByName.get(editing.branch) || null : null);

    if (me.isBranchScoped) {
      if (!me.branchId) return alert("Tu usuario no tiene sucursal asignada.");

      if (resolvedBranchId && resolvedBranchId !== me.branchId) {
        return alert("No podés crear/editar en otra sucursal.");
      }

      editing.branch_id = me.branchId;
      editing.branch = myBranchName || editing.branch || "";
    } else {
      if (!resolvedBranchId) {
        return failField("general", "branch", "Elegí una sucursal válida.");
      }
      editing.branch_id = resolvedBranchId;
      editing.branch = branchesById.get(resolvedBranchId) || editing.branch || "";
    }

    if (!editing.name.trim()) {
      return failField("general", "name", "Poné el nombre de la sala.");
    }
    if (editing.reserveUrl && !isHttpUrl(editing.reserveUrl)) {
      return failField(
        "contacto",
        "reserveUrl",
        "El link de reserva debe empezar con http/https (ej: https://...)."
      );
    }
    if (!String(editing.qrCode || "").trim()) {
      return failField("contacto", "qrCode", "El QR único no puede quedar vacío.");
    }
    if (!isMMSS(editing.record1)) {
      return failField("records", "record1", "Récord 1 debe ser MM:SS (ej: 12:34).");
    }
    if (!isMMSS(editing.record2)) {
      return failField("records", "record2", "Récord 2 debe ser MM:SS (ej: 12:34).");
    }

    if (isNew && !editingCardPhotoFile && !editingBannerPhotoFile && !editing.cardPhoto && !editing.bannerPhoto) {
      return failField("imagenes", "cardPhoto", "Seleccioná al menos una imagen para la sala.");
    }

    setSaving(true);
    try {
      let finalCardPhotoUrl = String(editing.cardPhoto || "").trim();
      let finalBannerPhotoUrl = String(editing.bannerPhoto || "").trim();

      if (editingCardPhotoFile) {
        finalCardPhotoUrl = await uploadRoomImage(editingCardPhotoFile, editing.id, "card");
      }

      if (editingBannerPhotoFile) {
        finalBannerPhotoUrl = await uploadRoomImage(editingBannerPhotoFile, editing.id, "banner");
      }

      if (finalCardPhotoUrl && !/^https?:\/\//i.test(finalCardPhotoUrl)) finalCardPhotoUrl = "";
      if (finalBannerPhotoUrl && !/^https?:\/\//i.test(finalBannerPhotoUrl)) finalBannerPhotoUrl = "";

      if (isNew && !finalCardPhotoUrl && !finalBannerPhotoUrl) {
        return alert("No pude generar la URL pública de las imágenes. Revisá Storage/Policies y volvé a subir.");
      }

      const payload = toDb({
        ...editing,
        cardPhoto: finalCardPhotoUrl,
        bannerPhoto: finalBannerPhotoUrl,
        playersMin: clamp(Number(editing.playersMin ?? 1), 1, 50),
        playersMax: clamp(Number(editing.playersMax ?? 6), 1, 50),
        difficulty: clamp(Number(editing.difficulty ?? 5), 1, 10),
        surprise: clamp(Number(editing.surprise ?? 5), 1, 10),
        points: clamp(Number(editing.points ?? 1), 1, 3) as 1 | 2 | 3,
        tags: normalizeThemes(editing.tags || []),
        reserveUrl: (editing.reserveUrl || "").trim(),
        whatsappPhone: (editing.whatsappPhone || "").trim(),
        qrCode: String(editing.qrCode || "").trim(),
      });

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

    if (me.isBranchScoped && me.branchId && current.branch_id !== me.branchId) {
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

    if (me.isBranchScoped && me.branchId && room.branch_id !== me.branchId) {
      return alert("No podés borrar salas de otra sucursal.");
    }

    const ok = confirm(`¿Seguro que querés borrar "${room.name}"? Esta acción no se puede deshacer.`);
    if (!ok) return;

    const prev = items;
    setItems((p) => p.filter((x) => x.id !== room.id));

    try {
      const pathsToDelete = [room.cardPhoto, room.bannerPhoto]
        .filter(Boolean)
        .filter((url, index, arr) => arr.indexOf(url) === index)
        .filter((url) => url.includes("/storage/v1/object/public/rooms/"))
        .map((url) => {
          const idx = url.indexOf("/storage/v1/object/public/rooms/");
          return url.slice(idx + "/storage/v1/object/public/rooms/".length).split("?")[0];
        });

      if (pathsToDelete.length > 0) {
        const { error: storageErr } = await supabase.storage.from("rooms").remove(pathsToDelete);
        if (storageErr) console.warn("No pude borrar imágenes en storage:", storageErr);
      }

      const { error } = await supabase.from("rooms_v2").delete().eq("id", room.id);
      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "No pude borrar la sala (revisá RLS / permisos).");
      setItems(prev);
    }
  };  

  const cropRectStyle = useMemo(() => {
    if (!natImg || !cropRect || !cropModal?.open) return null;
    const sr = natToScreenRect(cropRect);
    if (!sr) return null;
    return { left: sr.left, top: sr.top, width: sr.width, height: sr.height } as React.CSSProperties;
  }, [natImg, cropRect, cropModal?.open]);

const scrollerStyle: React.CSSProperties = {
  width: "100%",
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "transparent",
};


const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  tableLayout: "fixed",
  minWidth: 0,
};

const thStyle: React.CSSProperties = {
  position: "sticky" as any,
  top: 0,
  zIndex: 5,
  background: "rgba(10,10,10,0.92)",
  backdropFilter: "blur(6px)",
  borderBottom: "1px solid rgba(255,255,255,0.12)",
  padding: "12px 10px",
  fontSize: 13,
  fontWeight: 900,
  textAlign: "left" as any,
  letterSpacing: 0.3,
  color: "rgba(255,255,255,0.92)",
};

const tdBase: React.CSSProperties = {
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  padding: "10px 10px",
  verticalAlign: "middle",
};

/* Tinte dorado propio para que la fila fija se lea como fijada y no como
   una sala más del listado. */
const GOLDEN_ROW_BG = "rgba(255,190,60,0.06)";
const GOLDEN_ROW_BG_HOVER = "rgba(255,190,60,0.12)";

const statCardStyle: React.CSSProperties = {
  border: "1px solid #1f2937",
  borderRadius: 18,
  background: "#0b1220",
  padding: 18,
  color: "#cbd5e1",
  minHeight: 92,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  boxSizing: "border-box",
};

  const openQr = (room: Room, value: string) => {
    const uid = crypto.randomUUID();

    setQrModal({
      name: room.name || "QR Sala",
      value,
      canvasId: `qr_modal_canvas_${uid}`,
      exportCanvasId: `qr_export_canvas_${uid}`,
      code: value,
      branch: room.branch || "",
      category: ROOM_CATEGORY_LABEL[room.category] || room.category || "",
    });
  };

return (
  <div
    style={{
      width: "100%",
      minHeight: "100vh",
      background: "#0f172a",
      color: "#e5e7eb",
      boxSizing: "border-box",
    }}
  >
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        minHeight: "100vh",
        margin: 0,
        padding: "14px 18px 18px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              lineHeight: 1.1,
              fontWeight: 900,
              color: "#fff",
            }}
          >
            Salas
          </h1>
          <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,0.65)", fontSize: 13 }}></p>
        </div>

        <div>
          {canCreateRoom ? (
            <button className="btnSmall" onClick={startCreate}>
              + Nueva sala
            </button>
          ) : null}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: !me.isBranchScoped ? "minmax(260px, 1fr) 240px" : "minmax(260px, 1fr) 240px",
          gap: 10,
          marginBottom: 14,
          alignItems: "stretch",
        }}
      >
        <div>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o sucursal…"
            style={{ width: "100%" }}
          />
        </div>

        {!me.isBranchScoped ? (
          <select
            className="input"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">Todas las sucursales</option>
            {branches.map((b) => (
              <option key={b.id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        ) : (
          <div
            className="input"
            style={{ width: "100%", opacity: 0.85, display: "flex", alignItems: "center" }}
          >
            {myBranchName ? `Sucursal: ${myBranchName}` : "Sucursal: sin asignar"}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        {[
          ["Salas visibles", totals.totalRooms],
          ["Salas activas", totals.activeRooms],
          ["Salas inactivas", totals.inactiveRooms],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            style={statCardStyle}
          >
            <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 700 }}>{label}</span>
            <strong style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
              {String(value)}
            </strong>
          </div>
        ))}
      </div>

      <div
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          borderRadius: 18,
          background: "#0b1220",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
  <div style={scrollerStyle}>
    <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 74 }}>Imagen</th>
                <th style={{ ...thStyle, width: "clamp(180px, 22vw, 260px)" as any }}>Nombre</th>
                <th style={{ ...thStyle, width: "clamp(120px, 14vw, 170px)" as any }}>Sucursal</th>
                <th style={{ ...thStyle, width: "clamp(120px, 14vw, 160px)" as any }}>Categoría</th>
                <th style={{ ...thStyle, width: "clamp(110px, 12vw, 140px)" as any }}>Nivel</th>
                <th style={{ ...thStyle, width: "clamp(110px, 12vw, 130px)" as any }}>Jugadores</th>
                <th style={{ ...thStyle, width: "clamp(110px, 12vw, 120px)" as any }}>Dificultad</th>
                <th style={{ ...thStyle, width: "clamp(110px, 12vw, 120px)" as any }}>Récords</th>
                <th style={{ ...thStyle, width: "clamp(90px, 10vw, 120px)" as any }}>Puntos</th>
                <th style={{ ...thStyle, width: "clamp(100px, 12vw, 110px)" as any }}>Estado</th>
                <th style={{ ...thStyle, width: 70, textAlign: "center" }}>⋯</th>
              </tr>
            </thead>

            <tbody>
              {/* Fila fija: no sale de `items`, así que ignora búsqueda, filtro de
                  sucursal y orden, y no entra en los contadores de arriba. */}
              {canSeeGoldenTickets ? (
                <tr
                  onClick={() => setGoldenOpen(true)}
                  style={{ background: GOLDEN_ROW_BG, cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = GOLDEN_ROW_BG_HOVER;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = GOLDEN_ROW_BG;
                  }}
                  title="Gestionar Golden Tickets"
                >
                  <td style={{ ...tdBase, padding: 8 }}>
                    <div
                      style={{
                        width: 56,
                        height: 38,
                        borderRadius: 10,
                        overflow: "hidden",
                        border: "1px solid rgba(255,190,60,.35)",
                        background: "rgba(0,0,0,.35)",
                      }}
                    >
                      {goldenImgFailed ? (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "linear-gradient(180deg, #f0c040 0%, #b8860b 100%)",
                            color: "#3b2600",
                            fontSize: 13,
                            fontWeight: 900,
                            letterSpacing: 0.5,
                          }}
                        >
                          GT
                        </div>
                      ) : (
                        <img
                          src={GOLDEN_TICKET_IMAGE_URL}
                          alt="Golden Ticket"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                          onError={() => setGoldenImgFailed(true)}
                        />
                      )}
                    </div>
                  </td>

                  <td style={{ ...tdBase }} title="Golden Ticket">
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: 13,
                        color: "rgba(255,255,255,.92)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      Golden Ticket
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11.5, color: "#94a3b8" }}>
                      {goldenGranted == null
                        ? `— / ${GOLDEN_TICKET_LIMIT} otorgados`
                        : `${goldenGranted} / ${GOLDEN_TICKET_LIMIT} otorgados`}
                    </div>
                  </td>

                  <td style={{ ...tdBase }}>—</td>
                  <td style={{ ...tdBase }}>{badge("GOLDEN", "hot")}</td>
                  <td style={{ ...tdBase }}>—</td>
                  <td style={{ ...tdBase }}>—</td>
                  <td style={{ ...tdBase }}>—</td>
                  <td style={{ ...tdBase }}>—</td>
                  <td style={{ ...tdBase }}>—</td>
                  <td style={{ ...tdBase }}>{badge("ACTIVA", "on")}</td>

                  <td style={{ ...tdBase, textAlign: "center", padding: 8 }}>
                    <button
                      type="button"
                      className="ghostBtn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setGoldenOpen(true);
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        background: "rgba(0,0,0,0.55)",
                        border: "1px solid rgba(255,190,60,0.35)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Gestionar Golden Tickets"
                      aria-label="Gestionar Golden Tickets"
                    >
                      <Icon name="qr" size={16} />
                    </button>
                  </td>
                </tr>
              ) : null}

              {loading ? (
                <tr>
                  <td style={{ ...tdBase, padding: 16 }} colSpan={11}>
                    Cargando salas…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td style={{ ...tdBase, padding: 16 }} colSpan={11}>
                    No hay salas con estos filtros.
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => {
                  const rowBg = idx % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.00)";
                  const branchName = r.branch || (r.branch_id ? branchesById.get(r.branch_id) || "" : "");

                  return (
                    <tr
                      key={r.id}
                      style={{ background: rowBg }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.04)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = rowBg;
                      }}
                    >
                      <td style={{ ...tdBase, padding: 8 }}>
                        <div
                          style={{
                            width: 56,
                            height: 38,
                            borderRadius: 10,
                            overflow: "hidden",
                            border: "1px solid rgba(255,255,255,.12)",
                            background: "rgba(0,0,0,.35)",
                          }}
                        >
                          <img
src={r.cardPhoto || r.bannerPhoto || "https://picsum.photos/seed/placeholder/900/520"}
                            alt={r.name}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = "https://picsum.photos/seed/placeholder/900/520";
                            }}
                          />
                        </div>
                      </td>

                      <td style={{ ...tdBase }} title={r.name || ""}>
                        <div
                          style={{
                            fontWeight: 900,
                            fontSize: 13,
                            color: "rgba(255,255,255,.92)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {r.name || "—"}
                        </div>
                        {Array.isArray(r.tags) && r.tags.length ? (
                          <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {r.tags.slice(0, 4).map((t) => (
                              <span
                                key={t}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 999,
                                  border: "1px solid rgba(255,255,255,.12)",
                                  background: "rgba(255,255,255,.06)",
                                  fontSize: 11,
                                  opacity: 0.92,
                                }}
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </td>

                      <td style={{ ...tdBase }} title={branchName}>
                        {branchName || "—"}
                      </td>

                      <td style={{ ...tdBase }}>
                        {badge(String(CAT_LABEL[r.category] || r.category).toUpperCase(), r.category === "WOW" ? "hot" : "type")}
                      </td>

                      <td style={{ ...tdBase }}>
                        {badge(String(LEVEL_LABEL[r.level] || r.level).toUpperCase(), "type")}
                      </td>

                      <td style={{ ...tdBase }}>
                        <span style={{ fontWeight: 900 }}>
                          {r.playersMin}–{r.playersMax}
                        </span>
                      </td>

                      <td style={{ ...tdBase }}>
                        <span style={{ fontWeight: 900 }}>{r.difficulty}/10</span>
                        <span style={{ opacity: 0.75 }}> · ✨ {r.surprise}/10</span>
                      </td>

                      <td style={{ ...tdBase }}>
                        <span title={`Récord 1: ${r.record1}\nRécord 2: ${r.record2}`}>🏆 {r.record1} · 🥈 {r.record2}</span>
                      </td>

                      <td style={{ ...tdBase }}>
                        <span style={{ fontWeight: 900 }}>{r.points}/3</span>
                      </td>

                      <td style={{ ...tdBase }}>{r.active ? badge("ACTIVA", "on") : badge("INACTIVA", "off")}</td>

                      <td style={{ ...tdBase, textAlign: "center", padding: 8 }}>
                        <button
                          type="button"
                          className="ghostBtn"
                          data-menu-btn="1"
                          onClick={(e) => {
                            if (saving) return;
                            const btn = e.currentTarget as HTMLButtonElement;
                            if (menuOpenId === r.id) {
                              closeMenu();
                              return;
                            }
                            openMenuFor(r.id, btn);
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

                        {menuOpenId === r.id && menuPos
  ? createPortal(
      <div
        data-menu-popup="1"
        style={{
          ...portalMenuStyle,
          top: menuPos.top,
          left: menuPos.left,
        }}
        onMouseDown={(ev) => ev.stopPropagation()}
      >
        {(() => {
          const canTouchRoom =
            !me.isBranchScoped || !me.branchId || r.branch_id === me.branchId;

          const qrValue = (r.qrCode || "").trim() || makeRoomQr(r.id);

          return (
            <>
              {canManageRoomFull ? (
                <button
                  type="button"
                  style={portalItemStyle}
                  onClick={() => {
                    closeMenu();
                    if (!canTouchRoom) return alert("No podés editar salas de otra sucursal.");
                    startEditFull(r);
                  }}
                  disabled={saving}
                  onMouseEnter={(e) => menuItemHoverOn(e.currentTarget)}
                  onMouseLeave={(e) => menuItemHoverOff(e.currentTarget)}
                >
                  <Icon name="edit" size={16} />
                  Editar
                </button>
              ) : null}

              {canManageRoomFull ? (
                <button
                  type="button"
                  style={portalItemStyle}
                  onClick={() => {
                    closeMenu();
                    if (!r.description) return;
                    setDescModal({
                      title: r.name || "Descripción",
                      text: r.description,
                    });
                  }}
                  disabled={!r.description}
                  onMouseEnter={(e) => menuItemHoverOn(e.currentTarget)}
                  onMouseLeave={(e) => menuItemHoverOff(e.currentTarget)}
                >
                  <Icon name="eye" size={16} />
                  Ver descripción
                </button>
              ) : null}

              <button
                type="button"
                style={portalItemStyle}
                onClick={() => {
                  closeMenu();
                  openQr(r, qrValue);
                }}
                onMouseEnter={(e) => menuItemHoverOn(e.currentTarget)}
                onMouseLeave={(e) => menuItemHoverOff(e.currentTarget)}
              >
                <Icon name="qr" size={16} />
                Ver QR (copiar / imprimir)
              </button>

              {canManageRoomFull ? (
                <button
                  type="button"
                  style={portalItemStyle}
                  onClick={() => {
                    closeMenu();
                    if (!r.reserveUrl) return;
                    window.open(r.reserveUrl, "_blank", "noopener,noreferrer");
                  }}
                  disabled={!r.reserveUrl}
                  onMouseEnter={(e) => menuItemHoverOn(e.currentTarget)}
                  onMouseLeave={(e) => menuItemHoverOff(e.currentTarget)}
                >
                  <Icon name="link" size={16} />
                  Abrir link reserva
                </button>
              ) : null}

              {canEditRankings ? (
                <button
                  type="button"
                  style={portalItemStyle}
                  onClick={() => {
                    closeMenu();
                    if (!canTouchRoom) return alert("No podés editar salas de otra sucursal.");
                    openRecordsEditor(r);
                  }}
                  onMouseEnter={(e) => menuItemHoverOn(e.currentTarget)}
                  onMouseLeave={(e) => menuItemHoverOff(e.currentTarget)}
                >
                  <Icon name="records" size={16} />
                  Editar récords
                </button>
              ) : null}

              {canManageRoomFull ? <div style={portalDividerStyle} /> : null}

              {canManageRoomFull ? (
                <button
                  type="button"
                  style={portalItemStyle}
                  onClick={() => {
                    closeMenu();
                    if (!canTouchRoom) return alert("No podés cambiar estado de otra sucursal.");
                    toggleActive(r.id);
                  }}
                  disabled={saving}
                  onMouseEnter={(e) => menuItemHoverOn(e.currentTarget)}
                  onMouseLeave={(e) => menuItemHoverOff(e.currentTarget)}
                >
                  <Icon name="toggle" size={16} />
                  {r.active ? "Desactivar" : "Activar"}
                </button>
              ) : null}

              {canManageRoomFull ? (
                <button
                  type="button"
                  style={portalDangerItemStyle}
                  onClick={() => {
                    closeMenu();
                    if (!canTouchRoom) return alert("No podés borrar salas de otra sucursal.");
                    deleteRoom(r);
                  }}
                  disabled={saving}
                  onMouseEnter={(e) => menuDangerHoverOn(e.currentTarget)}
                  onMouseLeave={(e) => menuDangerHoverOff(e.currentTarget)}
                >
                  <Icon name="trash" size={16} />
                  Borrar
                </button>
              ) : null}
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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

     {qrModal ? (
  <>
    <div className="backdrop show" onMouseDown={() => setQrModal(null)} />
    <div
      className="modalCenter"
      onMouseDown={() => setQrModal(null)}
      style={{ alignItems: "center" }}
    >
      <div
        className="modalBox"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: "min(600px, 94vw)", maxWidth: 600 }}
      >
        <div className="modalHead">
          <div className="modalTitle">QR de {qrModal.name}</div>
          <button className="iconBtn" onClick={() => setQrModal(null)} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {/* Sin scroll interno: el contenido está acotado a mano. */}
        <div
          className="modalBody"
          style={{
            overflow: "visible",
            maxHeight: "none",
            padding: "20px 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              margin: "0 0 16px 0",
              fontSize: 24,
              fontWeight: 900,
              lineHeight: 1.2,
              color: "#fff",
            }}
          >
            {qrModal.name}
          </h2>

          <div
            style={{
              borderRadius: 14,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,.12)",
              background: "#fff",
              padding: 12,
              lineHeight: 0,
            }}
          >
            <QRCodeCanvas
              id={qrModal.canvasId}
              value={qrModal.value}
              size={QR_VIEW_SIZE}
              includeMargin
              bgColor="#ffffff"
              fgColor="#000000"
              style={{
                width: "min(320px, 62vw)",
                height: "min(320px, 62vw)",
                display: "block",
              }}
            />
          </div>

          <div
            style={{
              marginTop: 14,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 13,
              color: "#cbd5e1",
              wordBreak: "break-all",
            }}
          >
            {qrModal.code}
          </div>

          {roomQrMetaLine(qrModal) ? (
            <div style={{ marginTop: 6, fontSize: 13, color: "#94a3b8" }}>
              {roomQrMetaLine(qrModal)}
            </div>
          ) : null}

          {/* Copia oculta a 480px: es la que se exporta e imprime, para que el
              PNG no salga de escalar el QR chico de pantalla. */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              width: 0,
              height: 0,
              overflow: "hidden",
              opacity: 0,
              pointerEvents: "none",
            }}
          >
            <QRCodeCanvas
              id={qrModal.exportCanvasId}
              value={qrModal.value}
              size={QR_EXPORT_SIZE}
              includeMargin
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>
        </div>

        <div className="modalFoot" style={{ justifyContent: "center", flexWrap: "wrap" }}>
          <button
            className="ghostBtn"
            onClick={() => downloadRoomQrPng(qrModal.exportCanvasId, qrModal)}
          >
            Descargar PNG
          </button>

          <button
            className="ghostBtn"
            onClick={() => printRoomQrSheet(qrModal.exportCanvasId, qrModal)}
          >
            Imprimir
          </button>

          <button
            className="ghostBtn"
            onClick={async () => {
              await copy(qrModal.value);
              toast("success", "Link del QR copiado");
            }}
          >
            Copiar link
          </button>
        </div>
      </div>
    </div>
  </>
) : null}

{recordsModal ? (
  <>
    <div className="backdrop show" onMouseDown={() => setRecordsModal(null)} />
    <div className="modalCenter" onMouseDown={() => setRecordsModal(null)}>
      <div className="modalBox" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div className="modalTitle">Editar récords</div>
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

{open && editing ? (
  <>
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        backdropFilter: "blur(4px)",
        zIndex: 9998,
      }}
      onMouseDown={closeModal}
    />

    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onMouseDown={closeModal}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(1180px, calc(100vw - 32px))",
          maxWidth: "1180px",
          maxHeight: "88vh",
          overflow: "hidden",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "#0b1220",
          boxShadow: "0 18px 50px rgba(0,0,0,.45)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid rgba(255,255,255,.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 900,
                color: "#fff",
              }}
            >
              {items.some((x) => x.id === editing.id) ? "Editar sala" : "Nueva sala"}
            </h2>
            <div style={{ marginTop: 4, fontSize: 13, color: "#94a3b8" }}>
              Configuración general de la sala
            </div>
          </div>

          <button
            type="button"
            className="ghostBtn"
            onClick={closeModal}
            aria-label="Cerrar"
            style={{
              width: 40,
              height: 40,
              minWidth: 40,
              borderRadius: 12,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Los file inputs viven fuera del acordeón: tienen que seguir montados
            aunque la sección Imágenes esté cerrada (closeModal los limpia). */}
        <input
          ref={cardFileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={onFileChange}
        />
        <input
          ref={bannerFileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={onFileChange}
        />

        <div
          style={{
            padding: 22,
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* ---------- 1. GENERAL ---------- */}
          <FormSection
            title={FORM_SECTIONS[0].title}
            hint={FORM_SECTIONS[0].hint}
            open={openSections.general}
            onToggle={() => toggleSection("general")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={formRowStyle(220)}>
                <label style={formFieldStyle}>
                  <span style={formLabelStyle}>Nombre</span>
                  <input
                    ref={setFieldRef("name")}
                    className="input"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </label>

                <label style={formFieldStyle}>
                  <span style={formLabelStyle}>Sucursal</span>
                  <select
                    ref={setFieldRef("branch")}
                    className="input"
                    value={editing.branch}
                    onChange={(e) => {
                      const name = e.target.value;
                      const bid = branchesByName.get(name) || null;
                      setEditing({ ...editing, branch: name, branch_id: bid });
                    }}
                    disabled={me.isBranchScoped}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div style={formFieldStyle}>
                  <span style={formLabelStyle}>Estado</span>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={editing.active}
                    onClick={() => setEditing({ ...editing, active: !editing.active })}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 10,
                      height: 42,
                      padding: "0 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,.12)",
                      background: "rgba(255,255,255,.04)",
                      color: "#e2e8f0",
                      font: "inherit",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        position: "relative",
                        width: 38,
                        height: 22,
                        flex: "0 0 auto",
                        borderRadius: 999,
                        background: editing.active ? "#16a34a" : "rgba(255,255,255,.18)",
                        transition: "background .18s ease",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 3,
                          left: editing.active ? 19 : 3,
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background: "#fff",
                          transition: "left .18s ease",
                        }}
                      />
                    </span>

                    {editing.active ? "Activa" : "Inactiva"}
                  </button>
                </div>
              </div>

              <label style={formFieldStyle}>
                <span style={formLabelStyle}>Descripción</span>
                <textarea
                  className="input"
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={4}
                  style={{ resize: "vertical" }}
                />
              </label>
            </div>
          </FormSection>

          {/* ---------- 2. CATEGORÍA Y DIFICULTAD ---------- */}
          <FormSection
            title={FORM_SECTIONS[1].title}
            hint={FORM_SECTIONS[1].hint}
            open={openSections.categoria}
            onToggle={() => toggleSection("categoria")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={formRowStyle(220)}>
                <label style={formFieldStyle}>
                  <span style={formLabelStyle}>Categoría</span>
                  <select
                    className="input"
                    value={editing.category}
                    onChange={(e) =>
                      setEditing({ ...editing, category: e.target.value as RoomCategory })
                    }
                  >
                    <option value="WOW">WOW</option>
                    <option value="CLASICO">Clásico (20%)</option>
                    <option value="DESPEDIDA">Despedida</option>
                  </select>
                </label>

                <label style={formFieldStyle}>
                  <span style={formLabelStyle}>Nivel</span>
                  <select
                    className="input"
                    value={editing.level}
                    onChange={(e) => setEditing({ ...editing, level: e.target.value as RoomLevel })}
                  >
                    <option value="FACIL">Fácil</option>
                    <option value="INTERMEDIO">Intermedio</option>
                    <option value="AVANZADO">Avanzado</option>
                  </select>
                </label>

                <label style={formFieldStyle}>
                  <span style={formLabelStyle}>Puntaje</span>
                  <select
                    className="input"
                    value={String(editing.points ?? 1)}
                    onChange={(e) =>
                      setEditing({ ...editing, points: Number(e.target.value) as 1 | 2 | 3 })
                    }
                  >
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={formRowStyle(240)}>
                <label style={formFieldStyle}>
                  <span style={formLabelStyle}>
                    Dificultad{" "}
                    <span style={{ color: "#94a3b8", fontWeight: 600 }}>
                      ({editing.difficulty ?? 5}/10)
                    </span>
                  </span>
                  <input
                    className="rangeInput"
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={String(editing.difficulty ?? 5)}
                    onChange={(e) => setEditing({ ...editing, difficulty: Number(e.target.value) })}
                  />
                </label>

                <label style={formFieldStyle}>
                  <span style={formLabelStyle}>
                    Factor sorpresa{" "}
                    <span style={{ color: "#94a3b8", fontWeight: 600 }}>
                      ({editing.surprise ?? 5}/10)
                    </span>
                  </span>
                  <input
                    className="rangeInput"
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={String(editing.surprise ?? 5)}
                    onChange={(e) => setEditing({ ...editing, surprise: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div style={formRowStyle(260)}>
                <div ref={themesWrapRef} style={{ ...formPanelStyle, position: "relative" }}>
                  <div style={{ ...formLabelStyle, marginBottom: 10 }}>Temática</div>

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
                        <button
                          type="button"
                          className="ghostBtn"
                          onClick={clearThemes}
                          disabled={!selectedThemes.length}
                        >
                          Limpiar
                        </button>
                      </div>

                      <div className="multiSelectList">
                        {ROOM_THEMES_MULTI.map((t) => {
                          const checked = selectedThemes.includes(t);
                          const disabled = !checked && atThemesLimit;

                          return (
                            <label
                              key={t}
                              className={`multiSelectItem ${disabled ? "disabled" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => toggleTheme(t)}
                              />
                              <span>{t}</span>
                            </label>
                          );
                        })}
                      </div>

                      {atThemesLimit ? (
                        <div className="multiSelectHint">
                          Llegaste al máximo de 4 temáticas.
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                <div style={formPanelStyle}>
                  <div style={{ ...formLabelStyle, marginBottom: 10 }}>Jugadores</div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <label style={formFieldStyle}>
                      <span style={{ ...formLabelStyle, fontSize: 12 }}>Mínimo</span>
                      <input
                        className="input"
                        value={String(editing.playersMin ?? 1)}
                        onChange={(e) =>
                          setEditing({ ...editing, playersMin: Number(e.target.value) })
                        }
                        inputMode="numeric"
                      />
                    </label>

                    <label style={formFieldStyle}>
                      <span style={{ ...formLabelStyle, fontSize: 12 }}>Máximo</span>
                      <input
                        className="input"
                        value={String(editing.playersMax ?? 6)}
                        onChange={(e) =>
                          setEditing({ ...editing, playersMax: Number(e.target.value) })
                        }
                        inputMode="numeric"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </FormSection>

          {/* ---------- 3. IMÁGENES ---------- */}
          <FormSection
            title={FORM_SECTIONS[2].title}
            hint={FORM_SECTIONS[2].hint}
            open={openSections.imagenes}
            onToggle={() => toggleSection("imagenes")}
          >
            <div style={formRowStyle(300)}>
              {/* Card */}
              <div ref={setFieldRef("cardPhoto")} style={formPanelStyle}>
                <div style={{ ...formLabelStyle, marginBottom: 10 }}>
                  Imagen para card (listado)
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btnSmall"
                    onClick={onPickCardImage}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <Icon name="image" size={16} />
                    Elegir
                  </button>

                  {editing.cardPhoto ? (
                    <button type="button" className="ghostBtn" onClick={removeCardImage}>
                      Quitar
                    </button>
                  ) : (
                    <span style={{ opacity: 0.76, fontSize: 12 }}>Sin imagen</span>
                  )}
                </div>

                <ImageSpecHelp slot="card" warning={aspectWarn.card} />

                <div style={{ ...formLabelStyle, margin: "14px 0 10px 0" }}>Previa card</div>

                {editing.cardPhoto ? (
                  <div
                    style={{
                      borderRadius: 16,
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,.12)",
                      background: "rgba(0,0,0,.25)",
                    }}
                  >
                    <img
                      src={editing.cardPhoto}
                      alt="Preview card"
                      style={{
                        width: "100%",
                        height: "clamp(200px, 30vh, 320px)",
                        objectFit: "contain",
                        display: "block",
                        background: "#000",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      minHeight: 160,
                      borderRadius: 16,
                      border: "1px dashed rgba(255,255,255,.18)",
                      background: "rgba(255,255,255,.03)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      padding: 20,
                      opacity: 0.75,
                    }}
                  >
                    Acá se va a ver la previa de la imagen card.
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <CropPreview slot="card" src={editing.cardPhoto} />
                </div>
              </div>

              {/* Banner */}
              <div style={formPanelStyle}>
                <div style={{ ...formLabelStyle, marginBottom: 10 }}>
                  Imagen para banner (vista previa)
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btnSmall"
                    onClick={onPickBannerImage}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <Icon name="image" size={16} />
                    Elegir
                  </button>

                  {editing.bannerPhoto ? (
                    <button type="button" className="ghostBtn" onClick={removeBannerImage}>
                      Quitar
                    </button>
                  ) : (
                    <span style={{ opacity: 0.76, fontSize: 12 }}>Sin imagen</span>
                  )}
                </div>

                <ImageSpecHelp slot="banner" warning={aspectWarn.banner} />

                <div style={{ ...formLabelStyle, margin: "14px 0 10px 0" }}>
                  Previa del recorte final
                </div>

                <CropPreview slot="banner" src={editing.bannerPhoto} />
              </div>
            </div>
          </FormSection>

          {/* ---------- 4. CONTACTO Y RESERVA ---------- */}
          <FormSection
            title={FORM_SECTIONS[3].title}
            hint={FORM_SECTIONS[3].hint}
            open={openSections.contacto}
            onToggle={() => toggleSection("contacto")}
          >
            <div style={formRowStyle(240)}>
              <label style={formFieldStyle}>
                <span style={formLabelStyle}>Teléfono</span>
                <input
                  className="input"
                  value={editing.whatsappPhone}
                  onChange={(e) => setEditing({ ...editing, whatsappPhone: e.target.value })}
                  placeholder="Ej: +54911XXXXXXXX"
                  inputMode="tel"
                />
              </label>

              <label style={formFieldStyle}>
                <span style={formLabelStyle}>Link de reserva</span>
                <input
                  ref={setFieldRef("reserveUrl")}
                  className="input"
                  value={editing.reserveUrl}
                  onChange={(e) => setEditing({ ...editing, reserveUrl: e.target.value })}
                  placeholder="https://..."
                  inputMode="url"
                />
              </label>

              <label style={formFieldStyle}>
                <span style={formLabelStyle}>QR único</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
                  <input
                    ref={setFieldRef("qrCode")}
                    className="input"
                    value={editing.qrCode || ""}
                    onChange={(e) => setEditing({ ...editing, qrCode: e.target.value })}
                    placeholder={`Ej: ${makeRoomQr(editing.id)}`}
                    style={{ minWidth: 0, fontFamily: "monospace" }}
                  />

                  <button
                    type="button"
                    className="ghostBtn"
                    onClick={() => setEditing({ ...editing, qrCode: makeRoomQr(editing.id) })}
                    title="Regenerar QR"
                    style={{
                      width: 42,
                      minWidth: 42,
                      height: 42,
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 12,
                    }}
                  >
                    <Icon name="refresh" size={18} />
                  </button>

                  <button
                    type="button"
                    className="ghostBtn"
                    onClick={() => editing.qrCode && copy(editing.qrCode)}
                    disabled={!editing.qrCode}
                    title="Copiar QR"
                    style={{
                      width: 42,
                      minWidth: 42,
                      height: 42,
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 12,
                    }}
                  >
                    <Icon name="copy" size={18} />
                  </button>
                </div>
              </label>
            </div>
          </FormSection>

          {/* ---------- 5. RÉCORDS HISTÓRICOS ---------- */}
          <FormSection
            title={FORM_SECTIONS[4].title}
            hint={FORM_SECTIONS[4].hint}
            open={openSections.records}
            onToggle={() => toggleSection("records")}
          >
            <div style={formRowStyle(220)}>
              <label style={formFieldStyle}>
                <span style={formLabelStyle}>Récord 1</span>
                <input
                  ref={setFieldRef("record1")}
                  className="input"
                  value={editing.record1}
                  onChange={(e) => setEditing({ ...editing, record1: e.target.value })}
                  placeholder="12:34"
                />
              </label>

              <label style={formFieldStyle}>
                <span style={formLabelStyle}>Récord 2</span>
                <input
                  ref={setFieldRef("record2")}
                  className="input"
                  value={editing.record2}
                  onChange={(e) => setEditing({ ...editing, record2: e.target.value })}
                  placeholder="14:10"
                />
              </label>
            </div>

            <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
              Formato válido: <b>MM:SS</b> (ej: 08:45).
            </div>
          </FormSection>
        </div>

        <div
          style={{
            padding: "18px 22px",
            borderTop: "1px solid rgba(255,255,255,.08)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
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
            Recorte fijado a <b>{ROOM_IMAGE_SPECS[cropTarget ?? "card"].ratioLabel}</b> — se exporta a{" "}
            <b>
              {ROOM_IMAGE_SPECS[cropTarget ?? "card"].w}×{ROOM_IMAGE_SPECS[cropTarget ?? "card"].h}
            </b>
            . Mouse: <b>mover</b> arrastrando dentro, <b>resize</b> arrastrando bordes/esquinas. Ruedita = zoom del
            recorte. Doble click = máximo.
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
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0,0,0,.35)",
                  }}
                />
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
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0.8,
                }}
              >
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

<GoldenTicketManagementModal
  open={goldenOpen}
  onClose={() => setGoldenOpen(false)}
  toast={toast}
/>

<ToastStack toasts={toasts} onDismiss={dismiss} />

    </div>
  </div>
  );
}
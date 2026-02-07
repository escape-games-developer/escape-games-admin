// News.tsx (ADMIN ONLY)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

/* =======================
   PERMISOS
======================= */

type AdminRole = "ADMIN" | "ADMIN_GENERAL" | "GM" | "CLIENT" | "";

function getAdminRole(): AdminRole {
  return (localStorage.getItem("eg_admin_role") || "") as AdminRole;
}

function canManageNews(role: AdminRole) {
  return role === "ADMIN" || role === "ADMIN_GENERAL";
}

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
  publishedAt: string;
  image: string;
  imagePosition: number;
  ctaMode: CtaMode;
  ctaLink: string;
  active: boolean;
};

/* =======================
   HELPERS
======================= */

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

const stripHtml = (s: string) =>
  s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/* =======================
   COMPONENTE
======================= */

export default function News() {
  const role = getAdminRole();
  const allowed = canManageNews(role);

  /* 🚫 BLOQUEO TOTAL */
  if (!allowed) {
    return (
      <div className="page">
        <div className="panel" style={{ padding: 16 }}>
          No tenés permisos para acceder a Novedades.
        </div>
      </div>
    );
  }

  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NewsItem | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("news_v1")
        .select("*")
        .order("published_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error(error);
        alert("Error cargando novedades.");
        setItems([]);
      } else {
        setItems(
          (data || []).map((r: any) => ({
            id: r.id,
            title: r.title || "",
            description: r.description || "",
            type: r.type,
            publishedAt: r.published_at,
            image: r.image_url || "",
            imagePosition: r.image_position ?? 50,
            ctaMode: r.cta_mode,
            ctaLink: r.cta_link || "",
            active: Boolean(r.active),
          }))
        );
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const startCreate = () => {
    setEditing({
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
    setOpen(true);
  };

  const startEdit = (n: NewsItem) => {
    setEditing({ ...n });
    setOpen(true);
  };

  const closeModal = () => {
    setEditing(null);
    setOpen(false);
  };

  const save = async () => {
    if (!editing) return;

    if (!editing.title.trim()) return alert("Falta título");
    if (!stripHtml(editing.description)) return alert("Falta descripción");

    const payload = {
      id: editing.id,
      title: editing.title.trim(),
      description: editing.description,
      type: editing.type,
      published_at: editing.publishedAt,
      image_url: editing.image || null,
      image_position: editing.imagePosition,
      cta_mode: editing.ctaMode,
      cta_link: editing.ctaLink || null,
      active: editing.active,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("news_v1")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      console.error(error);
      alert("Error guardando novedad");
      return;
    }

    setItems((prev) => {
      const exists = prev.some((x) => x.id === editing.id);
      return exists
        ? prev.map((x) => (x.id === editing.id ? editing : x))
        : [editing, ...prev];
    });

    closeModal();
  };

  const remove = async (id: string) => {
    if (!confirm("¿Borrar esta novedad?")) return;

    const { error } = await supabase.from("news_v1").delete().eq("id", id);
    if (error) {
      alert("No se pudo borrar");
      return;
    }

    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <div className="page">
      <div className="pageHeadRow">
        <div>
          <div className="pageTitle">Novedades</div>
          <div className="pageSub">Solo administradores</div>
        </div>

        {/* ✅ solo ADMIN */}
        <button className="btnSmall" onClick={startCreate}>
          + Nueva novedad
        </button>
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 16 }}>
          Cargando…
        </div>
      ) : (
        <div className="roomsGrid">
          {items.map((n) => (
            <div key={n.id} className="roomCard">
              <div className="roomImgWrap">
                <img
                  src={n.image || "https://picsum.photos/seed/news/900/520"}
                  alt={n.title}
                />
                <div className="roomBadge">{TYPE_LABEL[n.type]}</div>
                {!n.active && <div className="roomBadge off">INACTIVA</div>}
              </div>

              <div className="roomBody">
                <div className="roomTitle">{n.title}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {n.publishedAt}
                </div>

                <div
                  style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}
                  dangerouslySetInnerHTML={{ __html: n.description }}
                />

                {/* ✅ acciones solo ADMIN */}
                <div className="roomActions">
                  <button className="ghostBtn" onClick={() => startEdit(n)}>
                    Editar
                  </button>
                  <button
                    className="dangerBtnInline"
                    onClick={() => remove(n.id)}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL */}
      {open && editing && (
        <>
          <div className="backdrop show" onMouseDown={closeModal} />
          <div className="modalCenter" onMouseDown={closeModal}>
            <div className="modalBox" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modalHead">
                <div className="modalTitle">Novedad</div>
                <button className="iconBtn" onClick={closeModal}>✕</button>
              </div>

              <div className="modalBody">
                <input
                  className="input"
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                  placeholder="Título"
                />

                <textarea
                  className="input"
                  style={{ minHeight: 120 }}
                  value={editing.description}
                  onChange={(e) =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                  placeholder="Descripción"
                />
              </div>

              <div className="modalFoot">
                <button className="ghostBtn" onClick={closeModal}>
                  Cancelar
                </button>
                <button className="btnSmall" onClick={save}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

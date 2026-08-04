import { useCallback, useEffect, useState } from "react";

import GoldenTicketReviewModal from "../components/GoldenTicketReviewModal";
import { ToastStack, useToasts } from "../components/Toast";
import {
  fetchGrantedCount,
  fetchPendingRequests,
  formatRelative,
  fullName,
  GOLDEN_TICKET_LIMIT,
  type PendingRequest,
} from "../lib/goldenTickets";

export default function GoldenTickets() {
  const { toasts, toast, dismiss } = useToasts();

  const [granted, setGranted] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [selected, setSelected] = useState<PendingRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrMsg("");

    try {
      const [count, rows] = await Promise.all([
        fetchGrantedCount(),
        fetchPendingRequests(),
      ]);

      setGranted(count);
      setPending(rows);
    } catch (err: any) {
      console.error(err);
      setErrMsg(err?.message || "No pude cargar los Golden Tickets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exhausted = granted != null && granted >= GOLDEN_TICKET_LIMIT;

  return (
    <div style={styles.page}>
      <div style={styles.pageInner}>
        <div style={styles.headerWrap}>
          <div style={styles.headerText}>
            <h1 style={styles.title}>Golden Tickets</h1>
            <p style={styles.subtitle}>
              Revisá las capturas de valoración que mandaron los usuarios y otorgá el
              Golden Ticket. El cupo es de {GOLDEN_TICKET_LIMIT} en total.
            </p>
          </div>

          <div style={styles.headerActions}>
            <button type="button" className="ghostBtn" onClick={load} disabled={loading}>
              {loading ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
        </div>

        <div style={styles.cardsGrid}>
          <div style={styles.card}>
            <span style={styles.cardLabel}>Otorgados</span>
            <div style={{ ...styles.cardValue, color: exhausted ? "#f87171" : "#ffffff" }}>
              {granted == null ? "—" : `${granted} / ${GOLDEN_TICKET_LIMIT}`}
            </div>
          </div>

          <div style={styles.card}>
            <span style={styles.cardLabel}>Pendientes de revisión</span>
            <div style={styles.cardValue}>{loading ? "—" : pending.length}</div>
          </div>

          <div style={styles.card}>
            <span style={styles.cardLabel}>Disponibles</span>
            <div style={styles.cardValue}>
              {granted == null ? "—" : Math.max(0, GOLDEN_TICKET_LIMIT - granted)}
            </div>
          </div>
        </div>

        {exhausted ? (
          <div style={styles.warnBanner}>
            Se agotaron los {GOLDEN_TICKET_LIMIT} Golden Tickets. Los intentos de otorgar
            nuevos van a fallar con <b>GOLDEN_TICKETS_EXHAUSTED</b>.
          </div>
        ) : null}

        <h2 style={styles.sectionTitle}>Solicitudes pendientes</h2>

        {loading ? (
          <div style={styles.panel}>Cargando…</div>
        ) : errMsg ? (
          <div style={{ ...styles.panel, color: "#f87171" }}>{errMsg}</div>
        ) : pending.length === 0 ? (
          <div style={styles.panel}>No hay capturas pendientes de revisión.</div>
        ) : (
          <div style={styles.list}>
            {pending.map((p) => {
              const name = fullName(p);

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p)}
                  style={styles.row}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#334155";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#1f2937";
                  }}
                >
                  {p.photo_url ? (
                    <img src={p.photo_url} alt="" style={styles.avatar} />
                  ) : (
                    <div style={{ ...styles.avatar, ...styles.avatarFallback }}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div style={styles.rowInfo}>
                    <div style={styles.rowName}>{name}</div>
                    <div style={styles.rowMeta}>
                      {p.alias ? `@${p.alias}` : "sin alias"} · {p.mail ?? "sin mail"}
                    </div>
                  </div>

                  <div style={styles.rowRight}>
                    <div style={styles.rowTime}>
                      Subido {formatRelative(p.rating_screenshot_uploaded_at)}
                    </div>
                    <div style={styles.rowCta}>Revisar captura →</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <GoldenTicketReviewModal
        open={!!selected}
        request={selected}
        onClose={() => setSelected(null)}
        onDone={load}
        toast={toast}
      />

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

const styles: Record<string, any> = {
  page: {
    width: "100%",
    minHeight: "100%",
    height: "100%",
    background: "#0f172a",
    color: "#e5e7eb",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxSizing: "border-box",
  },

  pageInner: {
    width: "100%",
    maxWidth: "100%",
    minHeight: "100%",
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

  warnBanner: {
    border: "1px solid #a16207",
    background: "rgba(161,98,7,0.14)",
    color: "#fde68a",
    borderRadius: 14,
    padding: 12,
    fontSize: 13.5,
    marginBottom: 16,
  },

  sectionTitle: {
    margin: "4px 0 12px 0",
    fontSize: 18,
    fontWeight: 800,
    color: "#ffffff",
  },

  panel: {
    border: "1px solid #1f2937",
    borderRadius: 18,
    background: "#0b1220",
    padding: 18,
    color: "#cbd5e1",
    fontSize: 14,
  },

  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    textAlign: "left",
    padding: 14,
    borderRadius: 16,
    border: "1px solid #1f2937",
    background: "linear-gradient(180deg, #111827 0%, #0b1220 100%)",
    color: "#e5e7eb",
    cursor: "pointer",
    boxSizing: "border-box",
    transition: "border-color 120ms ease",
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    objectFit: "cover",
    border: "1px solid #1f2937",
    flexShrink: 0,
  },

  avatarFallback: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    fontWeight: 800,
    color: "#94a3b8",
  },

  rowInfo: {
    flex: 1,
    minWidth: 0,
  },

  rowName: {
    fontSize: 15.5,
    fontWeight: 800,
    color: "#ffffff",
  },

  rowMeta: {
    fontSize: 12.5,
    color: "#94a3b8",
    marginTop: 3,
    wordBreak: "break-word",
  },

  rowRight: {
    textAlign: "right",
    flexShrink: 0,
  },

  rowTime: {
    fontSize: 12.5,
    color: "#cbd5e1",
  },

  rowCta: {
    fontSize: 12.5,
    color: "#93c5fd",
    marginTop: 4,
  },
};

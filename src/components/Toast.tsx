import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Toasts mínimos para el panel (antes se usaba alert()).
 * Paleta alineada con el resto: slate oscuro + acento por tipo.
 */

export type ToastKind = "success" | "error" | "warning";

export type ToastItem = {
  id: string;
  kind: ToastKind;
  text: string;
};

const DEFAULT_MS = 5000;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (kind: ToastKind, text: string, ms: number = DEFAULT_MS) => {
      seq.current += 1;
      const id = `t_${Date.now()}_${seq.current}`;

      setToasts((prev) => [...prev, { id, kind, text }]);
      window.setTimeout(() => dismiss(id), ms);
    },
    [dismiss]
  );

  return { toasts, toast, dismiss };
}

const KIND_STYLES: Record<ToastKind, { bg: string; border: string; accent: string }> = {
  success: {
    bg: "linear-gradient(180deg, #052e1b 0%, #042315 100%)",
    border: "#166534",
    accent: "#4ade80",
  },
  error: {
    bg: "linear-gradient(180deg, #3f1214 0%, #2a0c0e 100%)",
    border: "#991b1b",
    accent: "#f87171",
  },
  warning: {
    bg: "linear-gradient(180deg, #3d2a06 0%, #2a1d05 100%)",
    border: "#a16207",
    accent: "#fbbf24",
  },
};

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) return null;

  return createPortal(
    <div style={styles.stack}>
      {toasts.map((t) => {
        const k = KIND_STYLES[t.kind];

        return (
          <div
            key={t.id}
            role="status"
            style={{
              ...styles.toast,
              background: k.bg,
              borderColor: k.border,
            }}
          >
            <span style={{ ...styles.dot, background: k.accent }} />

            <div style={styles.text}>{t.text}</div>

            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              style={styles.close}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}

const styles: Record<string, any> = {
  stack: {
    position: "fixed",
    right: 18,
    bottom: 18,
    zIndex: 12000,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    maxWidth: "min(420px, calc(100vw - 36px))",
  },

  toast: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 12px 12px 14px",
    borderRadius: 14,
    border: "1px solid",
    boxShadow: "0 16px 34px rgba(0,0,0,0.42)",
    color: "#e5e7eb",
    fontSize: 13.5,
    lineHeight: 1.45,
  },

  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    marginTop: 6,
    flexShrink: 0,
  },

  text: {
    flex: 1,
    minWidth: 0,
    wordBreak: "break-word",
  },

  close: {
    background: "transparent",
    border: "none",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    padding: 2,
    flexShrink: 0,
  },
};

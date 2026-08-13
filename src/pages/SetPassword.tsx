import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type AdminRole = "ADMIN_GENERAL" | "ADMIN" | "GM";

/** Home del panel (misma que usa Login). */
const HOME_PATH = "/salas";

const MIN_PASS = 8;

/**
 * Fases:
 * - checking: todavía no sabemos si el link de invitación trajo sesión válida.
 * - ready: hay sesión, se puede pedir la contraseña nueva.
 * - invalid: link vencido / ya usado / sin tokens.
 */
type Phase = "checking" | "ready" | "invalid";

/* ===== ICONOS SVG (mismos que Login) ===== */

function EyeOpenIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M2 12s4-7.5 10-7.5c2.2 0 4.1.7 5.7 1.7M22 12s-1.5 2.8-4.2 4.9C15.9 18.6 14 19.5 12 19.5c-6.5 0-10-7.5-10-7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ===== HELPERS ===== */

function parseHashParams(hash: string) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(raw);
}

/** Saca los tokens de la URL para que no queden en el historial. */
function stripHash() {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

/**
 * Replica lo que hace Login al entrar: sin estas keys los guards de routes.tsx
 * leen role "CLIENT" y rebotan al usuario.
 */
async function hydrateAdminSession(userId: string): Promise<boolean> {
  const { data: adminRow, error } = await supabase
    .from("admins")
    .select("user_id, mail, branch_id, gm_code, is_super, permissions")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !adminRow) return false;

  let role: AdminRole;
  if (adminRow.is_super) role = "ADMIN_GENERAL";
  else if (adminRow.gm_code) role = "GM";
  else role = "ADMIN";

  localStorage.setItem("eg_admin_role", role);
  localStorage.setItem("eg_admin_mail", adminRow.mail ?? "");
  localStorage.setItem("eg_admin_branch_id", String(adminRow.branch_id ?? ""));
  localStorage.setItem("eg_admin_is_super", adminRow.is_super ? "true" : "false");
  localStorage.setItem("eg_admin_permissions", JSON.stringify(adminRow.permissions ?? {}));

  return true;
}

/* ===== COMPONENTE ===== */

export default function SetPassword() {
  const nav = useNavigate();

  const [phase, setPhase] = useState<Phase>("checking");
  const [mail, setMail] = useState("");

  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [showPass1, setShowPass1] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let timer: number | undefined;

    const markReady = (email?: string | null) => {
      if (!mounted) return;
      if (email) setMail(email);
      setPhase("ready");
    };

    // El cliente tiene detectSessionInUrl:true, así que puede haberse comido el
    // hash antes de que montemos. Escuchamos por las dudas.
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!mounted || !session) return;
      window.clearTimeout(timer);
      markReady(session.user?.email);
    });

    (async () => {
      const params = parseHashParams(window.location.hash);

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      // URLSearchParams ya decodifica, no hay que volver a pasarle decodeURIComponent.
      const errDesc = params.get("error_description") || params.get("error");

      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        stripHash();
        if (!mounted) return;

        if (error) {
          setErr(error.message || "El link de invitación no es válido.");
          setPhase("invalid");
          return;
        }

        markReady(data.session?.user?.email);
        return;
      }

      if (errDesc) {
        stripHash();
        if (!mounted) return;
        setErr(errDesc);
        setPhase("invalid");
        return;
      }

      // Sin tokens en el hash: puede que ya haya sesión (link consumido por el
      // propio cliente de Supabase, o el usuario entró logueado).
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data.session) {
        markReady(data.session.user?.email);
        return;
      }

      // Damos un margen por si detectSessionInUrl está resolviendo todavía.
      timer = window.setTimeout(() => {
        if (!mounted) return;
        setPhase((p) => (p === "checking" ? "invalid" : p));
      }, 3000);
    })();

    return () => {
      mounted = false;
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOkMsg(null);

    if (pass1.length < MIN_PASS) {
      setErr(`La contraseña debe tener al menos ${MIN_PASS} caracteres.`);
      return;
    }

    if (pass1 !== pass2) {
      setErr("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw error;

      setOkMsg("Contraseña configurada");

      const userId = data.user?.id;
      const isAdmin = userId ? await hydrateAdminSession(userId) : false;

      if (!isAdmin) {
        // No está habilitado como admin: que entre por la puerta de siempre.
        await supabase.auth.signOut();
        nav("/login", { replace: true });
        return;
      }

      nav(HOME_PATH, { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? "No pude configurar la contraseña.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authWrap">
      <div className="authCard">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
          <img
            src={new URL("../assets/escape-logo.png", import.meta.url).toString()}
            alt="Escape Games"
            style={{ height: 64 }}
          />
        </div>

        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Configurá tu contraseña</div>
          {mail ? (
            <div style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>{mail}</div>
          ) : null}
        </div>

        {err && (
          <div style={styles.errorBox}>{err}</div>
        )}

        {okMsg && (
          <div style={styles.okBox}>{okMsg}</div>
        )}

        {phase === "checking" ? (
          <div style={{ textAlign: "center", opacity: 0.8, fontSize: 13, padding: "12px 0" }}>
            Validando invitación…
          </div>
        ) : phase === "invalid" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.9 }}>
              El link de invitación no es válido o ya venció. Pedile a un Admin General
              que te reenvíe la invitación.
            </div>

            <button className="btnSmall" type="button" onClick={() => nav("/login", { replace: true })}>
              Ir al login
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="field">
              <span className="label">Nueva contraseña</span>

              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  value={pass1}
                  onChange={(e) => setPass1(e.target.value)}
                  type={showPass1 ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={`Mínimo ${MIN_PASS} caracteres`}
                  style={{ paddingRight: 42 }}
                  autoFocus
                />

                <button
                  type="button"
                  onClick={() => setShowPass1((v) => !v)}
                  aria-label={showPass1 ? "Ocultar contraseña" : "Mostrar contraseña"}
                  style={styles.eyeButton}
                >
                  {showPass1 ? <EyeOpenIcon /> : <EyeClosedIcon />}
                </button>
              </div>
            </label>

            <label className="field">
              <span className="label">Repetir contraseña</span>

              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  type={showPass2 ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  style={{ paddingRight: 42 }}
                />

                <button
                  type="button"
                  onClick={() => setShowPass2((v) => !v)}
                  aria-label={showPass2 ? "Ocultar contraseña" : "Mostrar contraseña"}
                  style={styles.eyeButton}
                >
                  {showPass2 ? <EyeOpenIcon /> : <EyeClosedIcon />}
                </button>
              </div>
            </label>

            <button className="btnSmall" type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar y entrar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, any> = {
  errorBox: {
    border: "1px solid rgba(255,60,60,.45)",
    background: "rgba(255,60,60,.14)",
    padding: 10,
    borderRadius: 12,
    fontSize: 13,
    marginBottom: 10,
  },

  okBox: {
    border: "1px solid rgba(34,197,94,.45)",
    background: "rgba(34,197,94,.14)",
    padding: 10,
    borderRadius: 12,
    fontSize: 13,
    marginBottom: 10,
  },

  eyeButton: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "#9ca3af",
  },
};

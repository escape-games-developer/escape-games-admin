import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button, Input } from "../ui";
import logo from "../assets/escape-logo.png";

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
      const { error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw error;

      setOkMsg("Contraseña configurada");

      /* Cerramos la sesión que abrió el link de invitación. Si la dejáramos
         viva el usuario quedaría adentro del panel sin haber pasado nunca por
         el login, un estado ambiguo difícil de depurar. Que cierre el círculo
         entrando con su mail y la contraseña que acaba de elegir. */
      await supabase.auth.signOut();

      nav("/login", {
        replace: true,
        state: { notice: "Contraseña creada, ingresá con tu email y contraseña." },
      });
    } catch (e: any) {
      setErr(e?.message ?? "No pude configurar la contraseña.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="eg-auth-shell">
      <section className="eg-auth-card" aria-labelledby="password-title">
        <img className="eg-auth-logo" src={logo} alt="Escape Games" />
        <header className="eg-auth-heading">
          <h1 id="password-title">Crear nueva contraseña</h1>
          <p>{mail || "Configurá una contraseña segura para acceder al panel."}</p>
        </header>

        {err && (
          <div className="eg-auth-alert is-error" role="alert">{err}</div>
        )}

        {okMsg && (
          <div className="eg-auth-alert is-success" role="status">{okMsg}</div>
        )}

        {phase === "checking" ? (
          <div className="eg-auth-state">
            Validando invitación…
          </div>
        ) : phase === "invalid" ? (
          <div className="eg-auth-state eg-auth-state--invalid">
            <div>
              El link de invitación no es válido o ya venció. Pedile a un Admin General
              que te reenvíe la invitación.
            </div>
            <Button variant="primary" onClick={() => nav("/login", { replace: true })}>Ir al login</Button>
          </div>
        ) : (
          <form className="eg-auth-form" onSubmit={onSubmit}>
            <label className="eg-field" htmlFor="new-password">
              <span className="eg-field__label">Nueva contraseña</span>
              <div className="eg-auth-password">
                <Input
                  id="new-password"
                  value={pass1}
                  onChange={(e) => setPass1(e.target.value)}
                  type={showPass1 ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={`Mínimo ${MIN_PASS} caracteres`}
                  className="eg-auth-password__input"
                  autoFocus
                />

                <button
                  type="button"
                  onClick={() => setShowPass1((v) => !v)}
                  aria-label={showPass1 ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="eg-auth-password__toggle"
                >
                  {showPass1 ? <EyeOpenIcon /> : <EyeClosedIcon />}
                </button>
              </div>
            </label>

            <label className="eg-field" htmlFor="repeat-password">
              <span className="eg-field__label">Repetir contraseña</span>
              <div className="eg-auth-password">
                <Input
                  id="repeat-password"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  type={showPass2 ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="eg-auth-password__input"
                />

                <button
                  type="button"
                  onClick={() => setShowPass2((v) => !v)}
                  aria-label={showPass2 ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="eg-auth-password__toggle"
                >
                  {showPass2 ? <EyeOpenIcon /> : <EyeClosedIcon />}
                </button>
              </div>
            </label>

            <Button type="submit" variant="primary" fullWidth loading={busy}>Guardar y entrar</Button>
          </form>
        )}
      </section>
    </main>
  );
}

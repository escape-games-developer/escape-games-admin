import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button, Input } from "../ui";
import logo from "../assets/escape-logo.png";

type AdminRole = "ADMIN_GENERAL" | "ADMIN" | "GM";

/* ===== ICONOS SVG ===== */

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
      <path
        d="M3 3l18 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M2 12s4-7.5 10-7.5c2.2 0 4.1.7 5.7 1.7M22 12s-1.5 2.8-4.2 4.9C15.9 18.6 14 19.5 12 19.5c-6.5 0-10-7.5-10-7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ===== COMPONENTE ===== */

export default function Login() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* Aviso que deja SetPassword al terminar el alta. No usamos el toast del
     panel porque vive en el componente que se desmonta al navegar acá. */
  const loc = useLocation();
  const notice = (loc.state as { notice?: string } | null)?.notice ?? null;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) nav("/salas", { replace: true });
    })();
  }, [nav]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      if (!data.session) throw new Error("No se pudo iniciar sesión.");

      const { data: adminRow, error: adminErr } = await supabase
        .from("admins")
        .select("user_id, mail, branch_id, gm_code, is_super, permissions")
        .eq("user_id", data.session.user.id)
        .maybeSingle();

      if (adminErr) throw adminErr;

      if (!adminRow) {
        await supabase.auth.signOut();
        throw new Error("No autorizado: este usuario no está habilitado como admin.");
      }

      let role: AdminRole;
      if (adminRow.is_super) role = "ADMIN_GENERAL";
      else if (adminRow.gm_code) role = "GM";
      else role = "ADMIN";

      if (!adminRow.is_super && (adminRow.branch_id == null)) {
        await supabase.auth.signOut();
        throw new Error("No autorizado: admin sin sucursal asignada.");
      }

      localStorage.setItem("eg_admin_role", role);
      localStorage.setItem("eg_admin_mail", adminRow.mail ?? email.trim());
      localStorage.setItem("eg_admin_branch_id", String(adminRow.branch_id ?? ""));
      localStorage.setItem("eg_admin_is_super", adminRow.is_super ? "true" : "false");
      localStorage.setItem("eg_admin_permissions", JSON.stringify(adminRow.permissions ?? {}));

      nav("/salas", { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? "Error al iniciar sesión.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="eg-auth-shell">
      <section className="eg-auth-card" aria-labelledby="login-title">
        <img className="eg-auth-logo" src={logo} alt="Escape Games" />
        <header className="eg-auth-heading">
          <h1 id="login-title">Acceso Administrador</h1>
          <p>Ingresá con tus credenciales para administrar Escape Games.</p>
        </header>

        {notice && (
          <div className="eg-auth-alert is-success" role="status">{notice}</div>
        )}

        {err && (
          <div className="eg-auth-alert is-error" role="alert">{err}</div>
        )}

        <form className="eg-auth-form" onSubmit={onSubmit}>
          <Input id="login-email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="admin@escapegames.com.ar" />

          <label className="eg-field" htmlFor="login-password">
            <span className="eg-field__label">Contraseña</span>
            <div className="eg-auth-password">
              <Input
                id="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                className="eg-auth-password__input"
              />

              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="eg-auth-password__toggle"
              >
                {showPass ? <EyeOpenIcon /> : <EyeClosedIcon />}
              </button>
            </div>
          </label>

          <Button type="submit" variant="primary" fullWidth loading={busy}>Entrar</Button>
        </form>
      </section>
    </main>
  );
}

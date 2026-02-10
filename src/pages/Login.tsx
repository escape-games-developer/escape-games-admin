import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

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
        .select("user_id, mail, branch_id, gm_code, is_super")
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

      nav("/salas", { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? "Error al iniciar sesión.");
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

        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Acceso Administrador</div>
          <div style={{ opacity: 0.8, fontSize: 12 }}>
            Ingresá con tu usuario de Supabase
          </div>
        </div>

        {err && (
          <div
            style={{
              border: "1px solid rgba(255,60,60,.45)",
              background: "rgba(255,60,60,.14)",
              padding: 10,
              borderRadius: 12,
              fontSize: 13,
              marginBottom: 10,
            }}
          >
            {err}
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="field">
            <span className="label">Email</span>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              placeholder="admin@escapegames.com.ar"
            />
          </label>

          <label className="field">
            <span className="label">Contraseña</span>

            <div style={{ position: "relative" }}>
              <input
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                style={{ paddingRight: 42 }}
              />

              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "#9ca3af",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#e5e7eb")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#9ca3af")}
              >
                {showPass ? <EyeOpenIcon /> : <EyeClosedIcon />}
              </button>
            </div>
          </label>

          <button className="btnSmall" type="submit" disabled={busy}>
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

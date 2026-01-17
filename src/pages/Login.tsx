import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Login() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Si ya hay sesión, ir directo
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

      // ✅ Chequeo de admin: debe existir en public.admins
      const { data: adminRow, error: adminErr } = await supabase
        .from("admins")
        .select("user_id, mail, branch_id")
        .eq("user_id", data.session.user.id)
        .maybeSingle();

      if (adminErr) throw adminErr;
      if (!adminRow) {
        await supabase.auth.signOut();
        throw new Error("No autorizado: este usuario no está habilitado como admin.");
      }

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
          {/* Logo centrado grande */}
          <img
            src={new URL("../assets/escape-logo.png", import.meta.url).toString()}
            alt="Escape Games"
            style={{ height: 64, width: "auto", objectFit: "contain" }}
          />
        </div>

        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Acceso Administrador</div>
          <div style={{ opacity: 0.8, fontSize: 12 }}>Ingresá con tu usuario de Supabase</div>
        </div>

        {err && (
          <div
            style={{
              border: "1px solid rgba(255,60,60,.45)",
              background: "rgba(255,60,60,.14)",
              padding: 10,
              borderRadius: 12,
              fontSize: 13,
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
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </label>

          <button className="btnSmall" type="submit" disabled={busy}>
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

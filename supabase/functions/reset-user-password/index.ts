// supabase/functions/reset-user-password/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  // "https://tu-dominio.com",
]);

function corsHeaders(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.has(origin) ? origin : (origin ?? "http://localhost:5173");
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const CORS = corsHeaders(origin);

  // ✅ Preflight SIEMPRE 200
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

    if (!supabaseUrl || !anonKey || !serviceRole) {
      return new Response(
        JSON.stringify({
          error: "Missing env vars (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)",
        }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized (missing bearer token)" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ✅ Client “usuario” para validar JWT y leer quién llama
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Invalid JWT" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const callerId = userData.user.id;

    // ✅ Admin client (service role) para chequear super + resetear
    const adminClient = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ✅ verificamos que sea ADMIN_GENERAL (is_super)
    const { data: adminRow, error: admErr } = await adminClient
      .from("admins")
      .select("is_super")
      .eq("user_id", callerId)
      .maybeSingle();

    if (admErr) {
      return new Response(JSON.stringify({ error: `Admins check failed: ${admErr.message}` }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!adminRow?.is_super) {
      return new Response(JSON.stringify({ error: "Forbidden (not ADMIN_GENERAL)" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);

    const userId = body?.user_id ? String(body.user_id) : "";
    const newPassword = body?.new_password ? String(body.new_password) : "";

    if (!userId || !newPassword) {
      return new Response(JSON.stringify({ error: "user_id and new_password are required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (newPassword.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ✅ Reset real
    const { data, error } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, user_id: data.user?.id }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error)?.message || "Unknown error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

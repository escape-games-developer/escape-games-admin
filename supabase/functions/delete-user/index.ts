/// <reference lib="deno.ns" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type DeleteUserBody = { user_id: string };

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function pickAuthHeader(req: Request) {
  return req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = requireEnv("SERVICE_ROLE_KEY");

    // 1) VALIDAR que llegue el JWT del usuario logueado
    const authHeader = pickAuthHeader(req);
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing/invalid Authorization header (expected Bearer token)" }, 401);
    }

    // 2) Obtener el usuario llamador (caller) usando ANON + Authorization del request
    const supabaseCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const token = authHeader.slice("Bearer ".length).trim();

const { data: callerData, error: callerErr } = await supabaseCaller.auth.getUser(token);
if (callerErr || !callerData?.user?.id) {
  return json(
    { error: `Unauthorized (getUser): ${callerErr?.message || "no user"}` },
    401
  );
}
const callerId = callerData.user.id;


    // 3) Cliente admin (service role) para borrar sin RLS
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 4) Chequeo: solo ADMIN_GENERAL (admins.is_super = true)
    const { data: adminRow, error: adminErr } = await supabaseAdmin
      .from("admins")
      .select("is_super")
      .eq("user_id", callerId)
      .maybeSingle();

    if (adminErr) return json({ error: `Admin check failed: ${adminErr.message}` }, 500);
    if (!adminRow?.is_super) return json({ error: "Forbidden (not admin general)" }, 403);

    // 5) Body: user_id
    const body = (await req.json()) as Partial<DeleteUserBody>;
    const userId = String(body.user_id ?? "").trim();
    if (!userId) return json({ error: "Falta user_id" }, 400);

    if (userId === callerId) return json({ error: "No podés eliminar tu propio usuario." }, 400);

    // 6) Borrados (orden seguro)
    const { error: e1 } = await supabaseAdmin.from("admins").delete().eq("user_id", userId);
    if (e1) return json({ error: `admins delete: ${e1.message}` }, 400);

    const { error: e2 } = await supabaseAdmin.from("profiles").delete().eq("id", userId);
    if (e2) return json({ error: `profiles delete: ${e2.message}` }, 400);

    const { error: e3 } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (e3) return json({ error: `auth deleteUser: ${e3.message}` }, 400);

    return json({ ok: true }, 200);
  } catch (e) {
    console.error("delete-user error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

/// <reference lib="deno.ns" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type CreateUserBody = {
  nombre: string;
  apellido: string;
  mail: string;
  role: "CLIENT" | "GM" | "ADMIN_GENERAL";
  alias?: string;
  branch_id?: number;
  is_super?: boolean;
};

type CreateUserResp = { mail: string; tempPassword: string } | { error: string };

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

function genTempPassword(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function errMsg(e: unknown) {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

serve(async (req: Request) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ✅ Log mínimo para debug (miralo en Logs/Invocations)
  console.log("create-user hit", new Date().toISOString());

  try {
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    // ✅ JWT del caller (desde browser)
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    console.log("has auth header?", Boolean(authHeader));

    if (!authHeader) return json({ error: "Missing Authorization" }, 401);

    // ✅ Validar el caller con su JWT (método oficial)
    const supabaseCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerData, error: callerErr } = await supabaseCaller.auth.getUser();
    if (callerErr || !callerData?.user) {
      return json(
        { error: `Unauthorized (invalid JWT): ${callerErr?.message || "no user"}` },
        401
      );
    }

    const callerId = callerData.user.id;

    // ✅ Cliente service role (sin RLS) para chequear admins + operar auth/tables
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ✅ Check ADMIN_GENERAL sin depender de RLS
    const { data: adminRow, error: adminErr } = await supabaseAdmin
      .from("admins")
      .select("is_super")
      .eq("user_id", callerId)
      .maybeSingle();

    if (adminErr) {
      return json({ error: `Admin check failed: ${adminErr.message}` }, 500);
    }
    if (!adminRow?.is_super) {
      return json({ error: "Forbidden (not admin general)" }, 403);
    }

    // ✅ Body
    const body = (await req.json()) as Partial<CreateUserBody>;

    const nombre = String(body.nombre ?? "").trim();
    const apellido = String(body.apellido ?? "").trim();
    const mail = String(body.mail ?? "").trim();
    const role = body.role;

    if (!nombre) return json({ error: "Falta nombre" }, 400);
    if (!apellido) return json({ error: "Falta apellido" }, 400);
    if (!mail) return json({ error: "Falta mail" }, 400);

    if (role !== "CLIENT" && role !== "GM" && role !== "ADMIN_GENERAL") {
      return json({ error: "Role inválido" }, 400);
    }

    if (role === "CLIENT") {
      const alias = String(body.alias ?? "").trim();
      if (!alias) return json({ error: "Para CLIENT falta alias" }, 400);
    }

    if (role === "GM") {
      if (!body.branch_id) return json({ error: "Para GM falta branch_id" }, 400);
    }

    // ✅ Crear usuario en Auth con password temporal
    const tempPassword = genTempPassword(10);

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: mail,
      password: tempPassword,
      email_confirm: true,
    });

    if (createErr || !created?.user) {
      return json({ error: `Auth createUser: ${createErr?.message || "unknown"}` }, 400);
    }

    const newUserId = created.user.id;

    // ✅ Upsert en profiles
    const profilePayload: any = {
      id: newUserId,
      nombre,
      apellido,
      mail,
      role,
      is_active: true,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    if (role === "CLIENT") profilePayload.alias = String(body.alias ?? "").trim();

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });

    if (profErr) {
      // rollback best-effort
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return json({ error: `profiles upsert: ${profErr.message}` }, 400);
    }

    // ✅ Si es GM o ADMIN_GENERAL => insertar en admins
    if (role === "GM" || role === "ADMIN_GENERAL") {
      const adminPayload: any = {
        user_id: newUserId,
        mail,
        branch_id: role === "GM" ? body.branch_id : null,
        is_super: role === "ADMIN_GENERAL",
        permissions: null,
        created_at: new Date().toISOString(),
      };

      const { error: admErr2 } = await supabaseAdmin.from("admins").insert(adminPayload);

      if (admErr2) {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
        return json({ error: `admins insert: ${admErr2.message}` }, 400);
      }
    }

    const resp: CreateUserResp = { mail, tempPassword };
    return json(resp, 200);
  } catch (e) {
    console.error("create-user error", e);
    return json({ error: errMsg(e) }, 500);
  }
});

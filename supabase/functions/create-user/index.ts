/// <reference lib="deno.ns" />

import { createClient } from "npm:@supabase/supabase-js@2.49.1";

type CreateUserBody = {
  nombre: string;
  apellido: string;
  mail: string;
  role: "CLIENT" | "GM" | "ADMIN_GENERAL";
  alias?: string;
  branch_id?: any;
  allow_existing?: boolean;
  reset_password?: boolean;
  send_invite?: boolean;
  permissions?: Record<string, boolean>;
  redirect_to?: string;
};

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BRANCHES = [
  "Nuñez", "San Telmo", "Saavedra", "Caballito", "Palermo",
  "Almagro", "Urquiza", "Studios", "La Plata", "Bariloche", "Salta",
] as const;

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
  try { return JSON.stringify(e); } catch { return String(e); }
}

function looksLikeUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function looksLikeJwt(token: string) { return token.split(".").length === 3; }

function extractBearerJwt(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = (m ? m[1] : auth).trim();
  if (!looksLikeJwt(token)) return null;
  return token;
}

function branchNameFromIndex(idx: number): string | null {
  if (!Number.isFinite(idx)) return null;
  if (idx >= 0 && idx < BRANCHES.length) return BRANCHES[idx];
  if (idx >= 1 && idx <= BRANCHES.length) return BRANCHES[idx - 1];
  return null;
}

async function resolveBranchUuidByRaw(supabaseAdmin: any, raw: any): Promise<{ branchId: string; branchName: string }> {
  if (typeof raw === "string" && looksLikeUuid(raw)) {
    const { data, error } = await supabaseAdmin.from("branches").select("id,name,active").eq("id", raw).maybeSingle();
    if (error) throw new Error(`branches lookup failed: ${error.message}`);
    if (!data?.id) throw new Error(`No existe la sucursal (uuid) "${raw}"`);
    if (data.active === false) throw new Error(`La sucursal "${data.name}" está inactiva.`);
    return { branchId: data.id, branchName: data.name };
  }
  let branchName: string | null = null;
  if (typeof raw === "number") {
    branchName = branchNameFromIndex(raw);
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum)) branchName = branchNameFromIndex(asNum);
    if (!branchName) branchName = trimmed;
  }
  if (!branchName) throw new Error("Para GM falta branch_id válido (uuid, nombre o índice).");
  const { data: br, error: brErr } = await supabaseAdmin.from("branches").select("id,name,active").ilike("name", branchName).maybeSingle();
  if (brErr) throw new Error(`branches lookup failed: ${brErr.message}`);
  if (!br?.id) throw new Error(`No existe la sucursal "${branchName}" en public.branches`);
  if (br.active === false) throw new Error(`La sucursal "${br.name}" está inactiva.`);
  return { branchId: br.id, branchName: br.name };
}

async function findUserIdByEmail(supabaseAdmin: any, email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const u = data?.users?.find((x: any) => (x.email || "").toLowerCase() === email.toLowerCase());
  return u?.id ?? null;
}

function defaultPermissionsForRole(role: string): Record<string, boolean> {
  if (role === "ADMIN_GENERAL") {
    return {
      canManageRooms: true, canManageNews: true, canManageUsers: true,
      canEditRankings: true, canAwardKeys: true, canResetClientPassword: true,
    };
  }
  if (role === "GM") {
    return {
      canManageRooms: false, canManageNews: false, canManageUsers: false,
      canEditRankings: false, canAwardKeys: true, canResetClientPassword: false,
    };
  }
  return {};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
    const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const userJwt = extractBearerJwt(req);
    if (!userJwt) return json({ error: "Missing/Invalid Authorization Bearer JWT" }, 401);

    const supabaseCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
    });

    const { data: callerData, error: callerErr } = await supabaseCaller.auth.getUser(userJwt);
    if (callerErr || !callerData?.user) {
      return json({ error: `Unauthorized (invalid JWT): ${callerErr?.message || "no user"}` }, 401);
    }
    const callerId = callerData.user.id;

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: adminRow, error: adminErr } = await supabaseAdmin
      .from("admins").select("is_super").eq("user_id", callerId).maybeSingle();
    if (adminErr) return json({ error: `Admin check failed: ${adminErr.message}` }, 500);
    if (!adminRow?.is_super) return json({ error: "Forbidden (not admin general)" }, 403);

    const body = (await req.json()) as Partial<CreateUserBody>;
    const nombre = String(body.nombre ?? "").trim();
    const apellido = String(body.apellido ?? "").trim();
    const mail = String(body.mail ?? "").trim().toLowerCase();
    const role = body.role;
    const allowExisting = Boolean(body.allow_existing);
    const resetPassword = Boolean(body.reset_password);
    const customPermissions = body.permissions;
    const redirectTo = body.redirect_to;
    const isStaff = role === "GM" || role === "ADMIN_GENERAL";
    const sendInvite = body.send_invite === undefined ? isStaff : Boolean(body.send_invite);

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

    let branchId: string | null = null;
    if (role === "GM") {
      const resolved = await resolveBranchUuidByRaw(supabaseAdmin, body.branch_id);
      branchId = resolved.branchId;
    }

    const existingId = await findUserIdByEmail(supabaseAdmin, mail);
    let userId: string;
    let tempPassword: string | null = null;
    let existed = false;
    let method: "invite" | "password" = sendInvite ? "invite" : "password";

    if (existingId) {
      existed = true;
      userId = existingId;
      if (!allowExisting) {
        return json({ error: "A user with this email address has already been registered" }, 409);
      }
      if (sendInvite) {
        const inviteOpts: any = { data: { nombre, apellido, role } };
        if (redirectTo) inviteOpts.redirectTo = redirectTo;
        const { error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(mail, inviteOpts);
        if (invErr) return json({ error: `inviteUserByEmail: ${invErr.message}` }, 400);
        method = "invite";
      } else if (resetPassword) {
        tempPassword = genTempPassword(10);
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existingId, { password: tempPassword });
        if (updErr) return json({ error: `Auth updateUserById(password): ${updErr.message}` }, 400);
        method = "password";
      }
    } else if (sendInvite) {
      const inviteOpts: any = { data: { nombre, apellido, role } };
      if (redirectTo) inviteOpts.redirectTo = redirectTo;
      const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(mail, inviteOpts);
      if (inviteErr || !invited?.user) {
        return json({ error: inviteErr?.message || "inviteUserByEmail failed" }, 400);
      }
      userId = invited.user.id;
      tempPassword = null;
      method = "invite";
    } else {
      tempPassword = genTempPassword(10);
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: mail, password: tempPassword, email_confirm: true,
      });
      if (createErr || !created?.user) {
        return json({ error: createErr?.message || "Auth createUser failed" }, 400);
      }
      userId = created.user.id;
      method = "password";
    }

    const profilePayload: any = {
      id: userId, nombre, apellido, mail, role,
      is_active: true, updated_at: new Date().toISOString(),
    };
    if (!existed) profilePayload.created_at = new Date().toISOString();
    if (role === "CLIENT") profilePayload.alias = String(body.alias ?? "").trim();

    const { error: profErr } = await supabaseAdmin.from("profiles").upsert(profilePayload, { onConflict: "id" });
    if (profErr) {
      if (!existed) await supabaseAdmin.auth.admin.deleteUser(userId);
      return json({ error: `profiles upsert failed: ${profErr.message}` }, 400);
    }

    let effectivePerms: Record<string, boolean> | null = null;
    if (role === "GM" || role === "ADMIN_GENERAL") {
      effectivePerms = customPermissions && Object.keys(customPermissions).length > 0
        ? customPermissions : defaultPermissionsForRole(role);
      const adminPayload: any = {
        user_id: userId, mail,
        branch_id: role === "GM" ? branchId : null,
        is_super: role === "ADMIN_GENERAL",
        permissions: effectivePerms,
        created_at: existed ? undefined : new Date().toISOString(),
      };
      Object.keys(adminPayload).forEach((k) => adminPayload[k] === undefined && delete adminPayload[k]);
      const { error: admErr } = await supabaseAdmin.from("admins").upsert(adminPayload, { onConflict: "user_id" });
      if (admErr) {
        if (!existed) await supabaseAdmin.auth.admin.deleteUser(userId);
        return json({ error: `admins upsert failed: ${admErr.message}` }, 500);
      }
    }

    return json({ mail, tempPassword, userId, existed, method, permissions: effectivePerms }, 200);
  } catch (e) {
    return json({ error: errMsg(e) }, 500);
  }
});

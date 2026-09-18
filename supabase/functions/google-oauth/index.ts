import { corsHeaders, encryptToken, authenticatedUser, json, requireSuper, serviceClient, getAccessToken } from "../_shared/recontactosGoogle.ts";

const redirectUri = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-oauth/callback`;
const scopes = ["openid", "email", "https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/spreadsheets"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();
  try {
    if (action === "callback") {
      const state = url.searchParams.get("state"); const code = url.searchParams.get("code");
      if (!state || !code) return new Response("OAuth incompleto", { status: 400 });
      const db = serviceClient();
      const { data: saved } = await db.from("google_oauth_states").select("*").eq("state", state).maybeSingle();
      if (!saved || new Date(saved.expires_at).getTime() < Date.now()) return new Response("El enlace OAuth venció", { status: 400 });
      await db.from("google_oauth_states").delete().eq("state", state);
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!, redirect_uri: redirectUri(), grant_type: "authorization_code" }) });
      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok || !tokens.refresh_token) throw new Error(tokens.error_description ?? "Google no devolvió refresh token");
      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const profile = await profileResponse.json();
      await db.from("google_oauth_connections").update({ revoked_at: new Date().toISOString() }).is("revoked_at", null);
      const { data: connection, error } = await db.from("google_oauth_connections").insert({ owner_user_id: saved.owner_user_id, google_email: profile.email, refresh_token_ciphertext: await encryptToken(tokens.refresh_token), access_token_ciphertext: await encryptToken(tokens.access_token), access_token_expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(), scopes }).select("id").single();
      if (error) throw error;
      const destination = new URL(saved.return_to); destination.searchParams.set("google", "connected"); destination.searchParams.set("connection", connection.id);
      return Response.redirect(destination.toString(), 302);
    }

    const user = await authenticatedUser(req);
    if (!user || !(await requireSuper(user.id))) return json({ error: "Acceso restringido al Admin General" }, 403);
    const db = serviceClient();
    if (action === "start" && req.method === "POST") {
      const { returnTo } = await req.json(); const allowedOrigin = Deno.env.get("APP_ORIGIN")!;
      if (!String(returnTo).startsWith(allowedOrigin)) return json({ error: "Origen de retorno inválido" }, 400);
      const state = crypto.randomUUID();
      await db.from("google_oauth_states").insert({ state, owner_user_id: user.id, return_to: returnTo, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.search = new URLSearchParams({ client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!, redirect_uri: redirectUri(), response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", scope: scopes.join(" "), state }).toString();
      return json({ authorizationUrl: auth.toString() });
    }
    const { data: connection } = await db.from("google_oauth_connections").select("*").is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (action === "status") return json(connection ? { connected: true, id: connection.id, email: connection.google_email } : { connected: false });
    if (action === "picker-token") {
      if (!connection) return json({ error: "Google no está conectado" }, 409);
      return json({ accessToken: await getAccessToken(connection), developerKey: Deno.env.get("GOOGLE_PICKER_API_KEY"), appId: Deno.env.get("GOOGLE_CLOUD_PROJECT_NUMBER") });
    }
    if (action === "assign-sheet" && req.method === "POST") {
      if (!connection) return json({ error: "Google no está conectado" }, 409);
      const body = await req.json();
      if (!body.branchId || !body.spreadsheetId || !body.spreadsheetName) return json({ error: "Selección incompleta" }, 400);
      const { error } = await db.from("recontactos_branch_sheets").upsert({ branch_id: body.branchId, google_connection_id: connection.id, spreadsheet_id: body.spreadsheetId, spreadsheet_name: body.spreadsheetName, sheet_tab: body.sheetTab || "Recontactos", active: body.enabled !== false, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "branch_id" });
      if (error) throw error;
      return json({ saved: true });
    }
    if (action === "disconnect" && req.method === "DELETE") {
      if (!connection) return json({ disconnected: true });
      try { const token = await getAccessToken(connection); await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }); } catch { /* se revoca localmente incluso si Google no responde */ }
      await db.from("google_oauth_connections").update({ revoked_at: new Date().toISOString(), access_token_ciphertext: null }).eq("id", connection.id);
      return json({ disconnected: true });
    }
    return json({ error: "Acción no encontrada" }, 404);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Error OAuth" }, 500); }
});

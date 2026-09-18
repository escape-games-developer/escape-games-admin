import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "http://localhost:5173",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
};

export const serviceClient = () => createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function authenticatedUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await serviceClient().auth.getUser(token);
  return data.user ?? null;
}

export async function requireSuper(userId: string) {
  const { data } = await serviceClient().from("admins").select("is_super").eq("user_id", userId).maybeSingle();
  return data?.is_super === true;
}

async function cipherKey() {
  const secret = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!secret) throw new Error("Falta GOOGLE_TOKEN_ENCRYPTION_KEY");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cipherKey(), new TextEncoder().encode(value)));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...encrypted))}`;
}

export async function decryptToken(value: string) {
  const [ivRaw, dataRaw] = value.split(".");
  const iv = Uint8Array.from(atob(ivRaw), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(dataRaw), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await cipherKey(), data));
}

export async function getAccessToken(connection: Record<string, unknown>) {
  const expiresAt = new Date(String(connection.access_token_expires_at ?? 0)).getTime();
  if (connection.access_token_ciphertext && expiresAt > Date.now() + 60_000) return decryptToken(String(connection.access_token_ciphertext));
  const refreshToken = await decryptToken(String(connection.refresh_token_ciphertext));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  const result = await response.json();
  if (!response.ok) throw new Error(`No se pudo renovar el acceso a Google: ${result.error_description ?? result.error}`);
  const accessToken = String(result.access_token);
  await serviceClient().from("google_oauth_connections").update({ access_token_ciphertext: await encryptToken(accessToken), access_token_expires_at: new Date(Date.now() + Number(result.expires_in ?? 3600) * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("id", connection.id);
  return accessToken;
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });


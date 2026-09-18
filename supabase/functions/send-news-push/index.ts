import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/* Expo rechaza el lote completo con 400 si mandás más de 100 mensajes en un
   request ("Must contain at most 100 element(s)"). Hay que partir en tandas. */
const EXPO_MAX_PER_REQUEST = 100;

/* PostgREST corta en max_rows (1000 por default) sin avisar. Se pagina para que
   no se pierdan destinatarios silenciosamente cuando crezca la base. */
const PROFILES_PAGE_SIZE = 1000;

type NewsPushPayload = {
  newsId: string;
  title: string;
  description?: string;
  type?: string;
  publishedAt?: string;
  imageUrl?: string;
  ctaLink?: string;
};

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function stripAndTrim(text: string, max = 140) {
  const clean = String(text || "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/_/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Método no permitido" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) {
      return json(500, { error: "Faltan variables de entorno de Supabase" });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    /* ---------- auth ----------
       Esto dispara un broadcast a toda la base, así que no puede quedar
       abierto: exige sesión real y que el usuario esté en `admins`. El permiso
       fino por sección lo sigue resolviendo el panel; acá sólo se corta el
       acceso anónimo. Mismo criterio que `send-push-notification`. */

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Falta el header Authorization" });

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: "Sesión inválida" });

    const { data: adminRow, error: adminErr } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (adminErr) return json(500, { error: `No se pudo validar el admin: ${adminErr.message}` });
    if (!adminRow) return json(403, { error: "Se requiere ser admin" });

    /* ---------- payload ---------- */

    const payload = (await req.json()) as NewsPushPayload;

    if (!payload?.newsId || !payload?.title) {
      return json(400, { error: "Faltan newsId o title" });
    }

    /* ---------- destinatarios ---------- */

    const tokenSet = new Set<string>();

    for (let page = 0; ; page++) {
      const from = page * PROFILES_PAGE_SIZE;

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, expo_push_token")
        .not("expo_push_token", "is", null)
        .range(from, from + PROFILES_PAGE_SIZE - 1);

      if (profilesError) throw profilesError;
      if (!profiles?.length) break;

      for (const row of profiles) {
        const token = row.expo_push_token;
        /* El Set deduplica: el mismo device puede quedar pegado a más de un
           perfil y Expo cobraría el envío dos veces. */
        if (typeof token === "string" && token.startsWith("ExponentPushToken[")) {
          tokenSet.add(token);
        }
      }

      if (profiles.length < PROFILES_PAGE_SIZE) break;
    }

    const tokens = [...tokenSet];
    console.log("Tokens válidos:", tokens.length);

    if (tokens.length === 0) {
      return json(200, { ok: true, total: 0, sent: 0, failed: 0, reason: "Sin tokens válidos" });
    }

    /* ---------- envío por tandas ---------- */

    const bodyText = stripAndTrim(payload.description || payload.title, 120);

    const buildMessage = (to: string) => ({
      to,
      sound: "default",
      title: payload.title,
      body: bodyText || payload.description || payload.title,
      data: {
        screen: "index",
        newsId: payload.newsId,
        type: payload.type || null,
        publishedAt: payload.publishedAt || null,
        imageUrl: payload.imageUrl || null,
        ctaLink: payload.ctaLink || null,
      },
    });

    const batches = chunk(tokens, EXPO_MAX_PER_REQUEST);

    let sent = 0;
    let failed = 0;
    const staleTokens: string[] = [];
    const errors: string[] = [];

    for (const [index, batch] of batches.entries()) {
      let expoRes: Response;
      let expoText: string;

      try {
        expoRes = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify(batch.map(buildMessage)),
        });
        expoText = await expoRes.text();
      } catch (err) {
        /* Una tanda caída no debe abortar las demás. */
        failed += batch.length;
        errors.push(`tanda ${index + 1}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      if (!expoRes.ok) {
        failed += batch.length;
        errors.push(`tanda ${index + 1}: Expo ${expoRes.status} ${expoText.slice(0, 300)}`);
        continue;
      }

      let tickets: ExpoTicket[] = [];
      try {
        tickets = (JSON.parse(expoText)?.data ?? []) as ExpoTicket[];
      } catch {
        errors.push(`tanda ${index + 1}: respuesta de Expo ilegible`);
      }

      batch.forEach((token, i) => {
        const ticket = tickets[i];

        if (!ticket || ticket.status === "ok") {
          sent++;
          return;
        }

        failed++;

        /* DeviceNotRegistered = app desinstalada o token rotado. Si no se
           limpia, la lista crece para siempre con tokens muertos. */
        if (ticket.details?.error === "DeviceNotRegistered") staleTokens.push(token);
        else if (ticket.message) errors.push(`tanda ${index + 1}: ${ticket.message}`);
      });
    }

    /* ---------- limpieza de tokens muertos ---------- */

    let invalidated = 0;

    if (staleTokens.length > 0) {
      const { error: cleanupError, count } = await supabase
        .from("profiles")
        .update({ expo_push_token: null }, { count: "exact" })
        .in("expo_push_token", staleTokens);

      if (cleanupError) errors.push(`limpieza de tokens: ${cleanupError.message}`);
      else invalidated = count ?? staleTokens.length;
    }

    const result = {
      ok: sent > 0,
      total: tokens.length,
      sent,
      failed,
      invalidated,
      batches: batches.length,
      errors: errors.slice(0, 10),
    };

    console.log("Resultado:", JSON.stringify(result));

    /* Un fallo parcial sigue siendo un envío: solo es 500 si no salió ninguna. */
    return json(sent > 0 ? 200 : 500, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.log("Function error:", message);
    return json(500, { error: message });
  }
});

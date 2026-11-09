// reservas-sync — recibe filas de la hoja VENTAS ONLINE (ORIGEN ESCAPE) y las
// guarda en public.web_reservations.
//
// Quién la llama:
//   · Apps Script 'SyncReservas.gs' (docs/apps-script), cada 15 minutos.
//   · La carga inicial, una sola vez.
//
// Autenticación: header 'x-sync-token' = secreto RESERVAS_SYNC_TOKEN. No usa la
// sesión de Supabase: el Apps Script no tiene una.
//
// Body: { "rows": [ { "REFERENCIA": "WC-4702", "EMAIL": "...", ... }, ... ] }
// Las claves son los encabezados de la hoja, tal cual. Sucursal, sala, jugadores
// y fecha de visita los calcula el trigger 'web_reservations_derive'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-sync-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_ROWS = 1000;

type Row = Record<string, unknown>;

const text = (value: unknown): string | null => {
  const s = String(value ?? "").trim();
  return s ? s : null;
};

const num = (value: unknown): number | null => {
  const s = String(value ?? "").replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(s);
  return s && Number.isFinite(n) ? n : null;
};

/** "16/9/2026 11:29:13" o "2026-09-16 11:28:46" → ISO con hora de Argentina. */
const fecha = (value: unknown): string | null => {
  const s = String(value ?? "").trim();
  const p2 = (v: string) => v.padStart(2, "0");
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, d, mo, y, h = "0", mi = "0", se = "0"] = m;
    return y + "-" + p2(mo) + "-" + p2(d) + "T" + p2(h) + ":" + p2(mi) + ":" + p2(se) + "-03:00";
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, y, mo, d, h = "00", mi = "00", se = "00"] = m;
    return y + "-" + mo + "-" + d + "T" + h + ":" + mi + ":" + se + "-03:00";
  }
  return null;
};

function toRecord(row: Row) {
  const get = (key: string) => row[key];
  const referencia = text(get("REFERENCIA"));
  if (!referencia) return null;
  return {
    referencia,
    recibido_at: fecha(get("RECIBIDO")),
    pedido_at: fecha(get("FECHA DEL PEDIDO")),
    estado: text(get("ESTADO"))?.toLowerCase() ?? null,
    marca: text(get("MARCA")),
    servicio: text(get("SERVICIO")),
    monto: num(get("MONTO")),
    cantidad: num(get("CANTIDAD")),
    visita_texto: text(get("FECHA DE LA VISITA")),
    nombre: text(get("NOMBRE")),
    email: text(get("EMAIL"))?.toLowerCase() ?? null,
    telefono: text(get("TELEFONO")),
    cupon: text(get("CUPÓN") ?? get("CUPON")),
    origen: text(get("ORIGEN")),
    campana: text(get("CAMPAÑA") ?? get("CAMPANA")),
    medio: text(get("MEDIO")),
    dispositivo: text(get("DISPOSITIVO")),
    booknetic_id: text(get("ID BOOKNETIC")),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "metodo_no_permitido" }, 405);

  const expected = Deno.env.get("RESERVAS_SYNC_TOKEN");
  if (!expected) return json({ ok: false, error: "falta_configurar_token" }, 500);
  if (req.headers.get("x-sync-token") !== expected) return json({ ok: false, error: "token_invalido" }, 401);

  let body: { rows?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "json_invalido" }, 400);
  }

  const rows = Array.isArray(body.rows) ? (body.rows as Row[]) : [];
  if (!rows.length) return json({ ok: true, recibidas: 0, guardadas: 0 });
  if (rows.length > MAX_ROWS) return json({ ok: false, error: "maximo_" + MAX_ROWS + "_filas_por_envio" }, 413);

  // Una referencia repetida en el mismo envío: gana la última (la hoja agrega abajo).
  const byRef = new Map<string, NonNullable<ReturnType<typeof toRecord>>>();
  let descartadas = 0;
  for (const row of rows) {
    const rec = toRecord(row);
    if (rec) byRef.set(rec.referencia, rec);
    else descartadas++;
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const records = [...byRef.values()];
  const { error } = await db.from("web_reservations").upsert(records, { onConflict: "referencia" });
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, recibidas: rows.length, guardadas: records.length, descartadas });
});

// rpw-storage — Supabase Edge Function belépési pont (RPW-003).
// A logika a core.js-ben van (Node-ban tesztelve); ez csak bekötés.
// A SUPABASE_SERVICE_ROLE_KEY-t a Supabase futtatókörnyezete adja — nincs a repóban,
// nincs a kliensben, és ez a függvény soha nem adja vissza.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { handle } from "./core.js";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "rpw-photos";
const ALLOWED_ORIGINS = new Set([
  "https://rpw-bosch-service.netlify.app",
  "https://main--rpw-bosch-service.netlify.app",
]);

const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const deps = {
  rpc: async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await anon.rpc(name, args);
    if (error) return null;
    return data;
  },
  sign: {
    upload: async (path: string, o: { upsert: boolean }) => {
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: o.upsert });
      return error ? { error } : { token: data.token, signedUrl: data.signedUrl, path: data.path };
    },
    read: async (paths: string[], exp: number) => {
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(paths, exp);
      return error ? { error } : { data };
    },
    remove: async (paths: string[]) => {
      const { error } = await admin.storage.from(BUCKET).remove(paths);
      return error ? { error } : { ok: true };
    },
  },
  audit: async (row: Record<string, unknown>) => {
    const { error } = await admin.from("rpw_audit").insert(row);
    if (error) throw error;
  },
};

function cors(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-rpw-token",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const h = { ...cors(origin), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "method" }), { status: 405, headers: h });
  // Böngészőből csak az engedélyezett oldalról (a CORS nem jogosultság — azt a core dönti el)
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ ok: false, error: "origin" }), { status: 403, headers: h });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ ok: false, error: "json" }), { status: 400, headers: h }); }
  const token = req.headers.get("x-rpw-token") || undefined;
  try {
    const r = await handle({ ...body, token }, deps);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: h });
  } catch (e) {
    console.error("rpw-storage", e);
    return new Response(JSON.stringify({ ok: false, error: "internal" }), { status: 500, headers: h });
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const origins = new Set(["http://127.0.0.1:4173", "http://localhost:4173", "https://mosshead-marimo.github.io"]);
const eventTypes = new Set(["page_view", "section_view", "service_view", "cta_click", "form_start", "form_step", "form_submit", "outbound_click"]);
const clean = (value: unknown, max = 200) => typeof value === "string" ? value.trim().slice(0, max) : null;
const reply = (body: unknown, status: number, origin: string | null) => new Response(JSON.stringify(body), { status, headers: {
  "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin",
  ...(origin && origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
} });
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
  .map((byte) => byte.toString(16).padStart(2, "0")).join("");
const admin = () => {
  const current = Deno.env.get("SUPABASE_SECRET_KEYS");
  const key = current ? JSON.parse(current).default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(Deno.env.get("SUPABASE_URL")!, key!, { auth: { persistSession: false } });
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (origin && !origins.has(origin)) return reply({ error: "Origin not allowed" }, 403, null);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": origin ?? "http://127.0.0.1:4173", "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "86400", "Vary": "Origin",
  } });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405, origin);
  if (Number(req.headers.get("content-length") ?? 0) > 12000) return reply({ error: "Too large" }, 413, origin);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON" }, 400, origin); }
  if (clean(body.website)) return reply({ ok: true }, 202, origin);
  const eventType = clean(body.eventType, 40);
  const sessionId = clean(body.sessionId, 36);
  if (!eventType || !eventTypes.has(eventType) || !sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) return reply({ error: "Invalid event" }, 422, origin);

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
    const ipHash = await hash(ip);
    const db = admin();
    const { count, error: countError } = await db.from("analytics_events").select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash).gte("occurred_at", new Date(Date.now() - 3600000).toISOString());
    if (countError) throw countError;
    if ((count ?? 0) >= 120) return reply({ error: "Rate limited" }, 429, origin);
    const width = Number(body.viewportWidth ?? 0);
    const device = width > 0 && width < 768 ? "mobile" : width < 1100 ? "tablet" : "desktop";
    const safeMetadata = typeof body.metadata === "object" && body.metadata && !Array.isArray(body.metadata) ? body.metadata : {};
    const { error } = await db.from("analytics_events").insert({
      session_id: sessionId, event_type: eventType, page_path: clean(body.pagePath, 500) || "/",
      section: clean(body.section), service_id: clean(body.serviceId, 36), referrer_host: clean(body.referrerHost),
      utm_source: clean(body.utmSource), utm_medium: clean(body.utmMedium), utm_campaign: clean(body.utmCampaign),
      device_category: device, ip_hash: ipHash, metadata: safeMetadata,
    });
    if (error) throw error;
    return reply({ ok: true }, 201, origin);
  } catch (error) {
    console.error("Analytics ingestion failed", error);
    return reply({ error: "Event unavailable" }, 500, origin);
  }
});

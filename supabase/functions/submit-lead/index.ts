import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const allowedOrigins = new Set([
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "https://mosshead-marimo.github.io",
]);
const allowedServices = new Set(["RAG / Document AI", "Agentic Workflow", "AI / ML System", "LLM Evaluation / Safety", "AI Backend / API", "Other / Not sure"]);
const allowedStages = new Set(["New product", "Improve existing system", "Audit or rescue"]);
const allowedBudgets = new Set(["Less than $2k USD", "$2k–$5k USD", "$5k–$10k USD", "$10k+ USD", "Not sure yet"]);
const allowedTimelines = new Set(["ASAP", "2–4 weeks", "1–3 months", "Flexible"]);
const allowedNeeds = new Set(["Data is ready", "Existing codebase", "Cloud deployment needed", "Ongoing support wanted"]);

const json = (body: unknown, status: number, origin: string | null) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    ...(origin && allowedOrigins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
  },
});
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
  .map((byte) => byte.toString(16).padStart(2, "0")).join("");

const getAdminClient = () => {
  const url = Deno.env.get("SUPABASE_URL");
  const currentKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const secretKey = currentKeys ? JSON.parse(currentKeys).default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secretKey) throw new Error("Supabase server configuration is unavailable.");
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin is not allowed." }, 403, null);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": origin ?? "http://127.0.0.1:4173",
    "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400", "Vary": "Origin",
  } });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return json({ error: "Content-Type must be application/json." }, 415, origin);
  if (Number(req.headers.get("content-length") ?? "0") > 24_000) return json({ error: "Request is too large." }, 413, origin);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400, origin); }
  if (clean(body.website, 200)) return json({ ok: true, reference: "received" }, 202, origin);

  const service = clean(body.service, 80), projectStage = clean(body.projectStage, 80);
  const projectName = clean(body.projectName, 160), problem = clean(body.problem, 5000);
  const budget = clean(body.budget, 80), timeline = clean(body.timeline, 80);
  const contactName = clean(body.name, 160), contactEmail = clean(body.email, 320).toLowerCase();
  const company = clean(body.company, 160), relevantLink = clean(body.link, 2048);
  const needs = Array.isArray(body.needs) ? [...new Set(body.needs.map((item) => clean(item, 80)))].filter((item) => allowedNeeds.has(item)) : [];
  let validLink = true;
  if (relevantLink) try { validLink = ["https:", "http:"].includes(new URL(relevantLink).protocol); } catch { validLink = false; }
  if (!allowedServices.has(service) || !allowedStages.has(projectStage) || !allowedBudgets.has(budget) ||
      !allowedTimelines.has(timeline) || problem.length < 20 || contactName.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail) || body.consent !== true || !validLink) {
    return json({ error: "Check the request details and try again." }, 422, origin);
  }

  try {
    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ipHash = await sha256(forwarded || req.headers.get("cf-connecting-ip") || "unknown");
    const supabase = getAdminClient();
    const { count, error: countError } = await supabase.from("lead_requests").select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
    if (countError) throw countError;
    if ((count ?? 0) >= 5) return json({ error: "Too many requests. Please try again in about an hour." }, 429, origin);

    const { data, error } = await supabase.from("lead_requests").insert({
      service, project_stage: projectStage, project_name: projectName || null, problem, budget, timeline, needs,
      contact_name: contactName, contact_email: contactEmail, company: company || null, relevant_link: relevantLink || null,
      consent: true, source: "portfolio", ip_hash: ipHash, user_agent: clean(req.headers.get("user-agent"), 512) || null,
      referrer: clean(body.referrer, 2048) || null,
    }).select("id").single();
    if (error) throw error;
    return json({ ok: true, reference: data.id }, 201, origin);
  } catch (error) {
    console.error("Lead submission failed", error);
    return json({ error: "The request could not be saved. Please use the email fallback." }, 500, origin);
  }
});

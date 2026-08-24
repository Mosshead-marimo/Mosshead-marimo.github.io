import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cors, requireAdmin, audit } from "../../../lib/platform.js";
import { contentPublishSchema, parseBody } from "../../../lib/schemas.js";
import { fail } from "../../../lib/http.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { contentId } = parseBody(contentPublishSchema, req.body);
    const { data: item } = await admin.db.from("content_items").select("*").eq("id", contentId).eq("status", "approved").single();
    if (!item) return res.status(409).json({ error: "Only approved content can be published" });
    if (!process.env.GITHUB_TOKEN) return res.status(409).json({ error: "GitHub publishing is not connected", fallback: item.github_content || item.linkedin_content });
    const owner = process.env.GITHUB_OWNER || "Mosshead-marimo", repo = process.env.GITHUB_CONTENT_REPO || "Mosshead-marimo.github.io";
    const slug = (item.utm_campaign || item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-|-$/g, "");
    const path = `content/${new Date().toISOString().slice(0, 10)}-${slug}.md`;
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, { method: "PUT", headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" }, body: JSON.stringify({ message: `Publish content: ${item.title}`, content: Buffer.from(`# ${item.title}\n\n${item.github_content || item.linkedin_content || item.source_notes || ""}\n`).toString("base64") }) });
    if (!response.ok) throw Object.assign(new Error(`GitHub publishing failed (${response.status})`), { statusCode: 502 });
    const payload = await response.json() as { content?: { html_url?: string } };
    await admin.db.from("content_items").update({ status: "published", published_at: new Date().toISOString(), github_url: payload.content?.html_url || null }).eq("id", contentId);
    await audit(admin.db, admin.user.id, "publish", "content", contentId, { channel: "github", url: payload.content?.html_url });
    res.status(200).json({ url: payload.content?.html_url });
  } catch (error) { fail(res, error); }
}

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
    const commentary = item.linkedin_content || item.source_notes || "";
    if (!process.env.LINKEDIN_ACCESS_TOKEN || !process.env.LINKEDIN_AUTHOR_URN) return res.status(409).json({ error: "LinkedIn publishing permission is unavailable", fallback: commentary });
    const response = await fetch("https://api.linkedin.com/rest/posts", { method: "POST", headers: { authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`, "content-type": "application/json", "linkedin-version": "202601", "x-restli-protocol-version": "2.0.0" }, body: JSON.stringify({ author: process.env.LINKEDIN_AUTHOR_URN, commentary, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false }) });
    if (!response.ok) return res.status(409).json({ error: `LinkedIn permission or publishing failed (${response.status})`, fallback: commentary });
    const postId = response.headers.get("x-restli-id");
    await admin.db.from("content_items").update({ status: "published", published_at: new Date().toISOString(), linkedin_url: postId ? `https://www.linkedin.com/feed/update/${postId}` : null }).eq("id", contentId);
    await audit(admin.db, admin.user.id, "publish", "content", contentId, { channel: "linkedin", postId });
    res.status(200).json({ postId });
  } catch (error) { fail(res, error); }
}

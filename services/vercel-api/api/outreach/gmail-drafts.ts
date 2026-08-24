import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cors, requireAdmin, decryptJson, encryptJson, audit } from "../../lib/platform.js";
import { fail } from "../../lib/http.js";
import { messageIdsSchema, parseBody } from "../../lib/schemas.js";

type GoogleTokens = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
const base64url = (value: string) => Buffer.from(value, "utf8").toString("base64url");
async function refresh(tokens: GoogleTokens) {
  if (!tokens.refresh_token) return tokens;
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: String(process.env.GOOGLE_CLIENT_ID), client_secret: String(process.env.GOOGLE_CLIENT_SECRET), refresh_token: tokens.refresh_token, grant_type: "refresh_token" }) });
  if (!response.ok) throw new Error("Could not refresh Gmail authorization");
  return { ...tokens, ...(await response.json() as GoogleTokens) };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { messageIds } = parseBody(messageIdsSchema, req.body);
    const [{ data: setting }, { data: connection }, { data: messages, error }] = await Promise.all([
      admin.db.from("site_settings").select("setting_value").eq("setting_key", "feature_gmail_drafts").maybeSingle(),
      admin.db.from("integration_connections").select("*").eq("provider", "gmail").maybeSingle(),
      admin.db.from("outreach_messages").select("*,outreach_recipients(email)").in("id", messageIds).eq("status", "approved"),
    ]);
    if (setting?.setting_value !== true) return res.status(409).json({ error: "Gmail drafts are disabled" });
    if (!connection?.encrypted_secret) return res.status(409).json({ error: "Connect Gmail first" });
    if (error) throw error;
    let tokens = await refresh(decryptJson<GoogleTokens>(connection.encrypted_secret));
    await admin.db.from("integration_connections").update({ encrypted_secret: encryptJson(tokens), last_checked_at: new Date().toISOString() }).eq("provider", "gmail");
    const results: Array<{ id: string; gmailDraftId?: string; error?: string }> = [];
    for (const message of messages || []) {
      const recipient = Array.isArray(message.outreach_recipients) ? message.outreach_recipients[0] : message.outreach_recipients;
      if (!recipient?.email) { results.push({ id: message.id, error: "Recipient email missing" }); continue; }
      const raw = [`To: ${recipient.email}`, `Subject: ${message.subject}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", message.body_text].join("\r\n");
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", { method: "POST", headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ message: { raw: base64url(raw) } }) });
      if (!response.ok) { results.push({ id: message.id, error: `Gmail returned ${response.status}` }); continue; }
      const draft = await response.json() as { id: string };
      await admin.db.from("outreach_messages").update({ status: "gmail_draft", gmail_draft_id: draft.id }).eq("id", message.id);
      results.push({ id: message.id, gmailDraftId: draft.id });
    }
    await audit(admin.db, admin.user.id, "create_gmail_drafts", "outreach_message", undefined, { requested: messageIds.length, created: results.filter(x => x.gmailDraftId).length });
    res.status(200).json({ results, sent: 0, guarantee: "Drafts were created; no message was sent." });
  } catch (error) { fail(res, error); }
}

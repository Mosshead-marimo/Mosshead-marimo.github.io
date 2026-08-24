import type { VercelRequest, VercelResponse } from "@vercel/node";
import { encryptJson, serviceDb, verifyState } from "../../../lib/platform.js";
import { fail } from "../../../lib/http.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const code = String(req.query.code || ""), state = String(req.query.state || "");
    const verified = verifyState<{ exp: number; adminUserId: string; provider: string }>(state);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: String(process.env.GOOGLE_CLIENT_ID), client_secret: String(process.env.GOOGLE_CLIENT_SECRET), redirect_uri: String(process.env.GOOGLE_REDIRECT_URI), grant_type: "authorization_code" }) });
    if (!tokenResponse.ok) throw Object.assign(new Error("Google authorization failed"), { statusCode: 400 });
    const tokens = await tokenResponse.json() as Record<string, unknown>;
    const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
    const profile = userResponse.ok ? await userResponse.json() as { email?: string } : {};
    const db = serviceDb();
    await db.from("integration_connections").upsert({ provider: "gmail", status: "connected", account_label: profile.email || "Google account", scopes: String(tokens.scope || "").split(" "), encrypted_secret: encryptJson(tokens), last_checked_at: new Date().toISOString(), error_message: null }, { onConflict: "provider" });
    await db.from("admin_audit_log").insert({ admin_user_id: verified.adminUserId, action: "connect", entity_type: "integration", entity_id: "gmail" });
    res.redirect(302, "https://mosshead-marimo.github.io/kaush1k/?integration=gmail-connected");
  } catch (error) { fail(res, error); }
}

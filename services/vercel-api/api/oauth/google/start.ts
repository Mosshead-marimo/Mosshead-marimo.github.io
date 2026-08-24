import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cors, requireAdmin, signState } from "../../../lib/platform.js";
import { fail } from "../../../lib/http.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res, "GET,OPTIONS")) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const params = new URLSearchParams({
      client_id: String(process.env.GOOGLE_CLIENT_ID), redirect_uri: String(process.env.GOOGLE_REDIRECT_URI), response_type: "code",
      access_type: "offline", prompt: "consent", include_granted_scopes: "true",
      scope: "openid email https://www.googleapis.com/auth/gmail.compose",
      state: signState({ adminUserId: admin.user.id, provider: "gmail" }),
    });
    res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  } catch (error) { fail(res, error); }
}

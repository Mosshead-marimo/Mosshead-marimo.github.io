import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cors } from "../lib/platform.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res, "GET,OPTIONS")) return;
  res.status(200).json({ ok: true, service: "kaushik-portfolio-api", time: new Date().toISOString() });
}

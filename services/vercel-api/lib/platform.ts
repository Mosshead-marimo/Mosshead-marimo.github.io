import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
};

export const serviceDb = () => createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const origins = () => new Set((process.env.PUBLIC_SITE_ORIGINS || "https://mosshead-marimo.github.io,http://127.0.0.1:4173,http://localhost:4173").split(",").map(x => x.trim()).filter(Boolean));

export function cors(req: VercelRequest, res: VercelResponse, methods = "POST,OPTIONS") {
  const origin = String(req.headers.origin || "");
  if (origin && origins().has(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "authorization,content-type,idempotency-key");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  if (origin && !origins().has(origin)) { res.status(403).json({ error: "Origin not allowed" }); return true; }
  return false;
}

export async function requireAdmin(req: VercelRequest, res: VercelResponse) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) { res.status(401).json({ error: "Authentication required" }); return null; }
  const db = serviceDb();
  const { data: auth, error } = await db.auth.getUser(token);
  if (error || !auth.user) { res.status(401).json({ error: "Invalid session" }); return null; }
  const { data: admin } = await db.from("admin_users").select("user_id,username").eq("user_id", auth.user.id).maybeSingle();
  if (!admin) { res.status(403).json({ error: "Admin access required" }); return null; }
  return { user: auth.user, admin, db };
}

export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

function encryptionKey() { return crypto.createHash("sha256").update(required("INTEGRATION_ENCRYPTION_KEY")).digest(); }
export function encryptJson(value: unknown) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { v: 1, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}
export function decryptJson<T>(sealed: { iv: string; tag: string; ciphertext: string }): T {
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(sealed.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64url")), decipher.final()]).toString("utf8")) as T;
}

export function signState(payload: object) {
  const encoded = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 10 * 60_000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", encryptionKey()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}
export function verifyState<T extends { exp: number }>(state: string): T {
  const [encoded, sig] = state.split(".");
  const expected = crypto.createHmac("sha256", encryptionKey()).update(encoded).digest("base64url");
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error("Invalid OAuth state");
  const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  if (value.exp < Date.now()) throw new Error("Expired OAuth state");
  return value;
}

export async function audit(db: ReturnType<typeof serviceDb>, adminUserId: string, action: string, entityType: string, entityId?: string, afterValue?: unknown) {
  await db.from("admin_audit_log").insert({ admin_user_id: adminUserId, action, entity_type: entityType, entity_id: entityId || null, after_value: afterValue ?? null });
}

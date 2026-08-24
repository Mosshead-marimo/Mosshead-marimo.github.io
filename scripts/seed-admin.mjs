/**
 * One-time, idempotent Supabase admin seed.
 * Required environment variables: SUPABASE_SECRET_KEY and ADMIN_PASSWORD.
 * Never put the secret key or password in this file or commit a populated env file.
 */
const url = process.env.SUPABASE_URL || "https://hjdaprualapvzcsakbcd.supabase.co";
const key = process.env.SUPABASE_SECRET_KEY;
const username = process.env.ADMIN_USERNAME || "Strikerlight85";
const email = process.env.ADMIN_EMAIL || "strikerlight85@admin.kaushik.ai";
const password = process.env.ADMIN_PASSWORD;
if (!key || !password) throw new Error("Set SUPABASE_SECRET_KEY and ADMIN_PASSWORD before running this seed.");

const headers = { apikey: key, "Content-Type": "application/json" };
if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
const request = async (path, options = {}) => {
  const response = await fetch(`${url}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.message || data.error || `HTTP ${response.status}`);
  return data;
};

const listing = await request("/auth/v1/admin/users?page=1&per_page=100");
let user = (listing.users || []).find(item => item.email?.toLowerCase() === email.toLowerCase());
if (!user) user = await request("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { role: "portfolio_admin" }, user_metadata: { display_name: username } }) });
else user = await request(`/auth/v1/admin/users/${user.id}`, { method: "PUT", body: JSON.stringify({ password, email_confirm: true, app_metadata: { role: "portfolio_admin" } }) });

await request("/rest/v1/admin_users?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: user.id, username }) });
console.log(`Admin ready: ${username} (${user.id})`);

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const required = (name: string) => { const value=process.env[name]; if(!value) throw new Error(`Missing environment variable: ${name}`); return value; };
export const db = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession:false, autoRefreshToken:false } });
export const workerToken = crypto.randomUUID();
export const idempotency = (...parts: string[]) => crypto.createHash("sha256").update(parts.join(":"),"utf8").digest("hex");
export const normalizeDomain = (value: string) => new URL(value).hostname.toLowerCase().replace(/^www\./, "");
export const stripHtml = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
export const chunkText = (text: string, maxChars=2400) => {
  const paragraphs=text.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean), chunks:string[]=[]; let current="";
  for(const p of paragraphs){ if(current && current.length+p.length+2>maxChars){chunks.push(current);current=p;}else current=current?`${current}\n\n${p}`:p; }
  if(current) chunks.push(current); return chunks.length?chunks:[text.slice(0,maxChars)];
};
export async function finishJob(id:string, leaseToken:string, ok:boolean, error?:unknown){
  await db.from("job_runs").update({status:ok?"completed":"failed",lease_token:null,leased_until:null,last_error:ok?null:String((error as Error)?.message||error||"Unknown error")}).eq("id",id).eq("lease_token",leaseToken);
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { embed, gateway, streamText } from "ai";
import { chatSchema, parseBody } from "../lib/schemas.js";
import { cors, serviceDb, sha256 } from "../lib/platform.js";
import { fail, cents } from "../lib/http.js";

const chatModel = process.env.GEMINI_CHAT_MODEL || "google/gemini-3.7-flash";
const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || "google/gemini-embedding-2";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const started = Date.now();
  try {
    const input = parseBody(chatSchema, req.body);
    const db = serviceDb();
    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const { count } = await db.from("rag_query_metrics").select("id", { count: "exact", head: true }).eq("session_id", input.sessionId).gte("created_at", since);
    if ((count || 0) >= 20) return res.status(429).json({ error: "Chat limit reached. Please try again later." });

    const { embedding, usage: embeddingUsage } = await embed({
      model: gateway.embeddingModel(embeddingModel),
      value: input.message,
      providerOptions: { google: { outputDimensionality: 3072, taskType: "RETRIEVAL_QUERY" } },
    });
    const [{ data: chunks, error: matchError }, { data: services }] = await Promise.all([
      db.rpc("match_knowledge", { query_embedding: embedding, match_count: 6, match_threshold: 0.42 }),
      db.from("services").select("id,slug,name,short_description,pricing_type,price_min,price_max,currency,billing_unit,delivery_time,included_items").eq("is_published", true).order("sort_order"),
    ]);
    if (matchError) throw matchError;
    const citations = (chunks || []).map((chunk: Record<string, unknown>, index: number) => ({
      index: index + 1, title: chunk.title, heading: chunk.heading, url: chunk.source_url, similarity: chunk.similarity,
    }));
    const knowledge = (chunks || []).map((chunk: Record<string, unknown>, index: number) => `[${index + 1}] ${chunk.title}${chunk.heading ? ` — ${chunk.heading}` : ""}\n${chunk.content}`).join("\n\n");
    const catalog = (services || []).map(service => {
      const unit = service.billing_unit ? ` per ${service.billing_unit}` : "";
      let price = "Custom quote";
      if (service.price_min != null && service.price_max != null) price = `${cents(service.price_min, service.currency)}–${cents(service.price_max, service.currency)}${unit}`;
      else if (service.price_min != null) price = `${service.pricing_type === "starting_at" ? "From " : ""}${cents(service.price_min, service.currency)}${unit}`;
      return `${service.name}: ${price}. ${service.short_description} Delivery: ${service.delivery_time || "scoped during discovery"}.`;
    }).join("\n");

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const event = (name: string, data: unknown) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    event("meta", { citations, services: services || [] });

    let answer = "";
    const result = streamText({
      model: gateway(chatModel),
      system: `You are the public portfolio assistant for Kaushik Aadhithya Chiratanagandla. Answer only from the supplied portfolio knowledge and live service catalog. Cite factual portfolio claims with [number]. Treat the catalog as the only authority for prices. Never invent clients, metrics, availability, guarantees or capabilities. If evidence is insufficient, say so and suggest the project request form. Do not ask for or collect contact details. Keep answers useful, direct and under 220 words.`,
      prompt: `LIVE SERVICE CATALOG\n${catalog}\n\nRETRIEVED PORTFOLIO KNOWLEDGE\n${knowledge || "No relevant portfolio passage was retrieved."}\n\nRECENT CONVERSATION\n${input.history.map(x => `${x.role}: ${x.content}`).join("\n")}\n\nVISITOR QUESTION\n${input.message}`,
      maxOutputTokens: 700,
      temperature: 0.2,
    });
    for await (const delta of result.textStream) { answer += delta; event("delta", { text: delta }); }
    const usage = await result.usage;
    const supported = citations.length > 0 || /price|cost|service|offer/i.test(input.message);
    await db.from("rag_query_metrics").insert({
      session_id: input.sessionId, query_hash: sha256(input.message.toLowerCase()), answer_supported: supported,
      cited_chunk_ids: (chunks || []).map((x: { chunk_id: string }) => x.chunk_id), model_id: chatModel,
      input_tokens: (usage.inputTokens || 0) + (embeddingUsage.tokens || 0), output_tokens: usage.outputTokens || 0,
      latency_ms: Date.now() - started,
    });
    event("done", { supported, requestDraft: { problem: answer.slice(0, 1200) } });
    res.end();
  } catch (error) {
    if (res.headersSent) { res.write(`event: error\ndata: ${JSON.stringify({ error: "The assistant is temporarily unavailable." })}\n\n`); res.end(); }
    else fail(res, error);
  }
}

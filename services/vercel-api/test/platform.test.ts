import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { calculateEstimate } from "../lib/pricing.js";
import { chatSchema } from "../lib/schemas.js";
import { buildPdf } from "../api/proposals/render.js";

test("fixed estimate uses integer minor units and warns below floor", () => {
  assert.deepEqual(calculateEstimate({ quantity: 2, unitAmount: 100_00, directCost: 80_00, contingencyPercent: 10, taxPercent: 18, priceFloor: 30_000 }), { subtotal:20_000, contingency:2_000, tax:3_960, total:25_960, marginPercent:(25_960-8_000)/25_960*100, belowFloor:true });
});

test("chat input rejects contact-sized or oversized payloads", () => {
  assert.equal(chatSchema.safeParse({ message:"What services do you provide?",sessionId:crypto.randomUUID(),history:[] }).success,true);
  assert.equal(chatSchema.safeParse({ message:"x".repeat(1201),sessionId:crypto.randomUUID(),history:[] }).success,false);
});

test("proposal renderer emits a PDF", async () => {
  const pdf=await buildPdf({title:"RAG system",client_name:"Example",proposal_number:"PROP-1",version:1,content:{summary:"Grounded assistant",scope:["Ingestion","Retrieval"]},total:250000,currency:"USD"});
  assert.equal(pdf.subarray(0,4).toString(),"%PDF");
});

test("Gmail integration contains no send endpoint", async () => {
  const source=await fs.readFile(new URL("../api/outreach/gmail-drafts.ts",import.meta.url),"utf8");
  assert.match(source,/gmail\/v1\/users\/me\/drafts/);
  assert.doesNotMatch(source,/messages\/send/);
});

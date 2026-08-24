import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
const core=await import("../src/core.js");

test("normalizes domains consistently",()=>{assert.equal(core.normalizeDomain("https://www.Example.com/careers"),"example.com")});
test("strips executable and visual markup from evidence",()=>{assert.equal(core.stripHtml("<style>x</style><script>bad()</script><h1>AI Team</h1>"),"AI Team")});
test("chunks long documents without losing paragraph order",()=>{const chunks=core.chunkText("First paragraph.\n\nSecond paragraph that is longer.",20);assert.deepEqual(chunks,["First paragraph.","Second paragraph that is longer."])});
test("idempotency keys are stable",()=>{assert.equal(core.idempotency("a","b"),core.idempotency("a","b"));assert.notEqual(core.idempotency("a","b"),core.idempotency("b","a"))});

import assert from "node:assert/strict";
import OpenAI, { APIError, APIConnectionTimeoutError } from "openai";

const token = process.env.SUBBRIDGE_TOKEN;
const model = process.env.SUBBRIDGE_MODEL;
if (!token || !model) throw new Error("Set SUBBRIDGE_TOKEN and SUBBRIDGE_MODEL. This suite sends real provider requests and may consume usage allowance.");
const baseURL = process.env.SUBBRIDGE_BASE_URL ?? "http://127.0.0.1:8787/v1";
const client = new OpenAI({ baseURL, apiKey: token, maxRetries: 0, timeout: Number(process.env.SUBBRIDGE_CLIENT_TIMEOUT_MS ?? 120_000) });
const check = async (name, fn) => { await fn(); console.log(`PASS ${name}`); };

await check("normal chat.completions.create", async () => {
  const result = await client.chat.completions.create({ model, messages: [{ role: "user", content: "Reply with exactly: sdk-ok" }] });
  assert.equal(result.object, "chat.completion"); assert.equal(result.model, model); assert.ok(result.choices[0]?.message.content);
});
await check("multi-message conversation", async () => {
  const result = await client.chat.completions.create({ model, messages: [{ role: "user", content: "Remember this code word: greenbird." }, { role: "assistant", content: "I will remember greenbird." }, { role: "user", content: "What was the code word?" }] });
  assert.match(result.choices[0]?.message.content ?? "", /greenbird/i);
});
await check("SSE stream and assembled content", async () => {
  const stream = await client.chat.completions.create({ model, stream: true, messages: [{ role: "user", content: "Reply with exactly: stream-ok" }] });
  let text = ""; let finish = false;
  for await (const chunk of stream) { text += chunk.choices[0]?.delta.content ?? ""; if (chunk.choices[0]?.finish_reason === "stop") finish = true; }
  assert.match(text, /stream-ok/i); assert.equal(finish, true);
});
await check("invalid request produces SDK APIError", async () => {
  try { await client.chat.completions.create({ model, messages: [] }); assert.fail("Expected API error"); }
  catch (error) { assert.ok(error instanceof APIError); assert.equal(error.status, 400); }
});
await check("unknown model is not silently substituted", async () => {
  const missingModel = "subbridge-model-that-does-not-exist";
  try { await client.chat.completions.create({ model: missingModel, messages: [{ role: "user", content: "test" }] }); assert.fail("Expected provider/model error"); }
  catch (error) { assert.ok(error instanceof APIError); assert.equal(error.status, 502); }
});
await check("bad gateway token receives 401", async () => {
  const badAuth = new OpenAI({ baseURL, apiKey: "invalid-subbridge-token", maxRetries: 0 });
  try { await badAuth.models.list(); assert.fail("Expected auth error"); }
  catch (error) { assert.ok(error instanceof APIError); assert.equal(error.status, 401); }
});
await check("SDK client timeout is surfaced", async () => {
  const impatient = new OpenAI({ baseURL, apiKey: token, maxRetries: 0, timeout: 1 });
  try { await impatient.chat.completions.create({ model, messages: [{ role: "user", content: "This request may be cancelled by client timeout." }] }); assert.fail("Expected timeout"); }
  catch (error) { assert.ok(error instanceof APIConnectionTimeoutError || error.name.includes("Timeout")); }
});

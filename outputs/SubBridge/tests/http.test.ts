import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/index.js";
import { HistoryStore } from "../src/history.js";
import type { ChatCompletionRequest, Provider, ProviderCapabilities, ProviderCompletion, ProviderId, ProviderStatus } from "../src/providers/types.js";
import type { ProviderRegistry } from "../src/providers/registry.js";

class FakeProvider implements Provider {
  readonly id: ProviderId = "codex";
  readonly capabilities: ProviderCapabilities = { completion: true, streaming: true, models: [], auth: "codex-cli" };
  async complete(): Promise<string> { return "legacy response"; }
  async completeWithMetrics(): Promise<ProviderCompletion> { return { content: "measured response", providerDurationMs: 12.5, usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 } }; }
  async stream(_request: ChatCompletionRequest, _signal: AbortSignal, onText: (text: string) => void): Promise<string> {
    onText("chunk "); await Promise.resolve(); onText("assembly"); return "chunk assembly";
  }
  async streamWithMetrics(_request: ChatCompletionRequest, _signal: AbortSignal, onText: (text: string) => void): Promise<ProviderCompletion> {
    onText("chunk "); onText("assembly"); return { content: "chunk assembly", providerDurationMs: 9, usage: { promptTokens: 2, completionTokens: 2, totalTokens: 4 } };
  }
}

class LegacyProvider implements Provider {
  readonly id: ProviderId = "codex";
  readonly capabilities: ProviderCapabilities = { completion: true, streaming: true, models: [], auth: "codex-cli" };
  async complete(): Promise<string> { return "unmetered response"; }
  async stream(_request: ChatCompletionRequest, _signal: AbortSignal, onText: (text: string) => void): Promise<string> { onText("unmetered response"); return "unmetered response"; }
}

async function fixture(provider: Provider = new FakeProvider()) {
  const root = await mkdtemp(join(tmpdir(), "subbridge-http-test-"));
  const status: ProviderStatus = { id: "codex", name: "Codex CLI", state: "ready", installed: true, supported: true, authState: "ready", executablePath: "/native/codex", version: "codex 1.0", capabilities: provider.capabilities };
  const registry = {
    providers: new Map([["codex", provider]]),
    refresh: async () => [status],
    list: () => [status],
    status: (id: ProviderId) => id === "codex" ? status : undefined,
    get: (id: ProviderId) => id === "codex" ? provider : undefined
  } as unknown as ProviderRegistry;
  const history = new HistoryStore("full", root);
  const app = await createApp({ registry, history, token: "test-token" });
  return { app, history, root };
}

test("REST omits unavailable usage and provider time instead of filling them with zero", async () => {
  const { app, root } = await fixture(new LegacyProvider());
  try {
    const response = await app.inject({ method: "POST", url: "/v1/chat/completions", headers: { host: "127.0.0.1:8787", authorization: "Bearer test-token" }, payload: { model: "explicit-model", messages: [{ role: "user", content: "hi" }] } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().choices[0].message.content, "unmetered response");
    assert.equal("usage" in response.json(), false);
    assert.equal(response.headers["x-subbridge-provider-duration-ms"], undefined);
    assert.ok(Number(response.headers["x-subbridge-request-duration-ms"]) >= 0);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test("REST contracts preserve V1 completion shape and protect provider/settings/history APIs", async () => {
  const { app, root } = await fixture();
  try {
    const health = await app.inject({ method: "GET", url: "/health", headers: { host: "127.0.0.1:8787" } });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { status: "ok" });
    const blocked = await app.inject({ method: "GET", url: "/v1/providers", headers: { host: "127.0.0.1:8787" } });
    assert.equal(blocked.statusCode, 401);
    const rebinding = await app.inject({ method: "GET", url: "/v1/providers", headers: { host: "attacker.example", authorization: "Bearer test-token" } });
    assert.equal(rebinding.statusCode, 421);
    const crossOrigin = await app.inject({ method: "DELETE", url: "/v1/history", headers: { host: "127.0.0.1:8787", origin: "http://attacker.example", authorization: "Bearer test-token" } });
    assert.equal(crossOrigin.statusCode, 403);
    const providerList = await app.inject({ method: "GET", url: "/v1/providers", headers: { host: "127.0.0.1:8787", authorization: "Bearer test-token" } });
    assert.equal(providerList.json().data[0].state, "ready");
    const providerStatus = await app.inject({ method: "GET", url: "/v1/providers/codex/status", headers: { host: "127.0.0.1:8787", authorization: "Bearer test-token" } });
    assert.equal(providerStatus.json().capabilities.completion, true);
    const models = await app.inject({ method: "GET", url: "/v1/models?provider=codex", headers: { host: "127.0.0.1:8787", authorization: "Bearer test-token" } });
    assert.equal(models.json().object, "list");
    assert.deepEqual(models.json().data, []);
    const badModels = await app.inject({ method: "GET", url: "/v1/models?provider=../../evil", headers: { host: "127.0.0.1:8787", authorization: "Bearer test-token" } });
    assert.equal(badModels.statusCode, 400);
    const response = await app.inject({ method: "POST", url: "/v1/chat/completions", headers: { host: "127.0.0.1:8787", authorization: "Bearer test-token" }, payload: { model: "gpt-6-luna", messages: [{ role: "user", content: "hi" }] } });
    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.object, "chat.completion");
    assert.equal(payload.choices[0].message.content, "measured response");
    assert.equal(payload.choices[0].finish_reason, "stop");
    assert.deepEqual(payload.usage, { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 });
    assert.ok(Number(response.headers["x-subbridge-request-duration-ms"]) >= 0);
    assert.equal(Number(response.headers["x-subbridge-provider-duration-ms"]), 12.5);
    const history = await app.inject({ method: "GET", url: "/v1/history", headers: { host: "127.0.0.1:8787", authorization: "Bearer test-token" } });
    assert.equal(history.json().data.length, 1);
    assert.equal(history.json().data[0].response, "measured response");
    assert.equal(history.json().data[0].providerDurationMs, 12.5);
    assert.equal(history.json().data[0].usage.totalTokens, 5);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test("SSE response has valid chunk frames, assembles text once, and ends with stop and DONE", async () => {
  const { app, root } = await fixture();
  try {
    const response = await app.inject({ method: "POST", url: "/v1/chat/completions", headers: { host: "127.0.0.1:8787", authorization: "Bearer test-token", accept: "text/event-stream" }, payload: { model: "gpt-6-luna", stream: true, messages: [{ role: "user", content: "hi" }] } });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] ?? "", /text\/event-stream/);
    const rawFrames = response.body.split("\n\n").filter(Boolean);
    const frames = rawFrames.filter((frame) => frame.startsWith("data:")).map((frame) => frame.replace(/^data: /, ""));
    const chunks = frames.filter((frame) => frame !== "[DONE]").map((frame) => JSON.parse(frame));
    const metrics = chunks.at(-1).subbridge_metrics as { providerDurationMs: number; usage: { total_tokens: number }; streaming: string };
    assert.equal(metrics.providerDurationMs, 9);
    assert.equal(metrics.usage.total_tokens, 4);
    assert.equal(metrics.streaming, "final-response-only");
    assert.equal(frames.at(-1), "[DONE]");
    assert.equal(chunks[0].choices[0].delta.role, "assistant");
    const assembled = chunks.map((chunk) => chunk.choices[0].delta.content ?? "").join("");
    assert.equal(assembled, "chunk assembly");
    assert.equal(chunks.at(-1).choices[0].finish_reason, "stop");
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { ModelCatalog } from "../src/providers/models.js";
import type { ProviderStatus } from "../src/providers/types.js";
import type { ProviderRegistry } from "../src/providers/registry.js";

function status(id: "codex" | "claude" | "ollama", state: ProviderStatus["state"], models: string[]): ProviderStatus {
  const supported = id !== "claude";
  return { id, name: id, state, installed: state === "ready", supported, authState: state === "ready" ? "ready" : "unknown", executablePath: null, version: null, capabilities: { completion: supported, streaming: id === "ollama" || id === "codex", models, auth: id === "ollama" ? "local-no-auth" : id === "claude" ? "provider-policy-restricted" : "codex-cli" } };
}

test("model discovery filters unsupported and unavailable providers and labels advertised IDs", async () => {
  const statuses = [status("codex", "ready", []), status("claude", "unavailable", ["must-not-leak"]), status("ollama", "ready", ["llama:latest", "qwen:7b"])];
  const registry = { status: (id: string) => statuses.find((row) => row.id === id) } as unknown as ProviderRegistry;
  const catalog = new ModelCatalog(registry);
  const all = await catalog.list();
  assert.deepEqual(all.map((item) => item.id), ["llama:latest", "qwen:7b"]);
  assert.equal(all[0]?.provider, "ollama");
  assert.equal(all[0]?.available, true);
  assert.deepEqual((await catalog.list("codex")), []);
  statuses[2] = status("ollama", "unavailable", ["stale"]);
  catalog.invalidate("ollama");
  assert.deepEqual(await catalog.list("ollama"), []);
});

test("model discovery caches provider-advertised values and invalidation refreshes cache", async () => {
  const current = status("ollama", "ready", ["model-one"]);
  const registry = { status: () => current } as unknown as ProviderRegistry;
  const catalog = new ModelCatalog(registry, 60_000);
  assert.deepEqual((await catalog.list("ollama")).map((item) => item.id), ["model-one"]);
  current.capabilities.models = ["model-two"];
  assert.deepEqual((await catalog.list("ollama")).map((item) => item.id), ["model-one"]);
  catalog.invalidate("ollama");
  assert.deepEqual((await catalog.list("ollama")).map((item) => item.id), ["model-two"]);
});

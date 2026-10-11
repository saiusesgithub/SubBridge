import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  assert.equal(all[0]?.availability, "advertised");
  assert.equal(all[0]?.origin, "provider-advertised");
  assert.deepEqual((await catalog.list("codex")), []);
  statuses[2] = status("ollama", "unavailable", ["stale"]);
  catalog.invalidate("ollama");
  assert.deepEqual(await catalog.list("ollama"), []);
});

test("saved model catalog persists, distinguishes verification, supports default, rename and delete", async () => {
  const root = await mkdtemp(join(tmpdir(), "subbridge-model-test-"));
  const registry = { status: () => status("codex", "ready", []) } as unknown as ProviderRegistry;
  const file = join(root, "models.json");
  try {
    const first = new ModelCatalog(registry, 60_000, file);
    await first.add("codex", "custom-model", "Custom");
    assert.equal((await first.list("codex"))[0]?.availability, "unknown");
    await first.setDefault("codex", "custom-model");
    await first.rememberSuccessful("codex", "custom-model");
    const second = new ModelCatalog(registry, 60_000, file);
    let item = (await second.list("codex"))[0];
    assert.equal(item?.availability, "verified");
    assert.equal(item?.origin, "successful-inference");
    assert.equal(item?.is_default, true);
    assert.equal(await second.rename("codex", "custom-model", "Renamed"), true);
    item = (await second.list("codex"))[0];
    assert.equal(item?.display_name, "Renamed");
    assert.equal(await second.remove("codex", "custom-model"), true);
    assert.deepEqual(await second.list("codex"), []);
  } finally { await rm(root, { recursive: true, force: true }); }
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

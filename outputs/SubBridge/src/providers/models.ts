import type { DiscoveredModel, ProviderId, ProviderStatus } from "./types.js";
import { ProviderRegistry } from "./registry.js";

type CacheEntry = { expires: number; models: DiscoveredModel[] };

/** Model discovery only publishes provider-advertised identifiers. Codex CLI currently
 * has no documented model-catalog command; its model list is intentionally empty. */
export class ModelCatalog {
  private cache = new Map<ProviderId, CacheEntry>();
  constructor(private readonly registry: ProviderRegistry, private readonly ttlMs = 30_000) {}

  async list(providerId?: ProviderId): Promise<DiscoveredModel[]> {
    const ids: ProviderId[] = providerId ? [providerId] : ["codex", "claude", "ollama"];
    const result: DiscoveredModel[] = [];
    for (const id of ids) result.push(...await this.forProvider(id));
    return result;
  }

  private async forProvider(id: ProviderId): Promise<DiscoveredModel[]> {
    const cached = this.cache.get(id);
    if (cached && cached.expires > Date.now()) return cached.models;
    const status = this.registry.status(id);
    if (!status?.supported || status.state !== "ready") return [];
    const models = status.capabilities.models.map((model) => ({
      id: model, object: "model" as const, owned_by: id, display_name: model,
      provider: id, available: true as const,
      capabilities: { completion: status.capabilities.completion, streaming: status.capabilities.streaming }
    }));
    this.cache.set(id, { expires: Date.now() + this.ttlMs, models });
    return models;
  }
  invalidate(id?: ProviderId): void { if (id) this.cache.delete(id); else this.cache.clear(); }
}

export function providerId(value: unknown): ProviderId | undefined {
  return value === "codex" || value === "claude" || value === "ollama" ? value : undefined;
}

export function modelsResponse(data: DiscoveredModel[], provider?: ProviderId) {
  return { object: "list", data, ...(provider ? { provider } : {}) };
}

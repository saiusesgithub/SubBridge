import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DiscoveredModel, ProviderId } from "./types.js";
import { ProviderRegistry } from "./registry.js";
import { configDirectory } from "../paths.js";

type Saved = { id: string; provider: ProviderId; displayName: string; origin: "manual" | "successful-inference"; verifiedAt?: string };
type CatalogFile = { models: Saved[]; defaults: Partial<Record<ProviderId, string>> };
const empty = (): CatalogFile => ({ models: [], defaults: {} });

/** Provider advertised models are short-lived; user catalog and successful model IDs persist locally. */
export class ModelCatalog {
  private cache = new Map<ProviderId, { expires: number; models: DiscoveredModel[] }>();
  private state: CatalogFile = empty();
  private loaded?: Promise<void>;
  constructor(private readonly registry: ProviderRegistry, private readonly ttlMs = 30_000, private readonly file = join(configDirectory(), "models.json")) {}

  private async load(): Promise<void> {
    this.loaded ??= (async () => {
      try {
        const parsed = JSON.parse(await readFile(this.file, "utf8")) as CatalogFile;
        if (Array.isArray(parsed.models) && parsed.defaults && typeof parsed.defaults === "object") this.state = parsed;
      } catch { this.state = empty(); }
    })();
    await this.loaded;
  }
  private async save(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    // This small JSON catalog is written directly to avoid Windows replacement semantics
    // and transient temp files. The directory is user-private and credentials are absent.
    await writeFile(this.file, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
  }
  async list(providerId?: ProviderId): Promise<DiscoveredModel[]> {
    await this.load();
    const ids: ProviderId[] = providerId ? [providerId] : ["codex", "claude", "ollama"];
    const result: DiscoveredModel[] = [];
    for (const id of ids) {
      const advertised = await this.advertised(id);
      const saved = this.state.models.filter((item) => item.provider === id);
      const combined = new Map<string, DiscoveredModel>();
      for (const item of advertised) combined.set(item.id, item);
      for (const item of saved) combined.set(item.id, { id: item.id, object: "model", owned_by: id, provider: id, display_name: item.displayName, origin: item.origin, availability: item.origin === "successful-inference" ? "verified" : "unknown", verified_at: item.verifiedAt ?? null, is_default: this.state.defaults[id] === item.id, capabilities: { completion: this.registry.status(id)?.capabilities.completion ?? false, streaming: this.registry.status(id)?.capabilities.streaming ?? false } });
      for (const model of combined.values()) { model.is_default = this.state.defaults[id] === model.id; result.push(model); }
    }
    return result;
  }
  private async advertised(id: ProviderId): Promise<DiscoveredModel[]> {
    const cached = this.cache.get(id);
    if (cached && cached.expires > Date.now()) return structuredClone(cached.models);
    const status = this.registry.status(id);
    if (!status?.supported || status.state !== "ready") return [];
    const models = status.capabilities.models.map((model) => ({ id: model, object: "model" as const, owned_by: id, display_name: model, provider: id, origin: "provider-advertised" as const, availability: "advertised" as const, verified_at: null, is_default: false, capabilities: { completion: status.capabilities.completion, streaming: status.capabilities.streaming } }));
    this.cache.set(id, { expires: Date.now() + this.ttlMs, models });
    return structuredClone(models);
  }
  async add(provider: ProviderId, id: string, displayName = id): Promise<void> {
    await this.load(); this.assertModel(id); this.assertDisplayName(displayName);
    const existing = this.state.models.find((item) => item.provider === provider && item.id === id);
    if (existing) { existing.displayName = displayName; }
    else this.state.models.push({ provider, id, displayName, origin: "manual" });
    await this.save();
  }
  async rename(provider: ProviderId, id: string, displayName: string): Promise<boolean> {
    await this.load(); this.assertDisplayName(displayName);
    const entry = this.state.models.find((item) => item.provider === provider && item.id === id);
    if (!entry) return false;
    entry.displayName = displayName; await this.save(); return true;
  }
  async remove(provider: ProviderId, id: string): Promise<boolean> {
    await this.load(); const before = this.state.models.length;
    this.state.models = this.state.models.filter((item) => !(item.provider === provider && item.id === id));
    if (this.state.defaults[provider] === id) delete this.state.defaults[provider];
    if (before === this.state.models.length) return false;
    await this.save(); return true;
  }
  async setDefault(provider: ProviderId, id: string): Promise<boolean> {
    await this.load();
    if (!(await this.list(provider)).some((item) => item.id === id)) return false;
    this.state.defaults[provider] = id; await this.save(); return true;
  }
  async defaults(): Promise<Partial<Record<ProviderId, string>>> { await this.load(); return { ...this.state.defaults }; }
  async rememberSuccessful(provider: ProviderId, id: string): Promise<void> {
    await this.load(); this.assertModel(id);
    const item = this.state.models.find((model) => model.provider === provider && model.id === id);
    const verifiedAt = new Date().toISOString();
    if (item) { item.origin = "successful-inference"; item.verifiedAt = verifiedAt; }
    else this.state.models.push({ provider, id, displayName: id, origin: "successful-inference", verifiedAt });
    await this.save(); this.cache.delete(provider);
  }
  invalidate(id?: ProviderId): void { if (id) this.cache.delete(id); else this.cache.clear(); }
  private assertModel(value: string): void { if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)) throw new Error("Model ID or display name must be 1–128 safe characters."); }
  private assertDisplayName(value: string): void { if (typeof value !== "string" || !value.trim() || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("Display name must be 1–128 printable characters."); }
}

export function providerId(value: unknown): ProviderId | undefined { return value === "codex" || value === "claude" || value === "ollama" ? value : undefined; }
export function modelsResponse(data: DiscoveredModel[], provider?: ProviderId) { return { object: "list", data, ...(provider ? { provider } : {}) }; }

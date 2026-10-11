import { codexAuthState, detectProviderBinaries, unavailableStatus, type Executable } from "./discovery.js";
import { CodexCliProvider } from "./codex-cli.js";
import { OllamaProvider } from "./ollama.js";
import type { Provider, ProviderId, ProviderStatus } from "./types.js";

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  implemented: boolean;
  create(executable?: Executable): Provider | undefined;
}

export const providerDefinitions: ProviderDefinition[] = [
  { id: "codex", name: "Codex CLI", implemented: true, create: (executable) => executable ? new CodexCliProvider(executable) : undefined },
  { id: "claude", name: "Claude Code", implemented: false, create: () => undefined },
  { id: "ollama", name: "Ollama", implemented: true, create: () => new OllamaProvider() }
];

export class ProviderRegistry {
  readonly providers = new Map<ProviderId, Provider>();
  private executables: Partial<Record<ProviderId, Executable>> = {};
  private statuses: ProviderStatus[] = [];

  async refresh(): Promise<ProviderStatus[]> {
    this.executables = await detectProviderBinaries();
    this.providers.clear();
    const codex = this.executables.codex ?? null;
    const codexAuth = await codexAuthState(codex);
    const codexStatus = unavailableStatus("codex", Boolean(codex), codex?.path, codex?.version);
    codexStatus.authState = codexAuth.state;
    codexStatus.state = codexAuth.state;
    codexStatus.message = codexAuth.message;
    const codexProvider = providerDefinitions[0]!.create(codex ?? undefined);
    if (codexProvider && codexAuth.state === "ready") this.providers.set("codex", codexProvider);

    const claudeExe = this.executables.claude;
    const claudeStatus = unavailableStatus("claude", Boolean(claudeExe), claudeExe?.path, claudeExe?.version);
    if (claudeExe) {
      claudeStatus.state = "unavailable";
      claudeStatus.message = "Claude Code was detected, but SubBridge has no Claude adapter. Subscription and licensing restrictions require a provider-approved integration.";
    }

    const ollamaExe = this.executables.ollama;
    const ollamaProvider = new OllamaProvider();
    const ollamaStatus = unavailableStatus("ollama", Boolean(ollamaExe), ollamaExe?.path, ollamaExe?.version);
    try {
      ollamaStatus.capabilities.models = await ollamaProvider.models(AbortSignal.timeout(1800));
      ollamaStatus.installed = true;
      ollamaStatus.state = "ready";
      ollamaStatus.authState = "ready";
      ollamaStatus.version = ollamaExe?.version ?? "HTTP API reachable";
      ollamaStatus.message = "Ollama local API is reachable.";
      this.providers.set("ollama", ollamaProvider);
    } catch {
      ollamaStatus.state = ollamaExe ? "unavailable" : "not-installed";
      ollamaStatus.authState = "unknown";
      ollamaStatus.message = ollamaExe ? "Ollama is installed, but its local API is not reachable." : "Ollama was not found and its local API is not reachable.";
    }

    this.statuses = [codexStatus, claudeStatus, ollamaStatus];
    return structuredClone(this.statuses);
  }

  list(): ProviderStatus[] { return structuredClone(this.statuses); }
  status(id: ProviderId): ProviderStatus | undefined { const value = this.statuses.find((item) => item.id === id); return value ? structuredClone(value) : undefined; }
  get(id: ProviderId): Provider | undefined { return this.providers.get(id); }
}

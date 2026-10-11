export type ProviderId = "codex" | "claude" | "ollama";
export type ProviderState = "ready" | "not-installed" | "auth-required" | "unavailable" | "error" | "unknown";
export type ChatRole = "system" | "developer" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  provider?: ProviderId;
  stream?: boolean;
}

export interface ProviderCapabilities {
  completion: boolean;
  streaming: boolean;
  models: string[];
  auth: "codex-cli" | "local-no-auth" | "provider-policy-restricted" | "unknown";
}

export interface UsageMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ProviderCompletion {
  content: string;
  usage?: UsageMetrics;
  providerDurationMs: number;
}

export interface DiscoveredModel {
  id: string;
  object: "model";
  owned_by: ProviderId;
  display_name: string;
  provider: ProviderId;
  origin: "provider-advertised" | "manual" | "successful-inference";
  availability: "advertised" | "verified" | "unknown";
  verified_at: string | null;
  is_default: boolean;
  capabilities: { completion: boolean; streaming: boolean };
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  state: ProviderState;
  installed: boolean;
  supported: boolean;
  authState: ProviderState;
  executablePath: string | null;
  version: string | null;
  capabilities: ProviderCapabilities;
  message?: string;
}

export interface Provider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  complete(request: ChatCompletionRequest, signal: AbortSignal): Promise<string>;
  stream?(request: ChatCompletionRequest, signal: AbortSignal, onText: (text: string) => void): Promise<string>;
  completeWithMetrics?(request: ChatCompletionRequest, signal: AbortSignal): Promise<ProviderCompletion>;
  streamWithMetrics?(request: ChatCompletionRequest, signal: AbortSignal, onText: (text: string) => void): Promise<ProviderCompletion>;
}

export type ValidationResult = ChatCompletionRequest | string;

export function validateRequest(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Request body must be an object";
  const body = value as Record<string, unknown>;
  if (typeof body.model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(body.model)) return "model must be a non-empty supported identifier (max 128 characters)";
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 100) return "messages must contain 1 to 100 items";
  const messages: ChatMessage[] = [];
  let totalChars = 0;
  for (const message of body.messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) return "Each message must be an object";
    const item = message as Record<string, unknown>;
    if (!["system", "developer", "user", "assistant"].includes(String(item.role))) return "Message role is unsupported";
    if (typeof item.content !== "string" || item.content.length > 100_000) return "Message content must be a string (max 100000 characters)";
    totalChars += item.content.length;
    if (totalChars > 500_000) return "Combined message content exceeds 500000 characters";
    messages.push({ role: item.role as ChatRole, content: item.content });
  }
  const provider = body.provider ?? "codex";
  if (provider !== "codex" && provider !== "claude" && provider !== "ollama") return "provider must be codex, claude, or ollama";
  if (body.stream !== undefined && typeof body.stream !== "boolean") return "stream must be a boolean";
  return { model: body.model, messages, provider, stream: body.stream === true };
}

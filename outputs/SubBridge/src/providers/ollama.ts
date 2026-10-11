import type { ChatCompletionRequest, Provider, ProviderCapabilities } from "./types.js";
import { ProviderError } from "./codex-cli.js";

async function readJsonLimited<T>(response: Response): Promise<T> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > 1_048_576) throw new ProviderError("Ollama response exceeded the 1 MiB limit.", "error");
  if (!response.body) throw new ProviderError("Ollama returned an empty response.", "error");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (value) {
      text += decoder.decode(value, { stream: !done });
      if (text.length > 1_048_576) { await reader.cancel(); throw new ProviderError("Ollama response exceeded the 1 MiB limit.", "error"); }
    }
    if (done) break;
  }
  try { return JSON.parse(text) as T; }
  catch { throw new ProviderError("Ollama returned invalid JSON.", "error"); }
}

export function ollamaBaseUrl(value = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"): string {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("OLLAMA_BASE_URL must be a localhost HTTP URL");
  }
  return url.origin;
}

export class OllamaProvider implements Provider {
  readonly id = "ollama" as const;
  readonly capabilities: ProviderCapabilities = { completion: true, streaming: true, models: [], auth: "local-no-auth" };
  private readonly baseUrl: string;

  constructor(baseUrl?: string) { this.baseUrl = ollamaBaseUrl(baseUrl); }

  async models(signal?: AbortSignal): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`, { signal: signal ?? AbortSignal.timeout(1800) });
    if (!response.ok) throw new ProviderError("Ollama model list is unavailable.", "unavailable");
    const payload = await readJsonLimited<{ models?: Array<{ name?: unknown }> }>(response);
    return Array.isArray(payload.models) ? payload.models.flatMap((model) => typeof model.name === "string" ? [model.name] : []) : [];
  }

  async complete(request: ChatCompletionRequest, signal: AbortSignal): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST", signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: request.model, messages: request.messages.map((message) => ({ role: message.role === "developer" ? "system" : message.role, content: message.content })), stream: false })
    });
    if (!response.ok) throw new ProviderError(response.status === 404 ? "Ollama model was not found. Pull the model locally first." : "Ollama is unavailable or rejected the request.", "unavailable");
    const payload = await readJsonLimited<{ message?: { content?: unknown }; error?: unknown }>(response);
    if (typeof payload.message?.content !== "string") throw new ProviderError("Ollama returned an invalid chat response.", "error");
    return payload.message.content;
  }

  async stream(request: ChatCompletionRequest, signal: AbortSignal, onText: (text: string) => void): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST", signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: request.model, messages: request.messages.map((message) => ({ role: message.role === "developer" ? "system" : message.role, content: message.content })), stream: true })
    });
    if (!response.ok || !response.body) throw new ProviderError(response.status === 404 ? "Ollama model was not found. Pull the model locally first." : "Ollama streaming request is unavailable.", "unavailable");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let complete = "";
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      if (pending.length > 1_048_576) { await reader.cancel(); throw new ProviderError("Ollama streaming event exceeded the 1 MiB limit.", "error"); }
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line) {
          let event: { message?: { content?: unknown }; done?: boolean; error?: unknown };
          try { event = JSON.parse(line); } catch { throw new ProviderError("Ollama sent an invalid streaming event.", "error"); }
          if (event.error) throw new ProviderError("Ollama rejected the streaming request.", "unavailable");
          const text = event.message?.content;
          if (typeof text === "string" && text) {
            complete += text;
            if (complete.length > 1_048_576) throw new ProviderError("Ollama response exceeded the 1 MiB limit.", "error");
            onText(text);
          }
        }
        newline = pending.indexOf("\n");
      }
      if (done) break;
    }
    if (pending.trim()) {
      try {
        const event = JSON.parse(pending) as { message?: { content?: unknown }; error?: unknown };
        if (typeof event.message?.content === "string") { complete += event.message.content; onText(event.message.content); }
      } catch { throw new ProviderError("Ollama sent an invalid final streaming event.", "error"); }
    }
    return complete;
  }
}

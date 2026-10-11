export interface ChatMessage {
  role: "system" | "developer" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: false;
}

export interface Provider {
  complete(request: ChatCompletionRequest, signal: AbortSignal): Promise<string>;
}

export function validateRequest(value: unknown): ChatCompletionRequest | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Request body must be an object";
  const body = value as Record<string, unknown>;
  if (typeof body.model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(body.model)) return "model must be a non-empty string (max 128 characters)";
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 100) return "messages must contain 1 to 100 items";
  const messages: ChatMessage[] = [];
  for (const message of body.messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) return "Each message must be an object";
    const item = message as Record<string, unknown>;
    if (!["system", "developer", "user", "assistant"].includes(String(item.role))) return "Message role is unsupported";
    if (typeof item.content !== "string" || item.content.length > 100_000) return "Message content must be a string (max 100000 characters)";
    messages.push({ role: item.role as ChatMessage["role"], content: item.content });
  }
  if (body.stream !== undefined && body.stream !== false) return "stream=true is not supported";
  return { model: body.model, messages, stream: false };
}



import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { HistoryStore } from "./history.js";
import { ProviderError } from "./providers/codex-cli.js";
import { ProviderRegistry } from "./providers/registry.js";
import { ModelCatalog, modelsResponse, providerId } from "./providers/models.js";
import type { ProviderCompletion, UsageMetrics } from "./providers/types.js";
import { validateRequest, type ProviderId } from "./providers/types.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const webRoot = resolve(here, "../web/dist");

export async function createApp(options: { registry?: ProviderRegistry; history?: HistoryStore; token?: string } = {}): Promise<FastifyInstance> {
  const registry = options.registry ?? new ProviderRegistry();
  const modelCatalog = new ModelCatalog(registry);
  const history = options.history ?? new HistoryStore(config.historyMode);
  const token = options.token ?? config.gatewayToken;
  const app = Fastify({ logger: true, bodyLimit: config.maxBodyBytes, requestTimeout: config.requestTimeoutMs, trustProxy: false });
  let tail: Promise<void> = Promise.resolve();
  let queueDepth = 0;
  const rate = new Map<string, { start: number; count: number }>();

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-frame-options", "DENY");
    reply.header("content-security-policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const hostHeader = request.headers.host;
    if (!hostHeader) return reply.code(400).send({ error: { message: "Host header required", type: "invalid_request_error" } });
    let hostName: string;
    let hostPort: string;
    try { const parsed = new URL(`http://${hostHeader}`); hostName = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ""); hostPort = parsed.port; }
    catch { return reply.code(400).send({ error: { message: "Invalid Host header", type: "invalid_request_error" } }); }
    const loopbackHost = ["127.0.0.1", "localhost", "::1"].includes(hostName);
    const configuredHost = config.host.toLowerCase().replace(/^\[|\]$/g, "");
    const hostMatches = (loopbackHost && (!hostPort || Number(hostPort) === config.port || (config.dev && Number(hostPort) === 5173))) || (hostName === configuredHost && (!hostPort || Number(hostPort) === config.port));
    if (!hostMatches) return reply.code(421).send({ error: { message: "Request host is not a local SubBridge host", type: "invalid_request_error" } });

    const origin = request.headers.origin;
    if (origin) {
      let originUrl: URL;
      try { originUrl = new URL(origin); } catch { return reply.code(403).send({ error: { message: "Origin is not allowed", type: "authentication_error" } }); }
      const originHost = originUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
      const originPort = Number(originUrl.port || (originUrl.protocol === "https:" ? 443 : 80));
      const allowedOrigin = originUrl.protocol === "http:" && ((["127.0.0.1", "localhost", "::1"].includes(originHost) && (originPort === config.port || (config.dev && originPort === 5173))) || (originHost === configuredHost && originPort === config.port));
      if (!allowedOrigin) return reply.code(403).send({ error: { message: "Cross-origin requests are not allowed", type: "authentication_error" } });
    }

    const bucket = rate.get(request.ip);
    const now = Date.now();
    if (!bucket || now - bucket.start >= 60_000) rate.set(request.ip, { start: now, count: 1 });
    else if (++bucket.count > 120) return reply.code(429).send({ error: { message: "Local request rate limit exceeded", type: "rate_limit_error" } });

    if (request.url.startsWith("/v1/")) {
      const authorization = request.headers.authorization ?? "";
      const supplied = authorization.startsWith("Bearer ") ? Buffer.from(authorization.slice(7)) : Buffer.alloc(0);
      const expected = Buffer.from(token);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        return reply.code(401).send({ error: { message: "Invalid gateway token", type: "authentication_error" } });
      }
    }
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/v1/providers", async () => ({ object: "list", data: await registry.refresh() }));
  app.get<{ Querystring: { provider?: string } }>("/v1/models", async (request, reply) => {
    const selected = request.query.provider;
    if (selected !== undefined && !providerId(selected)) return reply.code(400).send({ error: { message: "provider must be codex, claude, or ollama", type: "invalid_request_error" } });
    await registry.refresh();
    return modelsResponse(await modelCatalog.list(providerId(selected)), providerId(selected));
  });
  app.get<{ Params: { id: string } }>("/v1/providers/:id/status", async (request, reply) => {
    if (!["codex", "claude", "ollama"].includes(request.params.id)) return reply.code(404).send({ error: { message: "Unknown provider", type: "invalid_request_error" } });
    await registry.refresh();
    return registry.status(request.params.id as ProviderId);
  });
  app.get("/v1/config", async () => ({
    host: config.host, port: config.port, requestTimeoutMs: config.requestTimeoutMs,
    maxBodyBytes: config.maxBodyBytes, maxQueue: config.maxQueue,
    historyMode: history.mode, ollamaBaseUrl: config.ollamaBaseUrl,
    providers: registry.list().map(({ id, executablePath, version, capabilities }) => ({ id, executablePath, version, capabilities }))
  }));
  app.get("/v1/history", async () => ({ object: "list", data: await history.list(), mode: history.mode }));
  app.delete("/v1/history", async (_request, reply) => { await history.clear(); return reply.code(204).send(); });
  app.delete<{ Params: { id: string } }>("/v1/history/:id", async (request, reply) => {
    const deleted = await history.delete(request.params.id);
    return deleted ? reply.code(204).send() : reply.code(404).send({ error: { message: "History entry not found", type: "invalid_request_error" } });
  });

  app.post("/v1/chat/completions", async (request, reply) => {
    const input = validateRequest(request.body);
    if (typeof input === "string") return reply.code(400).send({ error: { message: input, type: "invalid_request_error" } });
    const providerId = input.provider ?? "codex";
    const provider = registry.get(providerId);
    if (!provider) {
      const state = registry.status(providerId);
      const status = state?.state === "auth-required" ? 401 : state?.state === "not-installed" ? 503 : 503;
      const message = state?.message ?? `Provider '${providerId}' is unavailable.`;
      return reply.code(status).send({ error: { message, type: state?.state === "auth-required" ? "authentication_error" : "provider_error" } });
    }
    if (input.stream && !provider.stream) return reply.code(400).send({ error: { message: `Provider '${providerId}' does not support streaming.`, type: "invalid_request_error" } });
    if (queueDepth >= config.maxQueue) return reply.code(429).send({ error: { message: "Provider queue is full; retry shortly.", type: "rate_limit_error" } });
    const started = Date.now();
    const id = randomUUID();
    const created = Math.floor(started / 1000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("Request timed out")), config.requestTimeoutMs);
    let release: (() => void) | undefined;
    let outcome: "success" | "error" | "cancelled" = "error";
    let responseText = "";
    let providerDurationMs: number | undefined;
    let usage: UsageMetrics | undefined;
    const cancelOnDisconnect = () => { if (!reply.raw.writableEnded) controller.abort(new Error("Client disconnected")); };
    request.raw.on("aborted", cancelOnDisconnect);
    reply.raw.on("close", cancelOnDisconnect);
    try {
      release = await acquireQueue(controller.signal);
      if (controller.signal.aborted) throw new ProviderError("Provider request timed out while waiting in the local queue.", "timeout");
      if (input.stream) {
        reply.hijack();
        reply.raw.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
        const send = (value: unknown) => { if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.write(`data: ${JSON.stringify(value)}\n\n`); };
        const chunk = (delta: Record<string, unknown>, finishReason: string | null = null) => ({ id: `chatcmpl-${id}`, object: "chat.completion.chunk", created, model: input.model, choices: [{ index: 0, delta, finish_reason: finishReason }] });
        send(chunk({ role: "assistant" }));
        const streamed: ProviderCompletion = provider.streamWithMetrics
          ? await provider.streamWithMetrics(input, controller.signal, (text) => { responseText += text; send(chunk({ content: text })); })
          : { content: await provider.stream!(input, controller.signal, (text) => { responseText += text; send(chunk({ content: text })); }), providerDurationMs: NaN };
        responseText = streamed.content;
        providerDurationMs = Number.isFinite(streamed.providerDurationMs) ? streamed.providerDurationMs : undefined;
        usage = streamed.usage;
        // The provider callback is the source of incremental text; use the returned final text for history only.
        outcome = "success";
        const totalDurationMs = Date.now() - started;
        const openAiUsage = usage ? { prompt_tokens: usage.promptTokens, completion_tokens: usage.completionTokens, total_tokens: usage.totalTokens } : null;
        send({ ...chunk({}, "stop"), subbridge_metrics: { totalDurationMs, providerDurationMs: providerDurationMs ?? null, usage: openAiUsage, provider: providerId, model: input.model, streaming: providerId === "codex" ? "final-response-only" : "incremental" } });
        if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.write("data: [DONE]\n\n");
      } else {
        const completed: ProviderCompletion = provider.completeWithMetrics
          ? await provider.completeWithMetrics(input, controller.signal)
          : { content: await provider.complete(input, controller.signal), providerDurationMs: NaN };
        responseText = completed.content;
        providerDurationMs = Number.isFinite(completed.providerDurationMs) ? completed.providerDurationMs : undefined;
        usage = completed.usage;
        outcome = "success";
        reply.header("x-subbridge-request-duration-ms", String(Date.now() - started));
        if (providerDurationMs !== undefined) reply.header("x-subbridge-provider-duration-ms", String(providerDurationMs));
        return {
          id: `chatcmpl-${id}`, object: "chat.completion", created, model: input.model,
          choices: [{ index: 0, message: { role: "assistant", content: responseText }, finish_reason: "stop" }],
          ...(usage ? { usage: { prompt_tokens: usage.promptTokens, completion_tokens: usage.completionTokens, total_tokens: usage.totalTokens } } : {})
        };
      }
    } catch (error) {
      outcome = controller.signal.aborted ? (controller.signal.reason?.message === "Client disconnected" ? "cancelled" : "error") : "error";
      const timedOut = controller.signal.aborted && controller.signal.reason?.message !== "Client disconnected";
      const providerError = error instanceof ProviderError ? error : undefined;
      const message = timedOut ? "Provider request timed out." : providerError?.message ?? "Provider request failed. Check provider availability and authentication.";
      request.log.warn({ provider: providerId, kind: providerError?.kind ?? (timedOut ? "timeout" : "error") }, "Provider request ended");
      if (input.stream) {
        if (!reply.raw.destroyed && !reply.raw.writableEnded) {
          reply.raw.write(`data: ${JSON.stringify({ error: { message, type: timedOut ? "timeout_error" : "provider_error" } })}\n\n`);
          reply.raw.write("data: [DONE]\n\n");
        }
      } else {
        const status = timedOut ? 504 : providerError?.kind === "auth-required" ? 401 : 502;
        return reply.code(status).send({ error: { message, type: timedOut ? "timeout_error" : providerError?.kind === "auth-required" ? "authentication_error" : "provider_error" } });
      }
    } finally {
      clearTimeout(timer);
      request.raw.off("aborted", cancelOnDisconnect);
      reply.raw.off("close", cancelOnDisconnect);
      try { await history.add({ id, timestamp: new Date(started).toISOString(), provider: providerId, model: input.model, durationMs: Date.now() - started, ...(providerDurationMs !== undefined ? { providerDurationMs } : {}), streaming: input.stream === true, streamingStatus: input.stream ? outcome === "success" ? "completed" : outcome === "cancelled" ? "interrupted" : "interrupted" : "off", ...(usage ? { usage } : {}), outcome, prompt: input.messages.map((message) => `${message.role}: ${message.content}`).join("\n\n"), response: responseText }); }
      catch (error) { request.log.warn({ error: error instanceof Error ? error.name : "storage_error" }, "Could not save local request history"); }
      release?.();
      if (input.stream && !reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
    }
    return reply;
  });

  async function acquireQueue(signal: AbortSignal): Promise<() => void> {
    queueDepth++;
    let release!: () => void;
    const previous = tail;
    tail = new Promise<void>((resolve) => { release = resolve; });
    let abortListener: (() => void) | undefined;
    try {
      await Promise.race([previous, new Promise<never>((_resolve, reject) => {
        abortListener = () => reject(new ProviderError("Provider request timed out while waiting in the local queue.", "timeout"));
        signal.addEventListener("abort", abortListener, { once: true });
      })]);
    } catch (error) {
      queueDepth--;
      void previous.then(release);
      throw error;
    } finally { if (abortListener) signal.removeEventListener("abort", abortListener); }
    queueDepth--;
    return release;
  }

  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot, prefix: "/", decorateReply: true });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/v1/") && !request.url.startsWith("/health")) return reply.sendFile("index.html");
      return reply.code(404).send({ error: { message: "Not found", type: "invalid_request_error" } });
    });
  }
  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const registry = new ProviderRegistry();
  await registry.refresh();
  const app = await createApp({ registry });
  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(`SubBridge listening at http://${config.host}:${config.port}; local gateway token: ${config.gatewayToken}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

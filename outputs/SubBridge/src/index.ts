import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { CodexCliProvider } from "./providers/codex-cli.js";
import { validateRequest } from "./providers/types.js";

if (config.provider !== "codex") throw new Error(`Provider '${config.provider}' is not implemented`);
const provider = new CodexCliProvider(config.codexCommand);
const app = Fastify({ logger: true, bodyLimit: config.maxBodyBytes, requestTimeout: config.requestTimeoutMs });
let queue: Promise<void> = Promise.resolve();

app.get("/health", async () => ({ status: "ok" }));
app.post("/v1/chat/completions", async (request, reply) => {
  const authorization = request.headers.authorization;
  if (authorization !== `Bearer ${config.gatewayToken}`) {
    return reply.code(401).send({ error: { message: "Invalid gateway token", type: "authentication_error" } });
  }
  const input = validateRequest(request.body);
  if (typeof input === "string") return reply.code(400).send({ error: { message: input, type: "invalid_request_error" } });

  let release!: () => void;
  const previous = queue;
  queue = new Promise<void>((resolve) => { release = resolve; });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timed out")), config.requestTimeoutMs);
  try {
    await previous;
    if (controller.signal.aborted) {
      return reply.code(504).send({ error: { message: "Request timed out", type: "timeout_error" } });
    }
    const content = await provider.complete(input, controller.signal);
    return {
      id: `chatcmpl-${randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: input.model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }]
    };
  } catch (error) {
    const timedOut = controller.signal.aborted;
    request.log.error({ err: error }, "Provider request failed");
    return reply.code(timedOut ? 504 : 502).send({ error: { message: timedOut ? "Provider request timed out" : "Provider request failed", type: timedOut ? "timeout_error" : "provider_error" } });
  } finally {
    clearTimeout(timer);
    release();
  }
});

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`SubBridge listening at http://${config.host}:${config.port}; gateway token: ${config.gatewayToken}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}



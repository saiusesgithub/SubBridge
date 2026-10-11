import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configDirectory } from "./paths.js";

function loadDotEnv(): void {
  for (const path of [join(configDirectory(), ".env"), join(process.cwd(), ".env")]) {
    try {
      const source = readFileSync(path, "utf8");
      for (const line of source.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (match && process.env[match[1]!] === undefined) process.env[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, "$2");
      }
    } catch { /* User config and legacy project .env are both optional. */ }
  }
}
loadDotEnv();

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export const config = {
  host: process.env.SUBBRIDGE_HOST ?? "127.0.0.1",
  port: positiveInteger("SUBBRIDGE_PORT", 8787),
  requestTimeoutMs: positiveInteger("SUBBRIDGE_REQUEST_TIMEOUT_MS", 120_000),
  maxBodyBytes: positiveInteger("SUBBRIDGE_MAX_BODY_BYTES", 1_048_576),
  maxQueue: positiveInteger("SUBBRIDGE_MAX_QUEUE", 8),
  provider: process.env.SUBBRIDGE_PROVIDER ?? "codex",
  defaultModel: process.env.SUBBRIDGE_DEFAULT_MODEL ?? "",
  defaultProvider: process.env.SUBBRIDGE_DEFAULT_PROVIDER ?? process.env.SUBBRIDGE_PROVIDER ?? "codex",
  codexCommand: process.env.CODEX_COMMAND,
  gatewayToken: process.env.SUBBRIDGE_TOKEN ?? randomBytes(32).toString("hex"),
  historyMode: process.env.SUBBRIDGE_HISTORY_MODE === "full" ? "full" as const : "metadata" as const,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
  dev: process.env.NODE_ENV !== "production"
};

if (config.host !== "127.0.0.1" && config.host !== "localhost" && config.host !== "::1") {
    if (process.env.SUBBRIDGE_ALLOW_REMOTE !== "true") throw new Error("Remote binding requires SUBBRIDGE_ALLOW_REMOTE=true");
}

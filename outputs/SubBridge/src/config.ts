import { randomBytes } from "node:crypto";

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
  provider: process.env.SUBBRIDGE_PROVIDER ?? "codex",
  codexCommand: process.env.CODEX_COMMAND ?? "codex",
  gatewayToken: process.env.SUBBRIDGE_TOKEN ?? randomBytes(32).toString("hex")
};

if (config.host !== "127.0.0.1" && config.host !== "localhost" && config.host !== "::1") {
  if (process.env.SUBBRIDGE_ALLOW_REMOTE !== "true") {
    throw new Error("Remote binding requires SUBBRIDGE_ALLOW_REMOTE=true");
  }
}


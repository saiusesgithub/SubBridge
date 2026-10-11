import { config } from "./config.js";
import { configDirectory } from "./paths.js";
import { ProviderRegistry } from "./providers/registry.js";
import { ModelCatalog } from "./providers/models.js";
import { startServer } from "./index.js";
import { readFile, access, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { dataDirectory } from "./paths.js";

const command = process.argv[2] ?? "--help";
const help = `SubBridge local AI gateway\n\nUsage: subbridge <command>\n  setup       Configure a local token and gateway settings\n  start       Start the loopback gateway and dashboard\n  doctor      Diagnose Node, configuration, providers and dashboard [--json]\n  providers   List detected providers\n  models      List provider-advertised and saved models\n  status      Check local gateway health\n  test        Make an explicitly confirmed inference request\n              --no-inference checks connectivity only\n  --help      Show this help\n`;

if (["--help", "-h", "help"].includes(command)) process.stdout.write(help);
else if (command === "setup") {
  const { runSetup } = await import("./setup.js"); await runSetup();
  // Readline/provider probes may leave TTY or child-process handles referenced
  // on Windows. Setup is a one-shot command, so exit after flushing output.
  process.exit(0);
} else if (command === "start") {
  const app = await startServer();
  const stop = () => { void app.close().finally(() => process.exit(0)); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
} else if (["providers", "models", "doctor"].includes(command)) {
  const registry = new ProviderRegistry(); await registry.refresh();
  if (command === "providers") process.stdout.write(`${JSON.stringify(registry.list().map(({ id, name, state, installed, supported, version, executablePath, message }) => ({ id, name, state, installed, supported, version, executablePath, message })), null, 2)}\n`);
  if (command === "models") { const catalog = new ModelCatalog(registry); process.stdout.write(`${JSON.stringify(await catalog.list(), null, 2)}\n`); }
  if (command === "doctor") await doctor(registry);
} else if (command === "status") {
  try { const response = await fetch(`http://${config.host}:${config.port}/health`, { signal: AbortSignal.timeout(1500) }); process.stdout.write(`${response.ok ? "PASS" : "FAIL"} gateway ${response.status}\n`); if (!response.ok) process.exitCode = 1; }
  catch { process.stdout.write("FAIL gateway unavailable; run subbridge start\n"); process.exitCode = 1; }
} else if (command === "test") await testGateway();
else { process.stderr.write(`Unknown command: ${command}\n\n${help}`); process.exitCode = 2; }

async function doctor(registry: ProviderRegistry): Promise<void> {
  const checks: Array<{ check: string; status: "PASS" | "WARN" | "FAIL"; detail: string }> = [];
  const [major, minor] = process.versions.node.split(".").map(Number);
  const nodeOk = (major ?? 0) > 22 || ((major ?? 0) === 22 && (minor ?? 0) >= 12);
  checks.push({ check: "Node.js compatibility", status: nodeOk ? "PASS" : "FAIL", detail: `Detected ${process.versions.node}; requires >=22.12` });
  try { await access(join(configDirectory(), ".env")); checks.push({ check: "Configuration", status: "PASS", detail: `Found in ${configDirectory()}` }); }
  catch { checks.push({ check: "Configuration", status: "WARN", detail: "No persisted config; run subbridge setup" }); }
  for (const p of registry.list()) {
    checks.push({ check: `${p.name} native executable`, status: p.installed ? "PASS" : "WARN", detail: p.executablePath ?? "No verified native executable detected" });
    checks.push({ check: `${p.name} authentication/adapter`, status: p.state === "ready" ? "PASS" : "WARN", detail: p.message ?? p.state });
  }
  const dashboard = await access(new URL("../web/dist/index.html", import.meta.url)).then(() => true).catch(() => false);
  checks.push({ check: "Dashboard assets", status: dashboard ? "PASS" : "FAIL", detail: dashboard ? "Bundled web/dist/index.html is present" : "Run npm run build to create dashboard assets" });
  const models = await new ModelCatalog(registry).list();
  checks.push({ check: "Model discovery/catalog", status: models.length ? "PASS" : "WARN", detail: models.length ? `${models.length} advertised or saved model(s)` : "No advertised or saved models; configure a model or check provider availability" });
  try {
    const health = await fetch(`http://${config.host}:${config.port}/health`, { signal: AbortSignal.timeout(900) });
    checks.push({ check: "Gateway availability", status: health.ok ? "PASS" : "WARN", detail: health.ok ? `Responding on ${config.host}:${config.port}` : `Health endpoint returned ${health.status}` });
  } catch {
    const probe = createServer();
    const portState = await new Promise<"free" | "occupied" | "unknown">((resolveState) => {
      probe.once("error", (error: NodeJS.ErrnoException) => resolveState(error.code === "EADDRINUSE" ? "occupied" : "unknown"));
      probe.listen({ host: config.host, port: config.port, exclusive: true }, () => probe.close(() => resolveState("free")));
    });
    checks.push({ check: "Gateway availability", status: portState === "occupied" ? "FAIL" : "WARN", detail: portState === "occupied" ? `Port ${config.port} is occupied but SubBridge health did not respond` : portState === "free" ? `Not running; port ${config.port} is available` : "Not running; port availability could not be verified" });
  }
  const permissionProbe = join(dataDirectory(), `.doctor-${randomUUID()}.tmp`);
  try {
    await mkdir(dataDirectory(), { recursive: true, mode: 0o700 });
    await writeFile(permissionProbe, "ok", { flag: "wx", mode: 0o600 });
    await rm(permissionProbe, { force: true });
    checks.push({ check: "Local filesystem permissions", status: "PASS", detail: "SubBridge state directory is writable" });
  } catch {
    await rm(permissionProbe, { force: true }).catch(() => undefined);
    checks.push({ check: "Local filesystem permissions", status: "FAIL", detail: "Cannot write to the configured SubBridge state directory" });
  }
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`);
  else for (const c of checks) process.stdout.write(`${c.status.padEnd(4)} ${c.check}: ${c.detail}\n`);
  if (checks.some((c) => c.status === "FAIL")) process.exitCode = 1;
}

async function testGateway(): Promise<void> {
  const base = `http://${config.host}:${config.port}`;
  if (process.argv.includes("--no-inference")) {
    try { const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) }); process.stdout.write(`${r.ok ? "PASS" : "FAIL"} gateway connection (${r.status})\n`); if (!r.ok) process.exitCode = 1; }
    catch { process.stderr.write("Gateway is not reachable. Start it with subbridge start.\n"); process.exitCode = 1; }
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) { process.stderr.write("Inference may consume provider usage. Run interactively to confirm or use --no-inference.\n"); process.exitCode = 2; return; }
  const readline = await import("node:readline/promises"); const io = readline.createInterface({ input: process.stdin, output: process.stdout });
  const yes = await io.question("This sends a real prompt to the configured provider and may consume usage. Continue? [y/N] "); io.close();
  if (yes.trim().toLowerCase() !== "y") { process.stdout.write("Cancelled.\n"); return; }
  const env = await readFile(join(configDirectory(), ".env"), "utf8").catch(() => "");
  const model = config.defaultModel || env.match(/^SUBBRIDGE_DEFAULT_MODEL=(.*)$/m)?.[1];
  if (!model) { process.stderr.write("No default model configured. Run subbridge setup or set SUBBRIDGE_DEFAULT_MODEL.\n"); process.exitCode = 1; return; }
  const response = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${config.gatewayToken}`, "content-type": "application/json" }, body: JSON.stringify({ provider: config.defaultProvider, model, messages: [{ role: "user", content: "Reply with the single word: ready" }] }), signal: AbortSignal.timeout(config.requestTimeoutMs + 1000) });
  process.stdout.write(`${response.ok ? "PASS" : "FAIL"} inference request (${response.status})\n`);
  if (!response.ok) { process.stderr.write(`${((await response.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "Provider request failed"}\n`); process.exitCode = 1; }
}

import { randomBytes } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join } from "node:path";
import { configDirectory } from "./paths.js";
import { detectProviderBinaries, codexAuthState } from "./providers/discovery.js";

export async function runSetup(): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) {
    stdout.write("SubBridge setup requires an interactive terminal. Run `subbridge setup` in PowerShell, Git Bash, macOS Terminal, or Linux terminal.\n");
    return;
  }
  const terminal = createInterface({ input: stdin, output: stdout, terminal: false });
  const ask = async (question: string) => (await terminal.question(question)).trim();
  try {
    stdout.write("\nSubBridge setup · local gateway\n────────────────────────────────\n");
    const path = join(configDirectory(), ".env");
    try { await access(path); if ((await ask(`Configuration already exists at ${path}. Replace it? [y/N] `)).toLowerCase() !== "y") { stdout.write("Existing configuration preserved.\n"); return; } } catch { /* first setup */ }
    const found = await detectProviderBinaries();
    for (const id of ["codex", "ollama", "claude"] as const) stdout.write(`${found[id] ? "FOUND" : "—"} ${id}: ${found[id]?.path ?? "not detected"}${found[id]?.version ? ` (${found[id].version})` : ""}\n`);
    const auth = await codexAuthState(found.codex ?? null);
    stdout.write(`Codex authentication: ${auth.state}\n`);
    const portInput = await ask("Local port [8787]: "); const port = portInput ? Number(portInput) : 8787;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535.");
    const readyDefault = auth.state === "ready" ? "codex" : found.ollama ? "ollama" : "codex";
    const provider = (await ask(`Default provider [${readyDefault}]: `)) || readyDefault;
    if (!(["codex", "ollama"] as string[]).includes(provider)) throw new Error("Choose codex or ollama.");
    const model = await ask("Default model ID (optional; no model is substituted): ");
    const full = (await ask("Persist full prompts/responses in request history? [y/N] ")).toLowerCase() === "y";
    const token = randomBytes(32).toString("hex");
    const lines = ["SUBBRIDGE_HOST=127.0.0.1", `SUBBRIDGE_PORT=${port}`, `SUBBRIDGE_TOKEN=${token}`, `SUBBRIDGE_DEFAULT_PROVIDER=${provider}`, ...(model ? [`SUBBRIDGE_DEFAULT_MODEL=${model}`] : []), "SUBBRIDGE_REQUEST_TIMEOUT_MS=120000", `SUBBRIDGE_HISTORY_MODE=${full ? "full" : "metadata"}`, ...(found.codex ? [`CODEX_COMMAND=${found.codex.path}`] : [])];
    await mkdir(configDirectory(), { recursive: true, mode: 0o700 }); await writeFile(path, `${lines.join("\n")}\n`, { mode: 0o600 });
    stdout.write(`\nConfiguration saved with owner-only permissions: ${path}\nToken generated and stored there; it is not printed. Paste its SUBBRIDGE_TOKEN value into the dashboard.\nStart with: subbridge start\nThen open: http://127.0.0.1:${port}\n`);
  } finally {
    terminal.close();
    stdin.pause();
    (stdin as NodeJS.ReadStream & { unref?: () => void }).unref?.();
    // readline can leave the Windows TTY handle referenced after close. Setup
    // has consumed all interactive input at this point, so release it fully.
    if (!stdin.destroyed) stdin.destroy();
  }
}

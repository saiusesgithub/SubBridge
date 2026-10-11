import { randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { detectProviderBinaries } from "../src/providers/discovery.js";

const terminal = createInterface({ input: stdin, output: stdout });
const ask = async (question: string) => (await terminal.question(question)).trim();

try {
  stdout.write("\n  SubBridge setup\n  ──────────────────────────────────────────\n");
  const found = await detectProviderBinaries();
  stdout.write("\n  Local provider scan (native binaries only):\n");
  for (const id of ["codex", "ollama", "claude"] as const) {
    const executable = found[id];
    stdout.write(`  ${executable ? "✓" : "·"} ${id.padEnd(8)} ${executable ? `${executable.version} · ${executable.path}` : "not detected"}\n`);
  }
  stdout.write("\n  SubBridge binds to 127.0.0.1 and stores metadata-only history by default.\n");
  stdout.write("  Full history stores prompts and responses in a local file.\n\n");
  const historyMode = (await ask("  Save full prompt/response history? [y/N] ")).toLowerCase() === "y" ? "full" : "metadata";
  const portInput = await ask("  Local port [8787]: ");
  const port = portInput ? Number(portInput) : 8787;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535.");
  const envPath = new URL("../.env", import.meta.url);
  try {
    await access(envPath);
    const overwrite = (await ask("  .env already exists. Replace it? [y/N] ")).toLowerCase() === "y";
    if (!overwrite) { stdout.write("\n  Kept the existing .env. Setup is complete.\n"); process.exitCode = 0; }
    else await writeConfig(envPath, port, historyMode, found.codex?.path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") await writeConfig(envPath, port, historyMode, found.codex?.path);
    else throw error;
  }
} catch (error) {
  stderrWrite(error instanceof Error ? error.message : "Setup failed.");
  process.exitCode = 1;
} finally { terminal.close(); }

async function writeConfig(path: URL, port: number, historyMode: string, codexPath?: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const entries = [
    "SUBBRIDGE_HOST=127.0.0.1",
    `SUBBRIDGE_PORT=${port}`,
    `SUBBRIDGE_TOKEN=${token}`,
    "SUBBRIDGE_REQUEST_TIMEOUT_MS=120000",
    `SUBBRIDGE_HISTORY_MODE=${historyMode}`,
    ...(codexPath ? [`CODEX_COMMAND=${codexPath}`] : [])
  ];
  await writeFile(path, `${entries.join("\n")}\n`, { mode: 0o600 });
  stdout.write("\n  Created .env. Keep this local token private:\n\n");
  stdout.write(`  ${token}\n\n  Start SubBridge with: npm run dev\n\n`);
}

function stderrWrite(message: string): void { stdout.write(`\n  Setup error: ${message}\n`); }

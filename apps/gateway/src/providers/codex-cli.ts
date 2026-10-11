import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Executable } from "./discovery.js";
import type { ChatCompletionRequest, Provider, ProviderCapabilities, ProviderCompletion, UsageMetrics } from "./types.js";

export class ProviderError extends Error {
  constructor(message: string, readonly kind: "unavailable" | "auth-required" | "timeout" | "error") { super(message); }
}

function authPath(): string {
  return join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json");
}

export function promptFor(request: ChatCompletionRequest): string {
  return request.messages.map(({ role, content }) => `${role.toUpperCase()}:\n${content}`).join("\n\n");
}

export function codexExecArgs(request: ChatCompletionRequest, lastMessage: string, json: boolean): string[] {
  return ["exec", "--disable", "shell_tool", "--disable", "unified_exec", "--disable", "code_mode", "--disable", "code_mode_host", "--disable", "code_mode_prewarm", "--disable", "code_mode_only", "--disable", "multi_agent", "--disable", "multi_agent_v2", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--model", request.model, "--output-last-message", lastMessage, ...(json ? ["--json"] : []), "-"];
}

function finalTextFromEvent(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const row = event as { type?: unknown; item?: { type?: unknown; text?: unknown; content?: unknown } };
  if (row.type !== "item.completed" || row.item?.type !== "agent_message") return null;
  if (typeof row.item.text === "string") return row.item.text;
  if (Array.isArray(row.item.content)) return row.item.content.map((part) => part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : "").join("");
  return null;
}

export class CodexJsonlCollector {
  private pending = "";
  private finalText: string | null = null;
  private usage: UsageMetrics | undefined;
  private size = 0;

  push(chunk: string): void {
    this.size += Buffer.byteLength(chunk);
    if (this.size > 1_048_576) throw new ProviderError("Codex JSONL output exceeded the 1 MiB limit.", "error");
    this.pending += chunk;
    let newline = this.pending.indexOf("\n");
    while (newline >= 0) {
      this.consume(this.pending.slice(0, newline));
      this.pending = this.pending.slice(newline + 1);
      newline = this.pending.indexOf("\n");
    }
  }

  finish(): string | null {
    if (this.pending.trim()) this.consume(this.pending);
    this.pending = "";
    return this.finalText;
  }

  getUsage(): UsageMetrics | undefined { return this.usage ? { ...this.usage } : undefined; }

  private consume(line: string): void {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line) as unknown;
      const row = event && typeof event === "object" ? event as { type?: unknown; usage?: Record<string, unknown> } : undefined;
      if (row?.type === "turn.completed" && row.usage) {
        const input = row.usage.input_tokens;
        const output = row.usage.output_tokens;
        if (Number.isSafeInteger(input) && Number.isSafeInteger(output) && Number(input) >= 0 && Number(output) >= 0) {
          this.usage = { promptTokens: Number(input), completionTokens: Number(output), totalTokens: Number(input) + Number(output) };
        }
      }
      const text = finalTextFromEvent(event);
      if (text !== null) this.finalText = text;
    } catch { /* Progress and malformed lines are ignored; the final-message file remains authoritative. */ }
  }
}

export class CodexCliProvider implements Provider {
  readonly id = "codex" as const;
  readonly capabilities: ProviderCapabilities = { completion: true, streaming: true, models: [], auth: "codex-cli" };
  private lastUsage: UsageMetrics | undefined;

  constructor(private readonly executable: Executable, private readonly timeoutMs = 120_000) {}

  complete(request: ChatCompletionRequest, signal: AbortSignal): Promise<string> {
    return this.execute(request, signal, false, () => undefined);
  }

  async completeWithMetrics(request: ChatCompletionRequest, signal: AbortSignal): Promise<ProviderCompletion> {
    const started = performance.now();
    const content = await this.execute(request, signal, false, () => undefined);
    return { content, ...(this.lastUsage ? { usage: this.lastUsage } : {}), providerDurationMs: performance.now() - started };
  }

  async streamWithMetrics(request: ChatCompletionRequest, signal: AbortSignal, onText: (text: string) => void): Promise<ProviderCompletion> {
    const started = performance.now();
    const content = await this.execute(request, signal, true, onText);
    return { content, ...(this.lastUsage ? { usage: this.lastUsage } : {}), providerDurationMs: performance.now() - started };
  }

  stream(request: ChatCompletionRequest, signal: AbortSignal, onText: (text: string) => void): Promise<string> {
    return this.execute(request, signal, true, onText);
  }

  private async execute(request: ChatCompletionRequest, signal: AbortSignal, json: boolean, onText: (text: string) => void): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "subbridge-"));
    const cwd = join(root, "work");
    const isolatedHome = join(root, "codex-home");
    const lastMessage = join(root, "last-message.txt");
    await Promise.all([mkdir(cwd), mkdir(isolatedHome)]);
    try {
      try {
        const authSource = authPath();
        if ((await stat(authSource)).size > 1_048_576) throw new ProviderError("Codex auth profile is unexpectedly large.", "error");
        const auth = await readFile(authSource);
        await writeFile(join(isolatedHome, "auth.json"), auth, { mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }

      const env: NodeJS.ProcessEnv = {};
      for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "LANG", "LC_ALL"]) {
        if (process.env[key]) env[key] = process.env[key];
      }
      env.CODEX_HOME = isolatedHome;
      env.HOME = isolatedHome;
      if (process.platform === "win32") {
        env.USERPROFILE = isolatedHome;
        env.APPDATA = join(isolatedHome, "AppData", "Roaming");
        env.LOCALAPPDATA = join(isolatedHome, "AppData", "Local");
      }

      const args = codexExecArgs(request, lastMessage, json);
      const finalText = await new Promise<string>((resolve, reject) => {
        const child = spawn(this.executable.path, args, { cwd, env, shell: false, stdio: ["pipe", json ? "pipe" : "ignore", "pipe"], signal, windowsHide: true });
        let stderr = "";
        const collector = new CodexJsonlCollector();
        let outputExceeded = false;
        if (child.stdout) {
          child.stdout.setEncoding("utf8");
          child.stdout.on("data", (chunk: string) => {
            if (outputExceeded) return;
            try { collector.push(chunk); }
            catch {
              outputExceeded = true;
              child.kill();
            }
          });
        }
        child.stderr!.setEncoding("utf8");
        child.stderr!.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-4096); });
        child.stdin!.on("error", () => undefined);
        child.stdin!.end(promptFor(request));
        child.once("error", () => reject(new ProviderError("Codex executable could not be started. Check CODEX_COMMAND and its native binary path.", "unavailable")));
        child.once("close", async (code) => {
          const finalEventText = collector.finish();
          const usage = collector.getUsage();
          this.lastUsage = usage;
          if (outputExceeded) { reject(new ProviderError("Codex JSONL output exceeded the 1 MiB limit.", "error")); return; }
          if (code !== 0) {
            const lower = stderr.toLowerCase();
            if (/not logged in|not authenticated|authentication required/.test(lower)) reject(new ProviderError("Codex authentication is required. Run `codex login`.", "auth-required"));
            else if (signal.aborted) reject(new ProviderError("Codex request timed out or was cancelled.", "timeout"));
            else reject(new ProviderError("Codex CLI request failed. Check its installation, account access, model name, and network connection.", "unavailable"));
            return;
          }
          try {
            const text = (await stat(lastMessage)).size <= 1_048_576 ? (await readFile(lastMessage, "utf8")).trim() || finalEventText || "" : "";
            if ((await stat(lastMessage)).size > 1_048_576) { reject(new ProviderError("Codex final response exceeded the 1 MiB limit.", "error")); return; }
            if (json && text) onText(text); // Codex JSONL has completion events, not token deltas; emit once after completion.
            resolve(text);
          } catch {
            reject(new ProviderError("Codex completed without writing its final response.", "error"));
          }
        });
      });
      return finalText;
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}

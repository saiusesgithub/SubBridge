import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatCompletionRequest, Provider } from "./types.js";

function authPath(): string {
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");
  return join(codexHome, "auth.json");
}

function promptFor(request: ChatCompletionRequest): string {
  return request.messages.map(({ role, content }) => `${role.toUpperCase()}:\n${content}`).join("\n\n");
}

export class CodexCliProvider implements Provider {
  constructor(private readonly command: string) {}

  async complete(request: ChatCompletionRequest, signal: AbortSignal): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "subbridge-"));
    const cwd = join(root, "work");
    const isolatedHome = join(root, "codex-home");
    const lastMessage = join(root, "last-message.txt");
    await Promise.all([mkdir(cwd), mkdir(isolatedHome)]);
    try {
      try {
        const auth = await readFile(authPath());
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

      const args = ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "--config", "features.shell_tool=false", "--config", "features.unified_exec=false", "--config", "features.code_mode=false", "--config", "features.code_mode_only=false", "--model", request.model, "--output-last-message", lastMessage, "-"];
      await new Promise<void>((resolve, reject) => {
        const child = spawn(this.command, args, { cwd, env, shell: false, stdio: ["pipe", "ignore", "pipe"], signal });
        let stderr = "";
        child.stderr.setEncoding("utf8");
        child.stdin.on("error", reject);
        child.stdin.end(promptFor(request));
        child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-8_000); });
        child.once("error", reject);
        child.once("close", (code) => {
          if (code !== 0) reject(new Error(`Codex CLI exited with code ${code}${stderr ? `: ${stderr}` : ""}`));
          else resolve();
        });
      });

      return (await readFile(lastMessage, "utf8")).trim();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}






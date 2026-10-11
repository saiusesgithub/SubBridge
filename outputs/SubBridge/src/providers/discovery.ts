import { spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { delimiter, extname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import type { ProviderId, ProviderStatus, ProviderState } from "./types.js";

export interface Executable {
  path: string;
  source: "override" | "path" | "known-location";
  version: string;
  argsPrefix?: string[];
}

export interface DiscoveryOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  home?: string;
  codexCommand?: string;
}

const nativeExt = (platform: NodeJS.Platform) => platform === "win32" ? [".exe", ".com"] : [""];
function safeVersion(output: string): string | null {
  return output.match(/(?:codex(?:-cli)?|claude(?:\s+code)?|ollama)?\s*v?\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?/i)?.[0]?.trim().slice(0, 100) ?? null;
}

async function isNativeExecutable(path: string, platform: NodeJS.Platform): Promise<boolean> {
  if (platform === "win32" && ![".exe", ".com"].includes(extname(path).toLowerCase())) return false;
  try { await access(path); return true; } catch { return false; }
}

function expandPathList(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const pathValue = env.PATH ?? env.Path ?? "";
  return pathValue.split(delimiter).filter(Boolean);
}

export function knownProviderLocations(id: "codex" | "claude" | "ollama", platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string[] {
  if (platform === "win32") {
    if (id === "codex") {
      const roots = [env.APPDATA, env.LOCALAPPDATA, env.ProgramFiles, env["ProgramFiles(x86)"]].filter((x): x is string => Boolean(x));
      return [
        ...roots.flatMap((root) => [
          join(root, "npm", "node_modules", "@openai", "codex-win32-x64", "vendor"),
          join(root, "npm", "node_modules", "@openai", "codex", "node_modules", "@openai", "codex-win32-x64", "vendor"),
          ...(root === env.ProgramFiles || root === env["ProgramFiles(x86)"] ? [join(root, "Programs", "Codex", "codex.exe")] : []),
          ...(root === env.LOCALAPPDATA ? [join(root, "OpenAI", "Codex", "bin")] : [])
        ]),
        join(home, ".npm-global", "node_modules", "@openai", "codex-win32-x64", "vendor")
      ];
    }
    if (id === "ollama") return [env.LOCALAPPDATA, env.ProgramFiles, env["ProgramFiles(x86)"]].filter((root): root is string => Boolean(root)).map((root) => join(root, "Programs", "Ollama", "ollama.exe"));
    const npmRoots = [env.APPDATA && join(env.APPDATA, "npm", "node_modules"), join(home, ".npm-global", "node_modules")].filter((root): root is string => Boolean(root));
    return npmRoots.map((root) => join(root, "@anthropic-ai", "claude-code", "cli.js"));
  }
  if (id === "codex") return [
    ...(platform === "darwin" ? ["/opt/homebrew/bin/codex", "/usr/local/bin/codex", "/Applications/Codex.app/Contents/MacOS/codex"] : ["/usr/bin/codex", "/usr/local/bin/codex", "/snap/bin/codex"]),
    join(home, ".local", "bin", "codex"), join(home, ".cargo", "bin", "codex"), join(home, ".npm-global", "bin", "codex"),
    join(home, ".npm-global", "lib", "node_modules", "@openai", "codex", "node_modules", "@openai", `codex-${platform}-${process.arch}`, "vendor")
  ];
  if (id === "ollama") return [...(platform === "darwin" ? ["/usr/local/bin/ollama", "/opt/homebrew/bin/ollama", "/Applications/Ollama.app/Contents/Resources/ollama"] : ["/usr/bin/ollama", "/usr/local/bin/ollama"]), join(home, ".local", "bin", "ollama")];
  const roots = ["/usr/lib/node_modules", "/usr/local/lib/node_modules", join(home, ".npm-global", "lib", "node_modules"), join(home, ".local", "lib", "node_modules")];
  return [...(platform === "darwin" ? ["/usr/local/bin/claude", "/opt/homebrew/bin/claude"] : ["/usr/local/bin/claude", "/usr/bin/claude"]), join(home, ".local", "bin", "claude"), ...roots.map((root) => join(root, "@anthropic-ai", "claude-code", "cli.js"))];
}

export function knownCodexLocations(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string[] { return knownProviderLocations("codex", platform, env, home); }

async function findVendorNative(root: string, platform: NodeJS.Platform): Promise<string[]> {
  const expected = platform === "win32" ? "codex.exe" : "codex";
  const found: string[] = [];
  const visit = async (dir: string, depth: number): Promise<void> => {
    if (depth < 0) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === expected) found.push(full);
      else if (entry.isDirectory()) await visit(full, depth - 1);
    }
  };
  await visit(root, 7);
  return found;
}

export async function runBounded(executable: string, args: string[], options: { timeoutMs?: number; cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<{ code: number | null; output: string; timedOut: boolean }> {
  return new Promise((resolvePromise) => {
    let output = "";
    let timedOut = false;
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ code, output: output.slice(-4096), timedOut });
    };
    let child;
    let timer: NodeJS.Timeout | undefined;
    try { child = spawn(executable, args, { shell: false, cwd: options.cwd, env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] }); }
    catch { finish(null); return; }
    timer = setTimeout(() => { timedOut = true; child.kill(); setTimeout(() => finish(null), 150).unref(); }, options.timeoutMs ?? 2500);
    const collect = (chunk: Buffer) => { output = (output + chunk.toString("utf8")).slice(-4096); };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", () => finish(null));
    child.once("close", (code) => finish(code));
  });
}

export async function verifyExecutable(path: string, source: Executable["source"], platform: NodeJS.Platform = process.platform): Promise<Executable | null> {
  if (!(await isNativeExecutable(path, platform))) return null;
  const probe = await runVersionProbe(path, ["--version"]);
  const result = probe.result;
  await rm(probe.home, { recursive: true, force: true });
  if (result.code !== 0 || result.timedOut) return null;
  const version = safeVersion(result.output);
  if (!version) return null;
  return { path: resolve(path), source, version };
}

async function verifyClaudeScript(path: string, source: Executable["source"]): Promise<Executable | null> {
  try { await access(path); } catch { return null; }
  if (!path.toLowerCase().endsWith(".js")) return null;
  const probe = await runVersionProbe(process.execPath, [path, "--version"]);
  const result = probe.result;
  await rm(probe.home, { recursive: true, force: true });
  if (result.code !== 0 || result.timedOut) return null;
  const version = safeVersion(result.output);
  return version ? { path: resolve(path), source, version, argsPrefix: [path] } : null;
}

async function runVersionProbe(executable: string, args: string[]): Promise<{ result: Awaited<ReturnType<typeof runBounded>>; home: string }> {
  const home = await mkdtemp(join(tmpdir(), "subbridge-probe-"));
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "LANG", "LC_ALL"]) if (process.env[key]) env[key] = process.env[key];
  env.HOME = home;
  env.CODEX_HOME = home;
  if (process.platform === "win32") { env.USERPROFILE = home; env.APPDATA = join(home, "AppData", "Roaming"); env.LOCALAPPDATA = join(home, "AppData", "Local"); }
  try { return { result: await runBounded(executable, args, { timeoutMs: 3000, env, cwd: home }), home }; }
  catch (error) { await rm(home, { recursive: true, force: true }); throw error; }
}

export async function discoverCodex(options: DiscoveryOptions = {}): Promise<Executable | null> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const override = options.codexCommand ?? env.CODEX_COMMAND;
  const pathExt = nativeExt(platform);
  const candidates: Array<{ path: string; source: Executable["source"] }> = [];

  if (override) {
    if (override.includes("/") || override.includes("\\")) candidates.push({ path: resolve(override), source: "override" });
    else {
      for (const dir of expandPathList(env, platform)) for (const ext of pathExt) candidates.push({ path: join(dir, override + (extname(override) ? "" : ext)), source: "override" });
    }
  } else {
    const pathDirs = expandPathList(env, platform);
    for (const dir of pathDirs) for (const name of ["codex", "codex-cli"]) for (const ext of pathExt) candidates.push({ path: join(dir, name + ext), source: "path" });
    for (const location of knownCodexLocations(platform, env, home)) {
      if (location.toLowerCase().endsWith(platform === "win32" ? ".exe" : "/codex")) candidates.push({ path: location, source: "known-location" });
      else for (const found of await findVendorNative(location, platform)) candidates.push({ path: found, source: "known-location" });
    }
  }
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = resolve(candidate.path).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const verified = await verifyExecutable(candidate.path, candidate.source, platform);
    if (verified) return verified;
  }
  return null;
}

export async function detectProviderBinaries(options: DiscoveryOptions = {}): Promise<Partial<Record<ProviderId, Executable>>> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const codex = await discoverCodex(options);
  const commands: Record<Exclude<ProviderId, "codex">, string[]> = {
    claude: platform === "win32" ? ["claude.exe"] : ["claude"],
    ollama: platform === "win32" ? ["ollama.exe"] : ["ollama"]
  };
  const result: Partial<Record<ProviderId, Executable>> = {};
  if (codex) result.codex = codex;
  for (const id of ["claude", "ollama"] as const) {
    const known = knownProviderLocations(id, platform, env, home);
    const candidates = [...expandPathList(env, platform).flatMap((dir) => commands[id].map((name) => join(dir, name))), ...known];
    for (const path of candidates) {
      const verified = id === "claude" && path.toLowerCase().endsWith(".js")
        ? await verifyClaudeScript(path, "known-location")
        : await verifyExecutable(path, known.includes(path) ? "known-location" : "path", platform);
      if (verified) { result[id] = verified; break; }
    }
  }
  return result;
}

export async function codexAuthState(executable: Executable | null): Promise<{ state: ProviderState; message?: string }> {
  if (!executable) return { state: "not-installed", message: "Codex CLI was not found." };
  const result = await runBounded(executable.path, ["login", "status"], { timeoutMs: 3500 });
  return mapCodexAuthResult(true, result.code, result.output, result.timedOut);
}

export function mapCodexAuthResult(installed: boolean, code: number | null, output: string, timedOut = false): { state: ProviderState; message: string } {
  if (!installed) return { state: "not-installed", message: "Codex CLI was not found." };
  if (timedOut) return { state: "unknown", message: "Codex auth status check timed out." };
  if (code === 0) return { state: "ready", message: "Codex CLI reports an authenticated session." };
  if (/not logged in|not authenticated|please log in|run codex login/i.test(output)) return { state: "auth-required", message: "Run `codex login` in your terminal." };
  return { state: code === null ? "error" : "unknown", message: "Codex auth status could not be determined." };
}

export function unavailableStatus(id: ProviderId, installed: boolean, path?: string, version?: string): ProviderStatus {
  const meta = {
    codex: { name: "Codex CLI", supported: true, auth: "codex-cli" as const, streaming: true },
    claude: { name: "Claude Code", supported: false, auth: "provider-policy-restricted" as const, streaming: false },
    ollama: { name: "Ollama", supported: true, auth: "local-no-auth" as const, streaming: true }
  }[id];
  return { id, name: meta.name, state: installed ? "unknown" : "not-installed", installed, supported: meta.supported, authState: "unknown", executablePath: path ?? null, version: version ?? null, capabilities: { completion: meta.supported, streaming: meta.streaming, models: [], auth: meta.auth } };
}

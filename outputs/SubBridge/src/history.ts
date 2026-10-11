import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ProviderId, UsageMetrics } from "./providers/types.js";

export interface HistoryRecord {
  id: string;
  timestamp: string;
  provider: ProviderId;
  model: string;
  durationMs: number;
  providerDurationMs?: number;
  streaming?: boolean;
  streamingStatus?: "off" | "completed" | "interrupted";
  usage?: UsageMetrics;
  outcome: "success" | "error" | "cancelled";
  prompt?: string;
  response?: string;
}

function defaultDirectory(): string {
  if (process.env.SUBBRIDGE_DATA_DIR) return process.env.SUBBRIDGE_DATA_DIR;
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "SubBridge");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "SubBridge");
  return join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "subbridge");
}

export class HistoryStore {
  private readonly file: string;
  private records: HistoryRecord[] = [];
  private loaded: Promise<void>;
  private writeTail: Promise<void> = Promise.resolve();
  constructor(readonly mode: "metadata" | "full", directory = defaultDirectory()) {
    this.file = join(directory, "history.json");
    this.loaded = this.load();
  }

  private async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as unknown;
      if (Array.isArray(parsed)) this.records = parsed.filter((value): value is HistoryRecord => Boolean(value && typeof value === "object" && typeof (value as HistoryRecord).id === "string")).slice(0, 500);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.records = []; }
  }

  private async save(): Promise<void> {
    const previous = this.writeTail;
    let release!: () => void;
    this.writeTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file, JSON.stringify(this.records), { mode: 0o600 });
    } finally { release(); }
  }

  async list(): Promise<HistoryRecord[]> { await this.loaded; return structuredClone(this.records); }
  async flush(): Promise<void> { await this.loaded; await this.writeTail; }

  async add(record: HistoryRecord): Promise<void> {
    await this.loaded;
    const stored = { ...record };
    if (this.mode === "metadata") { delete stored.prompt; delete stored.response; }
    this.records.unshift(stored);
    this.records = this.records.slice(0, 500);
    await this.save();
  }

  async delete(id: string): Promise<boolean> {
    await this.loaded;
    const next = this.records.filter((record) => record.id !== id);
    if (next.length === this.records.length) return false;
    this.records = next;
    await this.save();
    return true;
  }

  async clear(): Promise<void> { await this.loaded; this.records = []; await this.save(); }
}

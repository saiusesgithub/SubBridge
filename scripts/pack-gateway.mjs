import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("Could not locate npm's CLI path. Run with `npm run pack:gateway`.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [npmCli, "pack", "--dry-run"], {
  cwd: resolve(root, "apps/gateway"),
  stdio: "inherit",
  env: process.env,
  shell: false,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

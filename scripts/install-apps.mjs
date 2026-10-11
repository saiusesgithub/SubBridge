import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("Could not locate npm's CLI path. Run this script through `npm run install:apps` or `npm install`.");
  process.exit(1);
}

for (const app of ["apps/gateway", "apps/showcase"]) {
  console.log(`\nInstalling ${app} dependencies...`);
  const result = spawnSync(process.execPath, [npmCli, "install"], {
    cwd: resolve(root, app),
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

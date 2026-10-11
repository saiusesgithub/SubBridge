import { homedir } from "node:os";
import { join } from "node:path";

export function configDirectory(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, home = homedir()): string {
  if (env.SUBBRIDGE_CONFIG_DIR) return env.SUBBRIDGE_CONFIG_DIR;
  if (platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "SubBridge");
  if (platform === "darwin") return join(home, "Library", "Application Support", "SubBridge");
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "subbridge");
}

export function dataDirectory(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, home = homedir()): string {
  if (env.SUBBRIDGE_DATA_DIR) return env.SUBBRIDGE_DATA_DIR;
  if (platform === "win32") return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "SubBridge");
  if (platform === "darwin") return join(home, "Library", "Application Support", "SubBridge");
  return join(env.XDG_STATE_HOME ?? join(home, ".local", "state"), "subbridge");
}

import * as fs from "node:fs";
import type { Config } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import {
  getConfigPath,
  getStorageDir,
  readJson,
  writeJsonAtomic,
  ensureDir,
} from "./utils/storage.js";
import { authenticateCli } from "./auth.js";

/**
 * Ensure config exists on disk. Creates DEFAULT_CONFIG if missing.
 * Returns the loaded (or newly created) config.
 */
export function ensureConfig(): Config {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    return readJson<Config>(configPath, DEFAULT_CONFIG);
  }
  ensureDir(getStorageDir());
  const config = { ...DEFAULT_CONFIG };
  // Allow overriding serverUrl via env var for local development
  if (process.env.BURNINGMAN_SERVER_URL) {
    config.publicReporting.serverUrl = process.env.BURNINGMAN_SERVER_URL;
  }
  writeJsonAtomic(configPath, config);
  return config;
}

/**
 * Set up public reporting by authenticating the CLI via browser-based SIWE flow.
 * Returns the updated config (with cliToken set on success).
 */
export async function setupPublicReporting(config: Config): Promise<Config> {
  await authenticateCli(config);
  return config;
}

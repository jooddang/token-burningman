/**
 * Background quota fetch script. Spawned by the collector as a detached process
 * so it doesn't block the statusline output.
 */
import { fetchQuotaSafe } from "./quota.js";
import { DEFAULT_CONFIG } from "./types.js";
import { readJson, getConfigPath, ensureStorageDirs } from "./utils/storage.js";
import type { Config } from "./types.js";

async function main() {
  ensureStorageDirs();
  const config = readJson<Config>(getConfigPath(), DEFAULT_CONFIG);
  await fetchQuotaSafe(config);
}

main().catch(() => {}).finally(() => process.exit(0));

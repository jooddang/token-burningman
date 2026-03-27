import type { Config } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { runHourlyMaintenanceSafe } from "./maintenance.js";
import { ensureStorageDirs, getConfigPath, readJson } from "./utils/storage.js";

async function main(): Promise<void> {
  ensureStorageDirs();
  const config = readJson<Config>(getConfigPath(), DEFAULT_CONFIG);
  await runHourlyMaintenanceSafe(config);
}

main().catch(() => {}).finally(() => process.exit(0));

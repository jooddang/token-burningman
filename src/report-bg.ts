import type { Config } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { submitPublicReport } from "./reporter.js";
import { ensureStorageDirs, getConfigPath, readJson } from "./utils/storage.js";

async function main(): Promise<void> {
  ensureStorageDirs();
  const config = readJson<Config>(getConfigPath(), DEFAULT_CONFIG);
  if (config.publicReporting?.cliToken) {
    await submitPublicReport(config);
  }
}

main().catch(() => {
  // Reporting is best-effort; the next maintenance/import/MCP sync resumes.
});

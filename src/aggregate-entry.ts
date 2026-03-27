import { aggregateAllPending } from "./aggregator.js";
import { ensureStorageDirs, readJson, getConfigPath } from "./utils/storage.js";
import { submitPublicReport } from "./reporter.js";
import { DEFAULT_CONFIG } from "./types.js";
import type { Config } from "./types.js";

try {
  ensureStorageDirs();
  const result = aggregateAllPending();
  if (result.processed > 0) {
    process.stderr.write(
      `token-burningman: aggregated ${result.processed} session(s), ${result.skipped} up-to-date\n`,
    );
  }

  // Submit reports to community server if logged in
  const config = readJson<Config>(getConfigPath(), DEFAULT_CONFIG);
  if (config.publicReporting?.cliToken) {
    submitPublicReport(config).then((ok) => {
      if (ok) {
        process.stderr.write("token-burningman: community report submitted\n");
      }
    }).catch(() => {
      // Silent failure — don't block aggregation
    });
  }
} catch (err) {
  process.stderr.write(`token-burningman: aggregation error: ${err}\n`);
}

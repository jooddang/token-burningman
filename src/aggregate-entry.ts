import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { aggregateAllPending } from "./aggregator.js";
import { ensureStorageDirs } from "./utils/storage.js";

function triggerPublicReportBackground(): void {
  const binDir = path.dirname(path.resolve(process.argv[1]));
  const script = path.join(binDir, "report-bg.cjs");
  if (!fs.existsSync(script)) return;
  try {
    const child = spawn(process.execPath, [script], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // Reporting is best-effort and must not hold the Claude SessionEnd hook.
  }
}

try {
  ensureStorageDirs();
  const result = aggregateAllPending();
  if (result.processed > 0) {
    process.stderr.write(
      `token-burningman: aggregated ${result.processed} session(s), ${result.skipped} up-to-date\n`,
    );
  }

  triggerPublicReportBackground();
} catch (err) {
  process.stderr.write(`token-burningman: aggregation error: ${err}\n`);
}

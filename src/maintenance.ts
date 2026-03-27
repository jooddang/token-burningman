import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";

import type { Config } from "./types.js";
import { aggregateAllPending } from "./aggregator.js";
import { submitPublicReport } from "./reporter.js";
import {
  acquireLock,
  releaseLock,
  getMaintenanceLockPath,
  getMaintenanceStatePath,
  readJson,
  writeJsonAtomic,
} from "./utils/storage.js";

interface MaintenanceState {
  lastRunAt: number;
}

const DEFAULT_STATE: MaintenanceState = {
  lastRunAt: 0,
};

function readState(): MaintenanceState {
  return readJson<MaintenanceState>(getMaintenanceStatePath(), DEFAULT_STATE);
}

function writeState(state: MaintenanceState): void {
  writeJsonAtomic(getMaintenanceStatePath(), state);
}

export function shouldRunHourlyMaintenance(config: Config): boolean {
  const intervalMs = (config.collection?.hourlyMaintenanceIntervalMin ?? 60) * 60_000;
  const state = readState();
  return Date.now() - state.lastRunAt >= intervalMs;
}

export async function runHourlyMaintenanceSafe(
  config: Config,
): Promise<{ ran: boolean; processed: number; skipped: number; reported: boolean }> {
  const lockPath = getMaintenanceLockPath();
  const fd = acquireLock(lockPath);
  if (fd === null) {
    return { ran: false, processed: 0, skipped: 0, reported: false };
  }

  try {
    if (!shouldRunHourlyMaintenance(config)) {
      return { ran: false, processed: 0, skipped: 0, reported: false };
    }

    const result = aggregateAllPending();
    let reported = false;

    if (config.publicReporting?.cliToken) {
      reported = await submitPublicReport(config);
    }

    writeState({ lastRunAt: Date.now() });
    return {
      ran: true,
      processed: result.processed,
      skipped: result.skipped,
      reported,
    };
  } finally {
    releaseLock(lockPath, fd);
  }
}

export function triggerHourlyMaintenanceBackground(binDir: string): void {
  const script = path.join(binDir, "hourly-maintenance-bg.cjs");
  if (!fs.existsSync(script)) return;

  try {
    const child = spawn("node", [script], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // Best-effort background work only.
  }
}

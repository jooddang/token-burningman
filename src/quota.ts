import * as path from "node:path";
import type { QuotaState, StatuslineRateLimits } from "./types.js";
import { readJson, writeJsonAtomic, appendJsonl, getStorageDir } from "./utils/storage.js";

const QUOTA_STATE_PATH = () => path.join(getStorageDir(), "quota", "state.json");
const QUOTA_HISTORY_PATH = () => path.join(getStorageDir(), "quota", "history.jsonl");

const DEFAULT_QUOTA_STATE: QuotaState = {
  lastFetchedAt: 0,
  five_hour: null,
  seven_day: null,
};

// Skip rewriting an unchanged state more often than this; the collector
// runs on every statusline render.
const QUOTA_REFRESH_MS = 60_000;

export function readQuotaState(): QuotaState {
  return readJson<QuotaState>(QUOTA_STATE_PATH(), DEFAULT_QUOTA_STATE);
}

function toIsoTimestamp(epochSeconds: number): string {
  if (!Number.isFinite(epochSeconds)) return "";
  return new Date(epochSeconds * 1000).toISOString();
}

/**
 * Persist the official rate-limit data from the statusline payload into the
 * quota state consumed by the statusline renderer, TUI, and dashboard.
 * Each window may be independently absent; an absent window preserves the
 * previously known value.
 */
export function updateQuotaStateFromStatusline(rateLimits: StatuslineRateLimits | undefined): void {
  const fiveHour = rateLimits?.five_hour ?? null;
  const sevenDay = rateLimits?.seven_day ?? null;
  if (!fiveHour && !sevenDay) return;

  const previous = readQuotaState();
  const next: QuotaState = {
    lastFetchedAt: Date.now(),
    five_hour: fiveHour
      ? { utilization: fiveHour.used_percentage, resets_at: toIsoTimestamp(fiveHour.resets_at) }
      : previous.five_hour,
    seven_day: sevenDay
      ? { utilization: sevenDay.used_percentage, resets_at: toIsoTimestamp(sevenDay.resets_at) }
      : previous.seven_day,
  };

  const unchanged =
    previous.five_hour?.utilization === next.five_hour?.utilization &&
    previous.seven_day?.utilization === next.seven_day?.utilization;
  if (unchanged && Date.now() - previous.lastFetchedAt < QUOTA_REFRESH_MS) return;

  writeJsonAtomic(QUOTA_STATE_PATH(), next);
  if (!unchanged) {
    appendJsonl(QUOTA_HISTORY_PATH(), {
      t: Date.now(),
      five_hour: next.five_hour?.utilization ?? null,
      seven_day: next.seven_day?.utilization ?? null,
    });
  }
}

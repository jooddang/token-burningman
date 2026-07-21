import * as https from "node:https";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Config, HourlyAggregate, HourlyBucket } from "./types.js";
import {
  readJson,
  writeJsonAtomic,
  getConfigPath,
  getHourlyDir,
  getStorageDir,
  acquireLock,
  refreshLock,
  releaseLock,
} from "./utils/storage.js";

interface ReportEntry {
  hour: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_create_tokens: number;
  concurrent_sessions: number;
  avg_context_pct: number;
  total_lines_changed: number;
  session_count: number;
  avg_session_duration_min: number;
  cost_usd: number;
}

interface ReportBatch {
  entries: ReportEntry[];
  lastHour: string;
}

interface ReportBatchPlan {
  batches: ReportBatch[];
  blockedByOversizedHour: boolean;
}

const REPORT_BATCH_TARGET = 100;
const MAX_REPORTS_PER_HOUR = 500;
const REPORT_REQUEST_BASE_TIMEOUT_MS = 30_000;
const REPORT_REQUEST_TIMEOUT_PER_ENTRY_MS = 1_000;
const MAX_REPORT_REQUEST_TIMEOUT_MS = 600_000;
const REPORT_FIELD_LIMITS = {
  inputTokens: 50_000_000,
  outputTokens: 50_000_000,
  cacheReadTokens: 100_000_000,
  cacheCreateTokens: 100_000_000,
  concurrentSessions: 50,
  avgContextPct: 100,
  totalLinesChanged: 1_000_000,
  sessionCount: 100,
  avgSessionDurationMin: 1440,
  costUsd: 10_000,
} as const;

/**
 * Keep the community wire payload within the v1 report contract. Local
 * aggregates remain exact; only the anonymous public representation is
 * saturated because the server stores one row per user/hour/model and cannot
 * losslessly accept split values for a single row.
 */
export function saturateReportMetric(value: unknown, max: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Community report metrics must be finite numbers");
  }
  const boundedValue = Math.min(Math.max(value, 0), max);
  return integer ? Math.trunc(boundedValue) : boundedValue;
}

export function getReportRequestTimeoutMs(entryCount: number): number {
  return Math.min(
    REPORT_REQUEST_BASE_TIMEOUT_MS + entryCount * REPORT_REQUEST_TIMEOUT_PER_ENTRY_MS,
    MAX_REPORT_REQUEST_TIMEOUT_MS,
  );
}

/**
 * Build report entries from unreported hourly data.
 */
function buildReportEntries(lastReportedHour: string | null): ReportEntry[] {
  const hourlyDir = getHourlyDir();
  if (!fs.existsSync(hourlyDir)) return [];

  const files = fs.readdirSync(hourlyDir).filter((f) => f.endsWith(".json"));
  const entries: ReportEntry[] = [];

  for (const file of files) {
    const dateStr = file.replace(".json", "");
    const hourly = readJson<HourlyAggregate>(
      `${hourlyDir}/${file}`,
      {},
    );

    for (const [hourStr, models] of Object.entries(hourly)) {
      const hourIso = `${dateStr}T${hourStr.padStart(2, "0")}:00:00Z`;

      // Replay the checkpoint hour because an active session can continue to
      // add usage to its current hourly bucket after a successful report. The
      // server update is idempotent for user/hour/model; only older hours are
      // safe to exclude permanently.
      if (lastReportedHour && hourIso < lastReportedHour) continue;

      for (const [model, bucket] of Object.entries(models) as [string, HourlyBucket][]) {
        if (!Array.isArray(bucket.sessions)) {
          throw new TypeError("Community report sessions must be an array");
        }
        const linesChanged =
          saturateReportMetric(bucket.linesAdded, Number.MAX_SAFE_INTEGER) +
          saturateReportMetric(bucket.linesRemoved, Number.MAX_SAFE_INTEGER);
        const avgContextPct = saturateReportMetric(
          bucket.avgContextPct,
          Number.MAX_SAFE_INTEGER,
        );
        const costUsd = saturateReportMetric(bucket.cost, Number.MAX_SAFE_INTEGER);

        entries.push({
          hour: hourIso,
          model,
          input_tokens: saturateReportMetric(
            bucket.input,
            REPORT_FIELD_LIMITS.inputTokens,
            true,
          ),
          output_tokens: saturateReportMetric(
            bucket.output,
            REPORT_FIELD_LIMITS.outputTokens,
            true,
          ),
          cache_read_tokens: saturateReportMetric(
            bucket.cacheRead,
            REPORT_FIELD_LIMITS.cacheReadTokens,
            true,
          ),
          cache_create_tokens: saturateReportMetric(
            bucket.cacheCreate,
            REPORT_FIELD_LIMITS.cacheCreateTokens,
            true,
          ),
          concurrent_sessions: saturateReportMetric(
            bucket.sessions.length,
            REPORT_FIELD_LIMITS.concurrentSessions,
            true,
          ),
          avg_context_pct: saturateReportMetric(
            Math.round(avgContextPct),
            REPORT_FIELD_LIMITS.avgContextPct,
          ),
          total_lines_changed: saturateReportMetric(
            linesChanged,
            REPORT_FIELD_LIMITS.totalLinesChanged,
            true,
          ),
          session_count: saturateReportMetric(
            bucket.sessions.length,
            REPORT_FIELD_LIMITS.sessionCount,
            true,
          ),
          avg_session_duration_min: saturateReportMetric(
            0, // not tracked at hourly level yet
            REPORT_FIELD_LIMITS.avgSessionDurationMin,
          ),
          cost_usd: saturateReportMetric(
            Math.round(costUsd * 100) / 100,
            REPORT_FIELD_LIMITS.costUsd,
          ),
        });
      }
    }
  }

  return entries.sort((a, b) => {
    const hourOrder = a.hour.localeCompare(b.hour);
    return hourOrder !== 0 ? hourOrder : a.model.localeCompare(b.model);
  });
}

/**
 * Pack complete hours into bounded requests. The target is soft because a
 * single hour must remain intact for the hour-based reporting checkpoint.
 */
function buildReportBatches(entries: ReportEntry[]): ReportBatchPlan {
  const hourGroups: ReportEntry[][] = [];

  for (const entry of entries) {
    const current = hourGroups[hourGroups.length - 1];
    if (!current || current[0].hour !== entry.hour) {
      hourGroups.push([entry]);
    } else {
      current.push(entry);
    }
  }

  const batches: ReportBatch[] = [];
  let currentEntries: ReportEntry[] = [];

  const flush = (): void => {
    if (currentEntries.length === 0) return;
    batches.push({
      entries: currentEntries,
      lastHour: currentEntries[currentEntries.length - 1].hour,
    });
    currentEntries = [];
  };

  for (const group of hourGroups) {
    if (group.length > MAX_REPORTS_PER_HOUR) {
      flush();
      return { batches, blockedByOversizedHour: true };
    }

    if (currentEntries.length > 0 && currentEntries.length + group.length > REPORT_BATCH_TARGET) {
      flush();
    }

    if (group.length > REPORT_BATCH_TARGET) {
      currentEntries = group;
      flush();
    } else {
      currentEntries.push(...group);
    }
  }

  flush();
  return { batches, blockedByOversizedHour: false };
}

async function submitReportBatch(
  config: Config,
  serverUrl: string,
  entries: ReportEntry[],
  timeoutOverrideMs?: number,
): Promise<boolean> {
  const body = JSON.stringify({
    v: 1,
    reports: entries,
  });

  return new Promise((resolve) => {
    const url = new URL(`${serverUrl}/report`);
    const transport = url.protocol === "https:" ? https : http;
    const requestTimeoutMs =
      typeof timeoutOverrideMs === "number" &&
      Number.isFinite(timeoutOverrideMs) &&
      timeoutOverrideMs > 0
        ? timeoutOverrideMs
        : getReportRequestTimeoutMs(entries.length);
    let deadline: NodeJS.Timeout | undefined;
    let settled = false;
    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      resolve(result);
    };
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "Authorization": `Bearer ${config.publicReporting.cliToken}`,
        },
        rejectUnauthorized: true,
        timeout: requestTimeoutMs,
      },
      (res) => {
        res.on("aborted", () => finish(false));
        res.on("error", () => finish(false));
        res.on("end", () => {
          if (res.statusCode === 200) {
            finish(true);
          } else if (res.statusCode === 401) {
            config.publicReporting.cliToken = null;
            writeJsonAtomic(getConfigPath(), config);
            finish(false);
          } else {
            finish(false);
          }
        });
        res.resume();
      },
    );
    req.on("error", () => finish(false));
    req.on("timeout", () => { req.destroy(); finish(false); });
    deadline = setTimeout(() => {
      req.destroy();
      finish(false);
    }, requestTimeoutMs);
    req.write(body);
    req.end();
  });
}

/**
 * Submit hourly report batch to the community server.
 */
export async function submitPublicReport(
  config: Config,
  options: { requestTimeoutMs?: number } = {},
): Promise<boolean> {
  const cliToken = config.publicReporting?.cliToken;
  if (!cliToken) return false; // Not logged in — skip reporting

  const reportLockPath = path.join(getStorageDir(), ".report.lock");
  const reportLockFd = acquireLock(reportLockPath);
  if (reportLockFd === null) return false;

  try {
    const serverUrl = config.publicReporting.serverUrl || "https://sfvibe.fun/api/burningman";

    // Read last reported hour only after acquiring the cross-process report lock.
    const statePath = path.join(getStorageDir(), ".report-state.json");
    const state = readJson<{ lastReportedHour: string | null }>(statePath, {
      lastReportedHour: null,
    });

    let entries: ReportEntry[];
    try {
      entries = buildReportEntries(state.lastReportedHour);
    } catch {
      return false;
    }
    if (entries.length === 0) return true; // nothing new

    const plan = buildReportBatches(entries);

    for (const batch of plan.batches) {
      if (!refreshLock(reportLockPath, reportLockFd)) return false;
      const submitted = await submitReportBatch(
        config,
        serverUrl,
        batch.entries,
        options.requestTimeoutMs,
      );
      if (!submitted) return false;
      if (!refreshLock(reportLockPath, reportLockFd)) return false;
      writeJsonAtomic(statePath, { lastReportedHour: batch.lastHour });
    }

    return !plan.blockedByOversizedHour;
  } finally {
    releaseLock(reportLockPath, reportLockFd);
  }
}

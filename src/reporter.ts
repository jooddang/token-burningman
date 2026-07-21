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

      if (lastReportedHour && hourIso <= lastReportedHour) continue;

      for (const [model, bucket] of Object.entries(models) as [string, HourlyBucket][]) {
        entries.push({
          hour: hourIso,
          model,
          input_tokens: bucket.input,
          output_tokens: bucket.output,
          cache_read_tokens: bucket.cacheRead,
          cache_create_tokens: bucket.cacheCreate,
          concurrent_sessions: bucket.sessions.length,
          avg_context_pct: Math.round(bucket.avgContextPct),
          total_lines_changed: bucket.linesAdded + bucket.linesRemoved,
          session_count: bucket.sessions.length,
          avg_session_duration_min: 0, // not tracked at hourly level yet
          cost_usd: Math.round(bucket.cost * 100) / 100,
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
): Promise<boolean> {
  const body = JSON.stringify({
    v: 1,
    reports: entries,
  });

  return new Promise((resolve) => {
    const url = new URL(`${serverUrl}/report`);
    const transport = url.protocol === "https:" ? https : http;
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
        timeout: 10000,
      },
      (res) => {
        res.on("aborted", () => resolve(false));
        res.on("error", () => resolve(false));
        res.on("end", () => {
          if (res.statusCode === 200) {
            resolve(true);
          } else if (res.statusCode === 401) {
            config.publicReporting.cliToken = null;
            writeJsonAtomic(getConfigPath(), config);
            resolve(false);
          } else {
            resolve(false);
          }
        });
        res.resume();
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

/**
 * Submit hourly report batch to the community server.
 */
export async function submitPublicReport(config: Config): Promise<boolean> {
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

    const entries = buildReportEntries(state.lastReportedHour);
    if (entries.length === 0) return true; // nothing new

    const plan = buildReportBatches(entries);

    for (const batch of plan.batches) {
      const submitted = await submitReportBatch(config, serverUrl, batch.entries);
      if (!submitted) return false;
      writeJsonAtomic(statePath, { lastReportedHour: batch.lastHour });
    }

    return !plan.blockedByOversizedHour;
  } finally {
    releaseLock(reportLockPath, reportLockFd);
  }
}

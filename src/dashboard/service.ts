import type { HourlyAggregate, QuotaState, SessionEntry } from "../types.js";
import {
  getHourlyFilePath,
  listSessionFiles,
  readJson,
  readJsonl,
  sessionIdFromPath,
} from "../utils/storage.js";
import { cacheHitRate, modelDisplayName, normalizeQuotaUtilization } from "../utils/format.js";
import { readQuotaState } from "../quota.js";
import {
  getCacheRateTrend,
  getCodeVelocity,
  getDailyStats,
  getProjectStats,
  getWeeklyHeatmap,
} from "../analytics.js";
import type {
  OverviewViewModel,
  ProjectsViewModel,
  QuotaSummary,
  SessionSummary,
  SessionsViewModel,
  TrendsViewModel,
} from "./types.js";

const ACTIVE_THRESHOLD_MS = 10 * 60 * 1000;
const CACHE_TTL_MS = 5_000;

interface CacheEntry<T> {
  data: T;
  ts: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, fn: () => T): T {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
    return entry.data;
  }
  const data = fn();
  cache.set(key, { data, ts: Date.now() });
  return data;
}

function summarizeQuota(quota: QuotaState | null): QuotaSummary | null {
  if (!quota || (!quota.five_hour && !quota.seven_day)) {
    return null;
  }

  return {
    fiveHourPct: normalizeQuotaUtilization(quota.five_hour?.utilization),
    fiveHourResetsAt: quota.five_hour?.resets_at ?? null,
    sevenDayPct: normalizeQuotaUtilization(quota.seven_day?.utilization),
    sevenDayResetsAt: quota.seven_day?.resets_at ?? null,
  };
}

function todayDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function summarizeSession(filePath: string, now: number): SessionSummary | null {
  const entries = readJsonl<SessionEntry>(filePath);
  if (entries.length === 0) return null;

  const first = entries[0];
  const last = entries[entries.length - 1];

  let peakCtx = 0;
  let totalCacheRead = 0;
  let totalInput = 0;

  for (const entry of entries) {
    if (entry.ctx > peakCtx) peakCtx = entry.ctx;
    totalCacheRead += entry.cr;
    totalInput += entry.in;
  }

  return {
    id: sessionIdFromPath(filePath),
    model: last.model,
    modelLabel: modelDisplayName(last.model),
    proj: last.proj,
    startTime: first.t,
    endTime: last.t,
    totalInput: last.tin,
    totalOutput: last.tout,
    totalTokens: last.tin + last.tout,
    cost: last.cost,
    peakCtx,
    linesAdded: last.la,
    linesRemoved: last.lr,
    cacheRead: totalCacheRead,
    inputTokens: totalInput,
    entryCount: entries.length,
    isActive: now - last.t < ACTIVE_THRESHOLD_MS,
  };
}

export function getSessionSummaries(): SessionSummary[] {
  return cached("sessions", () => {
    const now = Date.now();
    const sessions = listSessionFiles()
      .map((filePath) => summarizeSession(filePath, now))
      .filter((session): session is SessionSummary => session !== null);

    sessions.sort((left, right) => right.endTime - left.endTime);
    return sessions;
  });
}

export function getOverviewModel(): OverviewViewModel {
  return cached("overview", () => _buildOverviewModel());
}

function _buildOverviewModel(): OverviewViewModel {
  const sessions = getSessionSummaries();
  const quota = summarizeQuota(readQuotaState());
  const todayHourly = readJson<HourlyAggregate>(getHourlyFilePath(todayDateStr()), {});

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const todaySessions = sessions.filter(
    (session) => session.startTime >= todayMs || session.endTime >= todayMs,
  );
  const activeSessions = sessions.filter((session) => session.isActive);

  let totalTokens = 0;
  let totalCost = 0;
  let totalCacheRead = 0;
  let totalInput = 0;
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const session of todaySessions) {
    totalTokens += session.totalTokens;
    totalCost += session.cost;
    totalCacheRead += session.cacheRead;
    totalInput += session.inputTokens;
    linesAdded += session.linesAdded;
    linesRemoved += session.linesRemoved;
  }

  const hourly = Object.entries(todayHourly)
    .map(([hour, models]) => {
      const modelRows = Object.entries(models).map(([model, bucket]) => ({
        model,
        modelLabel: modelDisplayName(model),
        tokens: bucket.input + bucket.output,
      }));
      return {
        hour: hour.padStart(2, "0"),
        totalTokens: modelRows.reduce((sum, row) => sum + row.tokens, 0),
        models: modelRows,
      };
    })
    .filter((row) => row.totalTokens > 0)
    .sort((left, right) => left.hour.localeCompare(right.hour));

  return {
    generatedAt: Date.now(),
    totals: {
      totalTokens,
      totalCost,
      sessionCount: todaySessions.length,
      activeSessionCount: activeSessions.length,
      cacheHitRate: cacheHitRate(totalCacheRead, totalInput),
      linesAdded,
      linesRemoved,
    },
    hourly,
    quota,
    activeSessions,
  };
}

function rangeMs(range: SessionsViewModel["range"]): number {
  switch (range) {
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "48h":
      return 48 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
  }
}

export function getSessionsModel(range: SessionsViewModel["range"]): SessionsViewModel {
  return cached(`sessions-${range}`, () => _buildSessionsModel(range));
}

function _buildSessionsModel(range: SessionsViewModel["range"]): SessionsViewModel {
  const cutoff = Date.now() - rangeMs(range);
  const sessions = getSessionSummaries().filter((session) => session.endTime >= cutoff);

  const durationBuckets = [
    { label: "0-15m", min: 0, max: 15, count: 0 },
    { label: "15-30m", min: 15, max: 30, count: 0 },
    { label: "30-60m", min: 30, max: 60, count: 0 },
    { label: "60-90m", min: 60, max: 90, count: 0 },
    { label: "90m+", min: 90, max: Infinity, count: 0 },
  ];

  for (const session of sessions) {
    const durationMinutes = (session.endTime - session.startTime) / 60_000;
    const bucket = durationBuckets.find(
      (candidate) => durationMinutes >= candidate.min && durationMinutes < candidate.max,
    );
    if (bucket) bucket.count += 1;
  }

  const sweetSpot =
    durationBuckets.reduce((best, bucket) => (bucket.count > best.count ? bucket : best), durationBuckets[0])
      ?.label || "";

  return {
    generatedAt: Date.now(),
    range,
    sessions,
    durationBuckets: durationBuckets.map(({ label, count }) => ({ label, count })),
    sweetSpot,
  };
}

export function getProjectsModel(rangeDays: number): ProjectsViewModel {
  return cached(`projects-${rangeDays}`, () => ({
    generatedAt: Date.now(),
    rangeDays,
    projects: getProjectStats(rangeDays),
  }));
}

export function getTrendsModel(rangeDays: number): TrendsViewModel {
  return cached(`trends-${rangeDays}`, () => _buildTrendsModel(rangeDays));
}

function _buildTrendsModel(rangeDays: number): TrendsViewModel {
  const daily = getDailyStats(rangeDays);
  const cacheRates = getCacheRateTrend(rangeDays);
  const heatmap = getWeeklyHeatmap(rangeDays);

  const totalTokens = daily.reduce((sum, stat) => sum + stat.totalTokens, 0);
  const totalLines = daily.reduce((sum, stat) => sum + stat.linesChanged, 0);
  const currentVelocity = getCodeVelocity(totalTokens, totalLines);

  const last7 = daily.slice(-7);
  const last30 = daily.slice(-30);
  const velocity7 = getCodeVelocity(
    last7.reduce((sum, stat) => sum + stat.totalTokens, 0),
    last7.reduce((sum, stat) => sum + stat.linesChanged, 0),
  );
  const velocity30 = getCodeVelocity(
    last30.reduce((sum, stat) => sum + stat.totalTokens, 0),
    last30.reduce((sum, stat) => sum + stat.linesChanged, 0),
  );

  let trendLabel = "";
  if (velocity7 > 0 && velocity30 > 0) {
    if (velocity7 < velocity30) {
      trendLabel = `Improving ${Math.round(((velocity30 - velocity7) / velocity30) * 100)}%`;
    } else {
      trendLabel = `${Math.round(((velocity7 - velocity30) / velocity30) * 100)}% increase`;
    }
  }

  return {
    generatedAt: Date.now(),
    rangeDays,
    daily,
    cacheRates,
    heatmap,
    productivity: {
      currentVelocity,
      velocity7,
      velocity30,
      trendLabel,
    },
  };
}

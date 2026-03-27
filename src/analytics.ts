import * as fs from "node:fs";
import * as path from "node:path";
import type {
  SessionEntry,
  HourlyAggregate,
  HourlyBucket,
  ProjectStat,
  DailyStat,
  HeatmapCell,
} from "./types.js";
import {
  readJsonl,
  readJson,
  listSessionFiles,
  sessionIdFromPath,
  getHourlyDir,
  getHourlyFilePath,
} from "./utils/storage.js";

/**
 * Get per-project statistics over a time range.
 */
export function getProjectStats(rangeDays: number): ProjectStat[] {
  const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
  const files = listSessionFiles();
  const projects = new Map<
    string,
    {
      totalTokens: number;
      cost: number;
      sessions: Set<string>;
      cacheRead: number;
      inputTokens: number;
      linesAdded: number;
      linesRemoved: number;
      modelTokens: Map<string, number>;
    }
  >();

  for (const file of files) {
    const entries = readJsonl<SessionEntry>(file);
    if (entries.length === 0) continue;

    const last = entries[entries.length - 1];
    if (last.t < cutoff) continue; // Session too old

    const sid = sessionIdFromPath(file);
    const proj = last.proj;
    const model = last.model;

    if (!projects.has(proj)) {
      projects.set(proj, {
        totalTokens: 0,
        cost: 0,
        sessions: new Set(),
        cacheRead: 0,
        inputTokens: 0,
        linesAdded: 0,
        linesRemoved: 0,
        modelTokens: new Map(),
      });
    }

    const p = projects.get(proj)!;
    const sessionTokens = last.tin + last.tout;
    p.totalTokens += sessionTokens;
    p.cost += last.cost;
    p.sessions.add(sid);
    p.linesAdded += last.la;
    p.linesRemoved += last.lr;

    // Accumulate cache stats from all entries
    for (const e of entries) {
      if (e.t >= cutoff) {
        p.cacheRead += e.cr;
        p.inputTokens += e.in;
      }
    }

    // Model mix
    p.modelTokens.set(model, (p.modelTokens.get(model) || 0) + sessionTokens);
  }

  const stats: ProjectStat[] = [];
  for (const [project, p] of projects) {
    const totalModelTokens = Array.from(p.modelTokens.values()).reduce(
      (s, v) => s + v,
      0,
    );
    const modelMix: Record<string, number> = {};
    for (const [model, tokens] of p.modelTokens) {
      const shortName = model.includes("opus")
        ? "Opus"
        : model.includes("sonnet")
          ? "Sonnet"
          : model.includes("haiku")
            ? "Haiku"
            : model;
      modelMix[shortName] =
        totalModelTokens > 0 ? Math.round((tokens / totalModelTokens) * 100) : 0;
    }

    const totalIn = p.cacheRead + p.inputTokens;
    stats.push({
      project,
      totalTokens: p.totalTokens,
      cost: p.cost,
      sessionCount: p.sessions.size,
      cacheHitRate: totalIn > 0 ? Math.round((p.cacheRead / totalIn) * 100) : 0,
      linesAdded: p.linesAdded,
      linesRemoved: p.linesRemoved,
      modelMix,
    });
  }

  return stats.sort((a, b) => b.cost - a.cost);
}

/**
 * Get daily statistics over a time range.
 */
export function getDailyStats(rangeDays: number): DailyStat[] {
  const hourlyDir = getHourlyDir();
  if (!fs.existsSync(hourlyDir)) return [];

  const files = fs.readdirSync(hourlyDir).filter((f) => f.endsWith(".json"));
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - rangeDays);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  const stats: DailyStat[] = [];

  for (const file of files) {
    const dateStr = file.replace(".json", "");
    if (dateStr < cutoffStr) continue;

    const hourly = readJson<HourlyAggregate>(
      path.join(hourlyDir, file),
      {},
    );

    let totalTokens = 0;
    let cost = 0;
    let cacheRead = 0;
    let totalInput = 0;
    let linesChanged = 0;
    let sessionSet = new Set<string>();

    for (const hourData of Object.values(hourly)) {
      for (const bucket of Object.values(hourData) as HourlyBucket[]) {
        totalTokens += bucket.input + bucket.output;
        cost += bucket.cost;
        cacheRead += bucket.cacheRead;
        totalInput += bucket.input + bucket.cacheRead;
        linesChanged += bucket.linesAdded + bucket.linesRemoved;
        for (const s of bucket.sessions) sessionSet.add(s);
      }
    }

    const totalIn = cacheRead + totalInput;
    stats.push({
      date: dateStr,
      totalTokens,
      cost,
      cacheRate: totalIn > 0 ? Math.round((cacheRead / totalIn) * 100) : 0,
      velocity: linesChanged > 0 ? Math.round(totalTokens / linesChanged) : 0,
      linesChanged,
      sessionCount: sessionSet.size,
    });
  }

  return stats.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Code velocity: tokens per line of code changed (lower = more efficient).
 */
export function getCodeVelocity(
  totalTokens: number,
  linesChanged: number,
): number {
  if (linesChanged === 0) return 0;
  return Math.round(totalTokens / linesChanged);
}

/**
 * Cache hit rate trend: daily cache rates over a range.
 */
export function getCacheRateTrend(
  rangeDays: number,
): { date: string; rate: number }[] {
  const daily = getDailyStats(rangeDays);
  return daily.map((d) => ({ date: d.date, rate: d.cacheRate }));
}

/**
 * Weekly heatmap: activity intensity by day-of-week × hour-of-day.
 */
export function getWeeklyHeatmap(rangeDays: number): HeatmapCell[] {
  const hourlyDir = getHourlyDir();
  if (!fs.existsSync(hourlyDir)) return [];

  const files = fs.readdirSync(hourlyDir).filter((f) => f.endsWith(".json"));
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - rangeDays);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  // 7 days × 24 hours grid
  const grid: number[][] = Array.from({ length: 7 }, () =>
    Array(24).fill(0),
  );

  for (const file of files) {
    const dateStr = file.replace(".json", "");
    if (dateStr < cutoffStr) continue;

    const dayOfWeek = new Date(dateStr + "T12:00:00").getDay(); // 0=Sun
    const hourly = readJson<HourlyAggregate>(
      path.join(hourlyDir, file),
      {},
    );

    for (const [hourStr, hourData] of Object.entries(hourly)) {
      const hour = parseInt(hourStr);
      for (const bucket of Object.values(hourData) as HourlyBucket[]) {
        grid[dayOfWeek][hour] += bucket.input + bucket.output;
      }
    }
  }

  const cells: HeatmapCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ day, hour, value: grid[day][hour] });
    }
  }

  return cells;
}

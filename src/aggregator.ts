import type { SessionEntry, HourlyAggregate, HourlyBucket, AggregationMeta } from "./types.js";
import { computeAllDeltas } from "./utils/delta.js";
import {
  readJsonl,
  readJson,
  writeJsonAtomic,
  listSessionFiles,
  sessionIdFromPath,
  getHourlyFilePath,
  getAggregationMetaPath,
} from "./utils/storage.js";

function newBucket(): HourlyBucket {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreate: 0,
    cost: 0,
    requests: 0,
    linesAdded: 0,
    linesRemoved: 0,
    sessions: [],
    avgContextPct: 0,
  };
}

function formatDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getHourKey(timestamp: number): string {
  return String(new Date(timestamp).getHours());
}

export function aggregateSession(
  sessionId: string,
  entries: SessionEntry[],
  startFromLine: number = 0,
): void {
  if (entries.length < 2 && startFromLine === 0) return;

  const relevantEntries = entries.slice(Math.max(0, startFromLine));
  if (relevantEntries.length < 2 && startFromLine === 0) return;

  // For incremental aggregation, we need the previous entry for delta
  const deltaStart = startFromLine > 0 ? startFromLine - 1 : 0;
  const deltaEntries = entries.slice(deltaStart);
  const deltas = computeAllDeltas(deltaEntries);

  // Skip the first delta if we're doing incremental (it was just for context)
  const newDeltas = startFromLine > 0 ? deltas.slice(1) : deltas;

  // Group deltas by date
  const byDate = new Map<string, typeof newDeltas>();
  for (const delta of newDeltas) {
    const dateKey = formatDateKey(delta.t);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(delta);
  }

  // Update hourly files
  for (const [dateKey, dateDeltas] of byDate) {
    const filePath = getHourlyFilePath(dateKey);
    const hourlyData = readJson<HourlyAggregate>(filePath, {});

    for (const delta of dateDeltas) {
      const hourKey = getHourKey(delta.t);
      const modelKey = delta.model;

      if (!hourlyData[hourKey]) hourlyData[hourKey] = {};
      if (!hourlyData[hourKey][modelKey]) hourlyData[hourKey][modelKey] = newBucket();

      const bucket = hourlyData[hourKey][modelKey];
      bucket.input += delta.inputDelta;
      bucket.output += delta.outputDelta;
      bucket.cacheRead += delta.cr;
      bucket.cacheCreate += delta.cc;
      bucket.cost += delta.costDelta;
      bucket.requests += 1;
      bucket.linesAdded += delta.lineAddedDelta;
      bucket.linesRemoved += delta.lineRemovedDelta;

      if (!bucket.sessions.includes(sessionId)) {
        bucket.sessions.push(sessionId);
      }

      // Running average for context %
      const prevCount = bucket.requests - 1;
      bucket.avgContextPct =
        prevCount > 0
          ? (bucket.avgContextPct * prevCount + delta.ctx) / bucket.requests
          : delta.ctx;
    }

    writeJsonAtomic(filePath, hourlyData);
  }
}

export function aggregateAllPending(): { processed: number; skipped: number } {
  const sessionFiles = listSessionFiles();
  const meta = readJson<AggregationMeta>(getAggregationMetaPath(), {});
  let processed = 0;
  let skipped = 0;

  for (const filePath of sessionFiles) {
    const sessionId = sessionIdFromPath(filePath);
    const entries = readJsonl<SessionEntry>(filePath);
    const lastProcessedLine = meta[sessionId] ?? 0;

    if (entries.length <= lastProcessedLine) {
      skipped++;
      continue;
    }

    aggregateSession(sessionId, entries, lastProcessedLine);
    meta[sessionId] = entries.length;
    processed++;
  }

  writeJsonAtomic(getAggregationMetaPath(), meta);
  return { processed, skipped };
}

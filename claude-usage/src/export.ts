import type { SessionEntry, HourlyAggregate, HourlyBucket } from "./types.js";
import {
  listSessionFiles,
  readJsonl,
  readJson,
  getHourlyDir,
} from "./utils/storage.js";
import * as fs from "node:fs";
import * as path from "node:path";

function rangeCutoff(range: string): number {
  const now = Date.now();
  switch (range) {
    case "today": {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case "7d": return now - 7 * 86400_000;
    case "30d": return now - 30 * 86400_000;
    case "all": return 0;
    default: return now - 7 * 86400_000;
  }
}

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function exportSessions(
  format: "json" | "csv",
  range: string,
): string {
  const cutoff = rangeCutoff(range);
  const files = listSessionFiles();
  const allEntries: SessionEntry[] = [];

  for (const file of files) {
    const entries = readJsonl<SessionEntry>(file);
    for (const e of entries) {
      if (e.t >= cutoff) allEntries.push(e);
    }
  }

  allEntries.sort((a, b) => a.t - b.t);

  if (format === "json") {
    return JSON.stringify(allEntries, null, 2);
  }

  // CSV
  const headers = [
    "timestamp", "session_id", "model", "project",
    "input_tokens", "output_tokens", "cache_read", "cache_create",
    "total_input", "total_output", "context_pct", "context_max",
    "cost", "lines_added", "lines_removed",
  ];

  const rows = allEntries.map((e) => [
    new Date(e.t).toISOString(),
    e.sid, e.model, e.proj,
    String(e.in), String(e.out), String(e.cr), String(e.cc),
    String(e.tin), String(e.tout), String(e.ctx), String(e.ctxMax),
    String(e.cost), String(e.la), String(e.lr),
  ].map(csvEscape).join(","));

  return [headers.join(","), ...rows].join("\n");
}

export function exportHourly(
  format: "json" | "csv",
  range: string,
): string {
  const hourlyDir = getHourlyDir();
  if (!fs.existsSync(hourlyDir)) return format === "json" ? "[]" : "";

  const cutoffDate = new Date(rangeCutoff(range));
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  const files = fs.readdirSync(hourlyDir)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => f.replace(".json", "") >= cutoffStr);

  if (format === "json") {
    const all: Record<string, HourlyAggregate> = {};
    for (const file of files) {
      const dateStr = file.replace(".json", "");
      all[dateStr] = readJson<HourlyAggregate>(path.join(hourlyDir, file), {});
    }
    return JSON.stringify(all, null, 2);
  }

  // CSV
  const headers = [
    "date", "hour", "model",
    "input", "output", "cache_read", "cache_create",
    "cost", "requests", "lines_added", "lines_removed",
    "sessions", "avg_context_pct",
  ];

  const rows: string[] = [];
  for (const file of files) {
    const dateStr = file.replace(".json", "");
    const hourly = readJson<HourlyAggregate>(path.join(hourlyDir, file), {});
    for (const [hour, models] of Object.entries(hourly)) {
      for (const [model, b] of Object.entries(models) as [string, HourlyBucket][]) {
        rows.push([
          dateStr, hour, model,
          String(b.input), String(b.output), String(b.cacheRead), String(b.cacheCreate),
          String(b.cost), String(b.requests), String(b.linesAdded), String(b.linesRemoved),
          String(b.sessions.length), String(Math.round(b.avgContextPct)),
        ].map(csvEscape).join(","));
      }
    }
  }

  return [headers.join(","), ...rows].join("\n");
}

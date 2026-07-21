#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/types.ts
var DEFAULT_CONFIG = {
  version: 1,
  publicReporting: {
    enabled: false,
    serverUrl: "https://sfvibe.fun/api/burningman",
    cliToken: null
  },
  display: {
    statuslineFormat: "full",
    currency: "USD",
    timezone: "system",
    colorScheme: "auto",
    chainStatusline: true
  },
  collection: {
    enabled: true,
    hourlyMaintenanceIntervalMin: 60,
    sessionRetentionDays: 90,
    archiveAfterDays: 30
  },
  alerts: {
    quotaWarningThreshold: 0.8,
    costDailyBudget: null,
    contextWarningPct: 75
  },
  tui: {
    defaultView: "overview",
    refreshIntervalSec: 5,
    compactMode: false
  }
};

// src/maintenance.ts
var fs3 = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);
var import_node_child_process = require("child_process");

// src/utils/delta.ts
function computeDelta(current, previous) {
  if (previous === null) {
    return {
      t: current.t,
      sid: current.sid,
      model: current.model,
      proj: current.proj,
      inputDelta: current.tin,
      outputDelta: current.tout,
      costDelta: current.cost,
      lineAddedDelta: current.la,
      lineRemovedDelta: current.lr,
      in: current.in,
      out: current.out,
      cr: current.cr,
      cc: current.cc,
      ctx: current.ctx,
      ctxMax: current.ctxMax
    };
  }
  let inputDelta = current.tin - previous.tin;
  let outputDelta = current.tout - previous.tout;
  let costDelta = current.cost - previous.cost;
  let lineAddedDelta = current.la - previous.la;
  let lineRemovedDelta = current.lr - previous.lr;
  if (inputDelta < 0 || outputDelta < 0) {
    inputDelta = current.tin;
    outputDelta = current.tout;
    costDelta = current.cost;
    lineAddedDelta = current.la;
    lineRemovedDelta = current.lr;
  }
  return {
    t: current.t,
    sid: current.sid,
    model: current.model,
    proj: current.proj,
    inputDelta,
    outputDelta,
    costDelta,
    lineAddedDelta,
    lineRemovedDelta,
    in: current.in,
    out: current.out,
    cr: current.cr,
    cc: current.cc,
    ctx: current.ctx,
    ctxMax: current.ctxMax
  };
}
function computeAllDeltas(entries) {
  if (entries.length === 0) return [];
  const deltas = [];
  deltas.push(computeDelta(entries[0], null));
  for (let i = 1; i < entries.length; i++) {
    deltas.push(computeDelta(entries[i], entries[i - 1]));
  }
  return deltas;
}

// src/utils/storage.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var os = __toESM(require("os"), 1);
var DEFAULT_STORAGE_DIR = path.join(os.homedir(), ".token-burningman");
function getStorageDir() {
  return process.env.CLAUDE_USAGE_DIR || DEFAULT_STORAGE_DIR;
}
function getSessionsDir() {
  return path.join(getStorageDir(), "sessions");
}
function getHourlyDir() {
  return path.join(getStorageDir(), "hourly");
}
function getHourlyFilePath(dateStr) {
  return path.join(getHourlyDir(), `${dateStr}.json`);
}
function getConfigPath() {
  return path.join(getStorageDir(), "config.json");
}
function getAggregationMetaPath() {
  return path.join(getStorageDir(), ".aggregation-meta.json");
}
function getMaintenanceStatePath() {
  return path.join(getStorageDir(), ".maintenance-state.json");
}
function getMaintenanceLockPath() {
  return path.join(getStorageDir(), ".maintenance.lock");
}
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 448 });
  }
}
function ensureStorageDirs() {
  ensureDir(getSessionsDir());
  ensureDir(getHourlyDir());
  ensureDir(path.join(getStorageDir(), "quota"));
}
function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const results = [];
  for (const line of lines) {
    try {
      results.push(JSON.parse(line));
    } catch {
    }
  }
  return results;
}
function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}
function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmpPath = filePath + ".tmp";
  const fd = fs.openSync(tmpPath, "w", 384);
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 2));
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
}
function listSessionFiles() {
  const dir = getSessionsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(dir, f));
}
function sessionIdFromPath(filePath) {
  return path.basename(filePath, ".jsonl");
}
var DEFAULT_LOCK_STALE_MS = 15 * 6e4;
function acquireLock(lockPath, staleMs = DEFAULT_LOCK_STALE_MS) {
  ensureDir(path.dirname(lockPath));
  try {
    return fs.openSync(lockPath, "wx", 384);
  } catch {
    try {
      const stat = fs.statSync(lockPath);
      if (Date.now() - stat.mtimeMs > staleMs) {
        fs.unlinkSync(lockPath);
        return fs.openSync(lockPath, "wx", 384);
      }
    } catch {
    }
    return null;
  }
}
function releaseLock(lockPath, fd) {
  if (fd !== null) {
    try {
      fs.closeSync(fd);
    } catch {
    }
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
  }
}

// src/aggregator.ts
function newBucket() {
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
    avgContextPct: 0
  };
}
function formatDateKey(timestamp) {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function getHourKey(timestamp) {
  return String(new Date(timestamp).getHours());
}
function aggregateSession(sessionId, entries, startFromLine = 0) {
  if (entries.length < 2 && startFromLine === 0) return;
  const relevantEntries = entries.slice(Math.max(0, startFromLine));
  if (relevantEntries.length < 2 && startFromLine === 0) return;
  const deltaStart = startFromLine > 0 ? startFromLine - 1 : 0;
  const deltaEntries = entries.slice(deltaStart);
  const deltas = computeAllDeltas(deltaEntries);
  const newDeltas = startFromLine > 0 ? deltas.slice(1) : deltas;
  const byDate = /* @__PURE__ */ new Map();
  for (const delta of newDeltas) {
    const dateKey = formatDateKey(delta.t);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(delta);
  }
  for (const [dateKey, dateDeltas] of byDate) {
    const filePath = getHourlyFilePath(dateKey);
    const hourlyData = readJson(filePath, {});
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
      const prevCount = bucket.requests - 1;
      bucket.avgContextPct = prevCount > 0 ? (bucket.avgContextPct * prevCount + delta.ctx) / bucket.requests : delta.ctx;
    }
    writeJsonAtomic(filePath, hourlyData);
  }
}
function aggregateAllPending() {
  const sessionFiles = listSessionFiles();
  const meta = readJson(getAggregationMetaPath(), {});
  let processed = 0;
  let skipped = 0;
  for (const filePath of sessionFiles) {
    const sessionId = sessionIdFromPath(filePath);
    const entries = readJsonl(filePath);
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

// src/reporter.ts
var https = __toESM(require("https"), 1);
var http = __toESM(require("http"), 1);
var fs2 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
var REPORT_BATCH_TARGET = 100;
var MAX_REPORTS_PER_HOUR = 500;
var REPORT_FIELD_LIMITS = {
  inputTokens: 5e7,
  outputTokens: 5e7,
  cacheReadTokens: 1e8,
  cacheCreateTokens: 1e8,
  concurrentSessions: 50,
  avgContextPct: 100,
  totalLinesChanged: 1e6,
  sessionCount: 100,
  avgSessionDurationMin: 1440,
  costUsd: 1e4
};
function saturateReportMetric(value, max, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Community report metrics must be finite numbers");
  }
  const boundedValue = Math.min(Math.max(value, 0), max);
  return integer ? Math.trunc(boundedValue) : boundedValue;
}
function buildReportEntries(lastReportedHour) {
  const hourlyDir = getHourlyDir();
  if (!fs2.existsSync(hourlyDir)) return [];
  const files = fs2.readdirSync(hourlyDir).filter((f) => f.endsWith(".json"));
  const entries = [];
  for (const file of files) {
    const dateStr = file.replace(".json", "");
    const hourly = readJson(
      `${hourlyDir}/${file}`,
      {}
    );
    for (const [hourStr, models] of Object.entries(hourly)) {
      const hourIso = `${dateStr}T${hourStr.padStart(2, "0")}:00:00Z`;
      if (lastReportedHour && hourIso <= lastReportedHour) continue;
      for (const [model, bucket] of Object.entries(models)) {
        if (!Array.isArray(bucket.sessions)) {
          throw new TypeError("Community report sessions must be an array");
        }
        const linesChanged = saturateReportMetric(bucket.linesAdded, Number.MAX_SAFE_INTEGER) + saturateReportMetric(bucket.linesRemoved, Number.MAX_SAFE_INTEGER);
        const avgContextPct = saturateReportMetric(
          bucket.avgContextPct,
          Number.MAX_SAFE_INTEGER
        );
        const costUsd = saturateReportMetric(bucket.cost, Number.MAX_SAFE_INTEGER);
        entries.push({
          hour: hourIso,
          model,
          input_tokens: saturateReportMetric(
            bucket.input,
            REPORT_FIELD_LIMITS.inputTokens,
            true
          ),
          output_tokens: saturateReportMetric(
            bucket.output,
            REPORT_FIELD_LIMITS.outputTokens,
            true
          ),
          cache_read_tokens: saturateReportMetric(
            bucket.cacheRead,
            REPORT_FIELD_LIMITS.cacheReadTokens,
            true
          ),
          cache_create_tokens: saturateReportMetric(
            bucket.cacheCreate,
            REPORT_FIELD_LIMITS.cacheCreateTokens,
            true
          ),
          concurrent_sessions: saturateReportMetric(
            bucket.sessions.length,
            REPORT_FIELD_LIMITS.concurrentSessions,
            true
          ),
          avg_context_pct: saturateReportMetric(
            Math.round(avgContextPct),
            REPORT_FIELD_LIMITS.avgContextPct
          ),
          total_lines_changed: saturateReportMetric(
            linesChanged,
            REPORT_FIELD_LIMITS.totalLinesChanged,
            true
          ),
          session_count: saturateReportMetric(
            bucket.sessions.length,
            REPORT_FIELD_LIMITS.sessionCount,
            true
          ),
          avg_session_duration_min: saturateReportMetric(
            0,
            // not tracked at hourly level yet
            REPORT_FIELD_LIMITS.avgSessionDurationMin
          ),
          cost_usd: saturateReportMetric(
            Math.round(costUsd * 100) / 100,
            REPORT_FIELD_LIMITS.costUsd
          )
        });
      }
    }
  }
  return entries.sort((a, b) => {
    const hourOrder = a.hour.localeCompare(b.hour);
    return hourOrder !== 0 ? hourOrder : a.model.localeCompare(b.model);
  });
}
function buildReportBatches(entries) {
  const hourGroups = [];
  for (const entry of entries) {
    const current = hourGroups[hourGroups.length - 1];
    if (!current || current[0].hour !== entry.hour) {
      hourGroups.push([entry]);
    } else {
      current.push(entry);
    }
  }
  const batches = [];
  let currentEntries = [];
  const flush = () => {
    if (currentEntries.length === 0) return;
    batches.push({
      entries: currentEntries,
      lastHour: currentEntries[currentEntries.length - 1].hour
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
async function submitReportBatch(config, serverUrl, entries) {
  const body = JSON.stringify({
    v: 1,
    reports: entries
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
          "Authorization": `Bearer ${config.publicReporting.cliToken}`
        },
        rejectUnauthorized: true,
        timeout: 1e4
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
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}
async function submitPublicReport(config) {
  const cliToken = config.publicReporting?.cliToken;
  if (!cliToken) return false;
  const reportLockPath = path2.join(getStorageDir(), ".report.lock");
  const reportLockFd = acquireLock(reportLockPath);
  if (reportLockFd === null) return false;
  try {
    const serverUrl = config.publicReporting.serverUrl || "https://sfvibe.fun/api/burningman";
    const statePath = path2.join(getStorageDir(), ".report-state.json");
    const state = readJson(statePath, {
      lastReportedHour: null
    });
    let entries;
    try {
      entries = buildReportEntries(state.lastReportedHour);
    } catch {
      return false;
    }
    if (entries.length === 0) return true;
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

// src/maintenance.ts
var DEFAULT_STATE = {
  lastRunAt: 0
};
function readState() {
  return readJson(getMaintenanceStatePath(), DEFAULT_STATE);
}
function writeState(state) {
  writeJsonAtomic(getMaintenanceStatePath(), state);
}
function shouldRunHourlyMaintenance(config) {
  const intervalMs = (config.collection?.hourlyMaintenanceIntervalMin ?? 60) * 6e4;
  const state = readState();
  return Date.now() - state.lastRunAt >= intervalMs;
}
async function runHourlyMaintenanceSafe(config) {
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
      reported
    };
  } finally {
    releaseLock(lockPath, fd);
  }
}

// src/hourly-maintenance-bg.ts
async function main() {
  ensureStorageDirs();
  const config = readJson(getConfigPath(), DEFAULT_CONFIG);
  await runHourlyMaintenanceSafe(config);
}
main().catch(() => {
}).finally(() => process.exit(0));

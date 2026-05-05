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
          avg_session_duration_min: 0,
          // not tracked at hourly level yet
          cost_usd: Math.round(bucket.cost * 100) / 100
        });
      }
    }
  }
  return entries;
}
async function submitPublicReport(config) {
  const cliToken = config.publicReporting?.cliToken;
  if (!cliToken) return false;
  const serverUrl = config.publicReporting.serverUrl || "https://sfvibe.fun/api/burningman";
  const statePath = path2.join(getStorageDir(), ".report-state.json");
  const state = readJson(statePath, {
    lastReportedHour: null
  });
  const entries = buildReportEntries(state.lastReportedHour);
  if (entries.length === 0) return true;
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
          "Authorization": `Bearer ${cliToken}`
        },
        rejectUnauthorized: true,
        timeout: 1e4
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode === 200) {
            const lastHour = entries.reduce(
              (max, e) => e.hour > max ? e.hour : max,
              entries[0].hour
            );
            writeJsonAtomic(statePath, { lastReportedHour: lastHour });
            resolve(true);
          } else if (res.statusCode === 401) {
            config.publicReporting.cliToken = null;
            writeJsonAtomic(getConfigPath(), config);
            resolve(false);
          } else {
            resolve(false);
          }
        });
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
    colorScheme: "auto"
  },
  collection: {
    enabled: true,
    quotaPollingIntervalMin: 1,
    quotaPollingMinSec: 30,
    quotaPollingTokenDelta: 2e4,
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

// src/aggregate-entry.ts
try {
  ensureStorageDirs();
  const result = aggregateAllPending();
  if (result.processed > 0) {
    process.stderr.write(
      `token-burningman: aggregated ${result.processed} session(s), ${result.skipped} up-to-date
`
    );
  }
  const config = readJson(getConfigPath(), DEFAULT_CONFIG);
  if (config.publicReporting?.cliToken) {
    submitPublicReport(config).then((ok) => {
      if (ok) {
        process.stderr.write("token-burningman: community report submitted\n");
      }
    }).catch(() => {
    });
  }
} catch (err) {
  process.stderr.write(`token-burningman: aggregation error: ${err}
`);
}

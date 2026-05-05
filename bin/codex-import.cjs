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

// src/codex/importer.ts
var fs3 = __toESM(require("fs"), 1);
var os2 = __toESM(require("os"), 1);
var path3 = __toESM(require("path"), 1);

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
function getSessionFilePath(sessionId) {
  return path.join(getSessionsDir(), `${sessionId}.jsonl`);
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
function appendJsonl(filePath, entry) {
  ensureDir(path.dirname(filePath));
  const line = JSON.stringify(entry) + "\n";
  const fd = fs.openSync(filePath, "a", 384);
  try {
    fs.writeSync(fd, line);
  } finally {
    fs.closeSync(fd);
  }
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

// src/codex/importer.ts
var IMPORT_META_PATH = () => path3.join(getStorageDir(), ".codex-import-meta.json");
function getDefaultCodexHome() {
  return process.env.BURNINGMAN_CODEX_HOME || process.env.CODEX_HOME || path3.join(os2.homedir(), ".codex");
}
function listCodexSessionFiles(codexHome) {
  const roots = [
    path3.join(codexHome, "sessions"),
    path3.join(codexHome, "archived_sessions")
  ];
  const files = [];
  function walk(dir) {
    if (!fs3.existsSync(dir)) return;
    for (const name of fs3.readdirSync(dir)) {
      const child = path3.join(dir, name);
      const stat = fs3.statSync(child);
      if (stat.isDirectory()) {
        walk(child);
      } else if (name.startsWith("rollout-") && name.endsWith(".jsonl")) {
        files.push(child);
      }
    }
  }
  for (const root of roots) walk(root);
  files.sort();
  return files;
}
function readLines(filePath) {
  if (!fs3.existsSync(filePath)) return [];
  return fs3.readFileSync(filePath, "utf8").split("\n").filter((line) => line.trim().length > 0);
}
function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function parseTimestamp(value) {
  if (typeof value !== "string") return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}
function projectName(cwd) {
  return typeof cwd === "string" && cwd.length > 0 ? path3.basename(cwd) : "unknown";
}
function sessionIdFromRecord(record, fallback) {
  if (record && typeof record === "object" && "payload" in record && record.payload && typeof record.payload === "object" && "id" in record.payload && typeof record.payload.id === "string") {
    return `codex-${record.payload.id.slice(0, 12)}`;
  }
  return fallback;
}
function updateContextFromRecord(record, context) {
  if (record?.type === "session_meta") {
    context.sessionId = sessionIdFromRecord(record, context.sessionId);
    context.project = projectName(record.payload?.cwd);
    if (typeof record.payload?.model === "string") {
      context.model = record.payload.model;
    }
  }
  if (record?.type === "turn_context") {
    context.project = projectName(record.payload?.cwd);
    if (typeof record.payload?.model === "string") {
      context.model = record.payload.model;
    }
  }
}
function quotaFromRecord(record, timestamp) {
  const limits = record?.payload?.rate_limits;
  if (!limits) return null;
  const primary = limits.primary;
  const secondary = limits.secondary;
  return {
    lastFetchedAt: timestamp,
    five_hour: primary ? {
      utilization: asNumber(primary.used_percent),
      resets_at: primary.resets_at ? new Date(asNumber(primary.resets_at) * 1e3).toISOString() : ""
    } : null,
    seven_day: secondary ? {
      utilization: asNumber(secondary.used_percent),
      resets_at: secondary.resets_at ? new Date(asNumber(secondary.resets_at) * 1e3).toISOString() : ""
    } : null
  };
}
function entryFromTokenRecord(record, context) {
  if (record?.type !== "event_msg" || record?.payload?.type !== "token_count") return null;
  const info = record.payload.info;
  if (!info?.total_token_usage) {
    return null;
  }
  const total = info.total_token_usage;
  const last = info.last_token_usage || {};
  const totalTokens = asNumber(total.total_tokens);
  if (context.lastTotalTokens === totalTokens) {
    return null;
  }
  context.lastTotalTokens = totalTokens;
  const timestamp = parseTimestamp(record.timestamp);
  context.latestQuota = quotaFromRecord(record, timestamp) || context.latestQuota;
  const contextWindow = asNumber(info.model_context_window);
  const output = asNumber(total.output_tokens) + asNumber(total.reasoning_output_tokens);
  const lastOutput = asNumber(last.output_tokens) + asNumber(last.reasoning_output_tokens);
  const ctx = contextWindow > 0 ? Math.min(100, Math.round(totalTokens / contextWindow * 100)) : 0;
  return {
    t: timestamp,
    sid: context.sessionId,
    model: context.model,
    proj: context.project,
    in: asNumber(last.input_tokens),
    out: lastOutput,
    cr: asNumber(last.cached_input_tokens),
    cc: 0,
    tin: asNumber(total.input_tokens),
    tout: output,
    ctx,
    ctxMax: contextWindow,
    cost: 0,
    la: 0,
    lr: 0
  };
}
function importSessionFile(filePath, startLine) {
  const lines = readLines(filePath);
  const safeStartLine = startLine > lines.length ? 0 : Math.max(0, startLine);
  const fallbackId = `codex-${path3.basename(filePath, ".jsonl").slice(-12)}`;
  const context = {
    sessionId: fallbackId,
    project: "unknown",
    model: "codex",
    lastTotalTokens: null,
    latestQuota: null,
    appended: 0
  };
  for (let index = 0; index < lines.length; index++) {
    let record;
    try {
      record = JSON.parse(lines[index]);
    } catch {
      continue;
    }
    updateContextFromRecord(record, context);
    const entry = entryFromTokenRecord(record, context);
    if (!entry || index < safeStartLine) continue;
    appendJsonl(getSessionFilePath(entry.sid), entry);
    context.appended += 1;
  }
  return {
    imported: context.appended,
    sessionId: context.appended > 0 ? context.sessionId : null,
    lineCount: lines.length,
    quota: context.latestQuota
  };
}
function writeQuotaState(quota) {
  if (!quota) return;
  writeJsonAtomic(path3.join(getStorageDir(), "quota", "state.json"), quota);
}
async function importCodexUsage(options = {}) {
  ensureStorageDirs();
  const codexHome = options.codexHome || getDefaultCodexHome();
  const meta = readJson(IMPORT_META_PATH(), { files: {} });
  const files = listCodexSessionFiles(codexHome);
  const importedSessions = /* @__PURE__ */ new Set();
  let filesChanged = 0;
  let entriesImported = 0;
  let latestQuota = null;
  for (const filePath of files) {
    const startLine = meta.files[filePath] ?? 0;
    const result = importSessionFile(filePath, startLine);
    meta.files[filePath] = result.lineCount;
    if (result.imported > 0) {
      filesChanged += 1;
      entriesImported += result.imported;
      if (result.sessionId) importedSessions.add(result.sessionId);
      if (result.quota) latestQuota = result.quota;
    }
  }
  writeJsonAtomic(IMPORT_META_PATH(), meta);
  writeQuotaState(latestQuota);
  const aggregated = aggregateAllPending();
  let reported = false;
  if (options.report !== false) {
    const config = readJson(getConfigPath(), DEFAULT_CONFIG);
    if (config.publicReporting?.cliToken) {
      reported = await submitPublicReport(config);
    }
  }
  return {
    codexHome,
    filesScanned: files.length,
    filesChanged,
    entriesImported,
    sessionsImported: importedSessions.size,
    aggregated,
    reported
  };
}

// src/codex-import.ts
async function main() {
  const result = await importCodexUsage();
  process.stdout.write(
    [
      `Scanned ${result.filesScanned} Codex session file(s).`,
      `Imported ${result.entriesImported} token event(s) from ${result.sessionsImported} session(s).`,
      `Aggregated ${result.aggregated.processed} session file(s), ${result.aggregated.skipped} up-to-date.`,
      result.reported ? "Submitted community report to sfvibe.fun." : "No community report submitted."
    ].join("\n") + "\n"
  );
}
main().catch((error) => {
  process.stderr.write(`token-burningman Codex import failed: ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});

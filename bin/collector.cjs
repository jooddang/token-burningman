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

// src/collector.ts
var fs5 = __toESM(require("fs"), 1);
var path5 = __toESM(require("path"), 1);

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
function getConfigPath() {
  return path.join(getStorageDir(), "config.json");
}
function getMaintenanceStatePath() {
  return path.join(getStorageDir(), ".maintenance-state.json");
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
var DEFAULT_LOCK_STALE_MS = 15 * 6e4;

// src/quota.ts
var fs2 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
var https = __toESM(require("https"), 1);
var import_node_child_process = require("child_process");
var QUOTA_STATE_PATH = () => path2.join(getStorageDir(), "quota", "state.json");
var QUOTA_TRIGGER_PATH = () => path2.join(getStorageDir(), "quota", "trigger.json");
var DEFAULT_QUOTA_STATE = {
  lastFetchedAt: 0,
  five_hour: null,
  seven_day: null
};
var DEFAULT_QUOTA_TRIGGER = {
  lastTriggerAt: 0,
  tokensAtLastTrigger: 0,
  sid: ""
};
function readQuotaState() {
  return readJson(QUOTA_STATE_PATH(), DEFAULT_QUOTA_STATE);
}
function readQuotaTrigger() {
  return readJson(QUOTA_TRIGGER_PATH(), DEFAULT_QUOTA_TRIGGER);
}
function markQuotaFetchTriggered(tokens, sid) {
  writeJsonAtomic(QUOTA_TRIGGER_PATH(), {
    lastTriggerAt: Date.now(),
    tokensAtLastTrigger: tokens,
    sid
  });
}
function shouldFetchQuota(config, currentTokens = 0, sid = "") {
  const state = readQuotaState();
  const trigger = readQuotaTrigger();
  const now = Date.now();
  const lastActivityAt = Math.max(state.lastFetchedAt, trigger.lastTriggerAt);
  const elapsed = now - lastActivityAt;
  const minMs = (config.collection?.quotaPollingMinSec ?? 30) * 1e3;
  const intervalMs = (config.collection?.quotaPollingIntervalMin ?? 1) * 6e4;
  if (elapsed < minMs) return false;
  if (elapsed >= intervalMs) return true;
  if (sid && trigger.sid && sid !== trigger.sid) return true;
  const threshold = config.collection?.quotaPollingTokenDelta ?? 2e4;
  const delta = currentTokens - trigger.tokensAtLastTrigger;
  return delta >= threshold;
}
function triggerQuotaFetchBackground(binDir) {
  const script = path2.join(binDir, "fetch-quota-bg.cjs");
  if (!fs2.existsSync(script)) return;
  try {
    const { spawn: spawn2 } = require("child_process");
    const child = spawn2("node", [script], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
  } catch {
  }
}

// src/maintenance.ts
var fs4 = __toESM(require("fs"), 1);
var path4 = __toESM(require("path"), 1);
var import_node_child_process2 = require("child_process");

// src/reporter.ts
var https2 = __toESM(require("https"), 1);
var http = __toESM(require("http"), 1);
var fs3 = __toESM(require("fs"), 1);
var path3 = __toESM(require("path"), 1);

// src/maintenance.ts
var DEFAULT_STATE = {
  lastRunAt: 0
};
function readState() {
  return readJson(getMaintenanceStatePath(), DEFAULT_STATE);
}
function shouldRunHourlyMaintenance(config) {
  const intervalMs = (config.collection?.hourlyMaintenanceIntervalMin ?? 60) * 6e4;
  const state = readState();
  return Date.now() - state.lastRunAt >= intervalMs;
}
function triggerHourlyMaintenanceBackground(binDir) {
  const script = path4.join(binDir, "hourly-maintenance-bg.cjs");
  if (!fs4.existsSync(script)) return;
  try {
    const child = (0, import_node_child_process2.spawn)("node", [script], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
  } catch {
  }
}

// src/utils/format.ts
var RESET = "\x1B[0m";
var BOLD = "\x1B[1m";
var DIM = "\x1B[2m";
var RED = "\x1B[31m";
var GREEN = "\x1B[32m";
var YELLOW = "\x1B[33m";
var MAGENTA = "\x1B[35m";
var CYAN = "\x1B[36m";
function fmtCost(n) {
  return `$${n.toFixed(2)}`;
}
function fmtPct(n) {
  return `${Math.round(n)}%`;
}
function fmtLines(added, removed) {
  return `+${added}/-${removed}`;
}
function normalizeQuotaUtilization(value) {
  if (typeof value !== "number") return null;
  return Math.round(value > 1 ? value : value * 100);
}
var MODEL_NAMES = {
  "claude-opus-4-6": "Opus",
  "claude-sonnet-4-6": "Sonnet",
  "claude-haiku-4-5-20251001": "Haiku"
};
function modelDisplayName(modelId) {
  if (MODEL_NAMES[modelId]) return MODEL_NAMES[modelId];
  const match = modelId.match(/claude-(\w+)-/);
  if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  return modelId;
}
var MODEL_COLORS = {
  "claude-opus-4-6": MAGENTA,
  "claude-sonnet-4-6": CYAN,
  "claude-haiku-4-5-20251001": GREEN
};
function modelColor(modelId) {
  if (MODEL_COLORS[modelId]) return MODEL_COLORS[modelId];
  if (modelId.includes("opus")) return MAGENTA;
  if (modelId.includes("sonnet")) return CYAN;
  if (modelId.includes("haiku")) return GREEN;
  return CYAN;
}
function contextColor(pct, warningPct = 75) {
  if (pct > warningPct) return RED;
  if (pct > 50) return YELLOW;
  return GREEN;
}
function cacheColor(hitRate) {
  if (hitRate > 50) return GREEN;
  if (hitRate > 30) return YELLOW;
  return DIM;
}
function cacheHitRate(cacheRead, inputTokens) {
  const total = cacheRead + inputTokens;
  if (total === 0) return 0;
  return Math.round(cacheRead / total * 100);
}
function colorize(text, color) {
  return `${color}${text}${RESET}`;
}
function bold(text) {
  return `${BOLD}${text}${RESET}`;
}

// src/collector.ts
function readConfig() {
  const configPath = getConfigPath();
  if (!fs5.existsSync(configPath)) return DEFAULT_CONFIG;
  try {
    const raw = fs5.readFileSync(configPath, "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}
function extractEntry(parsed) {
  const cu = parsed.context_window?.current_usage;
  return {
    t: Date.now(),
    sid: parsed.session_id?.slice(0, 12) || "unknown",
    model: (parsed.model?.id || "unknown").replace(/\[.*\]$/, ""),
    proj: path5.basename(parsed.workspace?.project_dir || parsed.cwd || "unknown"),
    in: cu?.input_tokens ?? 0,
    out: cu?.output_tokens ?? 0,
    cr: cu?.cache_read_input_tokens ?? 0,
    cc: cu?.cache_creation_input_tokens ?? 0,
    tin: parsed.context_window?.total_input_tokens ?? 0,
    tout: parsed.context_window?.total_output_tokens ?? 0,
    ctx: parsed.context_window?.used_percentage ?? 0,
    ctxMax: parsed.context_window?.context_window_size ?? 0,
    cost: parsed.cost?.total_cost_usd ?? 0,
    la: parsed.cost?.total_lines_added ?? 0,
    lr: parsed.cost?.total_lines_removed ?? 0
  };
}
function formatQuota(quota, config) {
  if (!quota || !quota.five_hour && !quota.seven_day) return "";
  const thresholdPct = (config.alerts?.quotaWarningThreshold ?? 0.8) * 100;
  const parts = [];
  if (quota.five_hour) {
    const pct = Math.round(normalizeQuotaUtilization(quota.five_hour.utilization));
    const color = pct > thresholdPct ? RED : pct > 60 ? YELLOW : GREEN;
    parts.push(`5h:${colorize(fmtPct(pct), color)}`);
  }
  if (quota.seven_day) {
    const pct = Math.round(normalizeQuotaUtilization(quota.seven_day.utilization));
    const color = pct > thresholdPct ? RED : pct > 60 ? YELLOW : GREEN;
    parts.push(`7d:${colorize(fmtPct(pct), color)}`);
  }
  return parts.join(" ");
}
function formatAlerts(entry, quota, config) {
  const alerts = [];
  const thresholdPct = (config.alerts?.quotaWarningThreshold ?? 0.8) * 100;
  if (quota?.five_hour && normalizeQuotaUtilization(quota.five_hour.utilization) > thresholdPct) {
    alerts.push(colorize("\u26A05h", RED));
  }
  if (quota?.seven_day && normalizeQuotaUtilization(quota.seven_day.utilization) > thresholdPct) {
    alerts.push(colorize("\u26A07d", RED));
  }
  if (config.alerts?.costDailyBudget && entry.cost > config.alerts.costDailyBudget) {
    alerts.push(colorize("\u26A0$", RED));
  }
  return alerts.length > 0 ? " " + alerts.join(" ") : "";
}
function formatStatusline(entry, config) {
  const format = config.display?.statuslineFormat || "full";
  if (format === "off") return "";
  const modelName = modelDisplayName(entry.model);
  const mColor = modelColor(entry.model);
  const cost = colorize(fmtCost(entry.cost), YELLOW);
  const ctxPct = entry.ctx;
  const ctxColor = contextColor(ctxPct, config.alerts?.contextWarningPct ?? 75);
  const ctx = colorize(fmtPct(ctxPct) + " ctx", ctxColor);
  const cache = cacheHitRate(entry.cr, entry.in);
  const cColor = cacheColor(cache);
  const lines = fmtLines(entry.la, entry.lr);
  const quota = readQuotaState();
  const quotaStr = formatQuota(quota, config);
  const alertStr = formatAlerts(entry, quota, config);
  switch (format) {
    case "minimal":
      return `${cost} ${ctx}${alertStr}`;
    case "compact":
      return `${colorize(modelName, mColor)} ${cost} ${colorize(fmtPct(ctxPct), ctxColor)}${alertStr}`;
    case "full":
    default: {
      const quotaPart = quotaStr ? ` | ${quotaStr}` : "";
      return `${colorize(bold(`[${modelName}]`), mColor)} ${cost} | ${ctx}${quotaPart} | ${lines} | cache:${colorize(fmtPct(cache), cColor)}${alertStr}`;
    }
  }
}
function main() {
  let stdinData;
  try {
    stdinData = fs5.readFileSync(0, "utf8");
  } catch {
    process.stdout.write("[?]");
    return;
  }
  if (!stdinData.trim()) {
    process.stdout.write("[?]");
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(stdinData);
  } catch {
    process.stdout.write("[?]");
    return;
  }
  if (!parsed.session_id || !parsed.model?.id) {
    process.stdout.write("[?]");
    return;
  }
  ensureStorageDirs();
  const entry = extractEntry(parsed);
  appendJsonl(getSessionFilePath(entry.sid), entry);
  const config = readConfig();
  const line = formatStatusline(entry, config);
  process.stdout.write(line);
  const totalTokens = entry.tin + entry.tout;
  if (shouldFetchQuota(config, totalTokens, entry.sid)) {
    markQuotaFetchTriggered(totalTokens, entry.sid);
    triggerQuotaFetchBackground(path5.dirname(process.argv[1] || __filename));
  }
  if (shouldRunHourlyMaintenance(config)) {
    triggerHourlyMaintenanceBackground(path5.dirname(process.argv[1] || __filename));
  }
}
try {
  main();
} catch {
  process.stdout.write("[!]");
}

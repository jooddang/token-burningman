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

// src/quota.ts
var fs2 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
var https = __toESM(require("https"), 1);
var import_node_child_process = require("child_process");

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
function getConfigPath() {
  return path.join(getStorageDir(), "config.json");
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

// src/quota.ts
var QUOTA_STATE_PATH = () => path2.join(getStorageDir(), "quota", "state.json");
var QUOTA_HISTORY_PATH = () => path2.join(getStorageDir(), "quota", "history.jsonl");
var QUOTA_LOCK_PATH = () => path2.join(getStorageDir(), "quota", "fetch.lock");
var DEFAULT_QUOTA_STATE = {
  lastFetchedAt: 0,
  five_hour: null,
  seven_day: null
};
function readQuotaState() {
  return readJson(QUOTA_STATE_PATH(), DEFAULT_QUOTA_STATE);
}
function getOAuthToken() {
  if (process.platform === "darwin") {
    try {
      const raw = (0, import_node_child_process.execFileSync)(
        "security",
        ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
        { encoding: "utf8", timeout: 3e3, stdio: ["pipe", "pipe", "ignore"] }
      ).trim();
      const parsed = JSON.parse(raw);
      if (parsed.claudeAiOauth?.accessToken) return parsed.claudeAiOauth.accessToken;
      if (parsed.accessToken) return parsed.accessToken;
      if (parsed.oauthAccessToken) return parsed.oauthAccessToken;
      if (typeof parsed === "string") return parsed;
    } catch {
    }
  }
  const credPath = path2.join(
    process.env.HOME || process.env.USERPROFILE || "",
    ".claude",
    ".credentials.json"
  );
  try {
    if (fs2.existsSync(credPath)) {
      const creds = JSON.parse(fs2.readFileSync(credPath, "utf8"));
      return creds.accessToken || creds.oauthAccessToken || null;
    }
  } catch {
  }
  return null;
}
function fetchQuota(token) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/api/oauth/usage",
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20"
        },
        rejectUnauthorized: true,
        timeout: 5e3
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }
          try {
            const data = JSON.parse(body);
            resolve({
              lastFetchedAt: Date.now(),
              five_hour: data.five_hour || null,
              seven_day: data.seven_day || null
            });
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}
async function fetchQuotaSafe(config) {
  const lockPath = QUOTA_LOCK_PATH();
  const fd = acquireLock(lockPath);
  if (fd === null) {
    return null;
  }
  try {
    const state = readQuotaState();
    const minMs = (config.collection?.quotaPollingMinSec ?? 30) * 1e3;
    if (Date.now() - state.lastFetchedAt < minMs) {
      return state;
    }
    const token = getOAuthToken();
    if (!token) {
      return null;
    }
    const quota = await fetchQuota(token);
    if (!quota) {
      return null;
    }
    writeJsonAtomic(QUOTA_STATE_PATH(), quota);
    appendJsonl(QUOTA_HISTORY_PATH(), {
      t: Date.now(),
      five_hour: quota.five_hour?.utilization ?? null,
      seven_day: quota.seven_day?.utilization ?? null
    });
    return quota;
  } finally {
    releaseLock(lockPath, fd);
  }
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

// src/fetch-quota-bg.ts
async function main() {
  ensureStorageDirs();
  const config = readJson(getConfigPath(), DEFAULT_CONFIG);
  await fetchQuotaSafe(config);
}
main().catch(() => {
}).finally(() => process.exit(0));

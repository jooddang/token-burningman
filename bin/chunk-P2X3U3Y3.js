#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// src/utils/storage.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
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

export {
  getStorageDir,
  getSessionsDir,
  getHourlyDir,
  getSessionFilePath,
  getHourlyFilePath,
  getConfigPath,
  getAggregationMetaPath,
  getMaintenanceStatePath,
  getMaintenanceLockPath,
  ensureDir,
  ensureStorageDirs,
  appendJsonl,
  readJsonl,
  readJson,
  writeJsonAtomic,
  listSessionFiles,
  sessionIdFromPath,
  acquireLock,
  releaseLock
};

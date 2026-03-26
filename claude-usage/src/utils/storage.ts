import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const DEFAULT_STORAGE_DIR = path.join(os.homedir(), ".token-burningman");

export function getStorageDir(): string {
  return process.env.CLAUDE_USAGE_DIR || DEFAULT_STORAGE_DIR;
}

export function getSessionsDir(): string {
  return path.join(getStorageDir(), "sessions");
}

export function getHourlyDir(): string {
  return path.join(getStorageDir(), "hourly");
}

export function getSessionFilePath(sessionId: string): string {
  return path.join(getSessionsDir(), `${sessionId}.jsonl`);
}

export function getHourlyFilePath(dateStr: string): string {
  return path.join(getHourlyDir(), `${dateStr}.json`);
}

export function getConfigPath(): string {
  return path.join(getStorageDir(), "config.json");
}

export function getAggregationMetaPath(): string {
  return path.join(getStorageDir(), ".aggregation-meta.json");
}

export function getMaintenanceStatePath(): string {
  return path.join(getStorageDir(), ".maintenance-state.json");
}

export function getMaintenanceLockPath(): string {
  return path.join(getStorageDir(), ".maintenance.lock");
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
}

export function ensureStorageDirs(): void {
  ensureDir(getSessionsDir());
  ensureDir(getHourlyDir());
  ensureDir(path.join(getStorageDir(), "quota"));
}

export function appendJsonl<T>(filePath: string, entry: T): void {
  ensureDir(path.dirname(filePath));
  const line = JSON.stringify(entry) + "\n";
  const fd = fs.openSync(filePath, "a", 0o600);
  try {
    fs.writeSync(fd, line);
  } finally {
    fs.closeSync(fd);
  }
}

export function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const results: T[] = [];
  for (const line of lines) {
    try {
      results.push(JSON.parse(line) as T);
    } catch {
      // skip corrupt lines
    }
  }
  return results;
}

export function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  const tmpPath = filePath + ".tmp";
  const fd = fs.openSync(tmpPath, "w", 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 2));
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
}

export function listSessionFiles(): string[] {
  const dir = getSessionsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(dir, f));
}

export function sessionIdFromPath(filePath: string): string {
  return path.basename(filePath, ".jsonl");
}

const DEFAULT_LOCK_STALE_MS = 15 * 60_000;

export function acquireLock(lockPath: string, staleMs = DEFAULT_LOCK_STALE_MS): number | null {
  ensureDir(path.dirname(lockPath));

  try {
    return fs.openSync(lockPath, "wx", 0o600);
  } catch {
    try {
      const stat = fs.statSync(lockPath);
      if (Date.now() - stat.mtimeMs > staleMs) {
        fs.unlinkSync(lockPath);
        return fs.openSync(lockPath, "wx", 0o600);
      }
    } catch {
      // Another process may have removed the lock or it may be unreadable.
    }
    return null;
  }
}

export function releaseLock(lockPath: string, fd: number | null): void {
  if (fd !== null) {
    try {
      fs.closeSync(fd);
    } catch {
      // Ignore close failures.
    }
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Ignore unlock failures.
  }
}

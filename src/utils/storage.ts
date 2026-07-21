import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as lockfile from "proper-lockfile";

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

export interface LockHandle {
  readonly compromised: boolean;
  release: () => void;
}

export function acquireLock(
  lockPath: string,
  staleMs = DEFAULT_LOCK_STALE_MS,
): LockHandle | null {
  ensureDir(path.dirname(lockPath));
  try {
    const legacy = fs.lstatSync(lockPath);
    if (legacy.isFile()) {
      if (Date.now() - legacy.mtimeMs <= staleMs) return null;
      try {
        // Versions through 0.2.2 used a regular file. Only the process that
        // successfully removes that exact stale artifact may continue; a
        // competing process that already created the new directory wins.
        fs.unlinkSync(lockPath);
      } catch {
        return null;
      }
    } else if (!legacy.isDirectory()) {
      return null;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null;
  }

  let compromised = false;
  try {
    const release = lockfile.lockSync(lockPath, {
      realpath: false,
      lockfilePath: lockPath,
      stale: staleMs,
      update: Math.min(staleMs / 3, 60_000),
      retries: 0,
      onCompromised: () => {
        compromised = true;
      },
    });
    return {
      get compromised(): boolean {
        return compromised;
      },
      release,
    };
  } catch {
    return null;
  }
}

export function refreshLock(_lockPath: string, handle: LockHandle | null): boolean {
  return handle !== null && !handle.compromised;
}

export function releaseLock(_lockPath: string, handle: LockHandle | null): void {
  if (handle !== null) {
    try {
      handle.release();
    } catch {
      // The lock may already have been released or marked compromised.
    }
  }
}

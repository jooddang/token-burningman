import * as fs from "node:fs";
import * as path from "node:path";
import * as https from "node:https";
import { execFileSync } from "node:child_process";
import type { QuotaState, Config } from "./types.js";
import { readJson, writeJsonAtomic, appendJsonl, getStorageDir, acquireLock, releaseLock } from "./utils/storage.js";

const QUOTA_STATE_PATH = () => path.join(getStorageDir(), "quota", "state.json");
const QUOTA_HISTORY_PATH = () => path.join(getStorageDir(), "quota", "history.jsonl");
const QUOTA_LOCK_PATH = () => path.join(getStorageDir(), "quota", "fetch.lock");

const DEFAULT_QUOTA_STATE: QuotaState = {
  lastFetchedAt: 0,
  five_hour: null,
  seven_day: null,
};

export function readQuotaState(): QuotaState {
  return readJson<QuotaState>(QUOTA_STATE_PATH(), DEFAULT_QUOTA_STATE);
}

export function shouldFetchQuota(config: Config): boolean {
  const state = readQuotaState();
  const intervalMs = (config.collection?.quotaPollingIntervalMin ?? 60) * 60_000;
  return Date.now() - state.lastFetchedAt >= intervalMs;
}

/**
 * Extract OAuth token from macOS Keychain or fallback credentials file.
 */
export function getOAuthToken(): string | null {
  // Try macOS Keychain first
  if (process.platform === "darwin") {
    try {
      const raw = execFileSync(
        "security",
        ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
        { encoding: "utf8", timeout: 3000, stdio: ["pipe", "pipe", "ignore"] },
      ).trim();
      const parsed = JSON.parse(raw);
      // Handle nested structures: {claudeAiOauth: {accessToken: "..."}}
      if (parsed.claudeAiOauth?.accessToken) return parsed.claudeAiOauth.accessToken;
      if (parsed.accessToken) return parsed.accessToken;
      if (parsed.oauthAccessToken) return parsed.oauthAccessToken;
      if (typeof parsed === "string") return parsed;
    } catch {
      // Keychain not available or entry not found
    }
  }

  // Fallback: ~/.claude/.credentials.json
  const credPath = path.join(
    process.env.HOME || process.env.USERPROFILE || "",
    ".claude",
    ".credentials.json",
  );
  try {
    if (fs.existsSync(credPath)) {
      const creds = JSON.parse(fs.readFileSync(credPath, "utf8"));
      return creds.accessToken || creds.oauthAccessToken || null;
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Fetch quota from the OAuth usage API.
 * Returns null on any failure (no token, network error, rate limited).
 */
export function fetchQuota(token: string): Promise<QuotaState | null> {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/api/oauth/usage",
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": "oauth-2025-04-20",
        },
        rejectUnauthorized: true,
        timeout: 5000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
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
              seven_day: data.seven_day || null,
            });
          } catch {
            resolve(null);
          }
        });
      },
    );

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/**
 * Fetch quota with file-lock coordination to prevent multiple sessions
 * from hammering the API simultaneously.
 */
export async function fetchQuotaSafe(config: Config): Promise<QuotaState | null> {
  const lockPath = QUOTA_LOCK_PATH();
  const fd = acquireLock(lockPath);
  if (fd === null) {
    return null;
  }

  try {
    const state = readQuotaState();
    const intervalMs = (config.collection?.quotaPollingIntervalMin ?? 60) * 60_000;
    if (Date.now() - state.lastFetchedAt < intervalMs) {
      return state; // Another session just fetched
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
      seven_day: quota.seven_day?.utilization ?? null,
    });

    return quota;
  } finally {
    releaseLock(lockPath, fd);
  }
}

/**
 * Spawn a detached quota fetch process so it doesn't block the collector.
 * The fetch-quota-bg.cjs script handles the actual fetch.
 */
export function triggerQuotaFetchBackground(binDir: string): void {
  const script = path.join(binDir, "fetch-quota-bg.cjs");
  if (!fs.existsSync(script)) return;

  try {
    const { spawn } = require("node:child_process") as typeof import("node:child_process");
    const child = spawn("node", [script], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // Silently fail — quota is best-effort
  }
}

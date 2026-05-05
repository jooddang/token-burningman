import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Config, QuotaState, SessionEntry } from "../types.js";
import { aggregateAllPending } from "../aggregator.js";
import { submitPublicReport } from "../reporter.js";
import {
  appendJsonl,
  ensureStorageDirs,
  getConfigPath,
  getSessionFilePath,
  getStorageDir,
  readJson,
  writeJsonAtomic,
} from "../utils/storage.js";
import { DEFAULT_CONFIG } from "../types.js";

interface CodexImportMeta {
  files: Record<string, number>;
}

interface ImportCodexUsageOptions {
  codexHome?: string;
  report?: boolean;
}

export interface ImportCodexUsageResult {
  codexHome: string;
  filesScanned: number;
  filesChanged: number;
  entriesImported: number;
  sessionsImported: number;
  aggregated: {
    processed: number;
    skipped: number;
  };
  reported: boolean;
}

interface CodexSessionContext {
  sessionId: string;
  project: string;
  model: string;
  lastTotalTokens: number | null;
  latestQuota: QuotaState | null;
  appended: number;
}

interface TokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

const IMPORT_META_PATH = () => path.join(getStorageDir(), ".codex-import-meta.json");

function getDefaultCodexHome(): string {
  return process.env.BURNINGMAN_CODEX_HOME || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function listCodexSessionFiles(codexHome: string): string[] {
  const roots = [
    path.join(codexHome, "sessions"),
    path.join(codexHome, "archived_sessions"),
  ];
  const files: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const child = path.join(dir, name);
      const stat = fs.statSync(child);
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

function readLines(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split("\n").filter((line) => line.trim().length > 0);
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseTimestamp(value: unknown): number {
  if (typeof value !== "string") return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function projectName(cwd: unknown): string {
  return typeof cwd === "string" && cwd.length > 0 ? path.basename(cwd) : "unknown";
}

function sessionIdFromRecord(record: unknown, fallback: string): string {
  if (
    record &&
    typeof record === "object" &&
    "payload" in record &&
    record.payload &&
    typeof record.payload === "object" &&
    "id" in record.payload &&
    typeof record.payload.id === "string"
  ) {
    return `codex-${record.payload.id.slice(0, 12)}`;
  }
  return fallback;
}

function updateContextFromRecord(record: any, context: CodexSessionContext): void {
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

function quotaFromRecord(record: any, timestamp: number): QuotaState | null {
  const limits = record?.payload?.rate_limits;
  if (!limits) return null;

  const primary = limits.primary;
  const secondary = limits.secondary;
  return {
    lastFetchedAt: timestamp,
    five_hour: primary
      ? {
          utilization: asNumber(primary.used_percent),
          resets_at: primary.resets_at ? new Date(asNumber(primary.resets_at) * 1000).toISOString() : "",
        }
      : null,
    seven_day: secondary
      ? {
          utilization: asNumber(secondary.used_percent),
          resets_at: secondary.resets_at ? new Date(asNumber(secondary.resets_at) * 1000).toISOString() : "",
        }
      : null,
  };
}

function entryFromTokenRecord(record: any, context: CodexSessionContext): SessionEntry | null {
  if (record?.type !== "event_msg" || record?.payload?.type !== "token_count") return null;
  const info = record.payload.info;
  if (!info?.total_token_usage) {
    return null;
  }

  const total = info.total_token_usage as TokenUsage;
  const last = (info.last_token_usage || {}) as TokenUsage;
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
  const ctx = contextWindow > 0 ? Math.min(100, Math.round((totalTokens / contextWindow) * 100)) : 0;

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
    lr: 0,
  };
}

function importSessionFile(filePath: string, startLine: number): { imported: number; sessionId: string | null; lineCount: number; quota: QuotaState | null } {
  const lines = readLines(filePath);
  const safeStartLine = startLine > lines.length ? 0 : Math.max(0, startLine);
  const fallbackId = `codex-${path.basename(filePath, ".jsonl").slice(-12)}`;
  const context: CodexSessionContext = {
    sessionId: fallbackId,
    project: "unknown",
    model: "codex",
    lastTotalTokens: null,
    latestQuota: null,
    appended: 0,
  };

  for (let index = 0; index < lines.length; index++) {
    let record: any;
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
    quota: context.latestQuota,
  };
}

function writeQuotaState(quota: QuotaState | null): void {
  if (!quota) return;
  writeJsonAtomic(path.join(getStorageDir(), "quota", "state.json"), quota);
}

export async function importCodexUsage(options: ImportCodexUsageOptions = {}): Promise<ImportCodexUsageResult> {
  ensureStorageDirs();

  const codexHome = options.codexHome || getDefaultCodexHome();
  const meta = readJson<CodexImportMeta>(IMPORT_META_PATH(), { files: {} });
  const files = listCodexSessionFiles(codexHome);
  const importedSessions = new Set<string>();
  let filesChanged = 0;
  let entriesImported = 0;
  let latestQuota: QuotaState | null = null;

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
    const config = readJson<Config>(getConfigPath(), DEFAULT_CONFIG);
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
    reported,
  };
}

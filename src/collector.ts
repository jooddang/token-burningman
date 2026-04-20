import * as fs from "node:fs";
import * as path from "node:path";
import type { StatuslineInput, SessionEntry, Config } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { appendJsonl, getSessionFilePath, getConfigPath, ensureStorageDirs } from "./utils/storage.js";
import type { QuotaState } from "./types.js";
import { shouldFetchQuota, triggerQuotaFetchBackground, readQuotaState, markQuotaFetchTriggered } from "./quota.js";
import { shouldRunHourlyMaintenance, triggerHourlyMaintenanceBackground } from "./maintenance.js";
import {
  fmtCost,
  fmtPct,
  fmtLines,
  modelDisplayName,
  modelColor,
  contextColor,
  cacheColor,
  cacheHitRate,
  colorize,
  bold,
  normalizeQuotaUtilization,
  YELLOW,
  RED,
  GREEN,
} from "./utils/format.js";

function readConfig(): Config {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return DEFAULT_CONFIG;
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function extractEntry(parsed: StatuslineInput): SessionEntry {
  const cu = parsed.context_window?.current_usage;
  return {
    t: Date.now(),
    sid: parsed.session_id?.slice(0, 12) || "unknown",
    model: (parsed.model?.id || "unknown").replace(/\[.*\]$/, ""),
    proj: path.basename(parsed.workspace?.project_dir || parsed.cwd || "unknown"),
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
    lr: parsed.cost?.total_lines_removed ?? 0,
  };
}


function formatQuota(quota: QuotaState | null, config: Config): string {
  if (!quota || (!quota.five_hour && !quota.seven_day)) return "";
  const thresholdPct = (config.alerts?.quotaWarningThreshold ?? 0.8) * 100;
  const parts: string[] = [];

  if (quota.five_hour) {
    const pct = Math.round(normalizeQuotaUtilization(quota.five_hour.utilization)!);
    const color = pct > thresholdPct ? RED : pct > 60 ? YELLOW : GREEN;
    parts.push(`5h:${colorize(fmtPct(pct), color)}`);
  }
  if (quota.seven_day) {
    const pct = Math.round(normalizeQuotaUtilization(quota.seven_day.utilization)!);
    const color = pct > thresholdPct ? RED : pct > 60 ? YELLOW : GREEN;
    parts.push(`7d:${colorize(fmtPct(pct), color)}`);
  }

  return parts.join(" ");
}

function formatAlerts(entry: SessionEntry, quota: QuotaState | null, config: Config): string {
  const alerts: string[] = [];
  const thresholdPct = (config.alerts?.quotaWarningThreshold ?? 0.8) * 100;

  if (quota?.five_hour && normalizeQuotaUtilization(quota.five_hour.utilization)! > thresholdPct) {
    alerts.push(colorize("⚠5h", RED));
  }
  if (quota?.seven_day && normalizeQuotaUtilization(quota.seven_day.utilization)! > thresholdPct) {
    alerts.push(colorize("⚠7d", RED));
  }
  if (config.alerts?.costDailyBudget && entry.cost > config.alerts.costDailyBudget) {
    alerts.push(colorize("⚠$", RED));
  }

  return alerts.length > 0 ? " " + alerts.join(" ") : "";
}

function formatStatusline(entry: SessionEntry, config: Config): string {
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

function main(): void {
  let stdinData: string;
  try {
    stdinData = fs.readFileSync(0, "utf8");
  } catch {
    process.stdout.write("[?]");
    return;
  }

  if (!stdinData.trim()) {
    process.stdout.write("[?]");
    return;
  }

  let parsed: StatuslineInput;
  try {
    parsed = JSON.parse(stdinData);
  } catch {
    process.stdout.write("[?]");
    return;
  }

  // Validate: must have session_id and model (hook_event_name may not exist)
  if (!parsed.session_id || !parsed.model?.id) {
    process.stdout.write("[?]");
    return;
  }

  // Ensure storage dirs exist
  ensureStorageDirs();

  // Extract and persist entry
  const entry = extractEntry(parsed);
  appendJsonl(getSessionFilePath(entry.sid), entry);

  // Load config and format output
  const config = readConfig();
  const line = formatStatusline(entry, config);
  process.stdout.write(line);

  // Maybe trigger background quota fetch (non-blocking)
  const totalTokens = entry.tin + entry.tout;
  if (shouldFetchQuota(config, totalTokens, entry.sid)) {
    markQuotaFetchTriggered(totalTokens, entry.sid);
    triggerQuotaFetchBackground(path.dirname(process.argv[1] || __filename));
  }

  // Opportunistic hourly maintenance driven by active statusline heartbeats.
  if (shouldRunHourlyMaintenance(config)) {
    triggerHourlyMaintenanceBackground(path.dirname(process.argv[1] || __filename));
  }
}

try {
  main();
} catch {
  process.stdout.write("[!]");
}

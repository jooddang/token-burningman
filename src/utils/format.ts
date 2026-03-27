// ANSI color codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";

export function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

export function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
}

export function fmtLines(added: number, removed: number): string {
  return `+${added}/-${removed}`;
}

/**
 * Normalize utilization: API may return 0-100 (percentage) or 0-1 (fraction).
 * Returns null for non-numeric input.
 */
export function normalizeQuotaUtilization(value: number | null | undefined): number | null {
  if (typeof value !== "number") return null;
  return Math.round(value > 1 ? value : value * 100);
}

const MODEL_NAMES: Record<string, string> = {
  "claude-opus-4-6": "Opus",
  "claude-sonnet-4-6": "Sonnet",
  "claude-haiku-4-5-20251001": "Haiku",
};

export function modelDisplayName(modelId: string): string {
  if (MODEL_NAMES[modelId]) return MODEL_NAMES[modelId];
  // Fallback: extract name from model id pattern claude-{name}-{version}
  const match = modelId.match(/claude-(\w+)-/);
  if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  return modelId;
}

const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-6": MAGENTA,
  "claude-sonnet-4-6": CYAN,
  "claude-haiku-4-5-20251001": GREEN,
};

export function modelColor(modelId: string): string {
  if (MODEL_COLORS[modelId]) return MODEL_COLORS[modelId];
  if (modelId.includes("opus")) return MAGENTA;
  if (modelId.includes("sonnet")) return CYAN;
  if (modelId.includes("haiku")) return GREEN;
  return CYAN;
}

export function contextColor(pct: number, warningPct: number = 75): string {
  if (pct > warningPct) return RED;
  if (pct > 50) return YELLOW;
  return GREEN;
}

export function cacheColor(hitRate: number): string {
  if (hitRate > 50) return GREEN;
  if (hitRate > 30) return YELLOW;
  return DIM;
}

export function cacheHitRate(cacheRead: number, inputTokens: number): number {
  const total = cacheRead + inputTokens;
  if (total === 0) return 0;
  return Math.round((cacheRead / total) * 100);
}

export function colorize(text: string, color: string): string {
  return `${color}${text}${RESET}`;
}

export function bold(text: string): string {
  return `${BOLD}${text}${RESET}`;
}

export { RESET, BOLD, DIM, RED, GREEN, YELLOW, MAGENTA, CYAN };

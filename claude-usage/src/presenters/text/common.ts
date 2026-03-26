import { fmtCost, fmtDuration, fmtLines, fmtPct, fmtTokens } from "../../utils/format.js";
import type { SessionSummary } from "../../dashboard/types.js";

export function renderSessionTable(sessions: SessionSummary[], maxRows: number = 10): string {
  if (sessions.length === 0) {
    return "_No sessions yet_";
  }

  const header = "| Model | Project | Duration | Tokens | Cost | Peak Ctx | Lines |";
  const separator = "|---|---|---:|---:|---:|---:|---:|";
  const rows = sessions.slice(0, maxRows).map((session) => {
    const duration = fmtDuration(session.endTime - session.startTime);
    return `| ${session.modelLabel} | ${session.proj} | ${duration} | ${fmtTokens(session.totalTokens)} | ${fmtCost(session.cost)} | ${fmtPct(session.peakCtx)} | ${fmtLines(session.linesAdded, session.linesRemoved)} |`;
  });

  return [header, separator, ...rows].join("\n");
}

export function renderBar(label: string, value: number, max: number, width: number = 24): string {
  const scaled = max > 0 ? Math.round((value / max) * width) : 0;
  return `${label.padEnd(12)} ${"█".repeat(scaled)}${"░".repeat(Math.max(0, width - scaled))} ${value.toLocaleString()}`;
}

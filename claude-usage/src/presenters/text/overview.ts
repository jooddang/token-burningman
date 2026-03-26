import type { OverviewViewModel } from "../../dashboard/types.js";
import { fmtCost, fmtLines, fmtPct, fmtTokens } from "../../utils/format.js";
import { renderBar, renderSessionTable } from "./common.js";

export function renderOverviewMarkdown(model: OverviewViewModel): string {
  const lines: string[] = [];
  lines.push("# Token Burningman Overview");
  lines.push("");
  lines.push(`Generated: ${new Date(model.generatedAt).toLocaleString()}`);
  lines.push("");
  lines.push("## Today");
  lines.push(`- Tokens: ${fmtTokens(model.totals.totalTokens)}`);
  lines.push(`- Cost: ${fmtCost(model.totals.totalCost)}`);
  lines.push(`- Sessions: ${model.totals.sessionCount} (${model.totals.activeSessionCount} active)`);
  lines.push(`- Cache hit rate: ${fmtPct(model.totals.cacheHitRate)}`);
  lines.push(`- Lines: ${fmtLines(model.totals.linesAdded, model.totals.linesRemoved)}`);
  lines.push("");

  if (model.hourly.length > 0) {
    const max = Math.max(...model.hourly.map((row) => row.totalTokens), 1);
    lines.push("## Hourly Usage");
    lines.push("```text");
    for (const row of model.hourly) {
      lines.push(renderBar(`${row.hour}:00`, row.totalTokens, max));
    }
    lines.push("```");
    lines.push("");
  }

  if (model.quota) {
    lines.push("## Quota");
    if (model.quota.fiveHourPct !== null) {
      lines.push(`- 5-hour: ${fmtPct(model.quota.fiveHourPct)} (resets ${model.quota.fiveHourResetsAt || "unknown"})`);
    }
    if (model.quota.sevenDayPct !== null) {
      lines.push(`- 7-day: ${fmtPct(model.quota.sevenDayPct)} (resets ${model.quota.sevenDayResetsAt || "unknown"})`);
    }
    lines.push("");
  }

  lines.push("## Active Sessions");
  lines.push(renderSessionTable(model.activeSessions, 10));
  return lines.join("\n");
}

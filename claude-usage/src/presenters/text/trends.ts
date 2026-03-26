import type { TrendsViewModel } from "../../dashboard/types.js";
import { fmtCost, fmtPct, fmtTokens } from "../../utils/format.js";

export function renderTrendsMarkdown(model: TrendsViewModel): string {
  const lines: string[] = [];
  lines.push(`# Trends (${model.rangeDays}d)`);
  lines.push("");

  if (model.daily.length === 0) {
    lines.push("_No trend data yet_");
    return lines.join("\n");
  }

  lines.push("## Daily Breakdown");
  lines.push("| Date | Tokens | Cost | Cache | Velocity | Sessions |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const day of model.daily.slice(-14)) {
    lines.push(
      `| ${day.date} | ${fmtTokens(day.totalTokens)} | ${fmtCost(day.cost)} | ${fmtPct(day.cacheRate)} | ${day.velocity} t/l | ${day.sessionCount} |`,
    );
  }

  lines.push("");
  lines.push("## Productivity");
  lines.push(`- Current: ${model.productivity.currentVelocity.toLocaleString()} tokens/line`);
  lines.push(`- 7d avg: ${model.productivity.velocity7.toLocaleString()} tokens/line`);
  lines.push(`- 30d avg: ${model.productivity.velocity30.toLocaleString()} tokens/line`);
  if (model.productivity.trendLabel) {
    lines.push(`- Trend: ${model.productivity.trendLabel}`);
  }

  return lines.join("\n");
}

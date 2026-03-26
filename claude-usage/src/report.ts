import { getProjectStats, getDailyStats, getCodeVelocity } from "./analytics.js";
import { readQuotaState } from "./quota.js";
import { fmtTokens, fmtCost, fmtPct } from "./utils/format.js";

export function generateReport(rangeDays: number = 7): string {
  const daily = getDailyStats(rangeDays);
  const projects = getProjectStats(rangeDays);
  const quota = readQuotaState();

  const totalTokens = daily.reduce((s, d) => s + d.totalTokens, 0);
  const totalCost = daily.reduce((s, d) => s + d.cost, 0);
  const totalSessions = daily.reduce((s, d) => s + d.sessionCount, 0);
  const totalLines = daily.reduce((s, d) => s + d.linesChanged, 0);

  const avgCacheRate = daily.length > 0
    ? Math.round(daily.reduce((s, d) => s + d.cacheRate, 0) / daily.length)
    : 0;

  const velocity = getCodeVelocity(totalTokens, totalLines);

  const lines: string[] = [];

  lines.push(`# Claude Usage Report (${rangeDays}d)`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push(`- **Tokens**: ${fmtTokens(totalTokens)}`);
  lines.push(`- **Cost**: ${fmtCost(totalCost)}`);
  lines.push(`- **Sessions**: ${totalSessions}`);
  lines.push(`- **Lines Changed**: +${totalLines}`);
  lines.push(`- **Avg Cache Hit Rate**: ${fmtPct(avgCacheRate)}`);
  lines.push(`- **Code Velocity**: ${velocity.toLocaleString()} tokens/line`);
  lines.push("");

  // Top projects
  if (projects.length > 0) {
    lines.push("## Top Projects by Cost");
    for (const p of projects.slice(0, 5)) {
      const mix = Object.entries(p.modelMix)
        .map(([m, pct]) => `${m} ${pct}%`)
        .join(", ");
      lines.push(
        `- **${p.project}**: ${fmtCost(p.cost)} | ${fmtTokens(p.totalTokens)} | ${p.sessionCount} sessions | cache ${fmtPct(p.cacheHitRate)} | ${mix}`,
      );
    }
    lines.push("");
  }

  // Daily breakdown
  if (daily.length > 0) {
    lines.push("## Daily Breakdown");
    lines.push("| Date | Tokens | Cost | Cache% | Velocity |");
    lines.push("|------|--------|------|--------|----------|");
    for (const d of daily.slice(-7)) {
      lines.push(
        `| ${d.date} | ${fmtTokens(d.totalTokens)} | ${fmtCost(d.cost)} | ${fmtPct(d.cacheRate)} | ${d.velocity} t/l |`,
      );
    }
    lines.push("");
  }

  // Quota
  if (quota.five_hour || quota.seven_day) {
    lines.push("## Quota Status");
    if (quota.five_hour) {
      lines.push(
        `- **5-hour**: ${fmtPct(quota.five_hour.utilization * 100)} (resets ${new Date(quota.five_hour.resets_at).toLocaleString()})`,
      );
    }
    if (quota.seven_day) {
      lines.push(
        `- **7-day**: ${fmtPct(quota.seven_day.utilization * 100)} (resets ${new Date(quota.seven_day.resets_at).toLocaleString()})`,
      );
    }
  }

  return lines.join("\n");
}

import type { ProjectsViewModel } from "../../dashboard/types.js";
import { fmtCost, fmtLines, fmtPct, fmtTokens } from "../../utils/format.js";

export function renderProjectsMarkdown(model: ProjectsViewModel): string {
  const lines: string[] = [];
  lines.push(`# Projects (${model.rangeDays}d)`);
  lines.push("");

  if (model.projects.length === 0) {
    lines.push("_No project data yet_");
    return lines.join("\n");
  }

  lines.push("| Project | Tokens | Cost | Sessions | Cache | Lines |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const project of model.projects.slice(0, 10)) {
    lines.push(
      `| ${project.project} | ${fmtTokens(project.totalTokens)} | ${fmtCost(project.cost)} | ${project.sessionCount} | ${fmtPct(project.cacheHitRate)} | ${fmtLines(project.linesAdded, project.linesRemoved)} |`,
    );
  }

  lines.push("");
  lines.push("## Model Mix");
  for (const project of model.projects.slice(0, 5)) {
    const mix = Object.entries(project.modelMix)
      .map(([name, pct]) => `${name} ${pct}%`)
      .join(", ");
    lines.push(`- ${project.project}: ${mix}`);
  }

  return lines.join("\n");
}

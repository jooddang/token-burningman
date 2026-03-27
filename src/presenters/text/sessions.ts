import type { SessionsViewModel } from "../../dashboard/types.js";
import { renderBar, renderSessionTable } from "./common.js";

export function renderSessionsMarkdown(model: SessionsViewModel): string {
  const lines: string[] = [];
  lines.push(`# Session History (${model.range})`);
  lines.push("");
  lines.push(renderSessionTable(model.sessions, 15));
  lines.push("");
  lines.push("## Duration Distribution");
  lines.push("```text");
  const max = Math.max(...model.durationBuckets.map((bucket) => bucket.count), 1);
  for (const bucket of model.durationBuckets) {
    lines.push(renderBar(bucket.label, bucket.count, max, 20));
  }
  lines.push("```");
  if (model.sweetSpot) {
    lines.push("");
    lines.push(`Sweet spot: ${model.sweetSpot}`);
  }
  return lines.join("\n");
}

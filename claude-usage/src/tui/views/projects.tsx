import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Table } from "../components/table.js";
import { BarChart } from "../components/bar-chart.js";
import { useConfig } from "../hooks/use-config.js";
import { getProjectStats } from "../../analytics.js";
import { fmtTokens, fmtCost, fmtPct, fmtLines } from "../../utils/format.js";
import type { ProjectStat } from "../../types.js";

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

export function ProjectsView() {
  const config = useConfig();
  const [rangeIdx, setRangeIdx] = useState(0);
  const [projects, setProjects] = useState<ProjectStat[]>([]);

  useInput((input) => {
    if (input === "[" && rangeIdx > 0) setRangeIdx(rangeIdx - 1);
    if (input === "]" && rangeIdx < RANGES.length - 1) setRangeIdx(rangeIdx + 1);
  });

  useEffect(() => {
    const load = () => setProjects(getProjectStats(RANGES[rangeIdx].days));
    load();
    const interval = setInterval(load, config.tui.refreshIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [rangeIdx, config.tui.refreshIntervalSec]);

  const rows = projects.map((p) => ({
    project: p.project,
    tokens: fmtTokens(p.totalTokens),
    cost: fmtCost(p.cost),
    sessions: String(p.sessionCount),
    cache: fmtPct(p.cacheHitRate),
    lines: fmtLines(p.linesAdded, p.linesRemoved),
  }));

  // Bar chart data
  const barData = projects.slice(0, 8).map((p) => ({
    label: p.project.slice(0, 18),
    value: p.cost,
    color: "yellow" as string,
  }));

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header + range selector */}
      <Box marginBottom={1}>
        <Text bold> PROJECTS </Text>
        <Text dimColor>(</Text>
        {RANGES.map((r, i) => (
          <React.Fragment key={r.label}>
            {i > 0 && <Text dimColor> | </Text>}
            {i === rangeIdx ? (
              <Text bold color="cyan">[{r.label}]</Text>
            ) : (
              <Text dimColor>{r.label}</Text>
            )}
          </React.Fragment>
        ))}
        <Text dimColor>)  sorted by: cost desc  Use [ ] to change</Text>
      </Box>

      {/* Project table */}
      <Box flexDirection="column" marginBottom={1} marginLeft={1}>
        <Table
          columns={[
            { key: "project", label: "PROJECT", width: 22 },
            { key: "tokens", label: "TOKENS", width: 10, align: "right" },
            { key: "cost", label: "COST", width: 10, align: "right" },
            { key: "sessions", label: "SESSIONS", width: 10, align: "right" },
            { key: "cache", label: "CACHE%", width: 8, align: "right" },
            { key: "lines", label: "LINES", width: 14, align: "right" },
          ]}
          data={rows}
          maxRows={10}
        />
      </Box>

      {/* Cost bar chart */}
      {barData.length > 0 && (
        <Box flexDirection="column" marginLeft={1} marginBottom={1}>
          <Text bold>COST BY PROJECT</Text>
          <Box marginLeft={1}>
            <BarChart data={barData} maxWidth={35} showValues />
          </Box>
        </Box>
      )}

      {/* Model mix */}
      {projects.length > 0 && (
        <Box flexDirection="column" marginLeft={1}>
          <Text bold>MODEL MIX BY PROJECT</Text>
          {projects.slice(0, 5).map((p) => (
            <Box key={p.project} marginLeft={1}>
              <Text dimColor>{p.project.padEnd(20)}</Text>
              {Object.entries(p.modelMix).map(([model, pct]) => (
                <Text
                  key={model}
                  color={
                    model === "Opus"
                      ? "magenta"
                      : model === "Sonnet"
                        ? "cyan"
                        : "green"
                  }
                >
                  {model} {pct}%{"  "}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

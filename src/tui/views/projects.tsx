import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Table } from "../components/table.js";
import { BarChart } from "../components/bar-chart.js";
import { useConfig } from "../hooks/use-config.js";
import { fmtTokens, fmtCost, fmtPct, fmtLines } from "../../utils/format.js";
import { getProjectsModel } from "../../dashboard/service.js";
import type { ProjectsViewModel } from "../../dashboard/types.js";

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

export function ProjectsView() {
  const config = useConfig();
  const [rangeIdx, setRangeIdx] = useState(0);
  const [model, setModel] = useState<ProjectsViewModel | null>(null);

  useInput((input) => {
    if (input === "[" && rangeIdx > 0) setRangeIdx(rangeIdx - 1);
    if (input === "]" && rangeIdx < RANGES.length - 1) setRangeIdx(rangeIdx + 1);
  });

  useEffect(() => {
    const load = () => setModel(getProjectsModel(RANGES[rangeIdx].days));
    load();
    const interval = setInterval(load, config.tui.refreshIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [rangeIdx, config.tui.refreshIntervalSec]);

  const projects = model?.projects ?? [];
  const rows = projects.map((project) => ({
    project: project.project,
    tokens: fmtTokens(project.totalTokens),
    cost: fmtCost(project.cost),
    sessions: String(project.sessionCount),
    cache: fmtPct(project.cacheHitRate),
    lines: fmtLines(project.linesAdded, project.linesRemoved),
  }));

  const barData = projects.slice(0, 8).map((project) => ({
    label: project.project.slice(0, 18),
    value: project.cost,
    color: "yellow" as string,
  }));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold> PROJECTS </Text>
        <Text dimColor>(</Text>
        {RANGES.map((range, index) => (
          <React.Fragment key={range.label}>
            {index > 0 && <Text dimColor> | </Text>}
            {index === rangeIdx ? (
              <Text bold color="cyan">[{range.label}]</Text>
            ) : (
              <Text dimColor>{range.label}</Text>
            )}
          </React.Fragment>
        ))}
        <Text dimColor>)  sorted by: cost desc  Use [ ] to change</Text>
      </Box>

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

      {barData.length > 0 && (
        <Box flexDirection="column" marginLeft={1} marginBottom={1}>
          <Text bold>COST BY PROJECT</Text>
          <Box marginLeft={1}>
            <BarChart data={barData} maxWidth={35} showValues />
          </Box>
        </Box>
      )}

      {projects.length > 0 && (
        <Box flexDirection="column" marginLeft={1}>
          <Text bold>MODEL MIX BY PROJECT</Text>
          {projects.slice(0, 5).map((project) => (
            <Box key={project.project} marginLeft={1}>
              <Text dimColor>{project.project.padEnd(20)}</Text>
              {Object.entries(project.modelMix).map(([name, pct]) => (
                <Text
                  key={name}
                  color={name === "Opus" ? "magenta" : name === "Sonnet" ? "cyan" : "green"}
                >
                  {name} {pct}%{"  "}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Table } from "../components/table.js";
import { BarChart } from "../components/bar-chart.js";
import { useSessionData } from "../hooks/use-session-data.js";
import { useConfig } from "../hooks/use-config.js";
import { fmtTokens, fmtCost, fmtDuration, fmtPct } from "../../utils/format.js";

const RANGES = ["24h", "48h", "7d"] as const;
type Range = (typeof RANGES)[number];

function rangeMs(range: Range): number {
  switch (range) {
    case "24h": return 24 * 60 * 60 * 1000;
    case "48h": return 48 * 60 * 60 * 1000;
    case "7d": return 7 * 24 * 60 * 60 * 1000;
  }
}

export function SessionsView() {
  const config = useConfig();
  const { sessions, isLoading } = useSessionData(config.tui.refreshIntervalSec);
  const [range, setRange] = useState<Range>("24h");

  useInput((input) => {
    const idx = RANGES.indexOf(range);
    if (input === "[" && idx > 0) setRange(RANGES[idx - 1]);
    if (input === "]" && idx < RANGES.length - 1) setRange(RANGES[idx + 1]);
  });

  if (isLoading) {
    return <Text>Loading...</Text>;
  }

  const now = Date.now();
  const cutoff = now - rangeMs(range);
  const filtered = sessions.filter((s) => s.endTime >= cutoff);

  // Session log table
  const rows = filtered.map((s) => {
    const start = new Date(s.startTime);
    const timeStr = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
    const dur = s.endTime - s.startTime;
    const modelShort = s.model.includes("opus")
      ? "Opus"
      : s.model.includes("sonnet")
        ? "Sonnet"
        : s.model.includes("haiku")
          ? "Haiku"
          : s.model;

    return {
      time: s.isActive ? `${timeStr}-now` : timeStr,
      model: modelShort,
      project: s.proj,
      dur: fmtDuration(dur),
      tokens: fmtTokens(s.totalInput + s.totalOutput),
      cost: fmtCost(s.cost),
      ctx: `${fmtPct(s.peakCtx)}${s.peakCtx > 75 ? " !" : ""}`,
    };
  });

  // Session length distribution
  const durationBuckets = [
    { label: "0-15m", min: 0, max: 15, count: 0 },
    { label: "15-30m", min: 15, max: 30, count: 0 },
    { label: "30-60m", min: 30, max: 60, count: 0 },
    { label: "60-90m", min: 60, max: 90, count: 0 },
    { label: "90m+", min: 90, max: Infinity, count: 0 },
  ];

  for (const s of filtered) {
    const durMin = (s.endTime - s.startTime) / 60_000;
    for (const bucket of durationBuckets) {
      if (durMin >= bucket.min && durMin < bucket.max) {
        bucket.count++;
        break;
      }
    }
  }

  const total = filtered.length || 1;
  const distData = durationBuckets.map((b) => ({
    label: b.label,
    value: b.count,
    color: "cyan" as string,
  }));

  // Find sweet spot
  let sweetSpot = "";
  let maxCount = 0;
  for (const b of durationBuckets) {
    if (b.count > maxCount) {
      maxCount = b.count;
      sweetSpot = b.label;
    }
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Range selector */}
      <Box marginBottom={1}>
        <Text bold> SESSION HISTORY </Text>
        <Text dimColor>(</Text>
        {RANGES.map((r, i) => (
          <React.Fragment key={r}>
            {i > 0 && <Text dimColor> | </Text>}
            {r === range ? (
              <Text bold color="cyan">[{r}]</Text>
            ) : (
              <Text dimColor>{r}</Text>
            )}
          </React.Fragment>
        ))}
        <Text dimColor>)  Use [ ] to change range</Text>
      </Box>

      {/* Session log */}
      <Box flexDirection="column" marginBottom={1} marginLeft={1}>
        <Table
          columns={[
            { key: "time", label: "TIME", width: 10 },
            { key: "model", label: "MODEL", width: 8 },
            { key: "project", label: "PROJECT", width: 20 },
            { key: "dur", label: "DUR", width: 8, align: "right" },
            { key: "tokens", label: "TOKENS", width: 8, align: "right" },
            { key: "cost", label: "COST", width: 8, align: "right" },
            { key: "ctx", label: "CTX-PEAK", width: 10, align: "right" },
          ]}
          data={rows}
          maxRows={15}
        />
      </Box>

      {/* Duration distribution */}
      <Box flexDirection="column" marginLeft={1}>
        <Text bold>SESSION LENGTH DISTRIBUTION</Text>
        <Box marginLeft={1} flexDirection="column">
          <BarChart data={distData} maxWidth={30} showValues />
          {sweetSpot && (
            <Text dimColor>  Sweet spot: {sweetSpot}</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

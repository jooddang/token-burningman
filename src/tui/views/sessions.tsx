import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Table } from "../components/table.js";
import { BarChart } from "../components/bar-chart.js";
import { useConfig } from "../hooks/use-config.js";
import { fmtTokens, fmtCost, fmtDuration, fmtPct } from "../../utils/format.js";
import { getSessionsModel } from "../../dashboard/service.js";
import type { SessionsViewModel } from "../../dashboard/types.js";

const RANGES = ["24h", "48h", "7d"] as const;
type Range = (typeof RANGES)[number];

export function SessionsView() {
  const config = useConfig();
  const [range, setRange] = useState<Range>("24h");
  const [model, setModel] = useState<SessionsViewModel | null>(null);

  useInput((input) => {
    const idx = RANGES.indexOf(range);
    if (input === "[" && idx > 0) setRange(RANGES[idx - 1]);
    if (input === "]" && idx < RANGES.length - 1) setRange(RANGES[idx + 1]);
  });

  useEffect(() => {
    const load = () => setModel(getSessionsModel(range));
    load();
    const interval = setInterval(load, config.tui.refreshIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [range, config.tui.refreshIntervalSec]);

  if (!model) {
    return <Text>Loading...</Text>;
  }

  const rows = model.sessions.map((session) => {
    const start = new Date(session.startTime);
    const timeStr = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;

    return {
      time: session.isActive ? `${timeStr}-now` : timeStr,
      model: session.modelLabel,
      project: session.proj,
      dur: fmtDuration(session.endTime - session.startTime),
      tokens: fmtTokens(session.totalTokens),
      cost: fmtCost(session.cost),
      ctx: `${fmtPct(session.peakCtx)}${session.peakCtx > 75 ? " !" : ""}`,
    };
  });

  const distData = model.durationBuckets.map((bucket) => ({
    label: bucket.label,
    value: bucket.count,
    color: "cyan" as string,
  }));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold> SESSION HISTORY </Text>
        <Text dimColor>(</Text>
        {RANGES.map((entry, index) => (
          <React.Fragment key={entry}>
            {index > 0 && <Text dimColor> | </Text>}
            {entry === range ? (
              <Text bold color="cyan">[{entry}]</Text>
            ) : (
              <Text dimColor>{entry}</Text>
            )}
          </React.Fragment>
        ))}
        <Text dimColor>)  Use [ ] to change range</Text>
      </Box>

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

      <Box flexDirection="column" marginLeft={1}>
        <Text bold>SESSION LENGTH DISTRIBUTION</Text>
        <Box marginLeft={1} flexDirection="column">
          <BarChart data={distData} maxWidth={30} showValues />
          {model.sweetSpot && <Text dimColor>  Sweet spot: {model.sweetSpot}</Text>}
        </Box>
      </Box>
    </Box>
  );
}

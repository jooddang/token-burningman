import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Sparkline } from "../components/sparkline.js";
import { Heatmap } from "../components/heatmap.js";
import { useConfig } from "../hooks/use-config.js";
import { fmtCost, fmtPct } from "../../utils/format.js";
import { getTrendsModel } from "../../dashboard/service.js";
import type { TrendsViewModel } from "../../dashboard/types.js";

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

export function TrendsView() {
  const config = useConfig();
  const [rangeIdx, setRangeIdx] = useState(0);
  const [model, setModel] = useState<TrendsViewModel | null>(null);

  useInput((input) => {
    if (input === "[" && rangeIdx > 0) setRangeIdx(rangeIdx - 1);
    if (input === "]" && rangeIdx < RANGES.length - 1) setRangeIdx(rangeIdx + 1);
  });

  useEffect(() => {
    const load = () => setModel(getTrendsModel(RANGES[rangeIdx].days));
    load();
    const interval = setInterval(load, config.tui.refreshIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [rangeIdx, config.tui.refreshIntervalSec]);

  if (!model) {
    return <Text>Loading...</Text>;
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold> TRENDS </Text>
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
        <Text dimColor>)  Use [ ] to change range</Text>
      </Box>

      <Box flexDirection="column" marginLeft={1} marginBottom={1}>
        <Sparkline
          data={model.daily.map((entry) => entry.cost)}
          width={50}
          color="yellow"
          label="DAILY COST TREND"
          formatValue={(value) => fmtCost(value)}
        />
      </Box>

      <Box flexDirection="column" marginLeft={1} marginBottom={1}>
        <Sparkline
          data={model.cacheRates.map((entry) => entry.rate)}
          width={50}
          color="green"
          label="CACHE HIT RATE TREND"
          formatValue={(value) => fmtPct(value)}
        />
      </Box>

      <Box flexDirection="column" marginLeft={1} marginBottom={1}>
        <Text bold>PRODUCTIVITY INDEX (tokens per line of code)</Text>
        <Box marginLeft={1} flexDirection="column">
          <Text>
            Current: <Text bold>{model.productivity.currentVelocity.toLocaleString()}</Text>
            <Text dimColor> tokens/line   (lower = more efficient)</Text>
          </Text>
          {model.productivity.velocity7 > 0 && (
            <Text>
              7d avg: <Text>{model.productivity.velocity7.toLocaleString()}</Text>
              <Text dimColor> tokens/line</Text>
            </Text>
          )}
          {model.productivity.velocity30 > 0 && (
            <Text>
              30d avg: <Text>{model.productivity.velocity30.toLocaleString()}</Text>
              <Text dimColor> tokens/line</Text>
            </Text>
          )}
          {model.productivity.trendLabel && (
            <Text>
              Trend: {" "}
              <Text color={model.productivity.trendLabel.startsWith("Improving") ? "green" : "yellow"}>
                {model.productivity.trendLabel}
              </Text>
            </Text>
          )}
        </Box>
      </Box>

      <Box flexDirection="column" marginLeft={1}>
        <Heatmap data={model.heatmap} label="WEEKLY HEATMAP (hour x day)" />
      </Box>
    </Box>
  );
}

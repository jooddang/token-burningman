import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Sparkline } from "../components/sparkline.js";
import { Heatmap } from "../components/heatmap.js";
import { useConfig } from "../hooks/use-config.js";
import {
  getDailyStats,
  getCacheRateTrend,
  getWeeklyHeatmap,
  getCodeVelocity,
} from "../../analytics.js";
import { fmtCost, fmtPct } from "../../utils/format.js";
import type { DailyStat, HeatmapCell } from "../../types.js";

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

export function TrendsView() {
  const config = useConfig();
  const [rangeIdx, setRangeIdx] = useState(0);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [cacheRates, setCacheRates] = useState<{ date: string; rate: number }[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);

  useInput((input) => {
    if (input === "[" && rangeIdx > 0) setRangeIdx(rangeIdx - 1);
    if (input === "]" && rangeIdx < RANGES.length - 1) setRangeIdx(rangeIdx + 1);
  });

  useEffect(() => {
    const rangeDays = RANGES[rangeIdx].days;
    const load = () => {
      setDaily(getDailyStats(rangeDays));
      setCacheRates(getCacheRateTrend(rangeDays));
      setHeatmap(getWeeklyHeatmap(rangeDays));
    };
    load();
    const interval = setInterval(load, config.tui.refreshIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [rangeIdx, config.tui.refreshIntervalSec]);

  // Velocity stats
  const totalTokens = daily.reduce((s, d) => s + d.totalTokens, 0);
  const totalLines = daily.reduce((s, d) => s + d.linesChanged, 0);
  const currentVelocity = getCodeVelocity(totalTokens, totalLines);

  // Period subsets for comparison
  const last7 = daily.slice(-7);
  const last30 = daily.slice(-30);
  const velocity7 = getCodeVelocity(
    last7.reduce((s, d) => s + d.totalTokens, 0),
    last7.reduce((s, d) => s + d.linesChanged, 0),
  );
  const velocity30 = getCodeVelocity(
    last30.reduce((s, d) => s + d.totalTokens, 0),
    last30.reduce((s, d) => s + d.linesChanged, 0),
  );

  // Trend direction
  const velocityTrend =
    velocity7 > 0 && velocity30 > 0
      ? velocity7 < velocity30
        ? `Improving ${Math.round(((velocity30 - velocity7) / velocity30) * 100)}%`
        : `${Math.round(((velocity7 - velocity30) / velocity30) * 100)}% increase`
      : "";

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold> TRENDS </Text>
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
        <Text dimColor>)  Use [ ] to change range</Text>
      </Box>

      {/* Daily cost trend */}
      <Box flexDirection="column" marginLeft={1} marginBottom={1}>
        <Sparkline
          data={daily.map((d) => d.cost)}
          width={50}
          color="yellow"
          label="DAILY COST TREND"
          formatValue={(v) => fmtCost(v)}
        />
      </Box>

      {/* Cache hit rate trend */}
      <Box flexDirection="column" marginLeft={1} marginBottom={1}>
        <Sparkline
          data={cacheRates.map((c) => c.rate)}
          width={50}
          color="green"
          label="CACHE HIT RATE TREND"
          formatValue={(v) => fmtPct(v)}
        />
      </Box>

      {/* Productivity index */}
      <Box flexDirection="column" marginLeft={1} marginBottom={1}>
        <Text bold>PRODUCTIVITY INDEX (tokens per line of code)</Text>
        <Box marginLeft={1} flexDirection="column">
          <Text>
            Current: {" "}
            <Text bold>{currentVelocity.toLocaleString()}</Text>
            <Text dimColor> tokens/line   (lower = more efficient)</Text>
          </Text>
          {velocity7 > 0 && (
            <Text>
              7d avg: {"  "}
              <Text>{velocity7.toLocaleString()}</Text>
              <Text dimColor> tokens/line</Text>
            </Text>
          )}
          {velocity30 > 0 && (
            <Text>
              30d avg: {" "}
              <Text>{velocity30.toLocaleString()}</Text>
              <Text dimColor> tokens/line</Text>
            </Text>
          )}
          {velocityTrend && (
            <Text>
              Trend: {"  "}
              <Text color={velocityTrend.startsWith("Improving") ? "green" : "yellow"}>
                {velocityTrend}
              </Text>
            </Text>
          )}
        </Box>
      </Box>

      {/* Weekly heatmap */}
      <Box flexDirection="column" marginLeft={1}>
        <Heatmap data={heatmap} label="WEEKLY HEATMAP (hour x day)" />
      </Box>
    </Box>
  );
}

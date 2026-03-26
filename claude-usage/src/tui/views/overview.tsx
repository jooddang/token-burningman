import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { KpiCard } from "../components/kpi-card.js";
import { StackedBarChart } from "../components/bar-chart.js";
import { Table } from "../components/table.js";
import { ProgressBar } from "../components/progress-bar.js";
import { useSessionData } from "../hooks/use-session-data.js";
import { useConfig } from "../hooks/use-config.js";
import { fmtTokens, fmtCost, fmtPct, fmtDuration, fmtLines } from "../../utils/format.js";
import { cacheHitRate } from "../../utils/format.js";
import { readJson } from "../../utils/storage.js";
import type { QuotaState } from "../../types.js";

function QuotaDisplay() {
  const [quota, setQuota] = useState<QuotaState | null>(null);

  useEffect(() => {
    const load = () => {
      const home = process.env.HOME || "";
      const quotaPath = `${process.env.CLAUDE_USAGE_DIR || `${home}/.token-burningman`}/quota/state.json`;
      setQuota(readJson<QuotaState | null>(quotaPath, null));
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!quota || (!quota.five_hour && !quota.seven_day)) return null;

  // Normalize: API may return 0-100 (percentage) or 0-1 (fraction)
  const normUtil = (val: number) => (val > 1 ? val : val * 100);

  const fmtReset = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch { return iso; }
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold> QUOTA</Text>
      <Box marginLeft={1} flexDirection="column">
        {quota.five_hour && (
          <ProgressBar
            value={normUtil(quota.five_hour.utilization)}
            max={100}
            width={20}
            label={`5-hour: `}
            thresholds={{ warn: 60, danger: 80 }}
          />
        )}
        {quota.five_hour && (
          <Text dimColor>         resets {fmtReset(quota.five_hour.resets_at)}</Text>
        )}
        {quota.seven_day && (
          <ProgressBar
            value={normUtil(quota.seven_day.utilization)}
            max={100}
            width={20}
            label={`7-day:  `}
            thresholds={{ warn: 60, danger: 80 }}
          />
        )}
        {quota.seven_day && (
          <Text dimColor>         resets {fmtReset(quota.seven_day.resets_at)}</Text>
        )}
      </Box>
    </Box>
  );
}

const MODEL_COLORS: Record<string, string> = {
  opus: "magenta",
  sonnet: "cyan",
  haiku: "green",
};

function getModelShortName(modelId: string): string {
  if (modelId.includes("opus")) return "opus";
  if (modelId.includes("sonnet")) return "sonnet";
  if (modelId.includes("haiku")) return "haiku";
  return modelId;
}

export function OverviewView() {
  const config = useConfig();
  const { sessions, todayHourly, isLoading } = useSessionData(
    config.tui.refreshIntervalSec,
  );

  if (isLoading) {
    return <Text>Loading...</Text>;
  }

  // Compute today's KPIs from sessions that started today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const todaySessions = sessions.filter(
    (s) => s.startTime >= todayMs || s.endTime >= todayMs,
  );
  const activeSessions = sessions.filter((s) => s.isActive);

  let totalTokens = 0;
  let totalCost = 0;
  let totalCacheRead = 0;
  let totalInput = 0;
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;

  for (const s of todaySessions) {
    totalTokens += s.totalInput + s.totalOutput;
    totalCost += s.cost;
    totalCacheRead += s.cacheRead;
    totalInput += s.inputTokens;
    totalLinesAdded += s.linesAdded;
    totalLinesRemoved += s.linesRemoved;
  }

  const cacheRate = cacheHitRate(totalCacheRead, totalInput);

  // Build hourly chart data
  const hours = Array.from({ length: 24 }, (_, i) => String(i));
  const hourlyBars = [];
  for (const h of hours) {
    const hourNum = parseInt(h);
    if (hourNum > new Date().getHours()) break;
    const bucket = todayHourly[h];
    if (!bucket) continue;

    const segments: { value: number; color: string }[] = [];
    for (const [model, data] of Object.entries(bucket)) {
      const shortName = getModelShortName(model);
      segments.push({
        value: data.input + data.output,
        color: MODEL_COLORS[shortName] || "cyan",
      });
    }
    if (segments.some((s) => s.value > 0)) {
      hourlyBars.push({ label: h.padStart(2), segments });
    }
  }

  // Active sessions table
  const activeRows = activeSessions.map((s) => ({
    model: getModelShortName(s.model).charAt(0).toUpperCase() +
      getModelShortName(s.model).slice(1),
    project: s.proj,
    ctx: fmtPct(s.peakCtx),
    cost: fmtCost(s.cost),
    dur: fmtDuration(Date.now() - s.startTime),
    lines: fmtLines(s.linesAdded, s.linesRemoved),
  }));

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* KPI Row */}
      <Box marginBottom={1}>
        <KpiCard label="TODAY TOKENS" value={fmtTokens(totalTokens)} color="white" />
        <KpiCard label="24H COST" value={fmtCost(totalCost)} color="yellow" />
        <KpiCard
          label="SESSIONS"
          value={`${todaySessions.length}`}
          sub={`${activeSessions.length} active`}
        />
        <KpiCard label="CACHE HIT" value={fmtPct(cacheRate)} color="green" />
        <KpiCard
          label="LINES"
          value={fmtLines(totalLinesAdded, totalLinesRemoved)}
          color="white"
        />
      </Box>

      {/* Hourly Chart */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold> HOURLY TOKEN USAGE (today)</Text>
        {hourlyBars.length > 0 ? (
          <Box marginLeft={1}>
            <StackedBarChart data={hourlyBars} maxWidth={50} />
          </Box>
        ) : (
          <Text dimColor>  No hourly data yet. Data appears after aggregation.</Text>
        )}
        <Box marginLeft={1} marginTop={0}>
          <Text color="magenta">██ Opus  </Text>
          <Text color="cyan">██ Sonnet  </Text>
          <Text color="green">██ Haiku</Text>
        </Box>
      </Box>

      {/* Quota */}
      <QuotaDisplay />

      {/* Active Sessions */}
      <Box flexDirection="column">
        <Text bold> ACTIVE SESSIONS</Text>
        <Box marginLeft={1}>
          <Table
            columns={[
              { key: "model", label: "MODEL", width: 8 },
              { key: "project", label: "PROJECT", width: 20 },
              { key: "ctx", label: "CTX", width: 6, align: "right" },
              { key: "cost", label: "COST", width: 8, align: "right" },
              { key: "dur", label: "DUR", width: 8, align: "right" },
              { key: "lines", label: "LINES", width: 10, align: "right" },
            ]}
            data={activeRows}
            maxRows={10}
          />
        </Box>
      </Box>
    </Box>
  );
}

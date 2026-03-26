import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { KpiCard } from "../components/kpi-card.js";
import { StackedBarChart } from "../components/bar-chart.js";
import { Table } from "../components/table.js";
import { ProgressBar } from "../components/progress-bar.js";
import { useConfig } from "../hooks/use-config.js";
import { fmtTokens, fmtCost, fmtPct, fmtDuration, fmtLines } from "../../utils/format.js";
import { getOverviewModel } from "../../dashboard/service.js";
import type { OverviewViewModel } from "../../dashboard/types.js";

function QuotaDisplay({ quota }: { quota: OverviewViewModel["quota"] }) {
  if (!quota || (quota.fiveHourPct === null && quota.sevenDayPct === null)) {
    return null;
  }

  const fmtReset = (iso: string | null) => {
    if (!iso) return "unknown";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold> QUOTA</Text>
      <Box marginLeft={1} flexDirection="column">
        {quota.fiveHourPct !== null && (
          <>
            <ProgressBar
              value={quota.fiveHourPct}
              max={100}
              width={20}
              label="5-hour: "
              thresholds={{ warn: 60, danger: 80 }}
            />
            <Text dimColor>         resets {fmtReset(quota.fiveHourResetsAt)}</Text>
          </>
        )}
        {quota.sevenDayPct !== null && (
          <>
            <ProgressBar
              value={quota.sevenDayPct}
              max={100}
              width={20}
              label="7-day:  "
              thresholds={{ warn: 60, danger: 80 }}
            />
            <Text dimColor>         resets {fmtReset(quota.sevenDayResetsAt)}</Text>
          </>
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
  const [model, setModel] = useState<OverviewViewModel | null>(null);

  useEffect(() => {
    const load = () => setModel(getOverviewModel());
    load();
    const interval = setInterval(load, config.tui.refreshIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [config.tui.refreshIntervalSec]);

  if (!model) {
    return <Text>Loading...</Text>;
  }

  const hourlyBars = model.hourly.map((row) => ({
    label: row.hour,
    segments: row.models.map((segment) => ({
      value: segment.tokens,
      color: MODEL_COLORS[getModelShortName(segment.model)] || "cyan",
    })),
  }));

  const activeRows = model.activeSessions.map((session) => ({
    model: session.modelLabel,
    project: session.proj,
    ctx: fmtPct(session.peakCtx),
    cost: fmtCost(session.cost),
    dur: fmtDuration(Date.now() - session.startTime),
    lines: fmtLines(session.linesAdded, session.linesRemoved),
  }));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <KpiCard label="TODAY TOKENS" value={fmtTokens(model.totals.totalTokens)} color="white" />
        <KpiCard label="24H COST" value={fmtCost(model.totals.totalCost)} color="yellow" />
        <KpiCard
          label="SESSIONS"
          value={`${model.totals.sessionCount}`}
          sub={`${model.totals.activeSessionCount} active`}
        />
        <KpiCard label="CACHE HIT" value={fmtPct(model.totals.cacheHitRate)} color="green" />
        <KpiCard
          label="LINES"
          value={fmtLines(model.totals.linesAdded, model.totals.linesRemoved)}
          color="white"
        />
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold> HOURLY TOKEN USAGE (today)</Text>
        {hourlyBars.length > 0 ? (
          <Box marginLeft={1}>
            <StackedBarChart data={hourlyBars} maxWidth={50} />
          </Box>
        ) : (
          <Text dimColor>  No hourly data yet. Data appears after aggregation.</Text>
        )}
        <Box marginLeft={1}>
          <Text color="magenta">██ Opus  </Text>
          <Text color="cyan">██ Sonnet  </Text>
          <Text color="green">██ Haiku</Text>
        </Box>
      </Box>

      <QuotaDisplay quota={model.quota} />

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

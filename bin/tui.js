#!/usr/bin/env node
import {
  authenticateCli,
  isAuthenticated
} from "./chunk-NNTSHCFT.js";
import {
  DEFAULT_CONFIG
} from "./chunk-YCAD3QRK.js";
import {
  ensureStorageDirs,
  getConfigPath,
  getHourlyDir,
  getHourlyFilePath,
  getStorageDir,
  listSessionFiles,
  readJson,
  readJsonl,
  sessionIdFromPath
} from "./chunk-6RWSJQBF.js";

// src/tui/entry.tsx
import { render } from "ink";

// src/tui/app.tsx
import React6, { useState as useState7, useCallback as useCallback2 } from "react";
import { Box as Box12, Text as Text12, useInput as useInput5, useApp } from "ink";

// src/tui/views/overview.tsx
import { useEffect as useEffect2, useState as useState2 } from "react";
import { Box as Box5, Text as Text5 } from "ink";

// src/tui/components/kpi-card.tsx
import { Box, Text } from "ink";
import { jsx, jsxs } from "react/jsx-runtime";
function KpiCard({ label, value, sub, color, width }) {
  return /* @__PURE__ */ jsxs(
    Box,
    {
      flexDirection: "column",
      width: width || 18,
      paddingX: 1,
      borderStyle: "single",
      borderColor: "gray",
      children: [
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: label }),
        /* @__PURE__ */ jsx(Text, { bold: true, color: color || "white", children: value }),
        sub && /* @__PURE__ */ jsx(Text, { dimColor: true, children: sub })
      ]
    }
  );
}

// src/tui/components/bar-chart.tsx
import { Box as Box2, Text as Text2 } from "ink";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var FULL_BLOCK = "\u2588";
function BarChart({ data, maxWidth = 40, showValues = true }) {
  if (data.length === 0) {
    return /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: "No data" });
  }
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const maxLabelLen = Math.max(...data.map((d) => d.label.length));
  return /* @__PURE__ */ jsx2(Box2, { flexDirection: "column", children: data.map((item, i) => {
    const barLen = Math.round(item.value / maxVal * maxWidth);
    const bar = FULL_BLOCK.repeat(Math.max(barLen, 0));
    return /* @__PURE__ */ jsxs2(Box2, { children: [
      /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: item.label.padEnd(maxLabelLen + 1) }),
      /* @__PURE__ */ jsx2(Text2, { color: item.color || "cyan", children: bar }),
      showValues && /* @__PURE__ */ jsxs2(Text2, { dimColor: true, children: [
        " ",
        item.value.toLocaleString()
      ] })
    ] }, i);
  }) });
}
function StackedBarChart({ data, maxWidth = 40 }) {
  if (data.length === 0) {
    return /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: "No data" });
  }
  const maxTotal = Math.max(
    ...data.map((d) => d.segments.reduce((s, seg) => s + seg.value, 0)),
    1
  );
  const maxLabelLen = Math.max(...data.map((d) => d.label.length));
  return /* @__PURE__ */ jsx2(Box2, { flexDirection: "column", children: data.map((item, i) => {
    const total = item.segments.reduce((s, seg) => s + seg.value, 0);
    return /* @__PURE__ */ jsxs2(Box2, { children: [
      /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: item.label.padEnd(maxLabelLen + 1) }),
      item.segments.map((seg, j) => {
        const segLen = Math.round(seg.value / maxTotal * maxWidth);
        const ch = seg.char || FULL_BLOCK;
        return /* @__PURE__ */ jsx2(Text2, { color: seg.color, children: ch.repeat(Math.max(segLen, 0)) }, j);
      }),
      /* @__PURE__ */ jsxs2(Text2, { dimColor: true, children: [
        " ",
        total.toLocaleString()
      ] })
    ] }, i);
  }) });
}

// src/tui/components/table.tsx
import { Box as Box3, Text as Text3 } from "ink";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function padCell(text, width, align = "left") {
  const truncated = text.length > width ? text.slice(0, width - 1) + "\u2026" : text;
  return align === "right" ? truncated.padStart(width) : truncated.padEnd(width);
}
function Table({ columns, data, maxRows }) {
  const rows = maxRows ? data.slice(0, maxRows) : data;
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx3(Box3, { children: columns.map((col, i) => /* @__PURE__ */ jsxs3(Text3, { bold: true, dimColor: true, children: [
      padCell(col.label, col.width, col.align),
      " "
    ] }, i)) }),
    /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: columns.map((col) => "\u2500".repeat(col.width)).join("\u2500") }),
    rows.length === 0 ? /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: "  No data yet" }) : rows.map((row, i) => /* @__PURE__ */ jsx3(Box3, { children: columns.map((col, j) => /* @__PURE__ */ jsxs3(Text3, { color: col.color, children: [
      padCell(row[col.key] || "", col.width, col.align),
      " "
    ] }, j)) }, i))
  ] });
}

// src/tui/components/progress-bar.tsx
import { Box as Box4, Text as Text4 } from "ink";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function ProgressBar({
  value,
  max,
  width = 20,
  label,
  showPercent = true,
  thresholds = { warn: 60, danger: 80 }
}) {
  const pct = max > 0 ? Math.min(value / max * 100, 100) : 0;
  const filled = Math.round(pct / 100 * width);
  const empty = width - filled;
  let color = "green";
  if (pct >= thresholds.danger) color = "red";
  else if (pct >= thresholds.warn) color = "yellow";
  return /* @__PURE__ */ jsxs4(Box4, { children: [
    label && /* @__PURE__ */ jsxs4(Text4, { dimColor: true, children: [
      label,
      " "
    ] }),
    /* @__PURE__ */ jsx4(Text4, { children: "[" }),
    /* @__PURE__ */ jsx4(Text4, { color, children: "\u2588".repeat(filled) }),
    /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "\u2591".repeat(empty) }),
    /* @__PURE__ */ jsx4(Text4, { children: "]" }),
    showPercent && /* @__PURE__ */ jsxs4(Text4, { children: [
      " ",
      Math.round(pct),
      "%"
    ] })
  ] });
}

// src/tui/hooks/use-config.ts
import { useState, useEffect } from "react";
function useConfig() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  useEffect(() => {
    const loaded = readJson(getConfigPath(), DEFAULT_CONFIG);
    setConfig({ ...DEFAULT_CONFIG, ...loaded });
  }, []);
  return config;
}

// src/utils/format.ts
function fmtTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
}
function fmtCost(n) {
  return `$${n.toFixed(2)}`;
}
function fmtPct(n) {
  return `${Math.round(n)}%`;
}
function fmtDuration(ms) {
  const totalMin = Math.floor(ms / 6e4);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
}
function fmtLines(added, removed) {
  return `+${added}/-${removed}`;
}
function normalizeQuotaUtilization(value) {
  if (typeof value !== "number") return null;
  return Math.round(value > 1 ? value : value * 100);
}
var MODEL_NAMES = {
  "claude-opus-4-6": "Opus",
  "claude-sonnet-4-6": "Sonnet",
  "claude-haiku-4-5-20251001": "Haiku"
};
function modelDisplayName(modelId) {
  if (MODEL_NAMES[modelId]) return MODEL_NAMES[modelId];
  const match = modelId.match(/claude-(\w+)-/);
  if (match) return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  return modelId;
}
function cacheHitRate(cacheRead, inputTokens) {
  const total = cacheRead + inputTokens;
  if (total === 0) return 0;
  return Math.round(cacheRead / total * 100);
}

// src/quota.ts
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { execFileSync } from "child_process";
var QUOTA_STATE_PATH = () => path.join(getStorageDir(), "quota", "state.json");
var DEFAULT_QUOTA_STATE = {
  lastFetchedAt: 0,
  five_hour: null,
  seven_day: null
};
function readQuotaState() {
  return readJson(QUOTA_STATE_PATH(), DEFAULT_QUOTA_STATE);
}

// src/analytics.ts
import * as fs2 from "fs";
import * as path2 from "path";
function getProjectStats(rangeDays) {
  const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1e3;
  const files = listSessionFiles();
  const projects = /* @__PURE__ */ new Map();
  for (const file of files) {
    const entries = readJsonl(file);
    if (entries.length === 0) continue;
    const last = entries[entries.length - 1];
    if (last.t < cutoff) continue;
    const sid = sessionIdFromPath(file);
    const proj = last.proj;
    const model = last.model;
    if (!projects.has(proj)) {
      projects.set(proj, {
        totalTokens: 0,
        cost: 0,
        sessions: /* @__PURE__ */ new Set(),
        cacheRead: 0,
        inputTokens: 0,
        linesAdded: 0,
        linesRemoved: 0,
        modelTokens: /* @__PURE__ */ new Map()
      });
    }
    const p = projects.get(proj);
    const sessionTokens = last.tin + last.tout;
    p.totalTokens += sessionTokens;
    p.cost += last.cost;
    p.sessions.add(sid);
    p.linesAdded += last.la;
    p.linesRemoved += last.lr;
    for (const e of entries) {
      if (e.t >= cutoff) {
        p.cacheRead += e.cr;
        p.inputTokens += e.in;
      }
    }
    p.modelTokens.set(model, (p.modelTokens.get(model) || 0) + sessionTokens);
  }
  const stats = [];
  for (const [project, p] of projects) {
    const totalModelTokens = Array.from(p.modelTokens.values()).reduce(
      (s, v) => s + v,
      0
    );
    const modelMix = {};
    for (const [model, tokens] of p.modelTokens) {
      const shortName = model.includes("opus") ? "Opus" : model.includes("sonnet") ? "Sonnet" : model.includes("haiku") ? "Haiku" : model;
      modelMix[shortName] = totalModelTokens > 0 ? Math.round(tokens / totalModelTokens * 100) : 0;
    }
    const totalIn = p.cacheRead + p.inputTokens;
    stats.push({
      project,
      totalTokens: p.totalTokens,
      cost: p.cost,
      sessionCount: p.sessions.size,
      cacheHitRate: totalIn > 0 ? Math.round(p.cacheRead / totalIn * 100) : 0,
      linesAdded: p.linesAdded,
      linesRemoved: p.linesRemoved,
      modelMix
    });
  }
  return stats.sort((a, b) => b.cost - a.cost);
}
function getDailyStats(rangeDays) {
  const hourlyDir = getHourlyDir();
  if (!fs2.existsSync(hourlyDir)) return [];
  const files = fs2.readdirSync(hourlyDir).filter((f) => f.endsWith(".json"));
  const cutoffDate = /* @__PURE__ */ new Date();
  cutoffDate.setDate(cutoffDate.getDate() - rangeDays);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);
  const stats = [];
  for (const file of files) {
    const dateStr = file.replace(".json", "");
    if (dateStr < cutoffStr) continue;
    const hourly = readJson(
      path2.join(hourlyDir, file),
      {}
    );
    let totalTokens = 0;
    let cost = 0;
    let cacheRead = 0;
    let totalInput = 0;
    let linesChanged = 0;
    let sessionSet = /* @__PURE__ */ new Set();
    for (const hourData of Object.values(hourly)) {
      for (const bucket of Object.values(hourData)) {
        totalTokens += bucket.input + bucket.output;
        cost += bucket.cost;
        cacheRead += bucket.cacheRead;
        totalInput += bucket.input + bucket.cacheRead;
        linesChanged += bucket.linesAdded + bucket.linesRemoved;
        for (const s of bucket.sessions) sessionSet.add(s);
      }
    }
    const totalIn = cacheRead + totalInput;
    stats.push({
      date: dateStr,
      totalTokens,
      cost,
      cacheRate: totalIn > 0 ? Math.round(cacheRead / totalIn * 100) : 0,
      velocity: linesChanged > 0 ? Math.round(totalTokens / linesChanged) : 0,
      linesChanged,
      sessionCount: sessionSet.size
    });
  }
  return stats.sort((a, b) => a.date.localeCompare(b.date));
}
function getCodeVelocity(totalTokens, linesChanged) {
  if (linesChanged === 0) return 0;
  return Math.round(totalTokens / linesChanged);
}
function getCacheRateTrend(rangeDays) {
  const daily = getDailyStats(rangeDays);
  return daily.map((d) => ({ date: d.date, rate: d.cacheRate }));
}
function getWeeklyHeatmap(rangeDays) {
  const hourlyDir = getHourlyDir();
  if (!fs2.existsSync(hourlyDir)) return [];
  const files = fs2.readdirSync(hourlyDir).filter((f) => f.endsWith(".json"));
  const cutoffDate = /* @__PURE__ */ new Date();
  cutoffDate.setDate(cutoffDate.getDate() - rangeDays);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);
  const grid = Array.from(
    { length: 7 },
    () => Array(24).fill(0)
  );
  for (const file of files) {
    const dateStr = file.replace(".json", "");
    if (dateStr < cutoffStr) continue;
    const dayOfWeek = (/* @__PURE__ */ new Date(dateStr + "T12:00:00")).getDay();
    const hourly = readJson(
      path2.join(hourlyDir, file),
      {}
    );
    for (const [hourStr, hourData] of Object.entries(hourly)) {
      const hour = parseInt(hourStr);
      for (const bucket of Object.values(hourData)) {
        grid[dayOfWeek][hour] += bucket.input + bucket.output;
      }
    }
  }
  const cells = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ day, hour, value: grid[day][hour] });
    }
  }
  return cells;
}

// src/dashboard/service.ts
var ACTIVE_THRESHOLD_MS = 10 * 60 * 1e3;
var CACHE_TTL_MS = 5e3;
var cache = /* @__PURE__ */ new Map();
function cached(key, fn) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
    return entry.data;
  }
  const data = fn();
  cache.set(key, { data, ts: Date.now() });
  return data;
}
function summarizeQuota(quota) {
  if (!quota || !quota.five_hour && !quota.seven_day) {
    return null;
  }
  return {
    fiveHourPct: normalizeQuotaUtilization(quota.five_hour?.utilization),
    fiveHourResetsAt: quota.five_hour?.resets_at ?? null,
    sevenDayPct: normalizeQuotaUtilization(quota.seven_day?.utilization),
    sevenDayResetsAt: quota.seven_day?.resets_at ?? null
  };
}
function todayDateStr() {
  const d = /* @__PURE__ */ new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function summarizeSession(filePath, now) {
  const entries = readJsonl(filePath);
  if (entries.length === 0) return null;
  const first = entries[0];
  const last = entries[entries.length - 1];
  let peakCtx = 0;
  let totalCacheRead = 0;
  let totalInput = 0;
  for (const entry of entries) {
    if (entry.ctx > peakCtx) peakCtx = entry.ctx;
    totalCacheRead += entry.cr;
    totalInput += entry.in;
  }
  return {
    id: sessionIdFromPath(filePath),
    model: last.model,
    modelLabel: modelDisplayName(last.model),
    proj: last.proj,
    startTime: first.t,
    endTime: last.t,
    totalInput: last.tin,
    totalOutput: last.tout,
    totalTokens: last.tin + last.tout,
    cost: last.cost,
    peakCtx,
    linesAdded: last.la,
    linesRemoved: last.lr,
    cacheRead: totalCacheRead,
    inputTokens: totalInput,
    entryCount: entries.length,
    isActive: now - last.t < ACTIVE_THRESHOLD_MS
  };
}
function getSessionSummaries() {
  return cached("sessions", () => {
    const now = Date.now();
    const sessions = listSessionFiles().map((filePath) => summarizeSession(filePath, now)).filter((session) => session !== null);
    sessions.sort((left, right) => right.endTime - left.endTime);
    return sessions;
  });
}
function getOverviewModel() {
  return cached("overview", () => _buildOverviewModel());
}
function _buildOverviewModel() {
  const sessions = getSessionSummaries();
  const quota = summarizeQuota(readQuotaState());
  const todayHourly = readJson(getHourlyFilePath(todayDateStr()), {});
  const todayStart = /* @__PURE__ */ new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const todaySessions = sessions.filter(
    (session) => session.startTime >= todayMs || session.endTime >= todayMs
  );
  const activeSessions = sessions.filter((session) => session.isActive);
  let totalTokens = 0;
  let totalCost = 0;
  let totalCacheRead = 0;
  let totalInput = 0;
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const session of todaySessions) {
    totalTokens += session.totalTokens;
    totalCost += session.cost;
    totalCacheRead += session.cacheRead;
    totalInput += session.inputTokens;
    linesAdded += session.linesAdded;
    linesRemoved += session.linesRemoved;
  }
  const hourly = Object.entries(todayHourly).map(([hour, models]) => {
    const modelRows = Object.entries(models).map(([model, bucket]) => ({
      model,
      modelLabel: modelDisplayName(model),
      tokens: bucket.input + bucket.output
    }));
    return {
      hour: hour.padStart(2, "0"),
      totalTokens: modelRows.reduce((sum, row) => sum + row.tokens, 0),
      models: modelRows
    };
  }).filter((row) => row.totalTokens > 0).sort((left, right) => left.hour.localeCompare(right.hour));
  return {
    generatedAt: Date.now(),
    totals: {
      totalTokens,
      totalCost,
      sessionCount: todaySessions.length,
      activeSessionCount: activeSessions.length,
      cacheHitRate: cacheHitRate(totalCacheRead, totalInput),
      linesAdded,
      linesRemoved
    },
    hourly,
    quota,
    activeSessions
  };
}
function rangeMs(range) {
  switch (range) {
    case "24h":
      return 24 * 60 * 60 * 1e3;
    case "48h":
      return 48 * 60 * 60 * 1e3;
    case "7d":
      return 7 * 24 * 60 * 60 * 1e3;
  }
}
function getSessionsModel(range) {
  return cached(`sessions-${range}`, () => _buildSessionsModel(range));
}
function _buildSessionsModel(range) {
  const cutoff = Date.now() - rangeMs(range);
  const sessions = getSessionSummaries().filter((session) => session.endTime >= cutoff);
  const durationBuckets = [
    { label: "0-15m", min: 0, max: 15, count: 0 },
    { label: "15-30m", min: 15, max: 30, count: 0 },
    { label: "30-60m", min: 30, max: 60, count: 0 },
    { label: "60-90m", min: 60, max: 90, count: 0 },
    { label: "90m+", min: 90, max: Infinity, count: 0 }
  ];
  for (const session of sessions) {
    const durationMinutes = (session.endTime - session.startTime) / 6e4;
    const bucket = durationBuckets.find(
      (candidate) => durationMinutes >= candidate.min && durationMinutes < candidate.max
    );
    if (bucket) bucket.count += 1;
  }
  const sweetSpot = durationBuckets.reduce((best, bucket) => bucket.count > best.count ? bucket : best, durationBuckets[0])?.label || "";
  return {
    generatedAt: Date.now(),
    range,
    sessions,
    durationBuckets: durationBuckets.map(({ label, count }) => ({ label, count })),
    sweetSpot
  };
}
function getProjectsModel(rangeDays) {
  return cached(`projects-${rangeDays}`, () => ({
    generatedAt: Date.now(),
    rangeDays,
    projects: getProjectStats(rangeDays)
  }));
}
function getTrendsModel(rangeDays) {
  return cached(`trends-${rangeDays}`, () => _buildTrendsModel(rangeDays));
}
function _buildTrendsModel(rangeDays) {
  const daily = getDailyStats(rangeDays);
  const cacheRates = getCacheRateTrend(rangeDays);
  const heatmap = getWeeklyHeatmap(rangeDays);
  const totalTokens = daily.reduce((sum, stat) => sum + stat.totalTokens, 0);
  const totalLines = daily.reduce((sum, stat) => sum + stat.linesChanged, 0);
  const currentVelocity = getCodeVelocity(totalTokens, totalLines);
  const last7 = daily.slice(-7);
  const last30 = daily.slice(-30);
  const velocity7 = getCodeVelocity(
    last7.reduce((sum, stat) => sum + stat.totalTokens, 0),
    last7.reduce((sum, stat) => sum + stat.linesChanged, 0)
  );
  const velocity30 = getCodeVelocity(
    last30.reduce((sum, stat) => sum + stat.totalTokens, 0),
    last30.reduce((sum, stat) => sum + stat.linesChanged, 0)
  );
  let trendLabel = "";
  if (velocity7 > 0 && velocity30 > 0) {
    if (velocity7 < velocity30) {
      trendLabel = `Improving ${Math.round((velocity30 - velocity7) / velocity30 * 100)}%`;
    } else {
      trendLabel = `${Math.round((velocity7 - velocity30) / velocity30 * 100)}% increase`;
    }
  }
  return {
    generatedAt: Date.now(),
    rangeDays,
    daily,
    cacheRates,
    heatmap,
    productivity: {
      currentVelocity,
      velocity7,
      velocity30,
      trendLabel
    }
  };
}

// src/tui/views/overview.tsx
import { Fragment, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function QuotaDisplay({ quota }) {
  if (!quota || quota.fiveHourPct === null && quota.sevenDayPct === null) {
    return null;
  }
  const fmtReset = (iso) => {
    if (!iso) return "unknown";
    try {
      const d = new Date(iso);
      return d.toLocaleString(void 0, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    } catch {
      return iso;
    }
  };
  return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", marginBottom: 1, children: [
    /* @__PURE__ */ jsx5(Text5, { bold: true, children: " QUOTA" }),
    /* @__PURE__ */ jsxs5(Box5, { marginLeft: 1, flexDirection: "column", children: [
      quota.fiveHourPct !== null && /* @__PURE__ */ jsxs5(Fragment, { children: [
        /* @__PURE__ */ jsx5(
          ProgressBar,
          {
            value: quota.fiveHourPct,
            max: 100,
            width: 20,
            label: "5-hour: ",
            thresholds: { warn: 60, danger: 80 }
          }
        ),
        /* @__PURE__ */ jsxs5(Text5, { dimColor: true, children: [
          "         resets ",
          fmtReset(quota.fiveHourResetsAt)
        ] })
      ] }),
      quota.sevenDayPct !== null && /* @__PURE__ */ jsxs5(Fragment, { children: [
        /* @__PURE__ */ jsx5(
          ProgressBar,
          {
            value: quota.sevenDayPct,
            max: 100,
            width: 20,
            label: "7-day:  ",
            thresholds: { warn: 60, danger: 80 }
          }
        ),
        /* @__PURE__ */ jsxs5(Text5, { dimColor: true, children: [
          "         resets ",
          fmtReset(quota.sevenDayResetsAt)
        ] })
      ] })
    ] })
  ] });
}
var MODEL_COLORS = {
  opus: "magenta",
  sonnet: "cyan",
  haiku: "green"
};
function getModelShortName(modelId) {
  if (modelId.includes("opus")) return "opus";
  if (modelId.includes("sonnet")) return "sonnet";
  if (modelId.includes("haiku")) return "haiku";
  return modelId;
}
function OverviewView() {
  const config = useConfig();
  const [model, setModel] = useState2(null);
  useEffect2(() => {
    const load = () => setModel(getOverviewModel());
    load();
    const interval = setInterval(load, config.tui.refreshIntervalSec * 1e3);
    return () => clearInterval(interval);
  }, [config.tui.refreshIntervalSec]);
  if (!model) {
    return /* @__PURE__ */ jsx5(Text5, { children: "Loading..." });
  }
  const hourlyBars = model.hourly.map((row) => ({
    label: row.hour,
    segments: row.models.map((segment) => ({
      value: segment.tokens,
      color: MODEL_COLORS[getModelShortName(segment.model)] || "cyan"
    }))
  }));
  const activeRows = model.activeSessions.map((session) => ({
    model: session.modelLabel,
    project: session.proj,
    ctx: fmtPct(session.peakCtx),
    cost: fmtCost(session.cost),
    dur: fmtDuration(Date.now() - session.startTime),
    lines: fmtLines(session.linesAdded, session.linesRemoved)
  }));
  return /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", paddingX: 1, children: [
    /* @__PURE__ */ jsxs5(Box5, { marginBottom: 1, children: [
      /* @__PURE__ */ jsx5(KpiCard, { label: "TODAY TOKENS", value: fmtTokens(model.totals.totalTokens), color: "white" }),
      /* @__PURE__ */ jsx5(KpiCard, { label: "24H COST", value: fmtCost(model.totals.totalCost), color: "yellow" }),
      /* @__PURE__ */ jsx5(
        KpiCard,
        {
          label: "SESSIONS",
          value: `${model.totals.sessionCount}`,
          sub: `${model.totals.activeSessionCount} active`
        }
      ),
      /* @__PURE__ */ jsx5(KpiCard, { label: "CACHE HIT", value: fmtPct(model.totals.cacheHitRate), color: "green" }),
      /* @__PURE__ */ jsx5(
        KpiCard,
        {
          label: "LINES",
          value: fmtLines(model.totals.linesAdded, model.totals.linesRemoved),
          color: "white"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", marginBottom: 1, children: [
      /* @__PURE__ */ jsx5(Text5, { bold: true, children: " HOURLY TOKEN USAGE (today)" }),
      hourlyBars.length > 0 ? /* @__PURE__ */ jsx5(Box5, { marginLeft: 1, children: /* @__PURE__ */ jsx5(StackedBarChart, { data: hourlyBars, maxWidth: 50 }) }) : /* @__PURE__ */ jsx5(Text5, { dimColor: true, children: "  No hourly data yet. Data appears after aggregation." }),
      /* @__PURE__ */ jsxs5(Box5, { marginLeft: 1, children: [
        /* @__PURE__ */ jsx5(Text5, { color: "magenta", children: "\u2588\u2588 Opus  " }),
        /* @__PURE__ */ jsx5(Text5, { color: "cyan", children: "\u2588\u2588 Sonnet  " }),
        /* @__PURE__ */ jsx5(Text5, { color: "green", children: "\u2588\u2588 Haiku" })
      ] })
    ] }),
    /* @__PURE__ */ jsx5(QuotaDisplay, { quota: model.quota }),
    /* @__PURE__ */ jsxs5(Box5, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx5(Text5, { bold: true, children: " ACTIVE SESSIONS" }),
      /* @__PURE__ */ jsx5(Box5, { marginLeft: 1, children: /* @__PURE__ */ jsx5(
        Table,
        {
          columns: [
            { key: "model", label: "MODEL", width: 8 },
            { key: "project", label: "PROJECT", width: 20 },
            { key: "ctx", label: "CTX", width: 6, align: "right" },
            { key: "cost", label: "COST", width: 8, align: "right" },
            { key: "dur", label: "DUR", width: 8, align: "right" },
            { key: "lines", label: "LINES", width: 10, align: "right" }
          ],
          data: activeRows,
          maxRows: 10
        }
      ) })
    ] })
  ] });
}

// src/tui/views/sessions.tsx
import React2, { useEffect as useEffect3, useState as useState3 } from "react";
import { Box as Box6, Text as Text6, useInput } from "ink";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var RANGES = ["24h", "48h", "7d"];
function SessionsView() {
  const config = useConfig();
  const [range, setRange] = useState3("24h");
  const [model, setModel] = useState3(null);
  useInput((input) => {
    const idx = RANGES.indexOf(range);
    if (input === "[" && idx > 0) setRange(RANGES[idx - 1]);
    if (input === "]" && idx < RANGES.length - 1) setRange(RANGES[idx + 1]);
  });
  useEffect3(() => {
    const load = () => setModel(getSessionsModel(range));
    load();
    const interval = setInterval(load, config.tui.refreshIntervalSec * 1e3);
    return () => clearInterval(interval);
  }, [range, config.tui.refreshIntervalSec]);
  if (!model) {
    return /* @__PURE__ */ jsx6(Text6, { children: "Loading..." });
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
      ctx: `${fmtPct(session.peakCtx)}${session.peakCtx > 75 ? " !" : ""}`
    };
  });
  const distData = model.durationBuckets.map((bucket) => ({
    label: bucket.label,
    value: bucket.count,
    color: "cyan"
  }));
  return /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", paddingX: 1, children: [
    /* @__PURE__ */ jsxs6(Box6, { marginBottom: 1, children: [
      /* @__PURE__ */ jsx6(Text6, { bold: true, children: " SESSION HISTORY " }),
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: "(" }),
      RANGES.map((entry, index) => /* @__PURE__ */ jsxs6(React2.Fragment, { children: [
        index > 0 && /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: " | " }),
        entry === range ? /* @__PURE__ */ jsxs6(Text6, { bold: true, color: "cyan", children: [
          "[",
          entry,
          "]"
        ] }) : /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: entry })
      ] }, entry)),
      /* @__PURE__ */ jsx6(Text6, { dimColor: true, children: ")  Use [ ] to change range" })
    ] }),
    /* @__PURE__ */ jsx6(Box6, { flexDirection: "column", marginBottom: 1, marginLeft: 1, children: /* @__PURE__ */ jsx6(
      Table,
      {
        columns: [
          { key: "time", label: "TIME", width: 10 },
          { key: "model", label: "MODEL", width: 8 },
          { key: "project", label: "PROJECT", width: 20 },
          { key: "dur", label: "DUR", width: 8, align: "right" },
          { key: "tokens", label: "TOKENS", width: 8, align: "right" },
          { key: "cost", label: "COST", width: 8, align: "right" },
          { key: "ctx", label: "CTX-PEAK", width: 10, align: "right" }
        ],
        data: rows,
        maxRows: 15
      }
    ) }),
    /* @__PURE__ */ jsxs6(Box6, { flexDirection: "column", marginLeft: 1, children: [
      /* @__PURE__ */ jsx6(Text6, { bold: true, children: "SESSION LENGTH DISTRIBUTION" }),
      /* @__PURE__ */ jsxs6(Box6, { marginLeft: 1, flexDirection: "column", children: [
        /* @__PURE__ */ jsx6(BarChart, { data: distData, maxWidth: 30, showValues: true }),
        model.sweetSpot && /* @__PURE__ */ jsxs6(Text6, { dimColor: true, children: [
          "  Sweet spot: ",
          model.sweetSpot
        ] })
      ] })
    ] })
  ] });
}

// src/tui/views/projects.tsx
import React3, { useEffect as useEffect4, useState as useState4 } from "react";
import { Box as Box7, Text as Text7, useInput as useInput2 } from "ink";
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var RANGES2 = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 }
];
function ProjectsView() {
  const config = useConfig();
  const [rangeIdx, setRangeIdx] = useState4(0);
  const [model, setModel] = useState4(null);
  useInput2((input) => {
    if (input === "[" && rangeIdx > 0) setRangeIdx(rangeIdx - 1);
    if (input === "]" && rangeIdx < RANGES2.length - 1) setRangeIdx(rangeIdx + 1);
  });
  useEffect4(() => {
    const load = () => setModel(getProjectsModel(RANGES2[rangeIdx].days));
    load();
    const interval = setInterval(load, config.tui.refreshIntervalSec * 1e3);
    return () => clearInterval(interval);
  }, [rangeIdx, config.tui.refreshIntervalSec]);
  const projects = model?.projects ?? [];
  const rows = projects.map((project) => ({
    project: project.project,
    tokens: fmtTokens(project.totalTokens),
    cost: fmtCost(project.cost),
    sessions: String(project.sessionCount),
    cache: fmtPct(project.cacheHitRate),
    lines: fmtLines(project.linesAdded, project.linesRemoved)
  }));
  const barData = projects.slice(0, 8).map((project) => ({
    label: project.project.slice(0, 18),
    value: project.cost,
    color: "yellow"
  }));
  return /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", paddingX: 1, children: [
    /* @__PURE__ */ jsxs7(Box7, { marginBottom: 1, children: [
      /* @__PURE__ */ jsx7(Text7, { bold: true, children: " PROJECTS " }),
      /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "(" }),
      RANGES2.map((range, index) => /* @__PURE__ */ jsxs7(React3.Fragment, { children: [
        index > 0 && /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: " | " }),
        index === rangeIdx ? /* @__PURE__ */ jsxs7(Text7, { bold: true, color: "cyan", children: [
          "[",
          range.label,
          "]"
        ] }) : /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: range.label })
      ] }, range.label)),
      /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: ")  sorted by: cost desc  Use [ ] to change" })
    ] }),
    /* @__PURE__ */ jsx7(Box7, { flexDirection: "column", marginBottom: 1, marginLeft: 1, children: /* @__PURE__ */ jsx7(
      Table,
      {
        columns: [
          { key: "project", label: "PROJECT", width: 22 },
          { key: "tokens", label: "TOKENS", width: 10, align: "right" },
          { key: "cost", label: "COST", width: 10, align: "right" },
          { key: "sessions", label: "SESSIONS", width: 10, align: "right" },
          { key: "cache", label: "CACHE%", width: 8, align: "right" },
          { key: "lines", label: "LINES", width: 14, align: "right" }
        ],
        data: rows,
        maxRows: 10
      }
    ) }),
    barData.length > 0 && /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", marginLeft: 1, marginBottom: 1, children: [
      /* @__PURE__ */ jsx7(Text7, { bold: true, children: "COST BY PROJECT" }),
      /* @__PURE__ */ jsx7(Box7, { marginLeft: 1, children: /* @__PURE__ */ jsx7(BarChart, { data: barData, maxWidth: 35, showValues: true }) })
    ] }),
    projects.length > 0 && /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", marginLeft: 1, children: [
      /* @__PURE__ */ jsx7(Text7, { bold: true, children: "MODEL MIX BY PROJECT" }),
      projects.slice(0, 5).map((project) => /* @__PURE__ */ jsxs7(Box7, { marginLeft: 1, children: [
        /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: project.project.padEnd(20) }),
        Object.entries(project.modelMix).map(([name, pct]) => /* @__PURE__ */ jsxs7(
          Text7,
          {
            color: name === "Opus" ? "magenta" : name === "Sonnet" ? "cyan" : "green",
            children: [
              name,
              " ",
              pct,
              "%",
              "  "
            ]
          },
          name
        ))
      ] }, project.project))
    ] })
  ] });
}

// src/tui/views/trends.tsx
import React4, { useEffect as useEffect5, useState as useState5 } from "react";
import { Box as Box10, Text as Text10, useInput as useInput3 } from "ink";

// src/tui/components/sparkline.tsx
import { Box as Box8, Text as Text8 } from "ink";
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var BLOCKS = [" ", "\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"];
function Sparkline({
  data,
  width = 40,
  color = "cyan",
  label,
  formatValue
}) {
  if (data.length === 0) {
    return /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: "No data" });
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const resampled = [];
  for (let i = 0; i < width; i++) {
    const idx = Math.floor(i / width * data.length);
    resampled.push(data[Math.min(idx, data.length - 1)]);
  }
  const chars = resampled.map((v) => {
    const normalized = (v - min) / range;
    const idx = Math.round(normalized * (BLOCKS.length - 1));
    return BLOCKS[idx];
  });
  const lastVal = data[data.length - 1];
  const firstVal = data[0];
  const trend = lastVal > firstVal ? "\u25B2" : lastVal < firstVal ? "\u25BC" : "\u2500";
  return /* @__PURE__ */ jsxs8(Box8, { flexDirection: "column", children: [
    label && /* @__PURE__ */ jsx8(Text8, { dimColor: true, children: label }),
    /* @__PURE__ */ jsxs8(Box8, { children: [
      /* @__PURE__ */ jsx8(Text8, { color, children: chars.join("") }),
      /* @__PURE__ */ jsxs8(Text8, { dimColor: true, children: [
        " ",
        formatValue ? formatValue(lastVal) : lastVal.toFixed(0),
        " ",
        trend
      ] })
    ] })
  ] });
}

// src/tui/components/heatmap.tsx
import { Box as Box9, Text as Text9 } from "ink";
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
var DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];
var INTENSITIES = [" . ", " \u2591 ", " \u2593 ", " \u2588 "];
function getIntensity(value, max) {
  if (value === 0 || max === 0) return INTENSITIES[0];
  const ratio = value / max;
  if (ratio < 0.25) return INTENSITIES[1];
  if (ratio < 0.6) return INTENSITIES[2];
  return INTENSITIES[3];
}
function getIntensityColor(value, max) {
  if (value === 0 || max === 0) return "gray";
  const ratio = value / max;
  if (ratio < 0.25) return "gray";
  if (ratio < 0.6) return "yellow";
  return "green";
}
function Heatmap({ data, label }) {
  if (data.length === 0) {
    return /* @__PURE__ */ jsx9(Text9, { dimColor: true, children: "No data" });
  }
  const max = Math.max(...data.map((c) => c.value), 1);
  const grid = Array.from(
    { length: 7 },
    () => Array(8).fill(0)
  );
  for (const cell of data) {
    const colIdx = Math.floor(cell.hour / 3);
    grid[cell.day][colIdx] += cell.value;
  }
  const gridMax = Math.max(...grid.flat(), 1);
  return /* @__PURE__ */ jsxs9(Box9, { flexDirection: "column", children: [
    label && /* @__PURE__ */ jsx9(Text9, { bold: true, children: label }),
    /* @__PURE__ */ jsxs9(Box9, { children: [
      /* @__PURE__ */ jsx9(Text9, { dimColor: true, children: "     " }),
      HOUR_LABELS.map((h) => /* @__PURE__ */ jsxs9(Text9, { dimColor: true, children: [
        String(h).padStart(2),
        " "
      ] }, h))
    ] }),
    [1, 2, 3, 4, 5, 6, 0].map((day) => /* @__PURE__ */ jsxs9(Box9, { children: [
      /* @__PURE__ */ jsxs9(Text9, { dimColor: true, children: [
        DAY_LABELS[day],
        " "
      ] }),
      grid[day].map((val, col) => /* @__PURE__ */ jsx9(Text9, { color: getIntensityColor(val, gridMax), children: getIntensity(val, gridMax) }, col))
    ] }, day))
  ] });
}

// src/tui/views/trends.tsx
import { jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
var RANGES3 = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 }
];
function TrendsView() {
  const config = useConfig();
  const [rangeIdx, setRangeIdx] = useState5(0);
  const [model, setModel] = useState5(null);
  useInput3((input) => {
    if (input === "[" && rangeIdx > 0) setRangeIdx(rangeIdx - 1);
    if (input === "]" && rangeIdx < RANGES3.length - 1) setRangeIdx(rangeIdx + 1);
  });
  useEffect5(() => {
    const load = () => setModel(getTrendsModel(RANGES3[rangeIdx].days));
    load();
    const interval = setInterval(load, config.tui.refreshIntervalSec * 1e3);
    return () => clearInterval(interval);
  }, [rangeIdx, config.tui.refreshIntervalSec]);
  if (!model) {
    return /* @__PURE__ */ jsx10(Text10, { children: "Loading..." });
  }
  return /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", paddingX: 1, children: [
    /* @__PURE__ */ jsxs10(Box10, { marginBottom: 1, children: [
      /* @__PURE__ */ jsx10(Text10, { bold: true, children: " TRENDS " }),
      /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: "(" }),
      RANGES3.map((range, index) => /* @__PURE__ */ jsxs10(React4.Fragment, { children: [
        index > 0 && /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: " | " }),
        index === rangeIdx ? /* @__PURE__ */ jsxs10(Text10, { bold: true, color: "cyan", children: [
          "[",
          range.label,
          "]"
        ] }) : /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: range.label })
      ] }, range.label)),
      /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: ")  Use [ ] to change range" })
    ] }),
    /* @__PURE__ */ jsx10(Box10, { flexDirection: "column", marginLeft: 1, marginBottom: 1, children: /* @__PURE__ */ jsx10(
      Sparkline,
      {
        data: model.daily.map((entry) => entry.cost),
        width: 50,
        color: "yellow",
        label: "DAILY COST TREND",
        formatValue: (value) => fmtCost(value)
      }
    ) }),
    /* @__PURE__ */ jsx10(Box10, { flexDirection: "column", marginLeft: 1, marginBottom: 1, children: /* @__PURE__ */ jsx10(
      Sparkline,
      {
        data: model.cacheRates.map((entry) => entry.rate),
        width: 50,
        color: "green",
        label: "CACHE HIT RATE TREND",
        formatValue: (value) => fmtPct(value)
      }
    ) }),
    /* @__PURE__ */ jsxs10(Box10, { flexDirection: "column", marginLeft: 1, marginBottom: 1, children: [
      /* @__PURE__ */ jsx10(Text10, { bold: true, children: "PRODUCTIVITY INDEX (tokens per line of code)" }),
      /* @__PURE__ */ jsxs10(Box10, { marginLeft: 1, flexDirection: "column", children: [
        /* @__PURE__ */ jsxs10(Text10, { children: [
          "Current: ",
          /* @__PURE__ */ jsx10(Text10, { bold: true, children: model.productivity.currentVelocity.toLocaleString() }),
          /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: " tokens/line   (lower = more efficient)" })
        ] }),
        model.productivity.velocity7 > 0 && /* @__PURE__ */ jsxs10(Text10, { children: [
          "7d avg: ",
          /* @__PURE__ */ jsx10(Text10, { children: model.productivity.velocity7.toLocaleString() }),
          /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: " tokens/line" })
        ] }),
        model.productivity.velocity30 > 0 && /* @__PURE__ */ jsxs10(Text10, { children: [
          "30d avg: ",
          /* @__PURE__ */ jsx10(Text10, { children: model.productivity.velocity30.toLocaleString() }),
          /* @__PURE__ */ jsx10(Text10, { dimColor: true, children: " tokens/line" })
        ] }),
        model.productivity.trendLabel && /* @__PURE__ */ jsxs10(Text10, { children: [
          "Trend: ",
          " ",
          /* @__PURE__ */ jsx10(Text10, { color: model.productivity.trendLabel.startsWith("Improving") ? "green" : "yellow", children: model.productivity.trendLabel })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx10(Box10, { flexDirection: "column", marginLeft: 1, children: /* @__PURE__ */ jsx10(Heatmap, { data: model.heatmap, label: "WEEKLY HEATMAP (hour x day)" }) })
  ] });
}

// src/tui/views/community.tsx
import { useState as useState6, useEffect as useEffect6, useCallback } from "react";
import { Box as Box11, Text as Text11, useInput as useInput4 } from "ink";
import { jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
async function fetchJson(url) {
  try {
    const mod = url.startsWith("https") ? await import("https") : await import("http");
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const req = mod.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (url.startsWith("https") ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: "GET",
          timeout: 5e3
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => {
            body += chunk.toString();
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    });
  } catch {
    return null;
  }
}
function CommunityView() {
  const config = useConfig();
  const [authState, setAuthState] = useState6("checking");
  const [authMessage, setAuthMessage] = useState6("");
  const [overview, setOverview] = useState6(null);
  const [leaderboard, setLeaderboard] = useState6([]);
  const [loading, setLoading] = useState6(true);
  const [error, setError] = useState6(null);
  const serverUrl = config.publicReporting?.serverUrl || "https://sfvibe.fun/api/burningman";
  useEffect6(() => {
    if (isAuthenticated(config)) {
      setAuthState("authenticated");
    } else {
      setAuthState("unauthenticated");
    }
  }, [config.publicReporting?.cliToken]);
  useEffect6(() => {
    if (authState !== "authenticated") return;
    async function load() {
      setLoading(true);
      const ov = await fetchJson(`${serverUrl}/community/overview?range=24h`);
      if (!ov) {
        setError("Cannot connect to community server");
        setLoading(false);
        return;
      }
      setOverview(ov);
      const lb = await fetchJson(
        `${serverUrl}/community/leaderboard?category=tokens&range=24h`
      );
      if (lb) setLeaderboard(lb.entries || []);
      setLoading(false);
    }
    load();
    const interval = setInterval(load, 3e4);
    return () => clearInterval(interval);
  }, [serverUrl, authState]);
  useInput4(
    useCallback(
      (input) => {
        if (input === "s" && (authState === "unauthenticated" || authState === "error")) {
          setAuthState("authenticating");
          setAuthMessage("Opening browser...");
          import("./setup-GGKYWZ5N.js").then(({ ensureConfig }) => {
            const freshConfig = ensureConfig();
            return authenticateCli(freshConfig);
          }).then((ok) => {
            if (ok) {
              setAuthState("authenticated");
              setAuthMessage("");
            } else {
              setAuthState("unauthenticated");
              setAuthMessage("Sign-in timed out. Press [s] to try again.");
            }
          }).catch(() => {
            setAuthState("error");
            setAuthMessage("Sign-in failed. Press [s] to try again.");
          });
        }
        if (input === "c" && authState === "authenticating") {
          setAuthState("unauthenticated");
          setAuthMessage("Cancelled. Press [s] to try again.");
        }
        if (input === "o" && authState === "authenticated") {
          import("./storage-TDVZUYPU.js").then(({ getConfigPath: getConfigPath2, readJson: readJson2, writeJsonAtomic: writeJsonAtomic2 }) => {
            import("./types-RKREOOY3.js").then(({ DEFAULT_CONFIG: DEFAULT_CONFIG2 }) => {
              const cfg = readJson2(getConfigPath2(), DEFAULT_CONFIG2);
              cfg.publicReporting.cliToken = null;
              cfg.publicReporting.enabled = false;
              writeJsonAtomic2(getConfigPath2(), cfg);
              setAuthState("unauthenticated");
              setAuthMessage("Logged out. Press [s] to sign in again.");
              setOverview(null);
              setLeaderboard([]);
            });
          });
        }
      },
      [authState, config]
    )
  );
  if (authState === "checking") {
    return /* @__PURE__ */ jsx11(Box11, { paddingX: 2, paddingY: 1, children: /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: authMessage || "Checking account status..." }) });
  }
  if (authState === "unauthenticated") {
    return /* @__PURE__ */ jsxs11(Box11, { paddingX: 2, paddingY: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx11(Box11, { marginBottom: 1, children: /* @__PURE__ */ jsx11(Text11, { bold: true, children: " COMMUNITY" }) }),
      /* @__PURE__ */ jsxs11(Box11, { flexDirection: "column", marginLeft: 1, children: [
        /* @__PURE__ */ jsx11(Text11, { color: "yellow", children: "Not signed in to the community server." }),
        /* @__PURE__ */ jsxs11(Text11, { dimColor: true, children: [
          "\n",
          "Press ",
          /* @__PURE__ */ jsx11(Text11, { bold: true, color: "cyan", children: "[s]" }),
          " to sign in via sfvibe.fun."
        ] }),
        authMessage ? /* @__PURE__ */ jsxs11(Text11, { dimColor: true, children: [
          "\n",
          authMessage
        ] }) : null
      ] })
    ] });
  }
  if (authState === "error") {
    return /* @__PURE__ */ jsxs11(Box11, { paddingX: 2, paddingY: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx11(Box11, { marginBottom: 1, children: /* @__PURE__ */ jsx11(Text11, { bold: true, children: " COMMUNITY" }) }),
      /* @__PURE__ */ jsx11(Text11, { color: "red", children: authMessage }),
      /* @__PURE__ */ jsxs11(Text11, { dimColor: true, children: [
        "\n",
        "Press ",
        /* @__PURE__ */ jsx11(Text11, { bold: true, color: "cyan", children: "[s]" }),
        " to retry."
      ] })
    ] });
  }
  if (authState === "authenticating") {
    return /* @__PURE__ */ jsxs11(Box11, { paddingX: 2, paddingY: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsx11(Box11, { marginBottom: 1, children: /* @__PURE__ */ jsx11(Text11, { bold: true, children: " COMMUNITY" }) }),
      /* @__PURE__ */ jsx11(Text11, { color: "cyan", children: "Signing in..." }),
      /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: authMessage }),
      /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "Complete the sign-in in your browser. Polling for confirmation..." }),
      /* @__PURE__ */ jsxs11(Text11, { dimColor: true, children: [
        "\n",
        "Press ",
        /* @__PURE__ */ jsx11(Text11, { bold: true, color: "yellow", children: "[c]" }),
        " to cancel."
      ] })
    ] });
  }
  if (loading) {
    return /* @__PURE__ */ jsx11(Box11, { paddingX: 2, paddingY: 1, children: /* @__PURE__ */ jsx11(Text11, { children: "Loading community data..." }) });
  }
  if (error || !overview) {
    return /* @__PURE__ */ jsxs11(Box11, { paddingX: 2, paddingY: 1, flexDirection: "column", children: [
      /* @__PURE__ */ jsxs11(Text11, { color: "yellow", children: [
        "Community dashboard unavailable: ",
        error || "No data"
      ] }),
      /* @__PURE__ */ jsxs11(Text11, { dimColor: true, children: [
        "\n",
        "Server: ",
        serverUrl
      ] })
    ] });
  }
  const modelDist = overview.model_distribution || {};
  const modelBars = Object.entries(modelDist).map(([name, pct]) => ({
    label: name.charAt(0).toUpperCase() + name.slice(1),
    value: pct,
    color: name === "opus" ? "magenta" : name === "sonnet" ? "cyan" : "green"
  }));
  const throughputValues = (overview.hourly_throughput || []).map((h) => h.tokens || h.total_tokens || 0);
  const BADGE_EMOJI = {
    token_volume: "\u{1F525}",
    cache_master: "\u{1F48E}",
    parallel_pro: "\u26A1",
    code_velocity: "\u{1F680}",
    marathon_runner: "\u{1F3C3}",
    first_report: "\u{1F31F}"
  };
  const lbRows = leaderboard.slice(0, 10).map((e) => ({
    rank: `#${e.rank}`,
    username: e.username,
    badges: (e.badges || []).map((b) => BADGE_EMOJI[b] || "").join(""),
    tokens: fmtTokens(e.value),
    pct: `P${Math.round(e.percentile)}`
  }));
  return /* @__PURE__ */ jsxs11(Box11, { flexDirection: "column", paddingX: 1, children: [
    /* @__PURE__ */ jsxs11(Box11, { marginBottom: 1, justifyContent: "space-between", children: [
      /* @__PURE__ */ jsxs11(Box11, { children: [
        /* @__PURE__ */ jsx11(Text11, { bold: true, children: " COMMUNITY DASHBOARD" }),
        /* @__PURE__ */ jsxs11(Text11, { dimColor: true, children: [
          "  ",
          overview.total_users,
          " active contributors (24h)"
        ] })
      ] }),
      /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "[o] Logout" })
    ] }),
    /* @__PURE__ */ jsx11(Box11, { marginLeft: 1, marginBottom: 1, flexDirection: "column", children: /* @__PURE__ */ jsxs11(Box11, { children: [
      /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "Total Tokens: " }),
      /* @__PURE__ */ jsx11(Text11, { bold: true, children: fmtTokens(overview.total_tokens) }),
      /* @__PURE__ */ jsx11(Text11, { children: "  " }),
      /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "Sessions: " }),
      /* @__PURE__ */ jsx11(Text11, { bold: true, children: overview.total_sessions }),
      /* @__PURE__ */ jsx11(Text11, { children: "  " }),
      /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "Cache: " }),
      /* @__PURE__ */ jsx11(Text11, { bold: true, color: "green", children: fmtPct(overview.avg_cache_hit_rate) }),
      /* @__PURE__ */ jsx11(Text11, { children: "  " }),
      /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "Parallel: " }),
      /* @__PURE__ */ jsx11(Text11, { bold: true, children: overview.avg_concurrent_sessions.toFixed(1) })
    ] }) }),
    throughputValues.length > 0 && /* @__PURE__ */ jsx11(Box11, { flexDirection: "column", marginLeft: 1, marginBottom: 1, children: /* @__PURE__ */ jsx11(
      Sparkline,
      {
        data: throughputValues,
        width: 50,
        color: "cyan",
        label: "COMMUNITY TOKEN THROUGHPUT (24h)",
        formatValue: (v) => fmtTokens(v)
      }
    ) }),
    modelBars.length > 0 && /* @__PURE__ */ jsxs11(Box11, { flexDirection: "column", marginLeft: 1, marginBottom: 1, children: [
      /* @__PURE__ */ jsx11(Text11, { bold: true, children: "MODEL ADOPTION" }),
      /* @__PURE__ */ jsx11(Box11, { marginLeft: 1, children: /* @__PURE__ */ jsx11(BarChart, { data: modelBars, maxWidth: 30, showValues: true }) })
    ] }),
    /* @__PURE__ */ jsxs11(Box11, { flexDirection: "column", marginLeft: 1, children: [
      /* @__PURE__ */ jsx11(Text11, { bold: true, children: "LEADERBOARD (24h tokens, opt-in)" }),
      /* @__PURE__ */ jsx11(Box11, { marginLeft: 1, children: /* @__PURE__ */ jsx11(
        Table,
        {
          columns: [
            { key: "rank", label: "#", width: 4 },
            { key: "username", label: "USER", width: 14 },
            { key: "badges", label: "BADGES", width: 8 },
            { key: "tokens", label: "TOKENS", width: 10, align: "right" },
            { key: "pct", label: "PCTL", width: 6, align: "right" }
          ],
          data: lbRows,
          maxRows: 10
        }
      ) })
    ] })
  ] });
}

// src/tui/app.tsx
import { jsx as jsx12, jsxs as jsxs12 } from "react/jsx-runtime";
var VIEWS = [
  { key: "1", name: "Overview", component: OverviewView },
  { key: "2", name: "Projects", component: ProjectsView },
  { key: "3", name: "Sessions", component: SessionsView },
  { key: "4", name: "Trends", component: TrendsView },
  { key: "5", name: "Community", component: CommunityView }
];
function App() {
  const { exit } = useApp();
  const [activeView, setActiveView] = useState7(0);
  const [refreshKey, setRefreshKey] = useState7(0);
  useInput5(
    useCallback2(
      (input) => {
        if (input === "q") {
          exit();
          return;
        }
        if (input === "r") {
          setRefreshKey((k) => k + 1);
          return;
        }
        const viewIdx = parseInt(input) - 1;
        if (viewIdx >= 0 && viewIdx < VIEWS.length) {
          setActiveView(viewIdx);
        }
      },
      [exit]
    )
  );
  const current = VIEWS[activeView];
  const ViewComponent = current.component;
  return /* @__PURE__ */ jsxs12(Box12, { flexDirection: "column", children: [
    /* @__PURE__ */ jsxs12(
      Box12,
      {
        borderStyle: "double",
        borderColor: "gray",
        paddingX: 1,
        justifyContent: "space-between",
        children: [
          /* @__PURE__ */ jsx12(Text12, { bold: true, color: "cyan", children: "token-burningman v0.1.0" }),
          /* @__PURE__ */ jsxs12(Text12, { dimColor: true, children: [
            (/* @__PURE__ */ new Date()).toLocaleDateString(),
            " ",
            (/* @__PURE__ */ new Date()).toLocaleTimeString()
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx12(Box12, { flexDirection: "column", minHeight: 20, children: ViewComponent ? /* @__PURE__ */ jsx12(ViewComponent, {}, refreshKey) : /* @__PURE__ */ jsx12(Box12, { paddingX: 2, paddingY: 2, children: /* @__PURE__ */ jsxs12(Text12, { dimColor: true, children: [
      current.name,
      " \u2014 Coming in Phase 2/3. Press 1 or 3 for available views."
    ] }) }) }),
    /* @__PURE__ */ jsxs12(Box12, { borderStyle: "single", borderColor: "gray", paddingX: 1, children: [
      VIEWS.map((v, i) => /* @__PURE__ */ jsxs12(React6.Fragment, { children: [
        i > 0 && /* @__PURE__ */ jsx12(Text12, { children: " " }),
        i === activeView ? /* @__PURE__ */ jsxs12(Text12, { bold: true, color: "cyan", children: [
          "[",
          v.key,
          "]",
          v.name
        ] }) : /* @__PURE__ */ jsxs12(Text12, { dimColor: true, children: [
          "[",
          v.key,
          "]",
          v.name
        ] })
      ] }, v.key)),
      /* @__PURE__ */ jsx12(Text12, { children: "  " }),
      /* @__PURE__ */ jsx12(Text12, { dimColor: true, children: "[q]Quit [r]Refresh [?]Help" })
    ] })
  ] });
}

// src/tui/entry.tsx
import { jsx as jsx13 } from "react/jsx-runtime";
var args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`burningman \u2014 Token usage analytics for Claude Code (v0.1.0)

Usage:
  burningman [options]

Options:
  --help, -h       Show this help message
  --version, -v    Show version number

Navigation:
  1-5    Switch views (Overview, Projects, Sessions, Trends, Community)
  q      Quit
  r      Refresh data
  [ ]    Change time range (Sessions view)
`);
  process.exit(0);
}
if (args.includes("--version") || args.includes("-v")) {
  console.log("burningman v0.1.0");
  process.exit(0);
}
ensureStorageDirs();
process.stdout.write("\x1B[?1049h");
process.stdout.write("\x1B[H");
var instance = render(/* @__PURE__ */ jsx13(App, {}));
instance.waitUntilExit().then(() => {
  process.stdout.write("\x1B[?1049l");
});

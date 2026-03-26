import { useState, useEffect } from "react";
import type { SessionEntry, HourlyAggregate } from "../../types.js";
import {
  listSessionFiles,
  sessionIdFromPath,
  readJsonl,
  readJson,
  getHourlyFilePath,
} from "../../utils/storage.js";

interface SessionSummary {
  id: string;
  model: string;
  proj: string;
  startTime: number;
  endTime: number;
  totalInput: number;
  totalOutput: number;
  cost: number;
  peakCtx: number;
  linesAdded: number;
  linesRemoved: number;
  cacheRead: number;
  inputTokens: number;
  entryCount: number;
  isActive: boolean;
}

interface SessionData {
  sessions: SessionSummary[];
  todayHourly: HourlyAggregate;
  isLoading: boolean;
}

const ACTIVE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function summarizeSession(filePath: string, now: number): SessionSummary | null {
  const entries = readJsonl<SessionEntry>(filePath);
  if (entries.length === 0) return null;

  const first = entries[0];
  const last = entries[entries.length - 1];

  let peakCtx = 0;
  let totalCacheRead = 0;
  let totalInput = 0;
  for (const e of entries) {
    if (e.ctx > peakCtx) peakCtx = e.ctx;
    totalCacheRead += e.cr;
    totalInput += e.in;
  }

  return {
    id: sessionIdFromPath(filePath),
    model: last.model,
    proj: last.proj,
    startTime: first.t,
    endTime: last.t,
    totalInput: last.tin,
    totalOutput: last.tout,
    cost: last.cost,
    peakCtx,
    linesAdded: last.la,
    linesRemoved: last.lr,
    cacheRead: totalCacheRead,
    inputTokens: totalInput,
    entryCount: entries.length,
    isActive: now - last.t < ACTIVE_THRESHOLD_MS,
  };
}

function todayDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useSessionData(refreshIntervalSec: number = 5): SessionData {
  const [data, setData] = useState<SessionData>({
    sessions: [],
    todayHourly: {},
    isLoading: true,
  });

  useEffect(() => {
    function load() {
      const now = Date.now();
      const files = listSessionFiles();
      const sessions: SessionSummary[] = [];

      for (const f of files) {
        const summary = summarizeSession(f, now);
        if (summary) sessions.push(summary);
      }

      // Sort by most recent first
      sessions.sort((a, b) => b.endTime - a.endTime);

      const todayHourly = readJson<HourlyAggregate>(
        getHourlyFilePath(todayDateStr()),
        {},
      );

      setData({ sessions, todayHourly, isLoading: false });
    }

    load();
    const interval = setInterval(load, refreshIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [refreshIntervalSec]);

  return data;
}

import type { HeatmapCell, ProjectStat } from "../types.js";

export interface SessionSummary {
  id: string;
  model: string;
  modelLabel: string;
  proj: string;
  startTime: number;
  endTime: number;
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  cost: number;
  peakCtx: number;
  linesAdded: number;
  linesRemoved: number;
  cacheRead: number;
  inputTokens: number;
  entryCount: number;
  isActive: boolean;
}

export interface QuotaSummary {
  fiveHourPct: number | null;
  fiveHourResetsAt: string | null;
  sevenDayPct: number | null;
  sevenDayResetsAt: string | null;
}

export interface OverviewHourlyBar {
  hour: string;
  totalTokens: number;
  models: Array<{
    model: string;
    modelLabel: string;
    tokens: number;
  }>;
}

export interface OverviewViewModel {
  generatedAt: number;
  totals: {
    totalTokens: number;
    totalCost: number;
    sessionCount: number;
    activeSessionCount: number;
    cacheHitRate: number;
    linesAdded: number;
    linesRemoved: number;
  };
  hourly: OverviewHourlyBar[];
  quota: QuotaSummary | null;
  activeSessions: SessionSummary[];
}

export interface SessionsViewModel {
  generatedAt: number;
  range: "24h" | "48h" | "7d";
  sessions: SessionSummary[];
  durationBuckets: Array<{
    label: string;
    count: number;
  }>;
  sweetSpot: string;
}

export interface ProjectsViewModel {
  generatedAt: number;
  rangeDays: number;
  projects: ProjectStat[];
}

export interface TrendsViewModel {
  generatedAt: number;
  rangeDays: number;
  daily: Array<{
    date: string;
    totalTokens: number;
    cost: number;
    cacheRate: number;
    velocity: number;
    linesChanged: number;
    sessionCount: number;
  }>;
  cacheRates: Array<{
    date: string;
    rate: number;
  }>;
  heatmap: HeatmapCell[];
  productivity: {
    currentVelocity: number;
    velocity7: number;
    velocity30: number;
    trendLabel: string;
  };
}

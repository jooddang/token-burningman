// Statusline stdin JSON from Claude Code
export interface StatuslineInput {
  hook_event_name: "Status";
  session_id: string;
  cwd: string;
  model: {
    id: string;
    display_name: string;
  };
  workspace: {
    current_dir: string;
    project_dir: string;
  };
  cost: {
    total_cost_usd: number;
    total_lines_added: number;
    total_lines_removed: number;
  };
  context_window: {
    used_percentage: number;
    remaining_percentage: number;
    context_window_size: number;
    current_usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens: number;
      cache_creation_input_tokens: number;
    } | null;
    total_input_tokens: number;
    total_output_tokens: number;
  };
  version: string;
}

// Compact JSONL entry persisted per statusline invocation
export interface SessionEntry {
  t: number;       // timestamp ms
  sid: string;     // session id (first 12 chars)
  model: string;   // model.id
  proj: string;    // project directory basename
  in: number;      // current context input tokens
  out: number;     // current context output tokens
  cr: number;      // cache read tokens
  cc: number;      // cache creation tokens
  tin: number;     // session cumulative input
  tout: number;    // session cumulative output
  ctx: number;     // context window used %
  ctxMax: number;  // context window size
  cost: number;    // session cumulative cost USD
  la: number;      // session cumulative lines added
  lr: number;      // session cumulative lines removed
}

// Delta between consecutive session entries
export interface DeltaEntry {
  t: number;
  sid: string;
  model: string;
  proj: string;
  inputDelta: number;
  outputDelta: number;
  costDelta: number;
  lineAddedDelta: number;
  lineRemovedDelta: number;
  // Snapshot values (not deltas)
  in: number;
  out: number;
  cr: number;
  cc: number;
  ctx: number;
  ctxMax: number;
}

// Per-model bucket within an hourly aggregate
export interface HourlyBucket {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
  cost: number;
  requests: number;
  linesAdded: number;
  linesRemoved: number;
  sessions: string[];
  avgContextPct: number;
}

// Hourly aggregate for one day: hour -> model -> bucket
export interface HourlyAggregate {
  [hour: string]: {
    [model: string]: HourlyBucket;
  };
}

// Aggregation progress tracker
export interface AggregationMeta {
  [sessionId: string]: number; // last processed line index
}

// Quota state from OAuth usage API
export interface QuotaState {
  lastFetchedAt: number;
  five_hour: { utilization: number; resets_at: string } | null;
  seven_day: { utilization: number; resets_at: string } | null;
}

// Per-project analytics summary
export interface ProjectStat {
  project: string;
  totalTokens: number;
  cost: number;
  sessionCount: number;
  cacheHitRate: number;
  linesAdded: number;
  linesRemoved: number;
  modelMix: Record<string, number>; // model -> percentage
}

// Daily aggregate for trend views
export interface DailyStat {
  date: string;
  totalTokens: number;
  cost: number;
  cacheRate: number;
  velocity: number; // tokens per line
  linesChanged: number;
  sessionCount: number;
}

// Heatmap cell for weekly activity view
export interface HeatmapCell {
  day: number;   // 0=Sun, 6=Sat
  hour: number;  // 0-23
  value: number; // token count or intensity
}

export interface Config {
  version: number;
  publicReporting: {
    enabled: boolean;
    serverUrl: string;
    cliToken: string | null;
  };
  display: {
    statuslineFormat: "full" | "compact" | "minimal" | "off";
    currency: string;
    timezone: string;
    colorScheme: "auto" | "dark" | "light" | "mono";
  };
  collection: {
    enabled: boolean;
    quotaPollingIntervalMin: number;
    hourlyMaintenanceIntervalMin: number;
    sessionRetentionDays: number;
    archiveAfterDays: number;
  };
  alerts: {
    quotaWarningThreshold: number;
    costDailyBudget: number | null;
    contextWarningPct: number;
  };
  tui: {
    defaultView: string;
    refreshIntervalSec: number;
    compactMode: boolean;
  };
}

export const DEFAULT_CONFIG: Config = {
  version: 1,
  publicReporting: {
    enabled: false,
    serverUrl: "https://sfvibe.fun/api/burningman",
    cliToken: null,
  },
  display: {
    statuslineFormat: "full",
    currency: "USD",
    timezone: "system",
    colorScheme: "auto",
  },
  collection: {
    enabled: true,
    quotaPollingIntervalMin: 60,
    hourlyMaintenanceIntervalMin: 60,
    sessionRetentionDays: 90,
    archiveAfterDays: 30,
  },
  alerts: {
    quotaWarningThreshold: 0.8,
    costDailyBudget: null,
    contextWarningPct: 75,
  },
  tui: {
    defaultView: "overview",
    refreshIntervalSec: 5,
    compactMode: false,
  },
};

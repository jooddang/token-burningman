import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { BarChart } from "../components/bar-chart.js";
import { Table } from "../components/table.js";
import { Sparkline } from "../components/sparkline.js";
import { useConfig } from "../hooks/use-config.js";
import { fmtTokens, fmtPct } from "../../utils/format.js";
import { isAuthenticated, authenticateCli } from "../../auth.js";

interface CommunityData {
  total_tokens: number;
  total_users: number;
  total_sessions: number;
  model_distribution: Record<string, number>;
  hourly_throughput: { hour: string; tokens: number; users: number }[];
  avg_cache_hit_rate: number;
  avg_concurrent_sessions: number;
  total_lines_changed: number;
  total_cost_usd: number;
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  value: number;
  percentile: number;
  badges?: string[];
}

type AuthState = "checking" | "unauthenticated" | "authenticating" | "authenticated" | "error";

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const mod = url.startsWith("https") ? await import("node:https") : await import("node:http");
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const req = (mod as typeof import("node:https")).request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (url.startsWith("https") ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: "GET",
          timeout: 5000,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          res.on("end", () => {
            try { resolve(JSON.parse(body) as T); } catch { resolve(null); }
          });
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => { req.destroy(); resolve(null); });
      req.end();
    });
  } catch {
    return null;
  }
}

export function CommunityView() {
  const config = useConfig();
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authMessage, setAuthMessage] = useState("");
  const [overview, setOverview] = useState<CommunityData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const serverUrl = config.publicReporting?.serverUrl || "https://sfvibe.fun/api/burningman";

  // Check auth state on mount
  useEffect(() => {
    if (isAuthenticated(config)) {
      setAuthState("authenticated");
    } else {
      setAuthState("unauthenticated");
    }
  }, [config.publicReporting?.cliToken]);

  // Load community data when authenticated (or always for public data)
  useEffect(() => {
    if (authState !== "authenticated") return;

    async function load() {
      setLoading(true);
      const ov = await fetchJson<CommunityData>(`${serverUrl}/community/overview?range=24h`);
      if (!ov) {
        setError("Cannot connect to community server");
        setLoading(false);
        return;
      }
      setOverview(ov);

      const lb = await fetchJson<{ entries: LeaderboardEntry[] }>(
        `${serverUrl}/community/leaderboard?category=tokens&range=24h`,
      );
      if (lb) setLeaderboard(lb.entries || []);
      setLoading(false);
    }

    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [serverUrl, authState]);

  // Key handlers
  useInput(
    useCallback(
      (input: string) => {
        // [s] Sign in — when unauthenticated or error
        if (input === "s" && (authState === "unauthenticated" || authState === "error")) {
          setAuthState("authenticating");
          setAuthMessage("Opening browser...");
          // Ensure config file exists (picks up BURNINGMAN_SERVER_URL env)
          import("../../setup.js").then(({ ensureConfig }) => {
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

        // [c] Cancel — when authenticating (stuck), go back to unauthenticated
        if (input === "c" && authState === "authenticating") {
          setAuthState("unauthenticated");
          setAuthMessage("Cancelled. Press [s] to try again.");
        }

        // [o] Logout — when authenticated
        if (input === "o" && authState === "authenticated") {
          import("../../utils/storage.js").then(({ getConfigPath, readJson, writeJsonAtomic }) => {
            import("../../types.js").then(({ DEFAULT_CONFIG }) => {
              const cfg = readJson(getConfigPath(), DEFAULT_CONFIG);
              (cfg as any).publicReporting.cliToken = null;
              (cfg as any).publicReporting.enabled = false;
              writeJsonAtomic(getConfigPath(), cfg);
              setAuthState("unauthenticated");
              setAuthMessage("Logged out. Press [s] to sign in again.");
              setOverview(null);
              setLeaderboard([]);
            });
          });
        }
      },
      [authState, config],
    ),
  );

  // ─── AUTH GATE ─────────────────────────────────────────────────
  if (authState === "checking") {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text dimColor>{authMessage || "Checking account status..."}</Text>
      </Box>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <Box paddingX={2} paddingY={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold> COMMUNITY</Text>
        </Box>
        <Box flexDirection="column" marginLeft={1}>
          <Text color="yellow">Not signed in to the community server.</Text>
          <Text dimColor>
            {"\n"}Press <Text bold color="cyan">[s]</Text> to sign in via sfvibe.fun.
          </Text>
          {authMessage ? <Text dimColor>{"\n"}{authMessage}</Text> : null}
        </Box>
      </Box>
    );
  }

  if (authState === "error") {
    return (
      <Box paddingX={2} paddingY={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold> COMMUNITY</Text>
        </Box>
        <Text color="red">{authMessage}</Text>
        <Text dimColor>
          {"\n"}Press <Text bold color="cyan">[s]</Text> to retry.
        </Text>
      </Box>
    );
  }

  if (authState === "authenticating") {
    return (
      <Box paddingX={2} paddingY={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold> COMMUNITY</Text>
        </Box>
        <Text color="cyan">Signing in...</Text>
        <Text dimColor>{authMessage}</Text>
        <Text dimColor>Complete the sign-in in your browser. Polling for confirmation...</Text>
        <Text dimColor>{"\n"}Press <Text bold color="yellow">[c]</Text> to cancel.</Text>
      </Box>
    );
  }

  // ─── AUTHENTICATED: FULL COMMUNITY DASHBOARD ───────────────────
  if (loading) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text>Loading community data...</Text>
      </Box>
    );
  }

  if (error || !overview) {
    return (
      <Box paddingX={2} paddingY={1} flexDirection="column">
        <Text color="yellow">
          Community dashboard unavailable: {error || "No data"}
        </Text>
        <Text dimColor>
          {"\n"}Server: {serverUrl}
        </Text>
      </Box>
    );
  }

  const modelDist = overview.model_distribution || {};
  const modelBars = Object.entries(modelDist).map(([name, pct]) => ({
    label: name.charAt(0).toUpperCase() + name.slice(1),
    value: pct,
    color: name === "opus" ? "magenta" : name === "sonnet" ? "cyan" : "green",
  }));

  const throughputValues = (overview.hourly_throughput || []).map((h) => h.tokens || (h as any).total_tokens || 0);

  const BADGE_EMOJI: Record<string, string> = {
    token_volume: "🔥",
    cache_master: "💎",
    parallel_pro: "⚡",
    code_velocity: "🚀",
    marathon_runner: "🏃",
    first_report: "🌟",
  };

  const lbRows = leaderboard.slice(0, 10).map((e) => ({
    rank: `#${e.rank}`,
    username: e.username,
    badges: (e.badges || []).map((b: string) => BADGE_EMOJI[b] || "").join(""),
    tokens: fmtTokens(e.value),
    pct: `P${Math.round(e.percentile)}`,
  }));

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Box>
          <Text bold> COMMUNITY DASHBOARD</Text>
          <Text dimColor>  {overview.total_users} active contributors (24h)</Text>
        </Box>
        <Text dimColor>[o] Logout</Text>
      </Box>

      {/* KPIs */}
      <Box marginLeft={1} marginBottom={1} flexDirection="column">
        <Box>
          <Text dimColor>Total Tokens: </Text>
          <Text bold>{fmtTokens(overview.total_tokens)}</Text>
          <Text>  </Text>
          <Text dimColor>Sessions: </Text>
          <Text bold>{overview.total_sessions}</Text>
          <Text>  </Text>
          <Text dimColor>Cache: </Text>
          <Text bold color="green">{fmtPct(overview.avg_cache_hit_rate)}</Text>
          <Text>  </Text>
          <Text dimColor>Parallel: </Text>
          <Text bold>{overview.avg_concurrent_sessions.toFixed(1)}</Text>
        </Box>
      </Box>

      {/* Token Throughput */}
      {throughputValues.length > 0 && (
        <Box flexDirection="column" marginLeft={1} marginBottom={1}>
          <Sparkline
            data={throughputValues}
            width={50}
            color="cyan"
            label="COMMUNITY TOKEN THROUGHPUT (24h)"
            formatValue={(v) => fmtTokens(v)}
          />
        </Box>
      )}

      {/* Model Distribution */}
      {modelBars.length > 0 && (
        <Box flexDirection="column" marginLeft={1} marginBottom={1}>
          <Text bold>MODEL ADOPTION</Text>
          <Box marginLeft={1}>
            <BarChart data={modelBars} maxWidth={30} showValues />
          </Box>
        </Box>
      )}

      {/* Leaderboard */}
      <Box flexDirection="column" marginLeft={1}>
        <Text bold>LEADERBOARD (24h tokens, opt-in)</Text>
        <Box marginLeft={1}>
          <Table
            columns={[
              { key: "rank", label: "#", width: 4 },
              { key: "username", label: "USER", width: 14 },
              { key: "badges", label: "BADGES", width: 8 },
              { key: "tokens", label: "TOKENS", width: 10, align: "right" },
              { key: "pct", label: "PCTL", width: 6, align: "right" },
            ]}
            data={lbRows}
            maxRows={10}
          />
        </Box>
      </Box>
    </Box>
  );
}

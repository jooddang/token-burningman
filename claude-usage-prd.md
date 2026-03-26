# claude-usage: Product Requirements Document

**Version**: 0.1.0-draft
**Author**: Eun (CTO)
**Date**: 2026-03-22
**Status**: Draft for Review

---

## 1. Executive Summary

claude-usage is a Claude Code plugin that collects token usage telemetry from local sessions, provides rich TUI-based analytics for personal workflow optimization, and optionally shares anonymized aggregate data to a public community dashboard.

Two-layer architecture:

- **Local Layer**: Granular, per-session, per-project, per-model analytics rendered in a terminal TUI. Zero network dependency. The user sees their own work patterns, cost breakdown, cache efficiency, and productivity metrics.
- **Public Layer**: Opt-in, privacy-safe, hourly-bucketed aggregate data submitted to a community API. Users claim a unique handle and see how their usage compares to the community.

Target audience: Claude Code power users running Pro/Max subscriptions or API keys, particularly developers in the vibe coding community who run multiple parallel sessions across projects.

---

## 2. Problem Statement

Claude Code users currently have no way to:

1. Track token consumption across sessions, projects, and time periods
2. Understand their prompt caching efficiency
3. See cost breakdown by model and project
4. Identify peak productivity hours and optimal session lengths
5. Compare their usage patterns with the broader community
6. Know when they are approaching rate limits without manual /usage checks

The /usage command is ephemeral. Statusline tools show real-time snapshots but do not persist historical data. No tool provides cross-session analytics or community-level aggregates.

---

## 3. System Architecture

### 3.1 High-Level Data Flow

```
Claude Code Session(s)
        |
        | stdin JSON (every message change, ~300ms throttle)
        v
+---------------------------+
| Statusline Collector      |  <-- ~/.claude/settings.json: statusLine command
| (collector.ts)            |
|                           |
| 1. Parse stdin JSON       |
| 2. Extract usage fields   |
| 3. Append to session JSONL|
| 4. Display statusline     |
| 5. Maybe fetch quota      |
+---------------------------+
        |
        | Append-only JSONL per session
        v
+---------------------------+
| Local Storage             |
| ~/.claude-usage/          |
|   sessions/*.jsonl        |
|   hourly/*.json           |
|   quota/state.json        |
|   config.json             |
+---------------------------+
        |                          |
        | (local only)             | (opt-in, hourly batch)
        v                          v
+----------------+      +--------------------+
| TUI Dashboard  |      | Public API         |
| (tui.ts)       |      | POST /v1/report    |
| blessed/ink    |      | GET /v1/community  |
+----------------+      +--------------------+
```

### 3.2 Why Statusline, Not Hooks

Decision log:

| Approach | session_id | token data | trigger frequency | content exposure |
|----------|-----------|------------|-------------------|-----------------|
| Statusline command | Yes (stdin JSON) | Yes (full context_window) | Every message change | None |
| PostToolUse hook | Not guaranteed | Not available (issue #11008) | Every tool call | tool_input exposed |
| Stop hook | Not guaranteed (issue #36678) | Partial | Every response | None |
| SessionEnd hook | Not guaranteed | Last state only | Once | None |

Statusline command is the only mechanism that provides both session_id and full token data on every interaction, with zero content exposure.

The statusline script runs in the same process context as the session, receives JSON on stdin, and must output a single formatted line to stdout. Our collector intercepts this flow: parse -> persist -> format -> output.

### 3.3 Data Sources

**Source A: Statusline stdin JSON (per-session, real-time)**

```json
{
  "hook_event_name": "Status",
  "session_id": "abc123...",
  "cwd": "/home/user/project",
  "model": {
    "id": "claude-opus-4-6",
    "display_name": "Opus"
  },
  "workspace": {
    "current_dir": "/home/user/project",
    "project_dir": "/home/user/project"
  },
  "cost": {
    "total_cost_usd": 0.47,
    "total_lines_added": 156,
    "total_lines_removed": 23
  },
  "context_window": {
    "used_percentage": 37.2,
    "context_window_size": 200000,
    "current_usage": {
      "input_tokens": 45230,
      "output_tokens": 12840,
      "cache_read_input_tokens": 18400,
      "cache_creation_input_tokens": 3200
    },
    "total_input_tokens": 145000,
    "total_output_tokens": 42000
  },
  "version": "2.1.0"
}
```

Fields are cumulative within a session. Delta calculation is required for time-series analytics.

**Source B: /api/oauth/usage (account-level, polled)**

```
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer {oauth_token}
anthropic-beta: oauth-2025-04-20

Response:
{
  "five_hour": { "utilization": 0.42, "resets_at": "2026-03-22T18:00:00Z" },
  "seven_day": { "utilization": 0.67, "resets_at": "2026-03-25T14:00:00Z" }
}
```

Undocumented endpoint. Rate limited (observed: aggressive 429 on frequent calls). Stateless -- always returns current account-level utilization regardless of which session calls it.

Constraints:
- OAuth token only (Pro/Max subscribers). API key users get no data here.
- Rate limit on the endpoint itself: maximum 1 call per 5 minutes recommended.
- The OAuth token is stored in macOS Keychain ("Claude Code-credentials") or ~/.claude/.credentials.json on Linux.

**Source C: API Response Headers (per-request, not exposed)**

Every API response includes headers like anthropic-ratelimit-unified-7d-utilization but Claude Code does not pass these to statusline or hooks. Tracked in issues #34074, #27915, #35672. When/if exposed, this becomes the most accurate real-time quota source.

---

## 4. Local Storage Schema

### 4.1 Directory Structure

```
~/.claude-usage/
  config.json                   # User configuration
  sessions/
    {session_id}.jsonl           # Per-session time series (append-only)
  hourly/
    {YYYY-MM-DD}.json            # Pre-aggregated hourly buckets per day
  quota/
    fetch.lock                   # Advisory file lock for cross-session coordination
    state.json                   # Last fetch timestamp + cached quota
    history.jsonl                # Quota snapshots over time
  archive/
    {session_id}.jsonl           # Archived sessions (after aggregation)
```

### 4.2 Session JSONL Entry

Each statusline invocation appends one line:

```json
{
  "t": 1711100520000,
  "sid": "abc123",
  "model": "claude-opus-4-6",
  "proj": "wasder-fhe",
  "in": 45230,
  "out": 12840,
  "cr": 18400,
  "cc": 3200,
  "tin": 145000,
  "tout": 42000,
  "ctx": 37.2,
  "ctxMax": 200000,
  "cost": 0.47,
  "la": 156,
  "lr": 23
}
```

Field descriptions:

| Field | Source | Description |
|-------|--------|-------------|
| t | Date.now() | Timestamp in ms |
| sid | session_id | Claude Code session identifier |
| model | model.id | Model identifier string |
| proj | derived from workspace.project_dir | Project directory basename (local only, never transmitted) |
| in | current_usage.input_tokens | Current context input tokens |
| out | current_usage.output_tokens | Current context output tokens |
| cr | current_usage.cache_read_input_tokens | Cache read tokens |
| cc | current_usage.cache_creation_input_tokens | Cache creation tokens |
| tin | total_input_tokens | Session cumulative input |
| tout | total_output_tokens | Session cumulative output |
| ctx | used_percentage | Context window utilization % |
| ctxMax | context_window_size | Context window size |
| cost | total_cost_usd | Session cumulative cost |
| la | total_lines_added | Session cumulative lines added |
| lr | total_lines_removed | Session cumulative lines removed |

Estimated storage: ~200 bytes/entry * ~120 entries/hour * 8 hours = ~192KB/day. Monthly: ~5.7MB. Acceptable without rotation for months.

### 4.3 Hourly Aggregate JSON

Computed on SessionEnd or on-demand by TUI. One file per day.

```json
{
  "2026-03-22": {
    "9": {
      "claude-opus-4-6": {
        "input": 145000,
        "output": 42000,
        "cacheRead": 68000,
        "cacheCreate": 7200,
        "cost": 2.31,
        "requests": 15,
        "linesAdded": 342,
        "linesRemoved": 87,
        "sessions": ["abc123", "def456"],
        "avgContextPct": 45
      },
      "claude-sonnet-4-6": { ... }
    },
    "10": { ... }
  }
}
```

### 4.4 Config JSON

```json
{
  "version": 1,
  "username": "eunkwang",
  "publicReporting": {
    "enabled": true,
    "serverUrl": "https://api.claude-usage.dev/v1",
    "userHash": "sha256(machine_id + install_salt)",
    "salt": "random_32_bytes_hex"
  },
  "display": {
    "statuslineFormat": "full",
    "currency": "USD",
    "timezone": "America/Los_Angeles",
    "colorScheme": "auto"
  },
  "collection": {
    "enabled": true,
    "quotaPollingIntervalMin": 60,
    "sessionRetentionDays": 90,
    "archiveAfterDays": 30
  },
  "alerts": {
    "quotaWarningThreshold": 0.8,
    "costDailyBudget": null,
    "contextWarningPct": 75
  },
  "tui": {
    "defaultView": "overview",
    "refreshIntervalSec": 5,
    "compactMode": false
  }
}
```

---

## 5. Collector Implementation

### 5.1 Statusline Integration

settings.json registration:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude-usage/bin/collector.js",
    "padding": 0
  }
}
```

### 5.2 Collector Pseudocode

```
function main():
  stdinJson = readAll(stdin)
  parsed = JSON.parse(stdinJson)
  
  // 1. Extract and persist
  entry = extractEntry(parsed)
  appendToSessionFile(entry.sid, entry)
  
  // 2. Maybe update quota (rate-limited, cross-session safe)
  if shouldFetchQuota():
    quota = fetchQuotaSafe()
  else:
    quota = readCachedQuota()
  
  // 3. Maybe submit public report (hourly batch)
  if publicReportingEnabled && shouldSubmitReport():
    submitPublicReport()
  
  // 4. Render statusline (must be fast, single line to stdout)
  line = formatStatusline(entry, quota)
  process.stdout.write(line)
```

### 5.3 Delta Calculation

Token values in statusline JSON are cumulative within a session. For time-series analytics, deltas must be computed.

```
function computeDelta(current, previous):
  if previous is null:
    return current  // first entry, use absolute values
  
  delta.input = current.tin - previous.tin
  delta.output = current.tout - previous.tout
  delta.cost = current.cost - previous.cost
  delta.linesAdded = current.la - previous.la
  delta.linesRemoved = current.lr - previous.lr
  
  // Negative delta = session reset (compact, /clear, new session)
  if delta.input < 0:
    // Treat current values as new baseline
    return { input: current.tin, output: current.tout, ... }
  
  return delta
```

### 5.4 Cross-Session Quota Coordination

Multiple concurrent sessions must not all call the OAuth usage API simultaneously. A file-lock-based coordinator ensures only one session fetches at a time.

```
function shouldFetchQuota():
  state = readQuotaState()
  elapsed = now() - state.lastFetchedAt
  if elapsed < config.quotaPollingIntervalMin * 60000:
    return false  // Too soon
  return true

function fetchQuotaSafe():
  fd = open(QUOTA_LOCK, 'w')
  if !tryLock(fd, LOCK_EX | LOCK_NB):
    return null  // Another session is fetching
  try:
    // Double-check after acquiring lock
    state = readQuotaState()
    if now() - state.lastFetchedAt < config.quotaPollingIntervalMin * 60000:
      return state.lastQuota  // Another session just finished
    
    quota = httpGet("https://api.anthropic.com/api/oauth/usage", oauthToken)
    if quota.error:
      return null  // API failure, try next cycle
    
    writeQuotaState({ lastFetchedAt: now(), lastQuota: quota })
    appendQuotaHistory(quota)
    return quota
  finally:
    unlock(fd)
    close(fd)
```

### 5.5 Hourly Aggregation

Triggered on SessionEnd hook (backup) and on-demand when TUI opens.

```
function aggregateSessionToHourly(sessionId):
  entries = readJsonl(sessions/{sessionId}.jsonl)
  if entries.length < 2: return
  
  for i = 1 to entries.length - 1:
    prev = entries[i-1]
    curr = entries[i]
    delta = computeDelta(curr, prev)
    
    dateKey = formatDate(curr.t, "YYYY-MM-DD")
    hourKey = getHour(curr.t).toString()
    modelKey = curr.model
    
    hourlyFile = hourly/{dateKey}.json
    data = readOrDefault(hourlyFile, {})
    bucket = data[hourKey][modelKey] || newBucket()
    
    bucket.input += delta.input
    bucket.output += delta.output
    bucket.cost += delta.cost
    // ... etc
    
    writeAtomic(hourlyFile, data)
```

### 5.6 Statusline Output Format

The collector must output exactly one line to stdout. Three format options configurable via /claude-usage:config.

**Full format** (default):
```
[Opus] $0.47 | 37% ctx | 5h:42% 7d:67% | +156/-23 | cache:58%
```

**Compact format**:
```
Opus $0.47 37% 5h:42%
```

**Minimal format**:
```
$0.47 37%
```

Color coding (ANSI escape sequences):
- Model name: Opus=magenta, Sonnet=cyan, Haiku=green
- Cost: yellow
- Context %: green (<50), yellow (50-75), red (>75)
- Quota: green (<60%), yellow (60-80%), red (>80%)
- Cache hit: green (>50%), yellow (30-50%), dim (<30%)

---

## 6. TUI Dashboard

### 6.1 Technology

Runtime: Bun (preferred) or Node.js
Framework: ink (React for CLI) with ink-ui components
Charts: cli-chart or custom box-drawing characters
Data: reads directly from ~/.claude-usage/ files

### 6.2 Launch

```bash
# From anywhere
claude-usage tui

# Or as a Claude Code slash command
/claude-usage:dashboard
```

### 6.3 Navigation

```
Tab key: cycle between panels
q: quit
r: refresh data
1-5: switch views
?: help overlay
/: filter (project, model, date range)
c: toggle compact/comfortable density
```

### 6.4 Views

**View 1: Overview (default)**

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  claude-usage v0.1.0                              eunkwang | 2026-03-22 ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║  TODAY           24H COST        SESSIONS    CACHE HIT    LINES CHANGED ║
║  1.2M tokens     $4.73           12          58.3%        +1,247 / -389 ║
║  ▲ 23% vs avg    ▲ vs $3.84      3 active    ▲ vs 51%                   ║
║                                                                         ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  HOURLY TOKEN USAGE (today)                                             ║
║                                                                         ║
║  250K ┤         ██                                                      ║
║  200K ┤    ▓▓▓▓▓██▓▓▓                                                   ║
║  150K ┤  ▓▓░░░░░██░░░▓▓▓                                                ║
║  100K ┤▓▓░░░░░░░██░░░░░░▓▓                                              ║
║   50K ┤░░░░░░░░░██░░░░░░░░░░                                            ║
║     0 ┤─────────────────────────                                        ║
║       8  9  10 11 12 13 14 15 16  (hour)                                ║
║                                                                         ║
║  ██ Opus  ▓▓ Sonnet  ░░ Haiku                                           ║
║                                                                         ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  ACTIVE SESSIONS                                                        ║
║                                                                         ║
║  #1  Opus    wasder-fhe          42% ctx   $1.23   47min  +89/-12       ║
║  #2  Sonnet  openclaw-hatchery   28% ctx   $0.34   23min  +156/-45      ║
║  #3  Sonnet  sfvibe-templates    15% ctx   $0.08   8min   +34/-2        ║
║                                                                         ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  QUOTA                                                                  ║
║  5-hour:  [████████░░░░░░░░░░░░] 42%   resets 5:42 PM                  ║
║  7-day:   [█████████████░░░░░░░] 67%   resets Mar 25                   ║
║                                                                         ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  [1]Overview [2]Projects [3]Sessions [4]Trends [5]Community     [?]Help ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

**View 2: Projects**

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  PROJECTS (last 7 days)                           sorted by: cost desc  ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║  PROJECT              TOKENS      COST     SESSIONS  CACHE%  LINES      ║
║  ─────────────────────────────────────────────────────────────────────   ║
║  wasder-fhe           4.2M        $18.47   34        62%     +3.2K/-890 ║
║  ████████████████████████████████████░░░░░                               ║
║                                                                         ║
║  openclaw-hatchery    2.8M        $8.34    22        55%     +2.1K/-445 ║
║  ████████████████████████░░░░░░░░░░░░░░░░                               ║
║                                                                         ║
║  sfvibe-templates     1.1M        $3.21    15        71%     +890/-120  ║
║  █████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                               ║
║                                                                         ║
║  klash-ai             680K        $2.10    8         48%     +540/-230  ║
║  ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                                ║
║                                                                         ║
║  personal             320K        $0.89    12        39%     +210/-45   ║
║  ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                                ║
║                                                                         ║
║  MODEL MIX BY PROJECT                                                   ║
║  wasder-fhe:       Opus 72%  Sonnet 28%                                 ║
║  openclaw-hatchery: Opus 15%  Sonnet 80%  Haiku 5%                      ║
║  sfvibe-templates:  Sonnet 95%  Haiku 5%                                ║
║                                                                         ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

**View 3: Sessions**

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  SESSION HISTORY (last 48h)                       filter: all projects  ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║  PARALLEL SESSIONS OVER TIME                                            ║
║  5 ┤                                                                    ║
║  4 ┤      ██                                                            ║
║  3 ┤   ██████ ██   ██                                                   ║
║  2 ┤ ████████████████████    ████                                       ║
║  1 ┤██████████████████████████████████████                              ║
║  0 ┤──────────────────────────────────────                              ║
║    Mar 21 8AM       4PM       Mar 22 8AM      4PM                       ║
║                                                                         ║
║  SESSION LOG                                                            ║
║  TIME          MODEL    PROJECT         DUR   TOKENS   COST   CTX-PEAK  ║
║  ─────────────────────────────────────────────────────────────────────   ║
║  14:23-now     Opus     wasder-fhe      47m   89K      $1.23  42%       ║
║  13:45-14:20   Sonnet   openclaw        35m   124K     $0.34  65%       ║
║  13:02-now     Sonnet   sfvibe          51m   210K     $0.67  28%       ║
║  11:30-12:45   Opus     wasder-fhe      75m   340K     $4.21  78% !     ║
║  10:15-11:28   Sonnet   klash-ai        73m   180K     $0.52  55%       ║
║  09:00-10:10   Opus     wasder-fhe      70m   290K     $3.89  71%       ║
║                                                                         ║
║  SESSION LENGTH DISTRIBUTION (last 30d)                                 ║
║  0-15m:  ███ 12%                                                        ║
║  15-30m: ████████ 28%                                                   ║
║  30-60m: ████████████ 35%    <-- sweet spot                             ║
║  60-90m: █████ 18%                                                      ║
║  90m+:   ██ 7%                                                          ║
║                                                                         ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

**View 4: Trends**

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  TRENDS (last 30 days)                              range: [7d] 30d 90d ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║  DAILY COST TREND                                                       ║
║  $8 ┤        *                                                          ║
║  $6 ┤   * *    *  *     *                                               ║
║  $4 ┤ *     *     * ** *  * *   *                                       ║
║  $2 ┤                        *  *  *                                    ║
║  $0 ┤──────────────────────────────                                     ║
║     Feb 21        Mar 1        Mar 15       Mar 22                      ║
║                                                                         ║
║  CACHE HIT RATE TREND                                                   ║
║  80% ┤                              ***                                 ║
║  60% ┤            ****  *****  ****                                     ║
║  40% ┤  **** ****                                                       ║
║  20% ┤**                                                                ║
║   0% ┤──────────────────────────────                                    ║
║      Improving over time. Current: 58% (top 25% of community)           ║
║                                                                         ║
║  PRODUCTIVITY INDEX (tokens per line of code)                           ║
║  Current:  847 tokens/line   (lower = more efficient)                   ║
║  7d avg:   923 tokens/line                                              ║
║  30d avg:  1,102 tokens/line                                            ║
║  Trend:    Improving 18% month-over-month                               ║
║                                                                         ║
║  WEEKLY HEATMAP (hour x day)                                            ║
║       0  3  6  9  12 15 18 21                                           ║
║  Mon  .  .  . ▓▓ ██ ▓▓ ░░ ▓▓                                           ║
║  Tue  .  .  . ▓▓ ██ ██ ▓▓ ░░                                           ║
║  Wed  .  .  . ██ ██ ▓▓ ░░ ▓▓                                           ║
║  Thu  .  .  ░░ ▓▓ ██ ██ ▓▓ ░░                                          ║
║  Fri  .  .  . ▓▓ ██ ▓▓ ░░ .                                            ║
║  Sat  .  .  .  .  ░░ ░░ ▓▓ ▓▓                                          ║
║  Sun  .  .  .  .  ░░ ░░ ░░ .                                           ║
║                                                                         ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

**View 5: Community**

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  COMMUNITY DASHBOARD                   1,247 active contributors (24h)  ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║  YOUR RANK                                                              ║
║  ─────────────────────────────────────────────────────────────────────   ║
║  eunkwang    #47 of 1,247     Top 3.8%                                  ║
║                                                                         ║
║  Tokens (24h):    1.2M     [████████████████░░░░] P85                   ║
║  Cache Hit:       58%      [██████████████░░░░░░] P72                   ║
║  Parallel Sess:   3.2 avg  [████████████████████] P95                   ║
║  Code Velocity:   847 t/l  [███████████░░░░░░░░░] P62                   ║
║  Session Length:   52m avg  [██████████████░░░░░░] P71                   ║
║                                                                         ║
║  COMMUNITY TOKEN THROUGHPUT (24h)                                       ║
║  15B ┤         ████                                                     ║
║  10B ┤    ████████████████                                              ║
║   5B ┤████████████████████████████                                      ║
║   0B ┤────────────────────────────                                      ║
║      0:00      6:00      12:00      18:00      now                      ║
║                                                                         ║
║  MODEL ADOPTION (community)            YOUR MIX                         ║
║  Opus:    28.3%                         Opus:    45%                     ║
║  Sonnet:  54.1%                         Sonnet:  48%                    ║
║  Haiku:   17.6%                         Haiku:   7%                     ║
║                                                                         ║
║  LEADERBOARD (opt-in, 24h tokens)                                       ║
║  #1  turbocoder       3.8M tokens   cache:71%   4.2 parallel            ║
║  #2  deepworker       2.9M tokens   cache:65%   2.8 parallel            ║
║  #3  nightshift       2.4M tokens   cache:42%   5.1 parallel            ║
║  ...                                                                    ║
║  #47 eunkwang         1.2M tokens   cache:58%   3.2 parallel            ║
║                                                                         ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

---

## 7. Plugin Structure

### 7.1 File Layout

```
claude-usage/
  .claude-plugin/
    plugin.json
  commands/
    dashboard.md          # /claude-usage:dashboard -> launch TUI
    config.md             # /claude-usage:config -> interactive setup
    report.md             # /claude-usage:report -> generate text summary
    status.md             # /claude-usage:status -> one-shot stats print
    export.md             # /claude-usage:export -> CSV/JSON export
  skills/
    usage-awareness/
      SKILL.md            # Auto-invoked skill for context-aware suggestions
  hooks/
    hooks.json            # SessionEnd -> aggregate; SessionStart -> orphan cleanup
  src/
    collector.ts          # Statusline data collector
    aggregator.ts         # Hourly aggregation logic
    quota.ts              # OAuth usage API client
    reporter.ts           # Public API reporter
    tui/
      app.tsx             # Ink-based TUI root
      views/
        overview.tsx
        projects.tsx
        sessions.tsx
        trends.tsx
        community.tsx
      components/
        kpi-card.tsx
        bar-chart.tsx
        area-chart.tsx
        heatmap.tsx
        table.tsx
        progress-bar.tsx
        statusline.tsx
    utils/
      storage.ts          # JSONL read/write, atomic writes
      delta.ts            # Cumulative -> delta calculation
      lock.ts             # File locking for cross-session coordination
      hash.ts             # SHA-256 hashing for anonymization
      format.ts           # Number formatting (K, M, B)
      credential.ts       # OAuth token extraction (Keychain / .credentials.json)
  bin/
    collector.js          # Compiled collector entry point
    tui.js                # Compiled TUI entry point
  package.json
  tsconfig.json
  README.md
```

### 7.2 Plugin Manifest

```json
{
  "name": "claude-usage",
  "version": "0.1.0",
  "description": "Token usage analytics for Claude Code. Local-first. Privacy-safe.",
  "author": "sfvibe.fun",
  "license": "MIT",
  "homepage": "https://github.com/sfvibe/claude-usage",
  "commands": ["dashboard", "config", "report", "status", "export"],
  "skills": ["usage-awareness"],
  "hooks": ["SessionEnd", "SessionStart"],
  "postInstall": "npm install && npm run build",
  "setup": "node bin/setup.js"
}
```

---

## 8. Configuration System (/claude-usage:config)

### 8.1 Interactive Setup Flow

When user runs /claude-usage:config, an interactive flow collects settings:

```
╔═══════════════════════════════════════════════════════════════╗
║  claude-usage setup                                          ║
╠═══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Step 1/5: Username                                          ║
║                                                              ║
║  Choose a unique handle for the community leaderboard.       ║
║  This is public and cannot be changed frequently.            ║
║                                                              ║
║  Username: eunkwang_                                         ║
║                                                              ║
║  Checking availability... Available!                         ║
║                                                              ║
║  [Next]                                                      ║
╚═══════════════════════════════════════════════════════════════╝
```

### 8.2 Configurable Settings

| Setting | Slug | Type | Default | Description |
|---------|------|------|---------|-------------|
| Username | username | string | null | Unique community handle. 3-20 chars, alphanumeric + underscore. Validated against server. |
| Public Reporting | public_reporting | boolean | false | Opt-in to submit anonymized hourly aggregates to community API. |
| Leaderboard Opt-in | leaderboard | boolean | false | Show username on community leaderboard. Requires public_reporting=true. |
| Statusline Format | statusline_format | enum | "full" | "full", "compact", "minimal", "off" |
| Quota Polling Interval | quota_interval_min | integer | 60 | Minutes between OAuth usage API calls. Minimum: 5. |
| Cost Daily Budget | daily_budget | float | null | Alert when daily cost exceeds this. null = no alert. |
| Quota Warning Threshold | quota_warning | float | 0.8 | Alert when 5h or 7d quota exceeds this ratio. |
| Context Warning % | context_warning | integer | 75 | Statusline color turns red above this context utilization. |
| Session Retention | retention_days | integer | 90 | Days to keep raw session JSONL before archiving. |
| Timezone | timezone | string | system | For hourly bucketing and display. |
| Color Scheme | colors | enum | "auto" | "auto", "dark", "light", "mono" |
| Projects to Exclude | exclude_projects | string[] | [] | Directory basenames to exclude from tracking. |
| Models to Track | track_models | string[] | ["*"] | Filter: ["*"] = all, or specific model IDs. |
| TUI Default View | default_view | enum | "overview" | Which view opens first in TUI. |
| TUI Refresh Interval | tui_refresh_sec | integer | 5 | How often TUI re-reads data files. |
| Export Format | export_format | enum | "json" | "json" or "csv" for /claude-usage:export. |
| Server URL | server_url | string | "https://api.claude-usage.dev/v1" | Community API endpoint. |

### 8.3 Username Uniqueness

Usernames are registered on the community server.

```
POST /v1/register
{
  "username": "eunkwang",
  "user_hash": "sha256(...)",
  "public_key": "ed25519_pubkey_hex"
}

Response:
{
  "status": "ok",
  "username": "eunkwang",
  "registered_at": "2026-03-22T14:00:00Z"
}

Errors:
- 409: { "error": "username_taken", "suggestions": ["eunkwang_sf", "eunkwang0"] }
- 400: { "error": "invalid_username", "reason": "too_short" }
```

Username rules:
- 3-20 characters
- Lowercase alphanumeric + underscore only
- Cannot start with underscore or number
- Cannot contain consecutive underscores
- Reserved: "admin", "system", "anonymous", "community", "claude", "anthropic"
- Change allowed once per 30 days (to prevent leaderboard gaming)

The user_hash is derived from machine_id + install_salt. If a user reinstalls, they can reclaim their username by proving they control the same ed25519 key pair (generated at setup, stored in config.json).

---

## 9. Public Reporting Protocol

### 9.1 Data Transmitted

One report per hour, per model. Batched and submitted on SessionEnd or when buffer reaches 10 entries.

```json
{
  "v": 1,
  "user_hash": "a1b2c3...",
  "username": "eunkwang",
  "sig": "ed25519_signature_hex",
  "reports": [
    {
      "hour": "2026-03-22T14:00:00Z",
      "model": "claude-opus-4-6",
      "input_tokens": 145000,
      "output_tokens": 42000,
      "cache_read_tokens": 68000,
      "cache_create_tokens": 7200,
      "concurrent_sessions": 3,
      "avg_context_pct": 47,
      "total_lines_changed": 342,
      "session_count": 2,
      "avg_session_duration_min": 65,
      "cost_usd": 2.31
    }
  ]
}
```

### 9.2 Data NOT Transmitted

- Project names, directory paths, workspace info
- Session IDs, timestamps finer than hour buckets
- Any conversation content, tool calls, file names
- IP address (server does not log)
- Operating system, Claude Code version
- Individual session timelines (only hourly aggregates)

### 9.3 Signature Verification

Each report is signed with the user's ed25519 private key. The server verifies against the registered public key. This prevents spoofing (submitting inflated numbers under someone else's username) without requiring account/password infrastructure.

```
signature = ed25519_sign(private_key, sha256(canonical_json(reports)))
```

### 9.4 Community Metrics Derived from Reports

| Metric | Derivation | Privacy | Community Value |
|--------|-----------|---------|-----------------|
| Model Adoption Curve | model field distribution over time | No PII | First public data on real-world model mix |
| Community Cache Hit Rate | cache_read / (cache_read + input) per hour | No PII | Benchmarks for caching optimization |
| Code Velocity Index | lines_changed / (input + output) | No PII | Unique productivity proxy |
| Session Marathon Histogram | avg_session_duration distribution | Low (aggregate) | Optimal session length insights |
| Concurrent Sessions Distribution | concurrent_sessions histogram | No PII | Power user behavior patterns |
| Peak Hour Heatmap | hour-of-day x day-of-week activity density | No PII | Global developer rhythm |
| Input/Output Ratio Trend | output / input by model over time | No PII | Prompt efficiency benchmark |
| User Percentile Rankings | per-metric percentile within active users | Username only (opt-in) | Bragging rights and gamification |

### 9.5 Leaderboard Design

Leaderboard participation is a separate opt-in from public reporting. A user can submit anonymized data (public_reporting=true) without appearing on the leaderboard (leaderboard=false).

Leaderboard categories:
- **Token Volume**: Total tokens consumed (24h / 7d / 30d)
- **Cache Master**: Highest cache hit rate (minimum 100K tokens to qualify)
- **Parallel Pro**: Highest average concurrent sessions
- **Code Velocity**: Best tokens-per-line ratio (minimum 500 lines to qualify)
- **Marathon Runner**: Longest average session duration
- **Efficiency Score**: Composite score: (cache_hit * 0.3) + (code_velocity * 0.3) + (tokens * 0.2) + (sessions * 0.2), normalized to percentile

Anti-gaming:
- Minimum activity thresholds per category
- Signed reports prevent spoofing
- Username change cooldown (30 days)
- Server-side anomaly detection (sudden 10x spike = flagged for review)
- Community flagging mechanism

---

## 10. Skill: Usage Awareness

An auto-invoked skill that makes Claude Code context-aware of usage patterns.

```markdown
---
name: usage-awareness
description: Provides Claude with awareness of current token usage, cost, and quota status to make context-sensitive suggestions about session management.
---

# Usage Awareness

When the user is working on a task and approaching resource limits, consider:

1. If context window > 70%, suggest /compact or /handoff
2. If session cost > $5, mention the running cost casually
3. If cache hit rate < 30%, suggest structuring prompts for better caching
4. If 5-hour quota > 80%, suggest switching to Sonnet for routine tasks

Read the current status from: ~/.claude-usage/sessions/ (latest entry of active session)
Read quota from: ~/.claude-usage/quota/state.json

Do NOT proactively mention usage unless it is relevant to the user's current task or a threshold is approaching.
```

---

## 11. Privacy Threat Model

### 11.1 Local Layer Threats

| Threat | Mitigation |
|--------|-----------|
| Other users on same machine read JSONL | Session files contain no content. Project directory names are the most sensitive field. Standard Unix file permissions (0600). |
| Malware exfiltrates ~/.claude-usage/ | Same risk as ~/.claude/ itself. No additional attack surface. |
| Session JSONL grows unbounded | Configurable retention (default 90d). Auto-archive. |

### 11.2 Public Layer Threats

| Threat | Mitigation |
|--------|-----------|
| Server correlates user_hash to identity | user_hash = sha256(machine_id + random salt). Salt is local-only. Machine_id is not transmitted. Without salt, hash is irreversible. |
| Hourly token counts reveal work patterns | This is the intended feature. Opt-in only. User explicitly consents. |
| Server operator infers project type from model mix | Model mix is too coarse to infer specifics. Opus-heavy could be many things. |
| Man-in-the-middle reads reports | HTTPS only. Certificate pinning recommended. |
| Spoofed reports inflate leaderboard | Ed25519 signature verification per report. |
| Username de-anonymization | Username is opt-in for leaderboard. User chooses what to reveal. |

### 11.3 Non-Goals

- We do not attempt to verify the accuracy of self-reported data. A user could modify the collector to inflate numbers. Ed25519 signatures prevent third-party spoofing, not self-inflation.
- We do not offer differential privacy guarantees. Hourly aggregates with 1000+ users provide natural k-anonymity.

---

## 12. API Specification

### 12.1 Community Server Endpoints

```
Base URL: https://api.claude-usage.dev/v1

POST /register
  Request:  { username, user_hash, public_key }
  Response: { status, username, registered_at }

POST /report
  Request:  { v, user_hash, username, sig, reports[] }
  Response: { status, accepted_count }

GET /community/overview?range=24h|7d|30d
  Response: {
    total_tokens, total_users, total_sessions,
    model_distribution: { opus: %, sonnet: %, haiku: % },
    hourly_throughput: [ { hour, tokens, users, sessions } ],
    avg_cache_hit_rate, avg_concurrent_sessions,
    heatmap: [ { day, hour, intensity } ]
  }

GET /community/leaderboard?category=tokens|cache|parallel|velocity|marathon|efficiency&range=24h|7d|30d
  Response: {
    entries: [ { rank, username, value, percentile } ],
    your_rank: { rank, value, percentile }  // if authenticated
  }

GET /community/user/{username}
  Response: {
    username, registered_at,
    stats: { tokens_24h, cache_rate, avg_parallel, code_velocity, avg_session_min },
    percentiles: { tokens: P85, cache: P72, ... },
    badges: [ "cache_master", "marathon_runner" ]
  }

GET /community/trends?metric=model_adoption|cache_rate|velocity&range=7d|30d|90d
  Response: {
    metric, range,
    data: [ { timestamp, value } ]
  }

GET /health
  Response: { status: "ok", version, total_users, uptime }
```

### 12.2 Authentication

- /register: no auth (public registration)
- /report: user_hash + ed25519 signature in body
- /community/*: no auth (public read)
- /community/leaderboard with ?me=true: user_hash in Authorization header

---

## 13. Implementation Phases

### Phase 1: Local MVP (2 weeks)

Deliverables:
- collector.ts: Statusline data collection and persistence
- Storage layer: Session JSONL, hourly aggregation
- Statusline output formatting (3 modes)
- SessionEnd hook for aggregation
- TUI: Overview and Sessions views only
- /claude-usage:config (basic: statusline format, timezone)
- Plugin manifest and marketplace submission

Success metric: User can see their token usage, cost, and session history in a TUI after 1 day of usage.

### Phase 2: Analytics + Quota (1 week)

Deliverables:
- Quota polling (OAuth usage API)
- TUI: Projects and Trends views
- Cache hit rate analytics
- Code velocity index calculation
- Heatmap and trend charts
- Alert system (quota, cost, context)
- /claude-usage:export (JSON/CSV)
- /claude-usage:report (text summary)

Success metric: User can identify their most expensive project, optimal session length, and caching improvement over time.

### Phase 3: Community (2 weeks)

Deliverables:
- Community server (minimal: Node.js + SQLite)
- Registration and username claiming
- Public reporting with ed25519 signatures
- Community API endpoints
- TUI: Community view with leaderboard
- Percentile rankings
- Model adoption curve (community-level)
- Web dashboard (reuse React components from prototype)

Success metric: 50+ active contributors within first week of launch in the vibe coding community.

### Phase 4: Polish (1 week)

Deliverables:
- Usage awareness skill
- Badges and achievements system
- Community trends (cache rate improvement, model shifts)
- Statusline compact widgets for ccstatusline integration
- Documentation and onboarding guide

---

## 14. Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Collector | TypeScript, compiled to JS | Runs in statusline context, must be fast |
| TUI | ink (React for CLI) | Composable, declarative UI for terminal |
| TUI Charts | custom box-drawing + cli-sparkline | Minimal dependencies, fast rendering |
| Local Storage | JSONL + JSON files | No database dependency. Human-readable. Easy backup. |
| File Locking | flock() via fs.open + LOCK_EX | POSIX-standard, works across Node/Bun |
| Cryptography | Node.js crypto (SHA-256, Ed25519) | Built-in, no external dependency |
| Community Server | Bun + Hono + SQLite | Minimal, fast, single-binary deployment |
| Web Dashboard | React + Recharts | Reuse components from prototype artifact |
| Build | tsup or esbuild | Fast bundling for plugin distribution |
| Runtime | Bun (preferred), Node.js (fallback) | Bun for speed; Node.js for compatibility |

---

## 15. Open Questions

1. **Statusline JSON schema stability**: The statusline stdin JSON is not formally versioned by Anthropic. Field additions are safe, but renames or removals could break the collector. Mitigation: defensive parsing with fallbacks, pin to known field paths, test against each Claude Code release.

2. **OAuth usage API deprecation risk**: This is an undocumented endpoint. It could be removed, rate-limited further, or replaced. Mitigation: treat quota data as best-effort, not critical. The core local analytics (token counts from statusline JSON) do not depend on this API.

3. **Rate limit header exposure timeline**: Issues #34074, #27915, #35672 all request rate limit data in statusline JSON. If Anthropic ships this, it supersedes the OAuth usage API for quota tracking. The collector should check for a rate_limits field in stdin JSON and prefer it over API polling.

4. **Session ID availability in hooks**: Issue #36678 requests session_id as an environment variable in hooks. If shipped, SessionEnd hooks can directly reference the session JSONL file for aggregation, eliminating the need for the statusline collector to write session IDs to a shared location.

5. **Community server hosting**: Options: Vercel Edge Functions + Turso (SQLite edge), Fly.io + LiteFS, or a simple VPS. Cost should be near-zero for 1000 users. Turso free tier (500 databases, 9GB storage) is likely sufficient for Phase 3.

6. **Web dashboard scope**: The React prototype built in this conversation is functional. Decision needed: ship as a separate web app (claude-usage.dev), embed in sfvibe.fun, or only offer TUI + API.

---

## 16. Success Metrics

| Metric | Target (Phase 1) | Target (Phase 3) |
|--------|------------------|------------------|
| Plugin installs | 100 | 500 |
| Daily active TUI users | 30 | 150 |
| Community contributors (public reporting) | N/A | 200 |
| Leaderboard participants | N/A | 50 |
| Avg session with usage tracking | 80% of user sessions | 90% |
| GitHub stars | 100 | 1000 |
| Data accuracy (token count within 5% of /usage) | 95% | 98% |
| Collector overhead (latency added to statusline) | <50ms | <30ms |

---

## Appendix A: Statusline JSON Full Schema (Observed)

Based on Claude Code docs and community reverse-engineering as of March 2026:

```typescript
interface StatuslineInput {
  hook_event_name: "Status";
  session_id: string;
  cwd: string;
  model: {
    id: string;           // "claude-opus-4-6"
    display_name: string; // "Opus"
  };
  workspace: {
    current_dir: string;
    project_dir: string;
  };
  output_style: {
    name: string;         // "markdown", "concise", etc.
  };
  cost: {
    total_cost_usd: number;
    total_lines_added: number;
    total_lines_removed: number;
  };
  context_window: {
    used_percentage: number;      // Input tokens only
    remaining_percentage: number;
    context_window_size: number;  // 200000 or 1000000
    current_usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens: number;
      cache_creation_input_tokens: number;
    } | null;  // null before first API call
    total_input_tokens: number;   // Cumulative session total
    total_output_tokens: number;  // Cumulative session total
  };
  version: string;
}
```

## Appendix B: Public Report Wire Format

```typescript
interface PublicReport {
  v: 1;
  user_hash: string;      // sha256(machine_id + salt), 64 hex chars
  username: string | null; // null if leaderboard not opted in
  sig: string;             // ed25519 signature, 128 hex chars
  reports: Array<{
    hour: string;          // ISO 8601, truncated to hour
    model: string;         // model.id
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_create_tokens: number;
    concurrent_sessions: number;
    avg_context_pct: number;
    total_lines_changed: number;
    session_count: number;
    avg_session_duration_min: number;
    cost_usd: number;
  }>;
}
```

## Appendix C: Dashboard Prototype

A functional React dashboard prototype was built during the design phase and is available as claude-usage-dashboard.jsx. It contains:

- Local Analytics tab with KPIs, hourly stacked area chart (by model), model distribution pie chart, parallel sessions bar chart, cost breakdown, lines changed, project breakdown, and a recent sessions table
- Community tab with aggregate token throughput, model adoption stacked area, concurrent session trend, context utilization, and a usage heatmap (hour x day-of-week)
- Mock data generators that produce realistic patterns

Components from this prototype (KPI, Card, chart configurations, color scheme, formatters) should be reused in the web dashboard when it ships.

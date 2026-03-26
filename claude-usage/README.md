# token-burningman

Token usage analytics for Claude Code. Local-first. Privacy-safe.

## Overview

token-burningman is a Claude Code plugin that collects token usage telemetry from local sessions, provides rich TUI-based analytics, and optionally shares anonymized aggregate data to a community dashboard on [sfvibe.fun/burningman](https://sfvibe.fun/burningman).

**Two-layer architecture:**
- **Local Layer**: Per-session, per-project, per-model analytics in a terminal TUI. Zero network dependency.
- **Public Layer**: Opt-in, hourly-bucketed aggregate data submitted to a community API with ed25519 signatures.

## Quick Start

### 1. Install

```bash
cd token-burningman
npm install && npm run build
```

### 2. Configure Statusline

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/token-burningman/bin/collector.cjs"
  }
}
```

**With OMC HUD coexistence** (runs both in parallel):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/token-burningman/bin/statusline-wrapper.mjs"
  }
}
```

### 3. Use

Data collection starts automatically. View analytics:

```bash
# Launch TUI dashboard
node bin/tui.js

# Run aggregation (also runs on session end via hook)
node bin/aggregate.cjs
```

## Statusline Formats

**Full** (default):
```
[Opus] $3.45 | 62% ctx | 5h:18% 7d:4% | +200/-30 | cache:41%
```

**Compact**:
```
Opus $3.45 62%
```

**Minimal**:
```
$3.45 62%
```

Color coding:
- Model: Opus=magenta, Sonnet=cyan, Haiku=green
- Cost: yellow
- Context %: green (<50%), yellow (50-75%), red (>75%)
- Quota: green (<60%), yellow (60-80%), red (>80%)

## TUI Dashboard

Navigate with number keys:

| Key | View | Description |
|-----|------|-------------|
| 1 | Overview | Today's KPIs, hourly chart, active sessions, quota |
| 2 | Projects | Per-project cost/token breakdown, model mix |
| 3 | Sessions | Session history, duration distribution |
| 4 | Trends | Cost/cache trends, velocity index, weekly heatmap |
| 5 | Community | Leaderboard, model adoption, community throughput |

Other keys: `q` quit, `r` refresh, `[` `]` change time range.

## Configuration

Config file: `~/.token-burningman/config.json`

| Setting | Default | Description |
|---------|---------|-------------|
| `display.statuslineFormat` | `"full"` | `"full"`, `"compact"`, `"minimal"`, `"off"` |
| `display.timezone` | `"system"` | IANA timezone string |
| `alerts.quotaWarningThreshold` | `0.8` | Quota % that triggers warning |
| `alerts.costDailyBudget` | `null` | Daily cost alert threshold |
| `alerts.contextWarningPct` | `75` | Context % that turns red |
| `collection.quotaPollingIntervalMin` | `60` | Minutes between quota API calls |
| `collection.sessionRetentionDays` | `90` | Days to keep raw session data |
| `tui.refreshIntervalSec` | `5` | TUI auto-refresh interval |
| `publicReporting.enabled` | `false` | Opt-in to community reporting |

## Community Reporting

To participate in the community dashboard:

1. Run `/token-burningman:config` in Claude Code
2. Choose a username and enable public reporting
3. Your anonymized hourly aggregates will appear on sfvibe.fun/burningman

**What's shared**: Hourly token counts, model, cache rates, session counts, lines changed.
**What's NOT shared**: Project names, file contents, conversation data, session IDs, timestamps finer than hour buckets.

Reports are signed with ed25519 to prevent spoofing.

## Data Storage

```
~/.token-burningman/
├── sessions/          # Per-session JSONL (~200 bytes/entry)
├── hourly/            # Daily aggregated JSON
├── quota/             # OAuth usage API cache
└── config.json        # User configuration
```

Estimated storage: ~6MB/month. Configurable retention (default 90 days).

## Plugin Commands

| Command | Description |
|---------|-------------|
| `/token-burningman:dashboard` | Launch TUI dashboard |
| `/token-burningman:config` | Interactive configuration |
| `/token-burningman:status` | One-shot text summary |
| `/token-burningman:report` | Generate markdown report |
| `/token-burningman:export` | Export data as JSON/CSV |

## Development

```bash
npm run build    # Build all entry points (tsup)
npm run dev      # Watch mode
npm run test     # Run tests (vitest)
```

### Project Structure

```
src/
├── collector.ts          # Statusline data collector (<50ms)
├── aggregator.ts         # Hourly aggregation
├── quota.ts              # OAuth usage API client
├── analytics.ts          # Derived metrics (projects, trends)
├── reporter.ts           # Community report submission
├── export.ts             # JSON/CSV export
├── report.ts             # Text report generator
├── types.ts              # Shared type definitions
├── utils/
│   ├── storage.ts        # JSONL/JSON file I/O
│   ├── delta.ts          # Cumulative → delta calculation
│   ├── format.ts         # Number/color formatting
│   └── crypto.ts         # Ed25519 signing, hashing
└── tui/
    ├── app.tsx            # TUI root (ink)
    ├── entry.tsx          # CLI entry point
    ├── views/             # Overview, Projects, Sessions, Trends, Community
    ├── components/        # KpiCard, BarChart, Table, Sparkline, Heatmap, ProgressBar
    └── hooks/             # useSessionData, useConfig
```

## License

MIT

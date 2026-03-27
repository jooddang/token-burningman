# token-burningman

[![License: FSL-1.1-MIT](https://img.shields.io/badge/License-FSL--1.1--MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

Token usage analytics for [Claude Code](https://claude.ai/claude-code). Local-first. Privacy-safe.

## Features

- **Local analytics** — Per-session, per-project, per-model token counts, costs, and trends. Zero network dependency.
- **TUI dashboard** — 5 interactive views: Overview, Projects, Sessions, Trends, Community.
- **Statusline integration** — Real-time token/cost display in your Claude Code status bar (`full`, `compact`, `minimal`, or `off`).
- **MCP server** — Query usage data programmatically from Claude Code with 6 tools, 4 resources, and 2 prompts.
- **Data export** — Export session or hourly data as JSON or CSV.
- **Community reporting** (opt-in) — Share anonymized hourly aggregates to a public dashboard at [sfvibe.fun](https://sfvibe.fun). Only hourly bucketed totals are shared — no project names, file contents, or session IDs.

## Prerequisites

- **Node.js 20+**
- **Claude Code** (for plugin/statusline features; the TUI works standalone)

## Installation

### Claude Code plugin (recommended)

```bash
# Add the marketplace
claude plugin marketplace add jooddang/token-burningman

# Install the plugin
claude plugin install token-burningman@jooddang
```

This registers the MCP server, session hooks, and slash commands automatically, and it will configure the HUD statusline for you when no different statusline command is already present.

### From source

```bash
git clone https://github.com/jooddang/token-burningman.git
cd token-burningman
npm install
npm run build

# Install as a local plugin
claude plugin add .
```

## Usage

### TUI Dashboard

```bash
burningman              # after npm install -g
# or
node bin/tui.js         # from source
```

| Key | Action |
|-----|--------|
| `1`–`5` | Switch views (Overview, Projects, Sessions, Trends, Community) |
| `r` | Refresh data |
| `[` / `]` | Change time range (Sessions view) |
| `q` | Quit |

### Statusline

When installed as a Claude Code plugin, setup now installs a stable HUD wrapper at `~/.token-burningman/bin/statusline.mjs` and points Claude Code's `statusLine` command at it if you do not already have a different statusline configured. Configure the format in `~/.token-burningman/config.json`:

```jsonc
"display": {
  "statuslineFormat": "full"  // "full" | "compact" | "minimal" | "off"
}
```

If you already use another statusline command, token-burningman will not overwrite it. In that case, point your existing wrapper at `~/.token-burningman/bin/statusline.mjs`, or if you installed from npm globally use:

```json
{
  "statusLine": {
    "type": "command",
    "command": "burningman-statusline"
  }
}
```

### MCP Tools

When installed as a Claude Code plugin (or MCP server), the following tools are available:

| Tool | Description |
|------|-------------|
| `get_overview` | Today's usage overview as Markdown |
| `get_sessions` | Session history for a time range (`24h`, `48h`, `7d`) |
| `get_projects` | Project-level token and cost breakdown (`7`, `30`, `90` days) |
| `get_trends` | Daily cost, cache rate, and productivity trends (`7`, `30`, `90` days) |
| `launch_tui` | Open the full TUI in tmux or a new terminal window |
| `sync_report` | Manually submit unreported hourly data to the community server |

**MCP Resources** (read-only data endpoints):

| URI | Description |
|-----|-------------|
| `burningman://overview` | Current usage overview |
| `burningman://sessions/24h` | Session history (24h) |
| `burningman://projects/30d` | Project breakdown (30d) |
| `burningman://trends/30d` | Cost and productivity trends (30d) |

**MCP Prompts**: `burningman-overview`, `burningman-projects`

### Data Export

Export session or hourly data as JSON or CSV via the `/export` slash command in Claude Code, or programmatically:

```bash
# Supported ranges: today, 7d, 30d, all
# Supported formats: json, csv
# Supported types: sessions, hourly
```

### Community Reporting (opt-in)

Sign in via the **Community** tab in the TUI (press `5`, then `s`). After authentication, hourly aggregates are submitted automatically.

Disable at any time:

```jsonc
"publicReporting": {
  "enabled": false
}
```

## Configuration

All settings are stored in `~/.token-burningman/config.json`. The full default configuration:

```jsonc
{
  "version": 1,
  "publicReporting": {
    "enabled": false,                              // opt-in community reporting
    "serverUrl": "https://sfvibe.fun/api/burningman",
    "cliToken": null                               // set automatically after sign-in
  },
  "display": {
    "statuslineFormat": "full",                    // "full" | "compact" | "minimal" | "off"
    "currency": "USD",
    "timezone": "system",
    "colorScheme": "auto"
  },
  "collection": {
    "enabled": true,
    "quotaPollingIntervalMin": 60,                 // how often to check API quota
    "hourlyMaintenanceIntervalMin": 60,
    "sessionRetentionDays": 90,                    // auto-cleanup old sessions
    "archiveAfterDays": 30
  },
  "alerts": {
    "quotaWarningThreshold": 0.8,                  // warn at 80% quota usage
    "costDailyBudget": null,                       // daily cost limit (USD), null = no limit
    "contextWarningPct": 75                        // warn when context window > 75%
  },
  "tui": {
    "defaultView": "overview",                     // initial TUI view
    "refreshIntervalSec": 5,
    "compactMode": false
  }
}
```

## Architecture

```
~/.token-burningman/              # Local data (never committed)
├── config.json                   # User configuration + auth token
├── sessions/                     # Per-session JSONL event logs
├── hourly/                       # Aggregated hourly buckets
└── quota/                        # OAuth usage API cache

repo root/
├── .claude-plugin/               # Plugin + marketplace manifests
├── .mcp.json                     # MCP server wiring
├── src/
│   ├── collector.ts              # Statusline data collector (<50ms)
│   ├── aggregator.ts             # Session → hourly aggregation
│   ├── maintenance.ts            # Hourly maintenance tasks
│   ├── reporter.ts               # Community report submission
│   ├── auth.ts                   # Browser-based SIWE authentication
│   ├── quota.ts                  # OAuth quota fetching
│   ├── analytics.ts              # Analytics computations
│   ├── export.ts                 # JSON/CSV data export
│   ├── mcp/                      # MCP server (tools, resources, prompts)
│   ├── tui/                      # Terminal UI (React + Ink)
│   ├── dashboard/                # Dashboard data service
│   ├── presenters/               # Text renderers for each view
│   └── utils/                    # Storage, formatting, delta helpers
├── commands/                     # Plugin slash commands
├── hooks/                        # Claude Code hook configuration
├── skills/                       # Plugin skills
└── tests/                        # Vitest test suite
```

## Privacy

- All data is stored locally in `~/.token-burningman/` with restricted file permissions (`0600`/`0700`).
- Community reporting is **opt-in** and shares only hourly-bucketed aggregates.
- No project names, file contents, session IDs, or fine-grained timestamps are ever transmitted.
- All network requests use HTTPS with certificate validation enforced.

## Uninstall

```bash
# Remove global CLI
npm uninstall -g token-burningman

# Remove Claude Code plugin
claude plugin uninstall token-burningman@jooddang

# Remove local data (optional)
rm -rf ~/.token-burningman
```

## Development

```bash
npm install
npm run dev    # Watch mode
npm run test   # Run tests
npm run build  # Production build
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

[FSL-1.1-MIT](LICENSE) — Functional Source License, Version 1.1, MIT Future License.

Free to use, modify, and redistribute. The only restriction: you may not host a competing community reporting service. All local features (TUI, statusline, MCP, analytics, export) are unrestricted. On **2028-03-27**, the license automatically converts to MIT.

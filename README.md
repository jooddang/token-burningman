# token-burningman

Token usage analytics for [Claude Code](https://claude.ai/claude-code). Local-first. Privacy-safe.

## What it does

A Claude Code plugin that tracks your token usage across sessions and projects, with a rich terminal dashboard.

- **Local analytics** — Per-session, per-project, per-model token counts, costs, and trends. Zero network dependency.
- **TUI dashboard** — 5 views: Overview, Projects, Sessions, Trends, Community. Navigate with keyboard.
- **Statusline integration** — Real-time token/cost display in your Claude Code status bar.
- **MCP server** — Query your usage data programmatically from Claude Code.
- **Community reporting** (opt-in) — Share anonymized hourly aggregates to a public dashboard at [sfvibe.fun](https://sfvibe.fun). Only hourly bucketed totals are shared — no project names, file contents, or session IDs.

## Installation

```bash
# Clone and build
git clone https://github.com/YOUR_ORG/token-burningman.git
cd token-burningman/claude-usage
npm install
npm run build
```

### As a Claude Code plugin

Add to your Claude Code configuration:

```json
{
  "mcpServers": {
    "token-burningman": {
      "command": "node",
      "args": ["<path-to>/claude-usage/bin/mcp.cjs"]
    }
  }
}
```

## Usage

### TUI Dashboard

```bash
node claude-usage/bin/tui.js
```

Navigate between views with arrow keys. Press `q` to quit.

### Statusline

The plugin automatically hooks into Claude Code's statusline to display real-time token usage and cost for the current session.

### MCP Tools

Once configured as an MCP server, the following tools are available inside Claude Code:

- `get_usage_summary` — Overview of token usage
- `get_project_stats` — Per-project breakdown
- `get_session_details` — Detailed session data
- `launch_tui` — Open the TUI dashboard in a new terminal

### Community Reporting (opt-in)

```bash
# Authenticate via browser
node claude-usage/bin/mcp.cjs auth
```

After authentication, hourly aggregates are submitted automatically. You can disable this at any time by setting `publicReporting.enabled` to `false` in `~/.token-burningman/config.json`.

## Architecture

```
~/.token-burningman/          # Local data (never committed)
├── config.json               # User configuration + auth token
├── sessions/                 # Per-session JSONL event logs
├── hourly/                   # Aggregated hourly buckets
└── quota/                    # OAuth usage API cache

claude-usage/
├── src/
│   ├── collector.ts          # Statusline data collector (<50ms)
│   ├── aggregator.ts         # Session → hourly aggregation
│   ├── maintenance.ts        # Hourly maintenance tasks
│   ├── reporter.ts           # Community report submission
│   ├── auth.ts               # Browser-based SIWE authentication
│   ├── quota.ts              # OAuth quota fetching
│   ├── analytics.ts          # Analytics computations
│   ├── export.ts             # JSON/CSV export
│   ├── mcp/                  # MCP server (tools, resources, prompts)
│   ├── tui/                  # Terminal UI (React + Ink)
│   ├── dashboard/            # Dashboard data service
│   ├── presenters/           # Text renderers for each view
│   └── utils/                # Storage, formatting, delta helpers
├── commands/                 # Plugin command definitions
├── hooks/                    # Claude Code hook configuration
└── tests/                    # Vitest test suite
```

## Privacy

- All data is stored locally in `~/.token-burningman/`.
- Community reporting is **opt-in** and shares only hourly-bucketed aggregates.
- No project names, file contents, session IDs, or fine-grained timestamps are ever transmitted.
- Reports are signed with ed25519 for integrity.

## Configuration

Edit `~/.token-burningman/config.json`:

```jsonc
{
  "collection": {
    "enabled": true,
    "quotaPollingIntervalMin": 60
  },
  "alerts": {
    "costThresholdUsd": null,
    "tokenThreshold": null
  },
  "publicReporting": {
    "enabled": false,
    "serverUrl": "https://sfvibe.fun/api/burningman",
    "cliToken": null
  }
}
```

## Development

```bash
cd claude-usage
npm install
npm run dev    # Watch mode
npm run test   # Run tests
npm run build  # Production build
```

## License

MIT

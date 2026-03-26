---
name: report
description: Generate a text summary of your token-burningman analytics for the current period.
---

# Report

Generate a usage report by running the report generator:

```bash
node -e "import('./src/report.js').then(m => console.log(m.generateReport(7)))"
```

Or read the data directly:

1. Read daily stats from `~/.token-burningman/hourly/*.json`
2. Read project stats from `~/.token-burningman/sessions/*.jsonl`
3. Read quota from `~/.token-burningman/quota/state.json`

Present a markdown-formatted summary including:
- Period totals (tokens, cost, sessions, lines)
- Top projects by cost with model mix
- Daily breakdown table
- Cache hit rate trend
- Code velocity (tokens per line)
- Current quota status

---
name: export
description: Export token-burningman data as JSON or CSV for external analysis.
---

# Export

Export usage data from `~/.token-burningman/` in JSON or CSV format.

## Usage

The user can specify:
- **format**: "json" (default) or "csv"
- **range**: "today", "7d", "30d", "all"
- **scope**: "sessions" (raw session data) or "hourly" (aggregated)

## Steps

1. Read the requested data from `~/.token-burningman/sessions/*.jsonl` or `~/.token-burningman/hourly/*.json`
2. For CSV: flatten nested fields, output with headers
3. For JSON: output as a formatted JSON array
4. Write to stdout or a specified file path

## Example output (CSV, sessions)

```
timestamp,session_id,model,project,input_tokens,output_tokens,cache_read,cache_create,total_input,total_output,context_pct,cost,lines_added,lines_removed
2026-03-22T23:00:50.710Z,cc450914-03b,claude-opus-4-6,token-burningman,3,396,131442,244,731,45178,13,7.98,1931,17
```

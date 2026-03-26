---
name: config
description: Configure token-burningman settings like statusline format, timezone, and alerts.
---

# Configuration

Read the current configuration from `~/.token-burningman/config.json` and help the user update it.

Available settings for Phase 1:
- **statuslineFormat**: "full" (default), "compact", "minimal", or "off"
- **timezone**: system timezone or IANA timezone string (e.g., "America/Los_Angeles")
- **contextWarningPct**: Context utilization % at which statusline turns red (default: 75)
- **sessionRetentionDays**: Days to keep raw session data (default: 90)

Read the file, show current values, ask the user what to change, and write back.

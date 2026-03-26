---
name: status
description: Show a one-shot summary of current token usage, cost, and session stats.
---

# Status

Read the latest data from `~/.token-burningman/` and output a concise summary:

1. Read all session JSONL files in `~/.token-burningman/sessions/`
2. Identify active sessions (last entry within 10 minutes)
3. Read today's hourly aggregate from `~/.token-burningman/hourly/{YYYY-MM-DD}.json`
4. Compute and display:
   - Today's total tokens, cost, and session count
   - Active sessions with model, project, context %, cost
   - Cache hit rate
   - Lines changed

Format as a clean text summary the user can read in the conversation.

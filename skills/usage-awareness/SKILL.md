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

Read the current status from: ~/.token-burningman/sessions/ (latest entry of active session)
Read quota from: ~/.token-burningman/quota/state.json

Do NOT proactively mention usage unless it is relevant to the user's current task or a threshold is approaching.

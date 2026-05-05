---
name: token-burningman
description: Use token-burningman from Codex to import local Codex token usage, show analytics dashboards, sign in to sfvibe.fun, and sync anonymized community reporting.
---

# Token Burningman

Use the token-burningman MCP tools for analytics instead of reading raw files directly.

When the user asks for current Codex usage:

1. Call `import_codex_usage` with `report: true`.
2. Call `get_overview`, `get_projects`, `get_sessions`, or `get_trends` as needed.
3. Display returned Markdown as-is unless the user asks for a summary.

When the user asks to connect sfvibe.fun, log in, enable community reporting, or join the social dashboard:

1. Call `login_sfvibe`.
2. Tell the user to complete the browser confirmation if the tool reports a pending or failed sign-in.
3. Call `import_codex_usage` with `report: true` after sign-in so newly imported hourly aggregates can sync.

When the user asks to sync or publish usage:

1. Call `import_codex_usage` with `report: true`.
2. If the result says no report was submitted because the user is not signed in, call `login_sfvibe` only after the user has asked to connect or publish to sfvibe.fun.

Privacy constraints:

- Do not transmit project names, session IDs, prompts, code, messages, or file contents.
- Public reporting only uses anonymized hourly aggregates produced by token-burningman.
- Treat Codex cost as unavailable unless token-burningman reports it explicitly.

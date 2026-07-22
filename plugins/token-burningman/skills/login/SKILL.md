---
name: login
description: Sign in to sfvibe.fun directly from Codex without opening the token-burningman TUI. Use when the user asks to log in, connect sfvibe.fun, or enable community reporting.
---

# Sign in to sfvibe.fun

1. Call the token-burningman MCP tool `login_sfvibe` and wait for it to finish.
2. Do not call `launch_tui`.
3. Report the returned result exactly.
4. If sign-in does not complete, tell the user to finish the browser confirmation and invoke `$token-burningman:login` again.

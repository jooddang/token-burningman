# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in token-burningman, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to report

Email: **gm@sfvibe.fun**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to expect

- **Acknowledgment** within 48 hours of your report.
- We will work with you to understand and validate the issue.
- A fix will be developed and tested before any public disclosure.
- You will be credited in the release notes (unless you prefer anonymity).

### Scope

The following are in scope:
- Authentication and token handling
- Data privacy (local storage, community reporting)
- Command injection or code execution vulnerabilities
- Dependency vulnerabilities

The following are out of scope:
- The community server at sfvibe.fun (report separately to the same email)
- Social engineering attacks
- Denial of service against local CLI tools

## Security Design

- **Local-first**: All usage data is stored locally in `~/.token-burningman/` with `0700`/`0600` permissions.
- **Opt-in reporting**: Community data sharing is disabled by default and requires explicit authentication.
- **Minimal data**: Only hourly-bucketed aggregates are shared — no project names, file paths, session IDs, or timestamps finer than 1 hour.
- **TLS enforced**: All network requests to external services use HTTPS with certificate validation enabled.
- **No hardcoded secrets**: Authentication tokens are stored in the user's local config file, never in source code.

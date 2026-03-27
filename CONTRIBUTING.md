# Contributing to token-burningman

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-username>/token-burningman.git
   cd token-burningman
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

```bash
npm run dev    # Watch mode (rebuilds on change)
npm run test   # Run test suite
npm run build  # Production build
```

### Project Structure

- `src/` — TypeScript source code
- `bin/` — Compiled output (do not edit directly)
- `tests/` — Vitest test files
- `commands/` — Claude Code plugin command definitions
- `hooks/` — Claude Code hook configuration

## Pull Request Process

1. **Keep PRs focused** — One feature or fix per PR.
2. **Write tests** — Add or update tests for your changes.
3. **Run the full suite** before submitting:
   ```bash
   npm run build && npm run test
   ```
4. **Write a clear description** — Explain what your PR does and why.
5. **Update documentation** if your change affects user-facing behavior.

## Code Style

- TypeScript with strict mode
- Use `node:` protocol for Node.js built-in imports (e.g., `import * as fs from "node:fs"`)
- Prefer `execFileSync` over `execSync` to avoid shell injection
- File permissions: `0o700` for directories, `0o600` for files containing sensitive data
- Use `writeJsonAtomic` for any JSON file writes (atomic rename pattern)

## Security

- Never hardcode secrets, tokens, or credentials
- Validate URLs before opening them (check protocol)
- Use `rejectUnauthorized: true` for HTTPS requests carrying credentials
- See [SECURITY.md](SECURITY.md) for reporting vulnerabilities

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add CSV export for session data
fix: prevent race condition in hourly aggregation
docs: update README with MCP configuration
```

## License

By contributing, you agree that your contributions will be licensed under the [FSL-1.1-MIT](LICENSE) license.

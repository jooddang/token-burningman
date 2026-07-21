# Releasing token-burningman

token-burningman has two delivery paths that must be released together:

| Consumer | Marketplace metadata and plugin files | Runtime binaries |
| --- | --- | --- |
| Claude Code | GitHub `master`: `.claude-plugin/`, `commands/`, `hooks/`, `skills/`, `bin/` | The plugin checkout from GitHub |
| Codex | GitHub `master`: `.agents/plugins/marketplace.json` and `plugins/token-burningman/` | npm `token-burningman@latest`, launched by `.codex.mcp.json` through `npx` |

`npm publish` alone is therefore not a complete release. GitHub serves both marketplaces and the Claude Code runtime, while npm serves the Codex MCP runtime. A release is complete only when the Git commit, marketplace manifests, npm dist-tag, and live MCP version all agree.

## 1. Choose and apply the version

Start from an up-to-date clean `master` branch on Node 22.13 or newer (required by the pinned pnpm 11 release tooling). Choose a version that has never been published to npm; npm versions are immutable.

```bash
git pull --ff-only origin master
npm view token-burningman versions --json
pnpm run release:bump -- 0.1.13
```

`release:bump` updates the canonical package version plus the Claude Code and Codex manifests. Do not edit the generated `plugins/token-burningman/` mirror by hand.

## 2. Build and verify every delivery path

```bash
pnpm install --frozen-lockfile
pnpm run release:check
npm pack --dry-run
git status --short
```

`release:check` rebuilds `bin/`, syncs the Codex plugin mirror, type-checks, runs the test suite, checks every manifest version, compares the mirrored binaries/skills/MCP configuration, and initializes the built MCP server to verify its reported version.

CI repeats the typecheck and release-artifact verification on Node 22 and Node 24, so version or mirror drift blocks the release branch before publish.

Inspect the `npm pack --dry-run` file list. It must contain at least `bin/mcp.cjs`, `.codex.mcp.json`, `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, and `plugins/token-burningman/`.

Also run the exact publish lifecycle without changing the registry:

```bash
npm publish --dry-run
```

Treat every `npm warn publish ... corrected` message as a release blocker. In particular, npm removes bin entries whose targets start with `./`; the targets must use `bin/...` paths.

## 3. Publish the GitHub marketplace state

Commit the version, generated bundles, manifests, and release documentation together, then push and wait for CI:

```bash
git add package.json .claude-plugin .codex-plugin .agents plugins bin docs scripts
git commit -m "chore: release 0.1.13"
git push origin master
RUN_ID=$(gh run list --repo jooddang/token-burningman --commit "$(git rev-parse HEAD)" --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --repo jooddang/token-burningman --exit-status
git tag v0.1.13
git push origin v0.1.13
```

A GitHub Release page is optional; the marketplaces consume the repository and tag, not a GitHub Release asset.

## 4. Publish the Codex runtime to npm

Confirm the npm identity and publish only after CI is green:

```bash
npm whoami
npm publish
```

`npm publish` automatically runs `prepublishOnly`, which repeats `release:check`. If `npm whoami` fails, authenticate with `npm login` and rerun it. Do not use `--force` to reuse an existing version; bump to a new version instead.

## 5. Verify the live release

Registry propagation can take a short time. Verify the dist-tag and execute the exact published package, not the local checkout:

```bash
npm view token-burningman version dist-tags --json
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"release-smoke","version":"1"}}}' \
  | npx -y --package=token-burningman@0.1.13 burningman-mcp
```

The response's `result.serverInfo.version` must be `0.1.13`.

Then test the client update paths:

```bash
# Claude Code
claude plugin marketplace update jooddang
claude plugin update token-burningman@jooddang

# Codex CLI, followed by checking Token Burningman in /plugins and restarting Codex
codex plugin marketplace upgrade token-burningman
```

Claude Code may use `/reload-plugins` instead of a full restart. Codex should be restarted after the marketplace upgrade so its skills and npm-backed MCP server are reloaded.

## Current 0.1.12 catch-up release

The `0.1.12` manifests and GitHub `master` state were already pushed and CI passed, but npm still served `0.1.10`. That npm version does not contain the `burningman-mcp` bin entry, so the current Codex MCP launch command fails with `burningman-mcp: command not found`; this is a runtime outage, not just a displayed-version mismatch.

For this one-time catch-up, after authenticating to npm, run the verification commands above and publish the existing `0.1.12`. Do not bump again unless npm reports that `0.1.12` already exists. After publishing, the explicit `npx --package=token-burningman@0.1.12 burningman-mcp` smoke test is mandatory.

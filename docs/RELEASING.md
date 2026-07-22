# Releasing token-burningman

token-burningman has two delivery paths that must be released together:

| Consumer | Marketplace metadata and plugin files | Runtime binaries |
| --- | --- | --- |
| Claude Code | GitHub `master`: `.claude-plugin/`, `commands/`, `hooks/`, `skills/`, `bin/` | The plugin checkout from GitHub |
| Codex | GitHub `master`: `.agents/plugins/marketplace.json` and `plugins/token-burningman/` | The bundled `plugins/token-burningman/bin/mcp.cjs`, launched directly by `.codex.mcp.json` |

`npm publish` alone is therefore not a complete release. GitHub serves both marketplaces and their plugin checkouts; npm serves the standalone CLI and provides an independent package smoke test. A release is complete only when the Git commit, marketplace manifests, npm dist-tag, and both live MCP launch paths agree.

## 1. Choose and apply the version

Start from an up-to-date clean `master` branch on Node 22.13 or newer (required by the pinned pnpm 11 release tooling). Choose a version that has never been published to npm; npm versions are immutable.

```bash
git pull --ff-only origin master
npm view token-burningman versions --json
pnpm run release:bump 0.2.4
```

`release:bump` updates the canonical package version plus the Claude Code and Codex manifests. Do not edit the generated `plugins/token-burningman/` mirror by hand.

## 2. Build and verify every delivery path

```bash
pnpm install --frozen-lockfile
pnpm run release:check
npm pack --dry-run
git status --short
```

`release:check` rebuilds `bin/`, syncs the Codex plugin mirror, type-checks, runs the test suite, checks every manifest version, compares the mirrored binaries/skills/MCP configuration, and performs a full initialize/initialized/tools-list handshake through the exact bundled Codex launch configuration.

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
git add package.json pnpm-lock.yaml tsup.config.ts README.md src tests .claude-plugin .codex-plugin .agents plugins bin docs scripts
git commit -m "chore: release 0.2.4"
git push origin master
RUN_ID=$(gh run list --repo jooddang/token-burningman --commit "$(git rev-parse HEAD)" --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --repo jooddang/token-burningman --exit-status
git tag v0.2.4
git push origin v0.2.4
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

Registry propagation can take a short time. Verify the dist-tag and execute the exact published package from outside the repository. Running `npx --package=token-burningman` inside the package's own checkout can make npm reuse the local root package without linking its bin commands.

```bash
npm view token-burningman version dist-tags --json
SMOKE_DIR=$(mktemp -d)
(cd "$SMOKE_DIR" && printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"release-smoke","version":"1"}}}' \
  | npx -y --package=token-burningman@0.2.4 burningman-mcp)
rmdir "$SMOKE_DIR"
```

The response's `result.serverInfo.version` must be `0.2.4`.

Then test the client update paths:

```bash
# Claude Code
claude plugin marketplace update jooddang
claude plugin update token-burningman@jooddang

# Codex CLI: add once, then upgrade on later releases
codex plugin marketplace add jooddang/token-burningman
codex plugin marketplace upgrade token-burningman
codex plugin add token-burningman@token-burningman
```

Claude Code may use `/reload-plugins` instead of a full restart. Codex should be restarted after the marketplace upgrade and plugin add so its skills and bundled MCP server are reloaded.

## 0.2.4 direct sfvibe login

Claude Code exposes `/token-burningman:login` from `commands/login.md`. Codex exposes the equivalent distributable workflow as `$token-burningman:login` from `skills/login/SKILL.md`; Codex plugin workflows use skills rather than Claude-style plugin command files. Both surfaces call the existing `login_sfvibe` MCP tool and explicitly avoid launching the TUI.

`check-release.cjs` requires both workflow files, verifies that they target `login_sfvibe` without calling `launch_tui`, confirms the Codex skill mirror is current, and checks that the bundled MCP server advertises the login tool.

## 0.2.3 reporting timeout correction

Production verification showed that a valid 100-entry batch can take more than the previous fixed 10-second request timeout while the server performs its per-row upserts. Report requests now receive a wall-clock deadline of `30 seconds + 1 second per entry`, capped at 600 seconds: 130 seconds for the normal 100-entry target and 530 seconds for the supported 500-entry complete-hour maximum. Network, HTTP, and checkpoint behavior is otherwise unchanged.

The report lock uses the pinned `proper-lockfile` atomic-directory primitive with automatic mtime heartbeat and compromise detection. The reporter checks lock health before and after every request, keeping long backlogs serialized across Codex imports, MCP calls, and Claude maintenance.

The last checkpoint hour is deliberately replayed on the next sync. Active sessions can continue adding usage to that bucket after its first successful report, and the server's user/hour/model update is idempotent; replay prevents those late increments from being permanently hidden by the high-watermark.

Claude's 30-second SessionEnd hook performs local aggregation and then launches `report-bg.cjs` as a detached worker. Slow community requests therefore outlive the hook safely instead of being killed before checkpoint cleanup.

## 0.2.2 reporting contract correction

Large local hourly totals can exceed the community API's per-field validation limits even after request batching is correct. The client keeps local analytics exact but saturates only the anonymous wire payload at the v1 reporting contract limits. This is intentionally a client-side compatibility rule: the server stores one row per user, hour, and model, so splitting a single oversized row would overwrite rather than add its chunks.

The limits are covered by reporter tests. If the server contract changes, update the named limits in `src/reporter.ts`, the contract test, and this note together. No sfvibe code change is required for this correction.

## 0.2.1 Claude Code compatibility correction

Claude Code automatically loads the standard plugin hook file at `hooks/hooks.json`. Do not also point the manifest's `hooks` field at that same file: current Claude Code rejects it as a duplicate hook source and marks the plugin failed to load. `check-release.cjs` enforces this invariant while still requiring the standard hook file to exist.

## 0.2.0 reporting change

`0.2.0` sends pending community reports as sequential, complete-hour batches instead of one unbounded request. The client targets 100 entries per request, never sends more than the server's 500-entry limit for one hour, and checkpoints after every accepted batch. A later HTTP, network, or authentication failure therefore preserves earlier progress and resumes from the last completed hour on the next sync.

Reporting is protected by a cross-process lock so Codex imports, MCP tools, and background maintenance cannot race the shared checkpoint. This release changes only the token-burningman client; it does not require a corresponding sfvibe server deployment.

## 0.1.12 corrective follow-up

`0.1.12` restored the missing npm `burningman-mcp` bin, but exposed two release-process assumptions:

- `npx --package=token-burningman` must be tested outside this repository to avoid local-package shadowing.
- A Codex Git marketplace must be added before it can be upgraded, and a listed plugin must be installed before its MCP is available.

The Codex plugin itself now launches its bundled `bin/mcp.cjs` directly, so its runtime no longer depends on npm resolution or the directory from which Codex was started. This Codex-only wiring change does not alter Claude Code's plugin manifest, hooks, commands, or MCP configuration.

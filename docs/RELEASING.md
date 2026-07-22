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
```

Do not tag a release until this commit is on `master` and CI is green. Future release tags must contain `.github/workflows/publish.yml`; this is what allows their tag-push events to publish automatically.

## 4. Configure npm Trusted Publishing once

The package owner must create one trusted relationship after `publish.yml` exists on `master`. npm CLI 11.15 or newer is required for this configuration command, and npm requires real account 2FA for this one-time bootstrap. A bypass-2FA granular access token cannot create the relationship.

```bash
npm trust github token-burningman \
  --file publish.yml \
  --repo jooddang/token-burningman \
  --allow-publish \
  --yes
npm trust list token-burningman --json
```

Do not add an npm write token or `NODE_AUTH_TOKEN` secret to GitHub. The publish job exchanges GitHub's OIDC identity for a short-lived npm credential and npm generates provenance automatically. Keep token publishing available until the first trusted release succeeds; then remove old automation tokens and set package publishing access to require 2FA while disallowing tokens.

Only one npm trusted publisher can be active for a package. To rotate or disable it, inspect its ID and revoke that exact relationship:

```bash
npm trust list token-burningman --json
npm trust revoke token-burningman --id=<trust-id>
```

## 5. Publish the release

For a normal release, create and push the stable SemVer tag only after the trusted relationship exists:

```bash
VERSION=$(node -p "require('./package.json').version")
git tag "v$VERSION"
git push origin "v$VERSION"
RUN_ID=$(gh run list --workflow publish.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

Pushing the tag starts `.github/workflows/publish.yml`. The workflow checks out that exact tag, proves that it is reachable from `origin/master`, repeats the full release gate, and creates an immutable npm tarball. A separate job with no dependency installation receives `id-token: write` and publishes only that verified tarball through npm Trusted Publishing. A third job launches the published MCP binary from a clean temporary directory.

A GitHub Release page is optional; the marketplaces consume the repository and tag, not a GitHub Release asset.

### Recover an already-created tag

GitHub does not replay past tag-push events when a workflow is added later. If a valid release tag already exists, run the workflow from `master` and pass the immutable tag explicitly:

```bash
gh workflow run publish.yml --ref master -f tag=v0.2.4
RUN_ID=$(gh run list --workflow publish.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

The manual path applies the same stable-SemVer, tag/commit, `origin/master`, package version, repository URL, tarball integrity, and live MCP checks as the automatic tag path. It deliberately publishes with `--provenance=false`: GitHub provenance describes the workflow invocation ref and SHA, which are `master` for a manual dispatch, while the recovered tarball comes from the older tag. Disabling provenance avoids attaching a valid but misleading statement. OIDC authentication is still used. Normal tag-push releases generate provenance because their invocation SHA and package source are the same tag commit.

Never move or force-push a release tag. npm versions and release tags are immutable; fix a failed or incorrect release with a new version.

## 6. Verify the live release

Registry propagation can take a short time. Verify the dist-tag and execute the exact published package from outside the repository. Running `npx --package=token-burningman` inside the package's own checkout can make npm reuse the local root package without linking its bin commands.

```bash
npm view token-burningman version dist-tags --json
SMOKE_DIR=$(mktemp -d)
(cd "$SMOKE_DIR" && printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"release-smoke","version":"1"}}}' \
  | npx -y --package=token-burningman@0.2.4 burningman-mcp)
rmdir "$SMOKE_DIR"
```

The response's `result.serverInfo.version` must be `0.2.4`.

For normal tag-push releases, verify that npm recorded GitHub provenance as well as the expected tarball integrity:

```bash
npm view token-burningman@0.2.4 dist.integrity dist.attestations --json
```

For an existing-tag recovery, `dist.integrity` must match but `dist.attestations` must be absent, as documented above.

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

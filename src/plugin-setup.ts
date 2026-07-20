import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ensureConfig } from "./setup.js";
import { DEFAULT_CONFIG, type Config } from "./types.js";
import { ensureDir, readJson, writeJsonAtomic, getStorageDir, getConfigPath } from "./utils/storage.js";

interface ClaudeSettings {
  statusLine?: {
    type?: string;
    command?: string;
  };
  [key: string]: unknown;
}

interface SetupResult {
  status: "installed" | "updated" | "synced" | "already-configured" | "chained" | "skipped-existing";
  collectorPath: string;
  message: string;
}

// Binaries the statusline pipeline needs at a version-independent path.
// collector.cjs spawns the -bg scripts from its own directory.
const SYNCED_BINARIES = ["collector.cjs", "hourly-maintenance-bg.cjs"];

// Previously synced binaries that no longer exist; removed from the
// persistent dir so retired code cannot be spawned by stale collectors.
const RETIRED_BINARIES = ["fetch-quota-bg.cjs"];

export function getClaudeSettingsPath(): string {
  if (process.env.BURNINGMAN_CLAUDE_SETTINGS_PATH) {
    return process.env.BURNINGMAN_CLAUDE_SETTINGS_PATH;
  }
  return path.join(os.homedir(), ".claude", "settings.json");
}

/**
 * Version-independent directory the statusline command points at.
 * Prefers Claude Code's persistent plugin data dir (survives plugin updates
 * and the ~7-day cleanup of old versioned cache dirs); falls back to the
 * app's own storage dir for manual (non-plugin) installs.
 */
export function getPersistentBinDir(dataDir?: string): string {
  if (dataDir && !dataDir.startsWith("${")) {
    return path.join(dataDir, "bin");
  }
  return path.join(getStorageDir(), "bin");
}

export function getPluginRootFromScript(scriptPath: string): string {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return process.env.CLAUDE_PLUGIN_ROOT;
  }

  if (typeof __dirname !== "undefined") {
    return path.resolve(__dirname, "..");
  }

  return path.dirname(path.dirname(path.resolve(scriptPath)));
}

function filesDiffer(sourcePath: string, targetPath: string): boolean {
  if (!fs.existsSync(targetPath)) return true;
  const source = fs.readFileSync(sourcePath);
  const target = fs.readFileSync(targetPath);
  return !source.equals(target);
}

/**
 * Copy the statusline binaries from the (versioned) plugin root into the
 * persistent bin dir. Content-compared so unchanged files are not rewritten.
 * Returns the number of files that were copied.
 */
export function syncBinaries(pluginRoot: string, targetBin: string): number {
  const sourceBin = path.join(pluginRoot, "bin");
  if (!fs.existsSync(path.join(sourceBin, "collector.cjs"))) {
    throw new Error(`collector.cjs not found in ${sourceBin}. Is the plugin built?`);
  }

  ensureDir(targetBin);
  for (const file of RETIRED_BINARIES) {
    fs.rmSync(path.join(targetBin, file), { force: true });
  }
  let copied = 0;
  for (const file of SYNCED_BINARIES) {
    const sourcePath = path.join(sourceBin, file);
    if (!fs.existsSync(sourcePath)) {
      // Only the collector is critical to the statusline; a missing background
      // script (e.g. version skew during updates) must not kill the HUD.
      console.error(`token-burningman: ${file} missing in ${sourceBin}; skipped`);
      continue;
    }
    const targetPath = path.join(targetBin, file);
    if (!filesDiffer(sourcePath, targetPath)) continue;
    const tmpPath = `${targetPath}.${process.pid}.tmp`;
    fs.copyFileSync(sourcePath, tmpPath);
    fs.chmodSync(tmpPath, 0o700);
    fs.renameSync(tmpPath, targetPath);
    copied += 1;
  }
  return copied;
}

function isBurningmanStatusLine(command: string | undefined): boolean {
  if (!command) return false;
  if (command.includes("burningman-statusline")) return true;
  // Require BOTH one of our artifact basenames AND a burningman-owned path:
  // a foreign statusline living under a "token-burningman" directory, or a
  // third-party script that happens to be named statusline.mjs, must not be
  // classified as ours.
  const hasArtifactName =
    command.includes("statusline.mjs") ||
    command.includes("statusline-chain.mjs") ||
    command.includes("collector.cjs");
  const hasOwnedPath = command.includes(getStorageDir()) || command.includes("token-burningman");
  return hasArtifactName && hasOwnedPath;
}

export function getChainOriginalPath(): string {
  return path.join(getStorageDir(), "chain-original.json");
}

/**
 * Chain wrapper: renders the user's pre-existing statusline on line 1 and the
 * token-burningman HUD on line 2 (multi-line statuslines are supported by
 * Claude Code). The original command lives in a sidecar file so the wrapper
 * content stays stable across setups.
 */
function buildChainWrapperSource(collectorPath: string, sidecarPath: string): string {
  return `#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const stdin = readFileSync(0, "utf8");
const lines = [];

let original = null;
try {
  original = JSON.parse(readFileSync(${JSON.stringify(sidecarPath)}, "utf8")).command || null;
} catch {
  // Sidecar missing/corrupt: degrade to collector-only output below.
}

if (original) {
  const isWindows = process.platform === "win32";
  const result = spawnSync(isWindows ? "cmd" : "sh", [isWindows ? "/c" : "-c", original], {
    input: stdin,
    encoding: "utf8",
    timeout: 2500,
  });
  if (typeof result.stdout === "string" && result.stdout.trim()) {
    lines.push(result.stdout.replace(/\\n+$/, ""));
  }
  if (result.error || result.status !== 0) {
    process.stderr.write(\`token-burningman chain: original statusline failed: \${result.error ? result.error.message : result.status}\\n\`);
  }
}

const collector = spawnSync(process.execPath, [${JSON.stringify(collectorPath)}], {
  input: stdin,
  encoding: "utf8",
  timeout: 2500,
});
if (typeof collector.stdout === "string" && collector.stdout) {
  lines.push(collector.stdout.replace(/\\n+$/, ""));
}
if (collector.error) {
  process.stderr.write(\`token-burningman chain: collector failed: \${collector.error.message}\\n\`);
}

process.stdout.write(lines.join("\\n"));
`;
}

function installChainedStatusLine(
  targetBin: string,
  collectorPath: string,
  originalCommand: string,
  settingsPath: string,
  settings: ClaudeSettings,
): SetupResult {
  const sidecarPath = getChainOriginalPath();
  writeJsonAtomic(sidecarPath, { command: originalCommand });

  const wrapperPath = path.join(targetBin, "statusline-chain.mjs");
  fs.writeFileSync(wrapperPath, buildChainWrapperSource(collectorPath, sidecarPath), "utf8");
  fs.chmodSync(wrapperPath, 0o700);

  settings.statusLine = { type: "command", command: `node ${JSON.stringify(wrapperPath)}` };
  writeJsonAtomic(settingsPath, settings);
  return {
    status: "chained",
    collectorPath,
    message: `Chained token-burningman HUD after your existing statusline (${originalCommand}). Disable via display.chainStatusline=false in ~/.token-burningman/config.json.`,
  };
}

/**
 * Sessions already running keep invoking the legacy wrapper command until
 * restart, so overwrite it with a forwarder to the new collector path
 * instead of deleting it.
 */
function migrateLegacyWrapper(collectorPath: string): void {
  const wrapperPath = path.join(getStorageDir(), "bin", "statusline.mjs");
  if (fs.existsSync(wrapperPath)) {
    const forwarder = `#!/usr/bin/env node
// Legacy forwarder: statusline now runs collector.cjs directly.
import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, [${JSON.stringify(collectorPath)}], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 0);
`;
    fs.writeFileSync(wrapperPath, forwarder, "utf8");
    fs.chmodSync(wrapperPath, 0o700);
  }
  fs.rmSync(path.join(getStorageDir(), ".plugin-root"), { force: true });
}

export function installHudStatusLine(pluginRoot: string, dataDir?: string): SetupResult {
  const targetBin = getPersistentBinDir(dataDir);
  const copied = syncBinaries(pluginRoot, targetBin);
  const collectorPath = path.join(targetBin, "collector.cjs");
  const collectorCommand = `node ${JSON.stringify(collectorPath)}`;
  const chainWrapperPath = path.join(targetBin, "statusline-chain.mjs");
  const chainCommand = `node ${JSON.stringify(chainWrapperPath)}`;

  const settingsPath = getClaudeSettingsPath();
  const settings = readJson<ClaudeSettings>(settingsPath, {});
  const existing = settings.statusLine;

  if (existing?.type === "command") {
    if (existing.command === collectorCommand || existing.command === chainCommand) {
      // Keep an existing chain wrapper's content current with this version.
      // The wrapper degrades to collector-only when the sidecar is missing,
      // so it is safe to (re)write unconditionally.
      if (existing.command === chainCommand) {
        fs.writeFileSync(chainWrapperPath, buildChainWrapperSource(collectorPath, getChainOriginalPath()), "utf8");
        fs.chmodSync(chainWrapperPath, 0o700);
      }
      return {
        status: copied > 0 ? "synced" : "already-configured",
        collectorPath,
        message:
          copied > 0
            ? `Synced ${copied} statusline binaries to ${targetBin}`
            : `HUD already configured at ${collectorPath}`,
      };
    }

    if (isBurningmanStatusLine(existing.command)) {
      // A chain wrapper at a stale targetBin path must be re-chained, not
      // migrated to the plain collector — that would silently drop the
      // user's foreign statusline. The sidecar still holds its command.
      if (existing.command?.includes("statusline-chain.mjs")) {
        const original = readJson<{ command?: string }>(getChainOriginalPath(), {});
        if (original.command) {
          return installChainedStatusLine(targetBin, collectorPath, original.command, settingsPath, settings);
        }
      }
      settings.statusLine = { type: "command", command: collectorCommand };
      writeJsonAtomic(settingsPath, settings);
      migrateLegacyWrapper(collectorPath);
      return {
        status: "updated",
        collectorPath,
        message: `Migrated token-burningman HUD command to ${collectorPath}`,
      };
    }

    const config = { ...DEFAULT_CONFIG, ...readJson<Partial<Config>>(getConfigPath(), {}) };
    if (config.display?.chainStatusline === false) {
      return {
        status: "skipped-existing",
        collectorPath,
        message: `Skipped HUD install because ~/.claude/settings.json already has a different statusLine command and chaining is disabled.`,
      };
    }

    return installChainedStatusLine(targetBin, collectorPath, existing.command || "", settingsPath, settings);
  }

  settings.statusLine = { type: "command", command: collectorCommand };
  writeJsonAtomic(settingsPath, settings);
  return {
    status: "installed",
    collectorPath,
    message: `Installed token-burningman HUD command at ${collectorPath}`,
  };
}

async function main(): Promise<void> {
  ensureConfig();
  const pluginRoot = getPluginRootFromScript(process.argv[1] || __filename);
  const dataDir = process.argv[2] || process.env.CLAUDE_PLUGIN_DATA;
  const result = installHudStatusLine(pluginRoot, dataDir);
  console.log(result.message);
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

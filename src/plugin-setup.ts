import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ensureConfig } from "./setup.js";
import { ensureDir, readJson, writeJsonAtomic, getStorageDir } from "./utils/storage.js";

interface ClaudeSettings {
  statusLine?: {
    type?: string;
    command?: string;
  };
  [key: string]: unknown;
}

interface SetupResult {
  status: "installed" | "updated" | "already-configured" | "skipped-existing";
  wrapperPath: string;
  message: string;
}

export function getClaudeSettingsPath(): string {
  if (process.env.BURNINGMAN_CLAUDE_SETTINGS_PATH) {
    return process.env.BURNINGMAN_CLAUDE_SETTINGS_PATH;
  }
  return path.join(os.homedir(), ".claude", "settings.json");
}

export function getHudWrapperPath(): string {
  return path.join(getStorageDir(), "bin", "statusline.mjs");
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

function escapeForJs(value: string): string {
  return JSON.stringify(value);
}

function buildWrapperSource(collectorPath: string): string {
  const encodedCollectorPath = escapeForJs(collectorPath);
  return `#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const collectorPath = ${encodedCollectorPath};
const result = spawnSync(process.execPath, [collectorPath], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
`;
}

function isBurningmanStatusLine(command: string | undefined): boolean {
  if (!command) return false;
  return command.includes("token-burningman") || command.includes("statusline.mjs") || command.includes("collector.cjs");
}

export function installHudStatusLine(pluginRoot: string): SetupResult {
  const collectorPath = path.join(pluginRoot, "bin", "collector.cjs");
  const wrapperPath = getHudWrapperPath();
  const wrapperCommand = `node ${JSON.stringify(wrapperPath)}`;
  const wrapperSource = buildWrapperSource(collectorPath);

  ensureDir(path.dirname(wrapperPath));
  fs.writeFileSync(wrapperPath, wrapperSource, { encoding: "utf8", mode: 0o700 });
  fs.chmodSync(wrapperPath, 0o700);

  const settingsPath = getClaudeSettingsPath();
  const settings = readJson<ClaudeSettings>(settingsPath, {});
  const existing = settings.statusLine;

  if (existing?.type === "command") {
    if (existing.command === wrapperCommand) {
      return {
        status: "already-configured",
        wrapperPath,
        message: `HUD already configured at ${wrapperPath}`,
      };
    }

    if (isBurningmanStatusLine(existing.command)) {
      settings.statusLine = { type: "command", command: wrapperCommand };
      writeJsonAtomic(settingsPath, settings);
      return {
        status: "updated",
        wrapperPath,
        message: `Updated token-burningman HUD command to ${wrapperPath}`,
      };
    }

    return {
      status: "skipped-existing",
      wrapperPath,
      message: `Skipped HUD install because ~/.claude/settings.json already has a different statusLine command.`,
    };
  }

  settings.statusLine = { type: "command", command: wrapperCommand };
  writeJsonAtomic(settingsPath, settings);
  return {
    status: "installed",
    wrapperPath,
    message: `Installed token-burningman HUD command at ${wrapperPath}`,
  };
}

async function main(): Promise<void> {
  ensureConfig();
  const pluginRoot = getPluginRootFromScript(process.argv[1] || __filename);
  const result = installHudStatusLine(pluginRoot);
  console.log(result.message);
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

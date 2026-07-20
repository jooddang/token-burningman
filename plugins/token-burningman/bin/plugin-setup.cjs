#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/plugin-setup.ts
var plugin_setup_exports = {};
__export(plugin_setup_exports, {
  getChainOriginalPath: () => getChainOriginalPath,
  getClaudeSettingsPath: () => getClaudeSettingsPath,
  getPersistentBinDir: () => getPersistentBinDir,
  getPluginRootFromScript: () => getPluginRootFromScript,
  installHudStatusLine: () => installHudStatusLine,
  syncBinaries: () => syncBinaries
});
module.exports = __toCommonJS(plugin_setup_exports);
var fs3 = __toESM(require("fs"), 1);
var path2 = __toESM(require("path"), 1);
var os2 = __toESM(require("os"), 1);

// src/setup.ts
var fs2 = __toESM(require("fs"), 1);

// src/types.ts
var DEFAULT_CONFIG = {
  version: 1,
  publicReporting: {
    enabled: false,
    serverUrl: "https://sfvibe.fun/api/burningman",
    cliToken: null
  },
  display: {
    statuslineFormat: "full",
    currency: "USD",
    timezone: "system",
    colorScheme: "auto",
    chainStatusline: true
  },
  collection: {
    enabled: true,
    hourlyMaintenanceIntervalMin: 60,
    sessionRetentionDays: 90,
    archiveAfterDays: 30
  },
  alerts: {
    quotaWarningThreshold: 0.8,
    costDailyBudget: null,
    contextWarningPct: 75
  },
  tui: {
    defaultView: "overview",
    refreshIntervalSec: 5,
    compactMode: false
  }
};

// src/utils/storage.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var os = __toESM(require("os"), 1);
var DEFAULT_STORAGE_DIR = path.join(os.homedir(), ".token-burningman");
function getStorageDir() {
  return process.env.CLAUDE_USAGE_DIR || DEFAULT_STORAGE_DIR;
}
function getConfigPath() {
  return path.join(getStorageDir(), "config.json");
}
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 448 });
  }
}
function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}
function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmpPath = filePath + ".tmp";
  const fd = fs.openSync(tmpPath, "w", 384);
  try {
    fs.writeSync(fd, JSON.stringify(data, null, 2));
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
}
var DEFAULT_LOCK_STALE_MS = 15 * 6e4;

// src/auth.ts
var https = __toESM(require("https"), 1);
var http = __toESM(require("http"), 1);

// src/setup.ts
function ensureConfig() {
  const configPath = getConfigPath();
  if (fs2.existsSync(configPath)) {
    return readJson(configPath, DEFAULT_CONFIG);
  }
  ensureDir(getStorageDir());
  const config = { ...DEFAULT_CONFIG };
  if (process.env.BURNINGMAN_SERVER_URL) {
    config.publicReporting.serverUrl = process.env.BURNINGMAN_SERVER_URL;
  }
  writeJsonAtomic(configPath, config);
  return config;
}

// src/plugin-setup.ts
var SYNCED_BINARIES = ["collector.cjs", "hourly-maintenance-bg.cjs"];
var RETIRED_BINARIES = ["fetch-quota-bg.cjs"];
function getClaudeSettingsPath() {
  if (process.env.BURNINGMAN_CLAUDE_SETTINGS_PATH) {
    return process.env.BURNINGMAN_CLAUDE_SETTINGS_PATH;
  }
  return path2.join(os2.homedir(), ".claude", "settings.json");
}
function getPersistentBinDir(dataDir) {
  if (dataDir && !dataDir.startsWith("${")) {
    return path2.join(dataDir, "bin");
  }
  return path2.join(getStorageDir(), "bin");
}
function getPluginRootFromScript(scriptPath) {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return process.env.CLAUDE_PLUGIN_ROOT;
  }
  if (typeof __dirname !== "undefined") {
    return path2.resolve(__dirname, "..");
  }
  return path2.dirname(path2.dirname(path2.resolve(scriptPath)));
}
function filesDiffer(sourcePath, targetPath) {
  if (!fs3.existsSync(targetPath)) return true;
  const source = fs3.readFileSync(sourcePath);
  const target = fs3.readFileSync(targetPath);
  return !source.equals(target);
}
function syncBinaries(pluginRoot, targetBin) {
  const sourceBin = path2.join(pluginRoot, "bin");
  if (!fs3.existsSync(path2.join(sourceBin, "collector.cjs"))) {
    throw new Error(`collector.cjs not found in ${sourceBin}. Is the plugin built?`);
  }
  ensureDir(targetBin);
  for (const file of RETIRED_BINARIES) {
    fs3.rmSync(path2.join(targetBin, file), { force: true });
  }
  let copied = 0;
  for (const file of SYNCED_BINARIES) {
    const sourcePath = path2.join(sourceBin, file);
    if (!fs3.existsSync(sourcePath)) {
      console.error(`token-burningman: ${file} missing in ${sourceBin}; skipped`);
      continue;
    }
    const targetPath = path2.join(targetBin, file);
    if (!filesDiffer(sourcePath, targetPath)) continue;
    const tmpPath = `${targetPath}.${process.pid}.tmp`;
    fs3.copyFileSync(sourcePath, tmpPath);
    fs3.chmodSync(tmpPath, 448);
    fs3.renameSync(tmpPath, targetPath);
    copied += 1;
  }
  return copied;
}
function isBurningmanStatusLine(command) {
  if (!command) return false;
  if (command.includes("burningman-statusline")) return true;
  const hasArtifactName = command.includes("statusline.mjs") || command.includes("statusline-chain.mjs") || command.includes("collector.cjs");
  const hasOwnedPath = command.includes(getStorageDir()) || command.includes("token-burningman");
  return hasArtifactName && hasOwnedPath;
}
function getChainOriginalPath() {
  return path2.join(getStorageDir(), "chain-original.json");
}
function buildChainWrapperSource(collectorPath, sidecarPath) {
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
function installChainedStatusLine(targetBin, collectorPath, originalCommand, settingsPath, settings) {
  const sidecarPath = getChainOriginalPath();
  writeJsonAtomic(sidecarPath, { command: originalCommand });
  const wrapperPath = path2.join(targetBin, "statusline-chain.mjs");
  fs3.writeFileSync(wrapperPath, buildChainWrapperSource(collectorPath, sidecarPath), "utf8");
  fs3.chmodSync(wrapperPath, 448);
  settings.statusLine = { type: "command", command: `node ${JSON.stringify(wrapperPath)}` };
  writeJsonAtomic(settingsPath, settings);
  return {
    status: "chained",
    collectorPath,
    message: `Chained token-burningman HUD after your existing statusline (${originalCommand}). Disable via display.chainStatusline=false in ~/.token-burningman/config.json.`
  };
}
function migrateLegacyWrapper(collectorPath) {
  const wrapperPath = path2.join(getStorageDir(), "bin", "statusline.mjs");
  if (fs3.existsSync(wrapperPath)) {
    const forwarder = `#!/usr/bin/env node
// Legacy forwarder: statusline now runs collector.cjs directly.
import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, [${JSON.stringify(collectorPath)}], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 0);
`;
    fs3.writeFileSync(wrapperPath, forwarder, "utf8");
    fs3.chmodSync(wrapperPath, 448);
  }
  fs3.rmSync(path2.join(getStorageDir(), ".plugin-root"), { force: true });
}
function installHudStatusLine(pluginRoot, dataDir) {
  const targetBin = getPersistentBinDir(dataDir);
  const copied = syncBinaries(pluginRoot, targetBin);
  const collectorPath = path2.join(targetBin, "collector.cjs");
  const collectorCommand = `node ${JSON.stringify(collectorPath)}`;
  const chainWrapperPath = path2.join(targetBin, "statusline-chain.mjs");
  const chainCommand = `node ${JSON.stringify(chainWrapperPath)}`;
  const settingsPath = getClaudeSettingsPath();
  const settings = readJson(settingsPath, {});
  const existing = settings.statusLine;
  if (existing?.type === "command") {
    if (existing.command === collectorCommand || existing.command === chainCommand) {
      if (existing.command === chainCommand) {
        fs3.writeFileSync(chainWrapperPath, buildChainWrapperSource(collectorPath, getChainOriginalPath()), "utf8");
        fs3.chmodSync(chainWrapperPath, 448);
      }
      return {
        status: copied > 0 ? "synced" : "already-configured",
        collectorPath,
        message: copied > 0 ? `Synced ${copied} statusline binaries to ${targetBin}` : `HUD already configured at ${collectorPath}`
      };
    }
    if (isBurningmanStatusLine(existing.command)) {
      if (existing.command?.includes("statusline-chain.mjs")) {
        const original = readJson(getChainOriginalPath(), {});
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
        message: `Migrated token-burningman HUD command to ${collectorPath}`
      };
    }
    const config = { ...DEFAULT_CONFIG, ...readJson(getConfigPath(), {}) };
    if (config.display?.chainStatusline === false) {
      return {
        status: "skipped-existing",
        collectorPath,
        message: `Skipped HUD install because ~/.claude/settings.json already has a different statusLine command and chaining is disabled.`
      };
    }
    return installChainedStatusLine(targetBin, collectorPath, existing.command || "", settingsPath, settings);
  }
  settings.statusLine = { type: "command", command: collectorCommand };
  writeJsonAtomic(settingsPath, settings);
  return {
    status: "installed",
    collectorPath,
    message: `Installed token-burningman HUD command at ${collectorPath}`
  };
}
async function main() {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getChainOriginalPath,
  getClaudeSettingsPath,
  getPersistentBinDir,
  getPluginRootFromScript,
  installHudStatusLine,
  syncBinaries
});

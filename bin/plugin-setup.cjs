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
  getClaudeSettingsPath: () => getClaudeSettingsPath,
  getHudWrapperPath: () => getHudWrapperPath,
  getPluginRootFromScript: () => getPluginRootFromScript,
  installHudStatusLine: () => installHudStatusLine
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
    colorScheme: "auto"
  },
  collection: {
    enabled: true,
    quotaPollingIntervalMin: 60,
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
function getClaudeSettingsPath() {
  if (process.env.BURNINGMAN_CLAUDE_SETTINGS_PATH) {
    return process.env.BURNINGMAN_CLAUDE_SETTINGS_PATH;
  }
  return path2.join(os2.homedir(), ".claude", "settings.json");
}
function getHudWrapperPath() {
  return path2.join(getStorageDir(), "bin", "statusline.mjs");
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
function escapeForJs(value) {
  return JSON.stringify(value);
}
function buildWrapperSource(collectorPath) {
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
function isBurningmanStatusLine(command) {
  if (!command) return false;
  return command.includes("token-burningman") || command.includes("statusline.mjs") || command.includes("collector.cjs");
}
function installHudStatusLine(pluginRoot) {
  const collectorPath = path2.join(pluginRoot, "bin", "collector.cjs");
  const wrapperPath = getHudWrapperPath();
  const wrapperCommand = `node ${JSON.stringify(wrapperPath)}`;
  const wrapperSource = buildWrapperSource(collectorPath);
  ensureDir(path2.dirname(wrapperPath));
  fs3.writeFileSync(wrapperPath, wrapperSource, { encoding: "utf8", mode: 448 });
  fs3.chmodSync(wrapperPath, 448);
  const settingsPath = getClaudeSettingsPath();
  const settings = readJson(settingsPath, {});
  const existing = settings.statusLine;
  if (existing?.type === "command") {
    if (existing.command === wrapperCommand) {
      return {
        status: "already-configured",
        wrapperPath,
        message: `HUD already configured at ${wrapperPath}`
      };
    }
    if (isBurningmanStatusLine(existing.command)) {
      settings.statusLine = { type: "command", command: wrapperCommand };
      writeJsonAtomic(settingsPath, settings);
      return {
        status: "updated",
        wrapperPath,
        message: `Updated token-burningman HUD command to ${wrapperPath}`
      };
    }
    return {
      status: "skipped-existing",
      wrapperPath,
      message: `Skipped HUD install because ~/.claude/settings.json already has a different statusLine command.`
    };
  }
  settings.statusLine = { type: "command", command: wrapperCommand };
  writeJsonAtomic(settingsPath, settings);
  return {
    status: "installed",
    wrapperPath,
    message: `Installed token-burningman HUD command at ${wrapperPath}`
  };
}
async function main() {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getClaudeSettingsPath,
  getHudWrapperPath,
  getPluginRootFromScript,
  installHudStatusLine
});

#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import {
  authenticateCli
} from "./chunk-OF2HD2D5.js";
import {
  DEFAULT_CONFIG
} from "./chunk-GBNYSLYD.js";
import {
  ensureDir,
  getConfigPath,
  getStorageDir,
  readJson,
  writeJsonAtomic
} from "./chunk-P2X3U3Y3.js";
import "./chunk-DXOULAZU.js";

// src/setup.ts
import * as fs from "fs";
function ensureConfig() {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
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
async function setupPublicReporting(config) {
  await authenticateCli(config);
  return config;
}
export {
  ensureConfig,
  setupPublicReporting
};

#!/usr/bin/env node
import {
  authenticateCli
} from "./chunk-NNTSHCFT.js";
import {
  DEFAULT_CONFIG
} from "./chunk-YCAD3QRK.js";
import {
  ensureDir,
  getConfigPath,
  getStorageDir,
  readJson,
  writeJsonAtomic
} from "./chunk-6RWSJQBF.js";
import "./chunk-77HVPD4G.js";

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

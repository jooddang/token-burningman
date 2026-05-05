#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pluginRoot = path.join(root, "plugins", "token-burningman");

function resetDir(relativePath) {
  const destination = path.join(pluginRoot, relativePath);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(root, relativePath), destination, {
    recursive: true,
    force: true,
    verbatimSymlinks: false,
  });
}

function copyFile(relativePath) {
  const destination = path.join(pluginRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, relativePath), destination);
}

fs.mkdirSync(pluginRoot, { recursive: true });
resetDir(".codex-plugin");
resetDir("bin");
resetDir("skills");
copyFile(".codex.mcp.json");
copyFile("LICENSE");

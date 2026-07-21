#!/usr/bin/env node
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function digestTree(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const entries = [];

  function walk(currentPath, prefix = "") {
    for (const name of fs.readdirSync(currentPath).sort()) {
      const fullPath = path.join(currentPath, name);
      const relativeName = path.join(prefix, name);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath, relativeName);
      } else {
        entries.push(
          `${relativeName}:${crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex")}`,
        );
      }
    }
  }

  walk(absolutePath);
  return entries;
}

const packageJson = readJson("package.json");
const version = packageJson.version;
const claudePlugin = readJson(".claude-plugin/plugin.json");
const claudeMarketplace = readJson(".claude-plugin/marketplace.json");
const claudeMarketplaceEntry = claudeMarketplace.plugins.find(
  (entry) => entry.name === packageJson.name,
);
const codexPlugin = readJson(".codex-plugin/plugin.json");
const codexPluginMirror = readJson("plugins/token-burningman/.codex-plugin/plugin.json");

for (const executable of ["burningman", "burningman-codex-import", "burningman-mcp"]) {
  const target = packageJson.bin?.[executable];
  assert.ok(target, `package.json is missing the ${executable} bin entry`);
  assert.ok(!target.startsWith("./"), `${executable} target must not start with ./; npm publish removes it`);
  assert.ok(fs.existsSync(path.join(root, target)), `${executable} target ${target} is missing`);
}

assert.ok(claudeMarketplaceEntry, "Claude marketplace entry is missing");
for (const [label, actual] of [
  ["Claude plugin", claudePlugin.version],
  ["Claude marketplace plugin", claudeMarketplaceEntry.version],
  ["Claude marketplace metadata", claudeMarketplace.metadata.version],
  ["Codex plugin", codexPlugin.version],
  ["Codex plugin mirror", codexPluginMirror.version],
]) {
  assert.equal(actual, version, `${label} version ${actual} does not match package ${version}`);
}

assert.deepEqual(
  readJson("plugins/token-burningman/.codex.mcp.json"),
  readJson(".codex.mcp.json"),
  "Codex MCP mirror is stale; run pnpm run build",
);
assert.deepEqual(
  digestTree("plugins/token-burningman/bin"),
  digestTree("bin"),
  "Codex bin mirror is stale; run pnpm run build",
);
assert.deepEqual(
  digestTree("plugins/token-burningman/skills"),
  digestTree("skills"),
  "Codex skills mirror is stale; run pnpm run build",
);

const initialize = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "release-check", version: "1" },
  },
});
const mcp = spawnSync(process.execPath, [path.join(root, "bin/mcp.cjs")], {
  input: `${initialize}\n`,
  encoding: "utf8",
  timeout: 5_000,
});
assert.equal(mcp.error, undefined, `MCP smoke test failed: ${mcp.error?.message}`);
assert.equal(mcp.status, 0, `MCP smoke test exited ${mcp.status}: ${mcp.stderr}`);
const response = JSON.parse(mcp.stdout.trim().split("\n")[0]);
assert.equal(
  response.result?.serverInfo?.version,
  version,
  `MCP server version ${response.result?.serverInfo?.version} does not match package ${version}`,
);

console.log(`Release artifacts are consistent at ${version}.`);

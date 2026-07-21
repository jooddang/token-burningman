#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: pnpm run release:bump <semver>");
  process.exit(1);
}

function updateJson(relativePath, update) {
  const filePath = path.join(root, relativePath);
  const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  update(value);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`Updated ${relativePath} -> ${version}`);
}

updateJson("package.json", (value) => {
  value.version = version;
});
updateJson(".claude-plugin/plugin.json", (value) => {
  value.version = version;
});
updateJson(".claude-plugin/marketplace.json", (value) => {
  const plugin = value.plugins.find((entry) => entry.name === "token-burningman");
  if (!plugin) throw new Error("Claude marketplace entry token-burningman is missing");
  plugin.version = version;
  value.metadata.version = version;
});
updateJson(".codex-plugin/plugin.json", (value) => {
  value.version = version;
});

console.log("Run `pnpm run release:check` to build the Codex mirror and verify the release.");

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getChainOriginalPath,
  getPersistentBinDir,
  getPluginRootFromScript,
  installHudStatusLine,
  syncBinaries,
} from "../src/plugin-setup.js";

describe("plugin setup HUD installation", () => {
  let tempHome: string;
  let tempSettingsPath: string;
  let previousHome: string | undefined;
  let previousStorageDir: string | undefined;
  let previousClaudeSettingsPath: string | undefined;

  beforeEach(() => {
    // Prefix must not contain "token-burningman": isBurningmanStatusLine
    // matches on that substring and would misclassify foreign test commands.
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "tbm-home-"));
    tempSettingsPath = path.join(tempHome, ".claude", "settings.json");
    previousHome = process.env.HOME;
    previousStorageDir = process.env.CLAUDE_USAGE_DIR;
    previousClaudeSettingsPath = process.env.BURNINGMAN_CLAUDE_SETTINGS_PATH;
    process.env.HOME = tempHome;
    process.env.CLAUDE_USAGE_DIR = path.join(tempHome, ".token-burningman");
    process.env.BURNINGMAN_CLAUDE_SETTINGS_PATH = tempSettingsPath;
  });

  afterEach(() => {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }

    if (previousStorageDir === undefined) {
      delete process.env.CLAUDE_USAGE_DIR;
    } else {
      process.env.CLAUDE_USAGE_DIR = previousStorageDir;
    }

    if (previousClaudeSettingsPath === undefined) {
      delete process.env.BURNINGMAN_CLAUDE_SETTINGS_PATH;
    } else {
      process.env.BURNINGMAN_CLAUDE_SETTINGS_PATH = previousClaudeSettingsPath;
    }

    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  const BINARIES = ["collector.cjs", "hourly-maintenance-bg.cjs"];

  function createFakePlugin(pluginRoot: string, content = "// fake collector"): void {
    const binDir = path.join(pluginRoot, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    for (const file of BINARIES) {
      fs.writeFileSync(path.join(binDir, file), `${content} ${file}`, "utf8");
    }
  }

  function createExecutableFakePlugin(pluginRoot: string, markerPath: string): void {
    createFakePlugin(pluginRoot);
    fs.writeFileSync(
      path.join(pluginRoot, "bin", "collector.cjs"),
      [
        "const fs = require('node:fs');",
        "const stdin = fs.readFileSync(0, 'utf8');",
        `fs.writeFileSync(${JSON.stringify(markerPath)}, JSON.stringify({ cwd: process.cwd(), stdin }));`,
        "process.stdout.write('ok');",
      ].join("\n"),
      "utf8",
    );
  }

  function readSettings(): { statusLine: { type: string; command: string } } {
    return JSON.parse(fs.readFileSync(tempSettingsPath, "utf8"));
  }

  it("installs collector into the plugin data dir and points statusLine at it", () => {
    const pluginRoot = path.join(tempHome, "plugin-v1");
    const dataDir = path.join(tempHome, "plugin-data");
    createFakePlugin(pluginRoot);

    const result = installHudStatusLine(pluginRoot, dataDir);

    expect(result.status).toBe("installed");
    const collectorPath = path.join(dataDir, "bin", "collector.cjs");
    expect(fs.existsSync(collectorPath)).toBe(true);
    for (const file of BINARIES) {
      expect(fs.existsSync(path.join(dataDir, "bin", file))).toBe(true);
    }
    expect(readSettings().statusLine.command).toBe(`node ${JSON.stringify(collectorPath)}`);
  });

  it("falls back to the storage bin dir without a data dir", () => {
    const pluginRoot = path.join(tempHome, "plugin-v1");
    createFakePlugin(pluginRoot);

    const result = installHudStatusLine(pluginRoot);

    const collectorPath = path.join(tempHome, ".token-burningman", "bin", "collector.cjs");
    expect(result.status).toBe("installed");
    expect(fs.existsSync(collectorPath)).toBe(true);
    expect(readSettings().statusLine.command).toBe(`node ${JSON.stringify(collectorPath)}`);
  });

  it("treats an unexpanded ${CLAUDE_PLUGIN_DATA} literal as absent", () => {
    expect(getPersistentBinDir("${CLAUDE_PLUGIN_DATA}")).toBe(
      path.join(tempHome, ".token-burningman", "bin"),
    );
  });

  it("re-syncs changed binaries on version upgrade without touching settings", () => {
    const oldRoot = path.join(tempHome, "plugin-0.1.11");
    const newRoot = path.join(tempHome, "plugin-0.1.12");
    const dataDir = path.join(tempHome, "plugin-data");
    createFakePlugin(oldRoot, "// v11");
    createFakePlugin(newRoot, "// v12");

    expect(installHudStatusLine(oldRoot, dataDir).status).toBe("installed");
    const settingsAfterInstall = readSettings().statusLine.command;

    const result = installHudStatusLine(newRoot, dataDir);
    expect(result.status).toBe("synced");
    expect(readSettings().statusLine.command).toBe(settingsAfterInstall);
    expect(
      fs.readFileSync(path.join(dataDir, "bin", "collector.cjs"), "utf8"),
    ).toContain("// v12");
  });

  it("skips copying when binaries are unchanged", () => {
    const pluginRoot = path.join(tempHome, "plugin-v1");
    const dataDir = path.join(tempHome, "plugin-data");
    createFakePlugin(pluginRoot);

    installHudStatusLine(pluginRoot, dataDir);
    const result = installHudStatusLine(pluginRoot, dataDir);

    expect(result.status).toBe("already-configured");
    expect(syncBinaries(pluginRoot, path.join(dataDir, "bin"))).toBe(0);
  });

  it("migrates a legacy wrapper install to the direct collector command", () => {
    const pluginRoot = path.join(tempHome, "plugin-v1");
    const dataDir = path.join(tempHome, "plugin-data");
    createFakePlugin(pluginRoot);

    const storageBin = path.join(tempHome, ".token-burningman", "bin");
    const legacyWrapper = path.join(storageBin, "statusline.mjs");
    const legacyPluginRoot = path.join(tempHome, ".token-burningman", ".plugin-root");
    fs.mkdirSync(storageBin, { recursive: true });
    fs.writeFileSync(legacyWrapper, "// legacy wrapper", "utf8");
    fs.writeFileSync(legacyPluginRoot, JSON.stringify("/old/versioned/path"), "utf8");
    fs.mkdirSync(path.dirname(tempSettingsPath), { recursive: true });
    fs.writeFileSync(
      tempSettingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: `node ${JSON.stringify(legacyWrapper)}` },
      }),
      "utf8",
    );

    const result = installHudStatusLine(pluginRoot, dataDir);

    expect(result.status).toBe("updated");
    const collectorPath = path.join(dataDir, "bin", "collector.cjs");
    expect(readSettings().statusLine.command).toBe(`node ${JSON.stringify(collectorPath)}`);
    // Legacy wrapper is rewritten as a forwarder for still-running sessions.
    expect(fs.readFileSync(legacyWrapper, "utf8")).toContain(collectorPath);
    expect(fs.existsSync(legacyPluginRoot)).toBe(false);
  });

  function writeForeignStatusLine(command: string): void {
    fs.mkdirSync(path.dirname(tempSettingsPath), { recursive: true });
    fs.writeFileSync(
      tempSettingsPath,
      JSON.stringify({ statusLine: { type: "command", command } }, null, 2),
      "utf8",
    );
  }

  it("chains a foreign statusline by default", () => {
    const pluginRoot = path.join(tempHome, "plugin-chain");
    const dataDir = path.join(tempHome, "plugin-data");
    createFakePlugin(pluginRoot);
    writeForeignStatusLine("node /tmp/other-statusline.js");

    const result = installHudStatusLine(pluginRoot, dataDir);

    expect(result.status).toBe("chained");
    const wrapperPath = path.join(dataDir, "bin", "statusline-chain.mjs");
    expect(readSettings().statusLine.command).toBe(`node ${JSON.stringify(wrapperPath)}`);
    const sidecar = JSON.parse(fs.readFileSync(getChainOriginalPath(), "utf8"));
    expect(sidecar.command).toBe("node /tmp/other-statusline.js");
  });

  it("chain wrapper renders the foreign line above the collector line", () => {
    const pluginRoot = path.join(tempHome, "plugin-chain-exec");
    const dataDir = path.join(tempHome, "plugin-data");
    const markerPath = path.join(tempHome, "collector-marker.json");
    createExecutableFakePlugin(pluginRoot, markerPath);

    const foreignScript = path.join(tempHome, "foreign-statusline.cjs");
    fs.writeFileSync(foreignScript, "process.stdout.write('FOREIGN');", "utf8");
    writeForeignStatusLine(`node ${JSON.stringify(foreignScript)}`);

    installHudStatusLine(pluginRoot, dataDir);

    const output = execFileSync("node", [path.join(dataDir, "bin", "statusline-chain.mjs")], {
      input: '{"session_id":"chained"}',
      encoding: "utf8",
    });

    expect(output).toBe("FOREIGN\nok");
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as { stdin: string };
    expect(marker.stdin).toBe('{"session_id":"chained"}');
  });

  it("re-running keeps the chain intact", () => {
    const pluginRoot = path.join(tempHome, "plugin-chain-rerun");
    const dataDir = path.join(tempHome, "plugin-data");
    createFakePlugin(pluginRoot);
    writeForeignStatusLine("node /tmp/other-statusline.js");

    installHudStatusLine(pluginRoot, dataDir);
    const chainedCommand = readSettings().statusLine.command;
    const result = installHudStatusLine(pluginRoot, dataDir);

    expect(result.status).toBe("already-configured");
    expect(readSettings().statusLine.command).toBe(chainedCommand);
    expect(JSON.parse(fs.readFileSync(getChainOriginalPath(), "utf8")).command).toBe(
      "node /tmp/other-statusline.js",
    );
  });

  it("re-chains instead of unchaining when the chain wrapper moved to a new bin dir", () => {
    const pluginRoot = path.join(tempHome, "plugin-chain-move");
    // Production data dirs always contain the plugin name — the stale-path
    // detection keys on that.
    const oldDataDir = path.join(tempHome, "data", "token-burningman-old");
    const newDataDir = path.join(tempHome, "data", "token-burningman-new");
    createFakePlugin(pluginRoot);
    writeForeignStatusLine("node /tmp/other-statusline.js");

    expect(installHudStatusLine(pluginRoot, oldDataDir).status).toBe("chained");

    const result = installHudStatusLine(pluginRoot, newDataDir);

    expect(result.status).toBe("chained");
    const newWrapper = path.join(newDataDir, "bin", "statusline-chain.mjs");
    expect(readSettings().statusLine.command).toBe(`node ${JSON.stringify(newWrapper)}`);
    expect(JSON.parse(fs.readFileSync(getChainOriginalPath(), "utf8")).command).toBe(
      "node /tmp/other-statusline.js",
    );
  });

  it("chain wrapper still renders the collector line when the foreign command fails", () => {
    const pluginRoot = path.join(tempHome, "plugin-chain-fail");
    const dataDir = path.join(tempHome, "plugin-data");
    const markerPath = path.join(tempHome, "collector-marker.json");
    createExecutableFakePlugin(pluginRoot, markerPath);

    const foreignScript = path.join(tempHome, "broken-foreign.cjs");
    fs.writeFileSync(foreignScript, "process.exit(3);", "utf8");
    writeForeignStatusLine(`node ${JSON.stringify(foreignScript)}`);

    installHudStatusLine(pluginRoot, dataDir);

    const output = execFileSync("node", [path.join(dataDir, "bin", "statusline-chain.mjs")], {
      input: '{"session_id":"x"}',
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });

    expect(output).toBe("ok");
  });

  it("chain wrapper degrades to collector-only when the sidecar is corrupt", () => {
    const pluginRoot = path.join(tempHome, "plugin-chain-corrupt");
    const dataDir = path.join(tempHome, "plugin-data");
    const markerPath = path.join(tempHome, "collector-marker.json");
    createExecutableFakePlugin(pluginRoot, markerPath);
    writeForeignStatusLine("node /tmp/other-statusline.js");

    installHudStatusLine(pluginRoot, dataDir);
    fs.writeFileSync(getChainOriginalPath(), "not-json", "utf8");

    const output = execFileSync("node", [path.join(dataDir, "bin", "statusline-chain.mjs")], {
      input: '{"session_id":"x"}',
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });

    expect(output).toBe("ok");
  });

  it("does not overwrite an unrelated statusLine when chaining is disabled", () => {
    const pluginRoot = path.join(tempHome, "plugin-skip");
    createFakePlugin(pluginRoot);
    writeForeignStatusLine("node /tmp/other-statusline.js");
    const storageDir = path.join(tempHome, ".token-burningman");
    fs.mkdirSync(storageDir, { recursive: true });
    fs.writeFileSync(
      path.join(storageDir, "config.json"),
      JSON.stringify({ display: { chainStatusline: false } }),
      "utf8",
    );

    const result = installHudStatusLine(pluginRoot);

    expect(result.status).toBe("skipped-existing");
    expect(readSettings().statusLine.command).toBe("node /tmp/other-statusline.js");
  });

  it("installed collector runs from the persistent path", () => {
    const pluginRoot = path.join(tempHome, "plugin-exec");
    const dataDir = path.join(tempHome, "plugin-data");
    const markerPath = path.join(tempHome, "collector-marker.json");
    createExecutableFakePlugin(pluginRoot, markerPath);

    installHudStatusLine(pluginRoot, dataDir);

    const output = execFileSync("node", [path.join(dataDir, "bin", "collector.cjs")], {
      input: '{"session_id":"abc"}',
      encoding: "utf8",
    });

    expect(output).toBe("ok");
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as { stdin: string };
    expect(marker.stdin).toBe('{"session_id":"abc"}');
  });

  it("throws when a required binary does not exist", () => {
    const badRoot = path.join(tempHome, "plugin-missing");
    fs.mkdirSync(badRoot, { recursive: true });
    expect(() => installHudStatusLine(badRoot)).toThrow("not found");
  });

  it("prefers the explicit CLAUDE_PLUGIN_ROOT override", () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/tmp/token-burningman";
    expect(getPluginRootFromScript("/ignored/bin/plugin-setup.cjs")).toBe("/tmp/token-burningman");
    delete process.env.CLAUDE_PLUGIN_ROOT;
  });
});

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getHudWrapperPath, getPluginRootFilePath, getPluginRootFromScript, installHudStatusLine } from "../src/plugin-setup.js";

describe("plugin setup HUD installation", () => {
  let tempHome: string;
  let tempSettingsPath: string;
  let previousHome: string | undefined;
  let previousStorageDir: string | undefined;
  let previousClaudeSettingsPath: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "token-burningman-home-"));
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

  function createFakePlugin(pluginRoot: string): void {
    const binDir = path.join(pluginRoot, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, "collector.cjs"), "// fake collector", "utf8");
  }

  it("installs the HUD wrapper when no statusLine exists", () => {
    const pluginRoot = path.join(tempHome, "plugin-v1");
    createFakePlugin(pluginRoot);
    const result = installHudStatusLine(pluginRoot);
    const wrapperPath = getHudWrapperPath();
    const pluginRootFile = getPluginRootFilePath();

    expect(result.status).toBe("installed");
    expect(fs.existsSync(wrapperPath)).toBe(true);
    // Wrapper should reference .plugin-root file, not a hardcoded collector path
    const wrapperContent = fs.readFileSync(wrapperPath, "utf8");
    expect(wrapperContent).toContain(".plugin-root");
    expect(wrapperContent).not.toContain(path.join(pluginRoot, "bin", "collector.cjs"));
    // .plugin-root should contain the pluginRoot
    expect(JSON.parse(fs.readFileSync(pluginRootFile, "utf8"))).toBe(pluginRoot);

    const settings = JSON.parse(fs.readFileSync(tempSettingsPath, "utf8")) as {
      statusLine: { type: string; command: string };
    };
    expect(settings.statusLine.type).toBe("command");
    expect(settings.statusLine.command).toBe(`node ${JSON.stringify(wrapperPath)}`);
  });

  it("does not overwrite an unrelated existing statusLine", () => {
    const pluginRoot = path.join(tempHome, "plugin-skip");
    createFakePlugin(pluginRoot);
    fs.mkdirSync(path.dirname(tempSettingsPath), { recursive: true });
    fs.writeFileSync(
      tempSettingsPath,
      JSON.stringify(
        {
          statusLine: {
            type: "command",
            command: "node /tmp/other-statusline.js",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = installHudStatusLine(pluginRoot);
    const settings = JSON.parse(fs.readFileSync(tempSettingsPath, "utf8")) as {
      statusLine: { type: string; command: string };
    };

    expect(result.status).toBe("skipped-existing");
    expect(settings.statusLine.command).toBe("node /tmp/other-statusline.js");
  });

  it("updates .plugin-root on version upgrade without touching settings", () => {
    const oldRoot = path.join(tempHome, "plugin-0.1.5");
    const newRoot = path.join(tempHome, "plugin-0.1.7");
    createFakePlugin(oldRoot);
    createFakePlugin(newRoot);

    const result1 = installHudStatusLine(oldRoot);
    expect(result1.status).toBe("installed");

    const pluginRootFile = getPluginRootFilePath();
    expect(JSON.parse(fs.readFileSync(pluginRootFile, "utf8"))).toBe(oldRoot);

    const result2 = installHudStatusLine(newRoot);
    expect(result2.status).toBe("wrapper-updated");
    expect(JSON.parse(fs.readFileSync(pluginRootFile, "utf8"))).toBe(newRoot);

    // Wrapper content should NOT contain any version-specific path
    const wrapperContent = fs.readFileSync(getHudWrapperPath(), "utf8");
    expect(wrapperContent).not.toContain(oldRoot);
    expect(wrapperContent).not.toContain(newRoot);
    expect(wrapperContent).toContain(".plugin-root");
  });

  it("returns already-configured when nothing changed", () => {
    const pluginRoot = path.join(tempHome, "plugin-same");
    createFakePlugin(pluginRoot);

    installHudStatusLine(pluginRoot);
    const result = installHudStatusLine(pluginRoot);
    expect(result.status).toBe("already-configured");
  });

  it("throws when collector.cjs does not exist", () => {
    const badRoot = path.join(tempHome, "plugin-missing");
    fs.mkdirSync(badRoot, { recursive: true });
    expect(() => installHudStatusLine(badRoot)).toThrow("collector.cjs not found");
  });

  it("prefers the explicit CLAUDE_PLUGIN_ROOT override", () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/tmp/token-burningman";
    expect(getPluginRootFromScript("/ignored/bin/plugin-setup.cjs")).toBe("/tmp/token-burningman");
    delete process.env.CLAUDE_PLUGIN_ROOT;
  });
});

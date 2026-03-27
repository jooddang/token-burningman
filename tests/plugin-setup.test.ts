import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getHudWrapperPath, installHudStatusLine } from "../src/plugin-setup.js";

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

  it("installs the HUD wrapper when no statusLine exists", () => {
    const pluginRoot = "/tmp/token-burningman-plugin";
    const result = installHudStatusLine(pluginRoot);
    const wrapperPath = getHudWrapperPath();

    expect(result.status).toBe("installed");
    expect(fs.existsSync(wrapperPath)).toBe(true);
    expect(fs.readFileSync(wrapperPath, "utf8")).toContain(path.join(pluginRoot, "bin", "collector.cjs"));

    const settings = JSON.parse(fs.readFileSync(tempSettingsPath, "utf8")) as {
      statusLine: { type: string; command: string };
    };
    expect(settings.statusLine.type).toBe("command");
    expect(settings.statusLine.command).toBe(`node ${JSON.stringify(wrapperPath)}`);
  });

  it("does not overwrite an unrelated existing statusLine", () => {
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

    const result = installHudStatusLine("/tmp/token-burningman-plugin");
    const settings = JSON.parse(fs.readFileSync(tempSettingsPath, "utf8")) as {
      statusLine: { type: string; command: string };
    };

    expect(result.status).toBe("skipped-existing");
    expect(settings.statusLine.command).toBe("node /tmp/other-statusline.js");
  });
});

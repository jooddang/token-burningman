import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, spawn } from "node:child_process";

function findBinDir(): string {
  return path.dirname(process.argv[1] || __filename);
}

export async function launchTui(mode: "auto" | "tmux" | "terminal" = "auto"): Promise<string> {
  const binDir = findBinDir();
  const tuiPath = path.join(binDir, "tui.js");

  if (!fs.existsSync(tuiPath)) {
    return `TUI entry not found at ${tuiPath}`;
  }

  if ((mode === "auto" || mode === "tmux") && process.env.TMUX) {
    try {
      execFileSync("tmux", ["split-window", "-h", "node", "--", tuiPath], {
        cwd: process.cwd(),
        stdio: "ignore",
      });
      return "Opened token-burningman TUI in a tmux split pane.";
    } catch {
      if (mode === "tmux") {
        return "tmux split launch failed.";
      }
    }
  }

  if ((mode === "auto" || mode === "terminal") && process.platform === "darwin") {
    try {
      execFileSync("osascript", [
        "-e",
        `tell application "Terminal" to do script "exec node " & quoted form of "${tuiPath}"`,
      ], {
        cwd: process.cwd(),
        stdio: "ignore",
      });
      return "Opened token-burningman TUI in a new Terminal window.";
    } catch {
      if (mode === "terminal") {
        return "Terminal launch failed.";
      }
    }
  }

  try {
    const child = spawn("node", [tuiPath], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return "Launched token-burningman TUI as a detached process.";
  } catch {
    return "TUI launch failed.";
  }
}

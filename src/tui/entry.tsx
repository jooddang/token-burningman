import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { ensureStorageDirs } from "../utils/storage.js";
import { APP_VERSION } from "../version.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`burningman — Token usage analytics for Claude Code (v${APP_VERSION})

Usage:
  burningman [options]

Options:
  --help, -h       Show this help message
  --version, -v    Show version number

Navigation:
  1-5    Switch views (Overview, Projects, Sessions, Trends, Community)
  q      Quit
  r      Refresh data
  [ ]    Change time range (Sessions view)
`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(`burningman v${APP_VERSION}`);
  process.exit(0);
}

ensureStorageDirs();

// Enter alternate screen buffer to avoid ghost frames
process.stdout.write("\x1b[?1049h");
process.stdout.write("\x1b[H"); // cursor to top-left

const instance = render(<App />);

instance.waitUntilExit().then(() => {
  // Leave alternate screen buffer
  process.stdout.write("\x1b[?1049l");
});

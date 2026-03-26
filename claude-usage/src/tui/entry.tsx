import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { ensureStorageDirs } from "../utils/storage.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`token-burningman TUI Dashboard v0.1.0

Usage:
  token-burningman [options]

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
  console.log("token-burningman v0.1.0");
  process.exit(0);
}

ensureStorageDirs();
render(<App />);

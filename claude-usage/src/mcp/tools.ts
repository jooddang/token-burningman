import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  getOverviewModel,
  getProjectsModel,
  getSessionsModel,
  getTrendsModel,
} from "../dashboard/service.js";
import { renderOverviewMarkdown } from "../presenters/text/overview.js";
import { renderSessionsMarkdown } from "../presenters/text/sessions.js";
import { renderProjectsMarkdown } from "../presenters/text/projects.js";
import { renderTrendsMarkdown } from "../presenters/text/trends.js";
import { launchTui } from "./launch-tui.js";
import { submitPublicReport } from "../reporter.js";
import { readJson, getConfigPath } from "../utils/storage.js";
import { DEFAULT_CONFIG } from "../types.js";

const SESSION_RANGE_SCHEMA = z.enum(["24h", "48h", "7d"]);
const PROJECT_RANGE_SCHEMA = z.enum(["7", "30", "90"]);

function asTextResult(text: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "get_overview",
    {
      title: "Get Usage Overview",
      description: "Read the local token-burningman overview dashboard as Markdown.",
    },
    async () => {
      const model = getOverviewModel();
      return asTextResult(renderOverviewMarkdown(model), { overview: model });
    },
  );

  server.registerTool(
    "get_sessions",
    {
      title: "Get Session History",
      description: "Read session history for a time range.",
      inputSchema: {
        range: SESSION_RANGE_SCHEMA.default("24h").describe("One of 24h, 48h, or 7d."),
      },
    },
    async ({ range }) => {
      const model = getSessionsModel(range);
      return asTextResult(renderSessionsMarkdown(model), { sessions: model });
    },
  );

  server.registerTool(
    "get_projects",
    {
      title: "Get Project Breakdown",
      description: "Read project-level token and cost analytics.",
      inputSchema: {
        rangeDays: PROJECT_RANGE_SCHEMA.default("30").describe("One of 7, 30, or 90."),
      },
    },
    async ({ rangeDays }) => {
      const model = getProjectsModel(Number(rangeDays));
      return asTextResult(renderProjectsMarkdown(model), { projects: model });
    },
  );

  server.registerTool(
    "get_trends",
    {
      title: "Get Usage Trends",
      description: "Read daily cost, cache, and productivity trends.",
      inputSchema: {
        rangeDays: PROJECT_RANGE_SCHEMA.default("30").describe("One of 7, 30, or 90."),
      },
    },
    async ({ rangeDays }) => {
      const model = getTrendsModel(Number(rangeDays));
      return asTextResult(renderTrendsMarkdown(model), { trends: model });
    },
  );

  server.registerTool(
    "launch_tui",
    {
      title: "Launch Full TUI",
      description: "Open the full Ink TUI in tmux or a separate terminal window.",
      inputSchema: {
        mode: z.enum(["auto", "tmux", "terminal"]).default("auto"),
      },
    },
    async ({ mode }) => {
      const result = await launchTui(mode);
      return asTextResult(result, { status: result, mode });
    },
  );

  server.registerTool(
    "sync_report",
    {
      title: "Sync Report to Community Server",
      description: "Manually submit unreported hourly usage data to the community server.",
    },
    async () => {
      const config = readJson(getConfigPath(), DEFAULT_CONFIG);
      if (!config.publicReporting?.cliToken) {
        return asTextResult("Not authenticated. Sign in via the Community tab in the TUI first.");
      }
      const ok = await submitPublicReport(config);
      return ok
        ? asTextResult("Report synced successfully.", { status: "ok" })
        : asTextResult("Sync failed. Check server connectivity or auth token.", { status: "error" });
    },
  );
}

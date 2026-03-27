import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

export function registerResources(server: McpServer): void {
  server.registerResource(
    "overview",
    "burningman://overview",
    {
      title: "Token Burningman Overview",
      description: "Markdown overview of current usage, quota, and active sessions.",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "burningman://overview",
          text: renderOverviewMarkdown(getOverviewModel()),
        },
      ],
    }),
  );

  server.registerResource(
    "sessions-24h",
    "burningman://sessions/24h",
    {
      title: "Session History (24h)",
      description: "Markdown session history for the last 24 hours.",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "burningman://sessions/24h",
          text: renderSessionsMarkdown(getSessionsModel("24h")),
        },
      ],
    }),
  );

  server.registerResource(
    "projects-30d",
    "burningman://projects/30d",
    {
      title: "Projects (30d)",
      description: "Markdown project breakdown for the last 30 days.",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "burningman://projects/30d",
          text: renderProjectsMarkdown(getProjectsModel(30)),
        },
      ],
    }),
  );

  server.registerResource(
    "trends-30d",
    "burningman://trends/30d",
    {
      title: "Trends (30d)",
      description: "Markdown cost, cache, and productivity trends for the last 30 days.",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "burningman://trends/30d",
          text: renderTrendsMarkdown(getTrendsModel(30)),
        },
      ],
    }),
  );
}

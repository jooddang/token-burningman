import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "burningman-overview",
    {
      title: "Token Burningman Overview",
      description: "Show today's usage overview.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: "Call get_overview and display the returned markdown as-is.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "burningman-projects",
    {
      title: "Token Burningman Projects",
      description: "Show project usage breakdown.",
      argsSchema: {
        rangeDays: z
          .string()
          .optional()
          .default("30")
          .describe("Time window in days (7, 30, or 90)."),
      },
    },
    async ({ rangeDays: raw }) => {
      const rangeDays = ["7", "30", "90"].includes(raw) ? raw : "30";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Call get_projects with rangeDays "${rangeDays}" and display the returned markdown as-is.`,
            },
          },
        ],
      };
    },
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ensureStorageDirs } from "../utils/storage.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";
import { APP_VERSION } from "../version.js";

async function main(): Promise<void> {
  ensureStorageDirs();

  const server = new McpServer({
    name: "token-burningman",
    version: APP_VERSION,
  });

  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("token-burningman MCP server error:", error);
  process.exit(1);
});

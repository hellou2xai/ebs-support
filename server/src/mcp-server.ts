// Standalone MCP server (stdio) exposing the EBS/ITSM tools over the data CSVs.
// Same handlers the web backend uses in-process, so the MCP layer is real and can
// be wired into Claude Desktop or the MCP Inspector. Run: npm run mcp
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { toolDefs, handlers } from "./tools.js";

const server = new Server(
  { name: "alice-ebs-ams", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefs.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input as any,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const fn = handlers[req.params.name];
  if (!fn) throw new Error(`Unknown tool: ${req.params.name}`);
  const result = fn(req.params.arguments ?? {});
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("alice-ebs-ams MCP server running on stdio");

import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

export interface ToolModule {
  definitions: Tool[];
  handlers: Record<string, (args: unknown) => Promise<CallToolResult>>;
}

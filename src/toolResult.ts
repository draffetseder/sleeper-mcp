import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const asContent = (payload: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(payload) }],
});

export const asError = (message: string): CallToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

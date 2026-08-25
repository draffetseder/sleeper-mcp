import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SleeperServer } from "../src/SleeperServer.js";

// Mock axios
vi.mock("axios");

describe("SleeperServer", () => {
  let server: SleeperServer;
  let mockAxiosGet: any;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create a mock axios instance
    mockAxiosGet = vi.fn();
    (axios.create as any).mockReturnValue({
      get: mockAxiosGet,
    });

    server = new SleeperServer();
  });

  // Helper to access private methods for testing
  // Since we are testing internal logic via public tool handlers, we simulate tool calls
  // However, the tool handlers are private callbacks.
  // A better approach for unit testing this specific implementation is to test the private _apiCall or specific methods
  // if we cast to any, or we can test the public interface (tool calling) if we mocked the transport.
  // For simplicity and effectiveness, we will test the private methods by casting to any,
  // as setting up a full MCP client/transport for unit tests is complex.

  const invokePrivateMethod = async (methodName: string, args?: any) => {
    return await (server as any)[methodName](args);
  };

  it("should get user", async () => {
    mockAxiosGet.mockResolvedValue({ data: { username: "testuser" } });
    const result = await invokePrivateMethod("_getUser", { user_id_or_name: "testuser" });

    expect(mockAxiosGet).toHaveBeenCalledWith("/user/testuser", { params: undefined });
    expect(JSON.parse(result.content[0].text)).toEqual({ username: "testuser" });
  });

  it("should get user leagues", async () => {
    mockAxiosGet.mockResolvedValue({ data: [] });
    await invokePrivateMethod("_getUserLeagues", { user_id: "123", season: "2024" });

    expect(mockAxiosGet).toHaveBeenCalledWith("/user/123/leagues/nfl/2024", { params: undefined });
  });

  it("should get trending players with defaults", async () => {
    mockAxiosGet.mockResolvedValue({ data: [] });
    await invokePrivateMethod("_getTrendingPlayers", { type: "add" });

    expect(mockAxiosGet).toHaveBeenCalledWith("/players/nfl/trending/add", {
      params: { lookback_hours: 24, limit: 25 },
    });
  });

  it("should handle API errors", async () => {
    const error = new Error("API Error");
    (error as any).isAxiosError = true;
    (error as any).response = { data: { message: "Not Found" } };

    // We need to simulate the CallToolRequest handler to test error handling properly
    // or just test that the private method throws and the handler catches it.
    // Since _getUser calls _apiCall which awaits axios, it will throw.
    mockAxiosGet.mockRejectedValue(error);

    await expect(invokePrivateMethod("_getUser", { user_id_or_name: "baduser" })).rejects.toThrow(
      "API Error"
    );
  });

  describe("tool module seam", () => {
    it("advertises the player tools and no longer advertises get_all_players", async () => {
      const definitions = (server as any).allToolDefinitions();
      const names = definitions.map((definition: any) => definition.name);

      expect(names).toContain("search_players");
      expect(names).toContain("get_players_by_id");
      expect(names).not.toContain("get_all_players");
    });

    it("routes a module tool to its handler", async () => {
      const handler = (server as any).moduleHandlers.get("search_players");
      expect(typeof handler).toBe("function");
    });

    it("no longer exposes the _getAllPlayers method", () => {
      expect((server as any)._getAllPlayers).toBeUndefined();
    });

    it("dispatches a module tool name to the module handler through the real CallToolRequest handler", async () => {
      const handlers = new Map<unknown, (request: unknown) => Promise<unknown>>();
      const spy = vi
        .spyOn(Server.prototype, "setRequestHandler")
        .mockImplementation((schema: unknown, handler: (request: unknown) => Promise<unknown>) => {
          handlers.set(schema, handler);
        });

      try {
        new SleeperServer();
        const callToolHandler = handlers.get(CallToolRequestSchema) as (
          request: unknown
        ) => Promise<any>;
        expect(typeof callToolHandler).toBe("function");

        const moduleResult = await callToolHandler({
          params: { name: "search_players", arguments: {} },
        });
        expect(moduleResult.isError).toBe(true);
        expect(moduleResult.content[0].text).toContain("at least one of");
      } finally {
        spy.mockRestore();
      }
    });

    it("still throws MethodNotFound for an unknown tool name through the real CallToolRequest handler", async () => {
      const handlers = new Map<unknown, (request: unknown) => Promise<unknown>>();
      const spy = vi
        .spyOn(Server.prototype, "setRequestHandler")
        .mockImplementation((schema: unknown, handler: (request: unknown) => Promise<unknown>) => {
          handlers.set(schema, handler);
        });

      try {
        new SleeperServer();
        const callToolHandler = handlers.get(CallToolRequestSchema) as (
          request: unknown
        ) => Promise<any>;

        await expect(
          callToolHandler({ params: { name: "totally_unknown_tool", arguments: {} } })
        ).rejects.toMatchObject({ code: ErrorCode.MethodNotFound });
      } finally {
        spy.mockRestore();
      }
    });
  });
});

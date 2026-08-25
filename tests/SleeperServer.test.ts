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

    it("advertises every tool as read-only", () => {
      const definitions = (server as any).allToolDefinitions();
      expect(definitions.length).toBeGreaterThan(0);

      for (const definition of definitions) {
        expect(definition.annotations?.readOnlyHint, definition.name).toBe(true);
        expect(definition.annotations?.openWorldHint, definition.name).toBe(true);
      }
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
  describe("response shaping", () => {
    it("prunes null fields out of a user response", async () => {
      mockAxiosGet.mockResolvedValue({
        data: { user_id: "1", username: "sleeper", real_name: null, avatar: null },
      });
      const result = await invokePrivateMethod("_getUser", { user_id_or_name: "sleeper" });

      expect(JSON.parse(result.content[0].text)).toEqual({ user_id: "1", username: "sleeper" });
    });

    it("never echoes account-private fields on a user response", async () => {
      mockAxiosGet.mockResolvedValue({
        data: { user_id: "1", email: "a@b.c", phone: "555", token: "secret" },
      });
      const result = await invokePrivateMethod("_getUser", { user_id_or_name: "sleeper" });

      expect(JSON.parse(result.content[0].text)).toEqual({ user_id: "1" });
    });

    it("drops scoring_settings from a league response by default", async () => {
      mockAxiosGet.mockResolvedValue({
        data: { league_id: "9", name: "L", shard: 95, scoring_settings: { rec: 1 } },
      });
      const result = await invokePrivateMethod("_getLeague", { league_id: "9" });

      expect(JSON.parse(result.content[0].text)).toEqual({ league_id: "9", name: "L" });
    });

    it("returns scoring_settings when the caller asks for it", async () => {
      mockAxiosGet.mockResolvedValue({
        data: { league_id: "9", name: "L", shard: 95, scoring_settings: { rec: 1 } },
      });
      const result = await invokePrivateMethod("_getLeague", {
        league_id: "9",
        fields: ["scoring_settings"],
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        league_id: "9",
        name: "L",
        scoring_settings: { rec: 1 },
      });
    });

    it("returns the untouched response when fields is [all]", async () => {
      const data = { league_id: "9", shard: 95, scoring_settings: { rec: 1 }, keepers: null };
      mockAxiosGet.mockResolvedValue({ data });
      const result = await invokePrivateMethod("_getLeague", {
        league_id: "9",
        fields: ["all"],
      });

      expect(JSON.parse(result.content[0].text)).toEqual(data);
    });

    it("emits compact JSON rather than indented JSON", async () => {
      mockAxiosGet.mockResolvedValue({ data: { league_id: "9", name: "L" } });
      const result = await invokePrivateMethod("_getLeague", { league_id: "9" });

      expect(result.content[0].text).not.toContain("\n");
    });

    it("advertises a fields escape hatch on every tool that drops data", () => {
      const definitions = (server as any).allToolDefinitions();
      const shaped = [
        "get_user",
        "get_user_leagues",
        "get_league",
        "get_users_in_league",
        "get_user_drafts",
        "get_league_drafts",
        "get_draft",
        "get_draft_picks",
      ];

      for (const name of shaped) {
        const definition = definitions.find((entry: any) => entry.name === name);
        expect(definition.inputSchema.properties.fields, name).toBeDefined();
        expect(definition.inputSchema.required, name).not.toContain("fields");
      }
    });

    it("tells the caller how to get scoring_settings back", () => {
      const definitions = (server as any).allToolDefinitions();
      const league = definitions.find((entry: any) => entry.name === "get_league");

      expect(league.description).toContain("scoring_settings");
    });

    it("rejects a fields argument that is not an array", async () => {
      mockAxiosGet.mockResolvedValue({ data: { league_id: "9" } });
      const result = await invokePrivateMethod("_getLeague", {
        league_id: "9",
        fields: "scoring_settings",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("fields");
    });
  });
});

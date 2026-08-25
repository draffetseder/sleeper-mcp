import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { PlayerCache } from "./players/PlayerCache.js";
import { createPlayersModule } from "./players/tools.js";
import type { ShapeKey } from "./responses/noise.js";
import { shapeResponse } from "./responses/shape.js";
import type { ToolModule } from "./ToolModule.js";
import { asContent, asError } from "./toolResult.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

interface LocalDefaults {
  user_id?: string;
  username?: string;
  league_id?: string;
}

const loadLocalDefaults = (): LocalDefaults => {
  try {
    return require("../.sleeper-mcp.json") as LocalDefaults;
  } catch {
    return {};
  }
};

// Every tool this server exposes is a GET against Sleeper's public API.
const READ_ONLY = { readOnlyHint: true, openWorldHint: true };

const SHAPED_TOOLS = new Set([
  "get_user",
  "get_user_leagues",
  "get_league",
  "get_users_in_league",
  "get_user_drafts",
  "get_league_drafts",
  "get_draft",
  "get_draft_picks",
]);

const FIELDS_DESCRIPTION =
  "Fields to add back to the trimmed response. Name a dropped field (for example " +
  '["scoring_settings"]) to re-include just that one, or use ["all"] to get the raw ' +
  "Sleeper response with nothing removed.";

const withFieldsParam = (inputSchema: Tool["inputSchema"]): Tool["inputSchema"] => ({
  ...inputSchema,
  properties: {
    ...inputSchema.properties,
    fields: {
      type: "array",
      items: { type: "string" },
      description: FIELDS_DESCRIPTION,
    },
  },
});

// Tool argument interfaces
interface GetUserArgs {
  user_id_or_name: string;
  fields?: unknown;
}
interface GetUserLeaguesArgs {
  user_id: string;
  season: string;
  sport?: string;
  fields?: unknown;
}
interface GetLeagueArgs {
  league_id: string;
  fields?: unknown;
}
interface GetRostersInLeagueArgs {
  league_id: string;
}
interface GetUsersInLeagueArgs {
  league_id: string;
  fields?: unknown;
}
interface GetMatchupsInLeagueArgs {
  league_id: string;
  week: number;
}
interface GetLeagueWinnersBracketArgs {
  league_id: string;
}
interface GetLeagueLosersBracketArgs {
  league_id: string;
}
interface GetTransactionsInLeagueArgs {
  league_id: string;
  week: number;
}
interface GetTradedPicksInLeagueArgs {
  league_id: string;
}
interface GetUserDraftsArgs {
  user_id: string;
  season: string;
  sport?: string;
  fields?: unknown;
}
interface GetLeagueDraftsArgs {
  league_id: string;
  fields?: unknown;
}
interface GetDraftArgs {
  draft_id: string;
  fields?: unknown;
}
interface GetDraftPicksArgs {
  draft_id: string;
  fields?: unknown;
}
interface GetTradedPicksInDraftArgs {
  draft_id: string;
}
interface GetTrendingPlayersArgs {
  type: "add" | "drop";
  sport?: string;
  lookback_hours?: number;
  limit?: number;
}

interface ApiCallOptions {
  params?: object;
  shape?: ShapeKey;
  fields?: unknown;
}

export class SleeperServer {
  private server: Server;
  private axiosInstance;
  private modules: ToolModule[];
  private moduleHandlers: Map<string, (args: unknown) => Promise<CallToolResult>>;
  private defaults: LocalDefaults;

  constructor() {
    this.defaults = loadLocalDefaults();

    this.server = new Server(
      {
        name: "sleeper-mcp",
        version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: "https://api.sleeper.app/v1",
    });

    this.modules = [createPlayersModule(new PlayerCache(this.axiosInstance))];
    this.moduleHandlers = new Map(
      this.modules.flatMap((module) => Object.entries(module.handlers))
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private staticToolDefinitions(): Tool[] {
    const definitions: Tool[] = [
      // User Endpoints
      {
        name: "get_user",
        description: "Get user information by username or user ID",
        inputSchema: {
          type: "object",
          properties: {
            user_id_or_name: {
              type: "string",
              description: "The username or user ID of the user",
            },
          },
          required: ["user_id_or_name"],
        },
      },
      {
        name: "get_user_leagues",
        description: "Get all leagues for a user in a given season",
        inputSchema: {
          type: "object",
          properties: {
            user_id: { type: "string", description: "The ID of the user" },
            sport: { type: "string", description: "The sport (e.g., nfl)", default: "nfl" },
            season: { type: "string", description: "The season (e.g., 2024)" },
          },
          required: ["user_id", "season"],
        },
      },
      // League Endpoints
      {
        name: "get_league",
        description:
          "Get league information by league ID. The league's scoring_settings block is " +
          'omitted by default because it is large; pass fields: ["scoring_settings"] when ' +
          "you need to answer a scoring question.",
        inputSchema: {
          type: "object",
          properties: { league_id: { type: "string", description: "The ID of the league" } },
          required: ["league_id"],
        },
      },
      {
        name: "get_rosters_in_league",
        description: "Get all rosters for a given league ID",
        inputSchema: {
          type: "object",
          properties: { league_id: { type: "string", description: "The ID of the league" } },
          required: ["league_id"],
        },
      },
      {
        name: "get_users_in_league",
        description: "Get all users for a given league ID",
        inputSchema: {
          type: "object",
          properties: { league_id: { type: "string", description: "The ID of the league" } },
          required: ["league_id"],
        },
      },
      {
        name: "get_matchups_in_league",
        description: "Get all matchups for a given week in a league",
        inputSchema: {
          type: "object",
          properties: {
            league_id: { type: "string", description: "The ID of the league" },
            week: { type: "number", description: "The week number" },
          },
          required: ["league_id", "week"],
        },
      },
      {
        name: "get_league_winners_bracket",
        description: "Get the winners playoff bracket for a league",
        inputSchema: {
          type: "object",
          properties: { league_id: { type: "string", description: "The ID of the league" } },
          required: ["league_id"],
        },
      },
      {
        name: "get_league_losers_bracket",
        description: "Get the losers playoff bracket for a league",
        inputSchema: {
          type: "object",
          properties: { league_id: { type: "string", description: "The ID of the league" } },
          required: ["league_id"],
        },
      },
      {
        name: "get_transactions_in_league",
        description: "Get all transactions for a given week in a league",
        inputSchema: {
          type: "object",
          properties: {
            league_id: { type: "string", description: "The ID of the league" },
            week: { type: "number", description: "The week number" },
          },
          required: ["league_id", "week"],
        },
      },
      {
        name: "get_traded_picks_in_league",
        description: "Get all traded picks in a league",
        inputSchema: {
          type: "object",
          properties: { league_id: { type: "string", description: "The ID of the league" } },
          required: ["league_id"],
        },
      },
      // Draft Endpoints
      {
        name: "get_user_drafts",
        description: "Get all drafts for a user in a given season",
        inputSchema: {
          type: "object",
          properties: {
            user_id: { type: "string", description: "The ID of the user" },
            season: { type: "string", description: "The season (e.g., 2024)" },
            sport: { type: "string", description: "The sport (e.g., nfl)", default: "nfl" },
          },
          required: ["user_id", "season"],
        },
      },
      {
        name: "get_league_drafts",
        description: "Get all drafts for a given league ID",
        inputSchema: {
          type: "object",
          properties: { league_id: { type: "string", description: "The ID of the league" } },
          required: ["league_id"],
        },
      },
      {
        name: "get_draft",
        description: "Get a specific draft by its ID",
        inputSchema: {
          type: "object",
          properties: { draft_id: { type: "string", description: "The ID of the draft" } },
          required: ["draft_id"],
        },
      },
      {
        name: "get_draft_picks",
        description: "Get all picks in a specific draft",
        inputSchema: {
          type: "object",
          properties: { draft_id: { type: "string", description: "The ID of the draft" } },
          required: ["draft_id"],
        },
      },
      {
        name: "get_traded_picks_in_draft",
        description: "Get all traded picks in a specific draft",
        inputSchema: {
          type: "object",
          properties: { draft_id: { type: "string", description: "The ID of the draft" } },
          required: ["draft_id"],
        },
      },
      // Players Endpoints
      {
        name: "get_trending_players",
        description: "Get trending players (adds or drops)",
        inputSchema: {
          type: "object",
          properties: {
            sport: { type: "string", description: "The sport (e.g., nfl)", default: "nfl" },
            type: { type: "string", description: "`add` or `drop`", enum: ["add", "drop"] },
            lookback_hours: { type: "number", description: "Hours to look back", default: 24 },
            limit: { type: "number", description: "Number of players to return", default: 25 },
          },
          required: ["type"],
        },
      },
      // General Endpoints
      {
        name: "get_nfl_state",
        description: "Get the current state of the NFL season",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
    ];

    return definitions.map((definition) => ({
      ...definition,
      annotations: READ_ONLY,
      inputSchema: SHAPED_TOOLS.has(definition.name)
        ? withFieldsParam(definition.inputSchema)
        : definition.inputSchema,
    }));
  }

  // Which schema params the local config can stand in for. `user_id_or_name` accepts a
  // username, but Sleeper's /user/{id}/leagues and /user/{id}/drafts endpoints 404 on one,
  // so `user_id` is only ever defaulted from a real numeric ID.
  private defaultedParams(): Map<string, string> {
    const { user_id, username, league_id } = this.defaults;
    return new Map(
      Object.entries({
        league_id,
        user_id,
        user_id_or_name: username ?? user_id,
      }).filter(([, value]) => typeof value === "string" && value.length > 0) as [string, string][]
    );
  }

  // A param that stays in `required` is a param the model will always send, which would
  // make the defaults dead weight. Drop exactly the ones the config can supply.
  private relaxRequired(definitions: Tool[]): Tool[] {
    const defaulted = this.defaultedParams();
    if (defaulted.size === 0) return definitions;

    return definitions.map((tool) => ({
      ...tool,
      inputSchema: {
        ...tool.inputSchema,
        required: (tool.inputSchema.required ?? []).filter((name) => !defaulted.has(name)),
      },
    }));
  }

  private withDefaults(args: unknown): Record<string, unknown> {
    const merged = { ...(args as Record<string, unknown> | null | undefined) };
    for (const [name, value] of this.defaultedParams()) {
      if (merged[name] === undefined) merged[name] = value;
    }
    return merged;
  }

  private allToolDefinitions(): Tool[] {
    return [
      ...this.relaxRequired(this.staticToolDefinitions()),
      ...this.modules.flatMap((module) => module.definitions),
    ];
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.allToolDefinitions(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const moduleHandler = this.moduleHandlers.get(request.params.name);
        if (moduleHandler) {
          return await moduleHandler(request.params.arguments);
        }

        const args = this.withDefaults(request.params.arguments);

        switch (request.params.name) {
          // User
          case "get_user":
            return await this._getUser(args as unknown as GetUserArgs);
          case "get_user_leagues":
            return await this._getUserLeagues(args as unknown as GetUserLeaguesArgs);
          // League
          case "get_league":
            return await this._getLeague(args as unknown as GetLeagueArgs);
          case "get_rosters_in_league":
            return await this._getRostersInLeague(args as unknown as GetRostersInLeagueArgs);
          case "get_users_in_league":
            return await this._getUsersInLeague(args as unknown as GetUsersInLeagueArgs);
          case "get_matchups_in_league":
            return await this._getMatchupsInLeague(args as unknown as GetMatchupsInLeagueArgs);
          case "get_league_winners_bracket":
            return await this._getLeagueWinnersBracket(
              args as unknown as GetLeagueWinnersBracketArgs
            );
          case "get_league_losers_bracket":
            return await this._getLeagueLosersBracket(
              args as unknown as GetLeagueLosersBracketArgs
            );
          case "get_transactions_in_league":
            return await this._getTransactionsInLeague(
              args as unknown as GetTransactionsInLeagueArgs
            );
          case "get_traded_picks_in_league":
            return await this._getTradedPicksInLeague(
              args as unknown as GetTradedPicksInLeagueArgs
            );
          // Draft
          case "get_user_drafts":
            return await this._getUserDrafts(args as unknown as GetUserDraftsArgs);
          case "get_league_drafts":
            return await this._getLeagueDrafts(args as unknown as GetLeagueDraftsArgs);
          case "get_draft":
            return await this._getDraft(args as unknown as GetDraftArgs);
          case "get_draft_picks":
            return await this._getDraftPicks(args as unknown as GetDraftPicksArgs);
          case "get_traded_picks_in_draft":
            return await this._getTradedPicksInDraft(args as unknown as GetTradedPicksInDraftArgs);
          // Players
          case "get_trending_players":
            return await this._getTrendingPlayers(args as unknown as GetTrendingPlayersArgs);
          // General
          case "get_nfl_state":
            return await this._getNflState();
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          return {
            content: [
              {
                type: "text",
                text: `Sleeper API error: ${error.response?.data?.message || error.message}`,
              },
            ],
            isError: true,
          };
        }
        throw error; // Re-throw if it's not an Axios error
      }
    });
  }

  private async _apiCall(endpoint: string, options: ApiCallOptions = {}) {
    const { params, shape, fields } = options;

    if (fields !== undefined && !Array.isArray(fields)) {
      return asError(
        `fields must be an array of field names, for example ["all"]. Received: ${typeof fields}.`
      );
    }

    const response = await this.axiosInstance.get(endpoint, { params });
    return asContent(shapeResponse(response.data, shape, fields));
  }

  // --- Tool Implementations ---

  private async _getUser(args: GetUserArgs) {
    return this._apiCall(`/user/${args.user_id_or_name}`, { shape: "user", fields: args.fields });
  }

  private async _getUserLeagues(args: GetUserLeaguesArgs) {
    const { user_id, sport = "nfl", season } = args;
    return this._apiCall(`/user/${user_id}/leagues/${sport}/${season}`, {
      shape: "league",
      fields: args.fields,
    });
  }

  private async _getLeague(args: GetLeagueArgs) {
    return this._apiCall(`/league/${args.league_id}`, { shape: "league", fields: args.fields });
  }

  private async _getRostersInLeague(args: GetRostersInLeagueArgs) {
    return this._apiCall(`/league/${args.league_id}/rosters`, { shape: "roster" });
  }

  private async _getUsersInLeague(args: GetUsersInLeagueArgs) {
    return this._apiCall(`/league/${args.league_id}/users`, {
      shape: "league_user",
      fields: args.fields,
    });
  }

  private async _getMatchupsInLeague(args: GetMatchupsInLeagueArgs) {
    return this._apiCall(`/league/${args.league_id}/matchups/${args.week}`, { shape: "matchup" });
  }

  private async _getLeagueWinnersBracket(args: GetLeagueWinnersBracketArgs) {
    return this._apiCall(`/league/${args.league_id}/winners_bracket`);
  }

  private async _getLeagueLosersBracket(args: GetLeagueLosersBracketArgs) {
    return this._apiCall(`/league/${args.league_id}/losers_bracket`);
  }

  private async _getTransactionsInLeague(args: GetTransactionsInLeagueArgs) {
    return this._apiCall(`/league/${args.league_id}/transactions/${args.week}`);
  }

  private async _getTradedPicksInLeague(args: GetTradedPicksInLeagueArgs) {
    return this._apiCall(`/league/${args.league_id}/traded_picks`);
  }

  private async _getUserDrafts(args: GetUserDraftsArgs) {
    const { user_id, season, sport = "nfl" } = args;
    return this._apiCall(`/user/${user_id}/drafts/${sport}/${season}`, {
      shape: "draft",
      fields: args.fields,
    });
  }

  private async _getLeagueDrafts(args: GetLeagueDraftsArgs) {
    return this._apiCall(`/league/${args.league_id}/drafts`, {
      shape: "draft",
      fields: args.fields,
    });
  }

  private async _getDraft(args: GetDraftArgs) {
    return this._apiCall(`/draft/${args.draft_id}`, { shape: "draft", fields: args.fields });
  }

  private async _getDraftPicks(args: GetDraftPicksArgs) {
    return this._apiCall(`/draft/${args.draft_id}/picks`, {
      shape: "draft_pick",
      fields: args.fields,
    });
  }

  private async _getTradedPicksInDraft(args: GetTradedPicksInDraftArgs) {
    return this._apiCall(`/draft/${args.draft_id}/traded_picks`);
  }

  private async _getTrendingPlayers(args: GetTrendingPlayersArgs) {
    const { sport = "nfl", type, lookback_hours = 24, limit = 25 } = args;
    return this._apiCall(`/players/${sport}/trending/${type}`, {
      params: { lookback_hours, limit },
    });
  }

  private async _getNflState() {
    return this._apiCall(`/state/nfl`);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Sleeper MCP server running on stdio");
  }
}

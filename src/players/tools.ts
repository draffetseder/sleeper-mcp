import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolModule } from "../ToolModule.js";
import type { PlayerCache } from "./PlayerCache.js";
import {
  collectValidFieldNames,
  findUnknownFields,
  projectFields,
  searchPlayers,
} from "./playerSearch.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;
const ALL_FIELDS_MAX_LIMIT = 10;
const MAX_IDS = 500;
const READ_ONLY = { readOnlyHint: true, openWorldHint: true };

const FORCE_REFRESH_DESCRIPTION =
  "Bypasses the 24-hour cache and re-downloads the full player list (~15MB, slow). " +
  "Only use when injury or roster status must be current as of right now.";

const FIELDS_DESCRIPTION =
  "Extra fields to include on top of the default set. Use ['all'] to return the untrimmed " +
  `player object; when 'all' is present, limit is clamped to at most ${ALL_FIELDS_MAX_LIMIT} ` +
  "to avoid returning an oversized response.";

const STALE_DESCRIPTION =
  "Responses include fetched_at and stale; stale: true means Sleeper was unreachable and " +
  "cached data is being served.";

interface SearchArgs {
  name?: string;
  position?: string;
  team?: string;
  fields?: unknown;
  limit?: number;
  force_refresh?: boolean;
  sport?: string;
}

interface LookupArgs {
  player_ids?: unknown;
  fields?: unknown;
  force_refresh?: boolean;
  sport?: string;
}

const asContent = (payload: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
});

const asError = (message: string): CallToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

const clampLimit = (limit: number | undefined, fields: string[]): number => {
  const max = fields.includes("all") ? ALL_FIELDS_MAX_LIMIT : MAX_LIMIT;
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    return Math.min(DEFAULT_LIMIT, max);
  }
  return Math.max(1, Math.min(Math.floor(limit), max));
};

const definitions: Tool[] = [
  {
    name: "search_players",
    description:
      "Search players by name, position, or team. Returns the most fantasy-relevant matches first. " +
      `At least one filter is required. ${STALE_DESCRIPTION}`,
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full or partial player name" },
        position: { type: "string", description: "Position, e.g. QB, RB, WR, TE, DEF" },
        team: {
          type: "string",
          description: "Team abbreviation, e.g. BUF. Use FA for free agents.",
        },
        fields: { type: "array", items: { type: "string" }, description: FIELDS_DESCRIPTION },
        limit: {
          type: "number",
          description: `Max players to return (default ${DEFAULT_LIMIT}, cap ${MAX_LIMIT})`,
        },
        force_refresh: { type: "boolean", description: FORCE_REFRESH_DESCRIPTION },
        sport: { type: "string", description: "The sport (e.g., nfl)", default: "nfl" },
      },
      required: [],
    },
  },
  {
    name: "get_players_by_id",
    description:
      "Resolve Sleeper player IDs (as returned by roster, matchup and transaction tools) to " +
      `player details. ${STALE_DESCRIPTION}`,
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        player_ids: {
          type: "array",
          items: { type: "string" },
          description: `Player IDs to resolve (max ${MAX_IDS})`,
        },
        fields: { type: "array", items: { type: "string" }, description: FIELDS_DESCRIPTION },
        force_refresh: { type: "boolean", description: FORCE_REFRESH_DESCRIPTION },
        sport: { type: "string", description: "The sport (e.g., nfl)", default: "nfl" },
      },
      required: ["player_ids"],
    },
  },
];

export const createPlayersModule = (cache: PlayerCache): ToolModule => {
  const handleSearch = async (raw: unknown): Promise<CallToolResult> => {
    const args = (raw ?? {}) as SearchArgs;
    if (!args.name && !args.position && !args.team) {
      return asError("search_players requires at least one of: name, position, team.");
    }

    const fields = args.fields ?? [];
    if (!Array.isArray(fields)) {
      return asError('fields must be an array of field names, for example ["search_rank"].');
    }

    const { players, fetched_at, stale } = await cache.get(args.sport ?? "nfl", {
      force: args.force_refresh === true,
    });

    if (fields.length > 0) {
      const unknown = findUnknownFields(fields, collectValidFieldNames(players));
      if (unknown.length > 0) {
        return asError(
          `Unknown field(s): ${unknown.join(", ")}. Use 'all' for the full object, or omit fields for the default set.`
        );
      }
    }

    const { total_matches, players: matches } = searchPlayers(
      players,
      { name: args.name, position: args.position, team: args.team },
      clampLimit(args.limit, fields)
    );

    return asContent({
      fetched_at,
      stale,
      total_matches,
      returned: matches.length,
      players: matches.map((player) => projectFields(player, fields)),
    });
  };

  const handleLookup = async (raw: unknown): Promise<CallToolResult> => {
    const args = (raw ?? {}) as LookupArgs;
    const ids = args.player_ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return asError(
        "get_players_by_id requires player_ids: a non-empty array of player id strings."
      );
    }
    if (ids.length > MAX_IDS) {
      return asError(`get_players_by_id accepts at most ${MAX_IDS} ids; received ${ids.length}.`);
    }

    const fields = args.fields ?? [];
    if (!Array.isArray(fields)) {
      return asError('fields must be an array of field names, for example ["search_rank"].');
    }

    const { players, fetched_at, stale } = await cache.get(args.sport ?? "nfl", {
      force: args.force_refresh === true,
    });

    if (fields.length > 0) {
      const unknown = findUnknownFields(fields, collectValidFieldNames(players));
      if (unknown.length > 0) {
        return asError(
          `Unknown field(s): ${unknown.join(", ")}. Use 'all' for the full object, or omit fields for the default set.`
        );
      }
    }

    const found: Record<string, unknown>[] = [];
    const notFound: string[] = [];
    for (const id of ids) {
      const key = String(id);
      const player = players[key];
      if (player) found.push(projectFields(player, fields));
      else notFound.push(key);
    }

    return asContent({ fetched_at, stale, players: found, not_found: notFound });
  };

  return {
    definitions,
    handlers: {
      search_players: handleSearch,
      get_players_by_id: handleLookup,
    },
  };
};

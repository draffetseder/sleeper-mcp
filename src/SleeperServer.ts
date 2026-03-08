import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

// Tool argument interfaces
interface GetUserArgs {
  user_id_or_name: string;
}
interface GetUserLeaguesArgs {
  user_id: string;
  season: string;
  sport?: string;
}
interface GetLeagueArgs {
  league_id: string;
}
interface GetRostersInLeagueArgs {
  league_id: string;
}
interface GetUsersInLeagueArgs {
  league_id: string;
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
}
interface GetLeagueDraftsArgs {
  league_id: string;
}
interface GetDraftArgs {
  draft_id: string;
}
interface GetDraftPicksArgs {
  draft_id: string;
}
interface GetTradedPicksInDraftArgs {
  draft_id: string;
}
interface GetAllPlayersArgs {
  sport?: string;
}
interface GetTrendingPlayersArgs {
  type: 'add' | 'drop';
  sport?: string;
  lookback_hours?: number;
  limit?: number;
}

export class SleeperServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: 'sleeper-mcp',
        version: '0.2.0', // Version updated to reflect changes
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: 'https://api.sleeper.app/v1',
    });

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // User Endpoints
        {
          name: 'get_user',
          description: 'Get user information by username or user ID',
          inputSchema: {
            type: 'object',
            properties: {
              user_id_or_name: {
                type: 'string',
                description: 'The username or user ID of the user',
              },
            },
            required: ['user_id_or_name'],
          },
        },
        {
          name: 'get_user_leagues',
          description: 'Get all leagues for a user in a given season',
          inputSchema: {
            type: 'object',
            properties: {
              user_id: { type: 'string', description: 'The ID of the user' },
              sport: { type: 'string', description: 'The sport (e.g., nfl)', default: 'nfl' },
              season: { type: 'string', description: 'The season (e.g., 2024)' },
            },
            required: ['user_id', 'season'],
          },
        },
        // League Endpoints
        {
          name: 'get_league',
          description: 'Get league information by league ID',
          inputSchema: {
            type: 'object',
            properties: { league_id: { type: 'string', description: 'The ID of the league' } },
            required: ['league_id'],
          },
        },
        {
          name: 'get_rosters_in_league',
          description: 'Get all rosters for a given league ID',
          inputSchema: {
            type: 'object',
            properties: { league_id: { type: 'string', description: 'The ID of the league' } },
            required: ['league_id'],
          },
        },
        {
          name: 'get_users_in_league',
          description: 'Get all users for a given league ID',
          inputSchema: {
            type: 'object',
            properties: { league_id: { type: 'string', description: 'The ID of the league' } },
            required: ['league_id'],
          },
        },
        {
          name: 'get_matchups_in_league',
          description: 'Get all matchups for a given week in a league',
          inputSchema: {
            type: 'object',
            properties: {
              league_id: { type: 'string', description: 'The ID of the league' },
              week: { type: 'number', description: 'The week number' },
            },
            required: ['league_id', 'week'],
          },
        },
        {
          name: 'get_league_winners_bracket',
          description: 'Get the winners playoff bracket for a league',
          inputSchema: {
            type: 'object',
            properties: { league_id: { type: 'string', description: 'The ID of the league' } },
            required: ['league_id'],
          },
        },
        {
          name: 'get_league_losers_bracket',
          description: 'Get the losers playoff bracket for a league',
          inputSchema: {
            type: 'object',
            properties: { league_id: { type: 'string', description: 'The ID of the league' } },
            required: ['league_id'],
          },
        },
        {
          name: 'get_transactions_in_league',
          description: 'Get all transactions for a given week in a league',
          inputSchema: {
            type: 'object',
            properties: {
              league_id: { type: 'string', description: 'The ID of the league' },
              week: { type: 'number', description: 'The week number' },
            },
            required: ['league_id', 'week'],
          },
        },
        {
          name: 'get_traded_picks_in_league',
          description: 'Get all traded picks in a league',
          inputSchema: {
            type: 'object',
            properties: { league_id: { type: 'string', description: 'The ID of the league' } },
            required: ['league_id'],
          },
        },
        // Draft Endpoints
        {
          name: 'get_user_drafts',
          description: 'Get all drafts for a user in a given season',
          inputSchema: {
            type: 'object',
            properties: {
              user_id: { type: 'string', description: 'The ID of the user' },
              season: { type: 'string', description: 'The season (e.g., 2024)' },
              sport: { type: 'string', description: 'The sport (e.g., nfl)', default: 'nfl' },
            },
            required: ['user_id', 'season'],
          },
        },
        {
          name: 'get_league_drafts',
          description: 'Get all drafts for a given league ID',
          inputSchema: {
            type: 'object',
            properties: { league_id: { type: 'string', description: 'The ID of the league' } },
            required: ['league_id'],
          },
        },
        {
          name: 'get_draft',
          description: 'Get a specific draft by its ID',
          inputSchema: {
            type: 'object',
            properties: { draft_id: { type: 'string', description: 'The ID of the draft' } },
            required: ['draft_id'],
          },
        },
        {
          name: 'get_draft_picks',
          description: 'Get all picks in a specific draft',
          inputSchema: {
            type: 'object',
            properties: { draft_id: { type: 'string', description: 'The ID of the draft' } },
            required: ['draft_id'],
          },
        },
        {
          name: 'get_traded_picks_in_draft',
          description: 'Get all traded picks in a specific draft',
          inputSchema: {
            type: 'object',
            properties: { draft_id: { type: 'string', description: 'The ID of the draft' } },
            required: ['draft_id'],
          },
        },
        // Players Endpoints
        {
          name: 'get_all_players',
          description: 'Get all players for a given sport',
          inputSchema: {
            type: 'object',
            properties: {
              sport: { type: 'string', description: 'The sport (e.g., nfl)', default: 'nfl' },
            },
            required: ['sport'],
          },
        },
        {
          name: 'get_trending_players',
          description: 'Get trending players (adds or drops)',
          inputSchema: {
            type: 'object',
            properties: {
              sport: { type: 'string', description: 'The sport (e.g., nfl)', default: 'nfl' },
              type: { type: 'string', description: '`add` or `drop`', enum: ['add', 'drop'] },
              lookback_hours: { type: 'number', description: 'Hours to look back', default: 24 },
              limit: { type: 'number', description: 'Number of players to return', default: 25 },
            },
            required: ['type'],
          },
        },
        // General Endpoints
        {
          name: 'get_nfl_state',
          description: 'Get the current state of the NFL season',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          // User
          case 'get_user':
            return await this._getUser(request.params.arguments as unknown as GetUserArgs);
          case 'get_user_leagues':
            return await this._getUserLeagues(request.params.arguments as unknown as GetUserLeaguesArgs);
          // League
          case 'get_league':
            return await this._getLeague(request.params.arguments as unknown as GetLeagueArgs);
          case 'get_rosters_in_league':
            return await this._getRostersInLeague(request.params.arguments as unknown as GetRostersInLeagueArgs);
          case 'get_users_in_league':
            return await this._getUsersInLeague(request.params.arguments as unknown as GetUsersInLeagueArgs);
          case 'get_matchups_in_league':
            return await this._getMatchupsInLeague(request.params.arguments as unknown as GetMatchupsInLeagueArgs);
          case 'get_league_winners_bracket':
            return await this._getLeagueWinnersBracket(request.params.arguments as unknown as GetLeagueWinnersBracketArgs);
          case 'get_league_losers_bracket':
            return await this._getLeagueLosersBracket(request.params.arguments as unknown as GetLeagueLosersBracketArgs);
          case 'get_transactions_in_league':
            return await this._getTransactionsInLeague(request.params.arguments as unknown as GetTransactionsInLeagueArgs);
          case 'get_traded_picks_in_league':
            return await this._getTradedPicksInLeague(request.params.arguments as unknown as GetTradedPicksInLeagueArgs);
          // Draft
          case 'get_user_drafts':
            return await this._getUserDrafts(request.params.arguments as unknown as GetUserDraftsArgs);
          case 'get_league_drafts':
            return await this._getLeagueDrafts(request.params.arguments as unknown as GetLeagueDraftsArgs);
          case 'get_draft':
            return await this._getDraft(request.params.arguments as unknown as GetDraftArgs);
          case 'get_draft_picks':
            return await this._getDraftPicks(request.params.arguments as unknown as GetDraftPicksArgs);
          case 'get_traded_picks_in_draft':
            return await this._getTradedPicksInDraft(request.params.arguments as unknown as GetTradedPicksInDraftArgs);
          // Players
          case 'get_all_players':
            return await this._getAllPlayers(request.params.arguments as unknown as GetAllPlayersArgs);
          case 'get_trending_players':
            return await this._getTrendingPlayers(request.params.arguments as unknown as GetTrendingPlayersArgs);
          // General
          case 'get_nfl_state':
            return await this._getNflState();
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          return {
            content: [
              {
                type: 'text',
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

  private async _apiCall(endpoint: string, params?: object) {
    const response = await this.axiosInstance.get(endpoint, { params });
    return {
      content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }],
    };
  }

  // --- Tool Implementations ---

  private async _getUser(args: GetUserArgs) {
    return this._apiCall(`/user/${args.user_id_or_name}`);
  }

  private async _getUserLeagues(args: GetUserLeaguesArgs) {
    const { user_id, sport = 'nfl', season } = args;
    return this._apiCall(`/user/${user_id}/leagues/${sport}/${season}`);
  }

  private async _getLeague(args: GetLeagueArgs) {
    return this._apiCall(`/league/${args.league_id}`);
  }

  private async _getRostersInLeague(args: GetRostersInLeagueArgs) {
    return this._apiCall(`/league/${args.league_id}/rosters`);
  }

  private async _getUsersInLeague(args: GetUsersInLeagueArgs) {
    return this._apiCall(`/league/${args.league_id}/users`);
  }

  private async _getMatchupsInLeague(args: GetMatchupsInLeagueArgs) {
    return this._apiCall(`/league/${args.league_id}/matchups/${args.week}`);
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
    const { user_id, season, sport = 'nfl' } = args;
    return this._apiCall(`/user/${user_id}/drafts/${sport}/${season}`);
  }

  private async _getLeagueDrafts(args: GetLeagueDraftsArgs) {
    return this._apiCall(`/league/${args.league_id}/drafts`);
  }

  private async _getDraft(args: GetDraftArgs) {
    return this._apiCall(`/draft/${args.draft_id}`);
  }

  private async _getDraftPicks(args: GetDraftPicksArgs) {
    return this._apiCall(`/draft/${args.draft_id}/picks`);
  }

  private async _getTradedPicksInDraft(args: GetTradedPicksInDraftArgs) {
    return this._apiCall(`/draft/${args.draft_id}/traded_picks`);
  }

  private async _getAllPlayers(args: GetAllPlayersArgs) {
    const { sport = 'nfl' } = args;
    return this._apiCall(`/players/${sport}`);
  }

  private async _getTrendingPlayers(args: GetTrendingPlayersArgs) {
    const { sport = 'nfl', type, lookback_hours = 24, limit = 25 } = args;
    return this._apiCall(`/players/${sport}/trending/${type}`, { lookback_hours, limit });
  }

  private async _getNflState() {
    return this._apiCall(`/state/nfl`);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Sleeper MCP server running on stdio');
  }
}

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

An MCP (Model Context Protocol) tool server that wraps the [Sleeper fantasy sports API](https://docs.sleeper.com/) and exposes it as a set of read-only tools an AI can call to query users, leagues, rosters, matchups, transactions, drafts, and players.

## Open Source

**This repo is public and open source.** Everything committed here is visible to
anyone. Before adding a file or staging a change, assume a stranger will read it.

1. **No personal or machine-specific data.** Never commit real usernames, Sleeper user
   or league IDs belonging to the repo owner, email addresses, or absolute local paths
   (`C:/...`, `/Users/...`). Use placeholders instead, e.g.
   `/absolute/path/to/sleeper-mcp/build/index.js`.
2. **No secrets — and none are needed.** The Sleeper API is public and unauthenticated
   (see the axios `baseURL` in `src/SleeperServer.ts`; there is no auth header
   anywhere). This server reads no credentials. Do not introduce an API-key setting, an
   `.env` requirement, or auth config — if a task seems to call for one, the task is
   wrong. The single environment variable read is `SLEEPER_MCP_CACHE_DIR`, a filesystem
   path, not a secret.
3. **Keep agent artifacts out of the repo.** Progress summaries, run reports, plans,
   handoffs, ledgers are working notes, not public documentation.
4. **Test fixtures use public data on purpose.** The integration tests query Sleeper's
   public `sleeper` demo account and its completed 2021 league. Do not swap in the
   owner's real account or a live league to make a test more realistic; the comment
   above that fixture explains why a finished season was chosen.

## Local user defaults (`.sleeper-mcp.json`)

When a request is about the *user's own* fantasy data ("my roster", "my league", "how
did I do last week"), read `.sleeper-mcp.json` in the repo root **before asking them
for identifiers**. It is the local convenience file each developer keeps for their own
Sleeper account:

```json
{
  "username": "your-sleeper-username",
  "user_id": "000000000000000000",
  "league_id": "000000000000000000"
}
```

It is gitignored and untracked on purpose — real account and league IDs are personal
data 

**If the file does not exist, create it** rather than making the user look up IDs by
hand; this server's own tools resolve everything from a username:

1. `cp .sleeper-mcp.example.json .sleeper-mcp.json`
2. Ask the user for their Sleeper **username** — the only value they need to know.
3. `get_user` with that username → `user_id`.
4. `get_user_leagues` with that `user_id` and the current season (`get_nfl_state`
   returns `league_season`) → take the `league_id`, asking which league if there are
   several.
5. Write the three values into `.sleeper-mcp.json`.

Never commit the populated file, and never copy its values into README, CLAUDE.md,
tests, fixtures, or commit messages.

## Commands

```bash
npm run build          # Compile TypeScript (src/ -> build/) via tsc
npm test               # Run unit tests (vitest), excludes *.integration.test.ts
npm run test:watch     # Run vitest in watch mode
npm run test:integration   # Run integration tests that hit the LIVE Sleeper API
npm run format         # Lint + format + autofix with Biome

# Run a single test file or test by name
npx vitest run tests/SleeperServer.test.ts
npx vitest run -t "should get user"
```

`npm run lint` checks with Biome; `npm run format` applies fixes.

## Architecture

`src/index.ts` instantiates `SleeperServer` and calls `run()`. Most of the server
lives in `src/SleeperServer.ts`; the player tools live in `src/players/` and are
registered through a small tool-module seam.

- **Transport**: `StdioServerTransport` — the server communicates over stdio (intended to be launched as a subprocess by an MCP client). Note `console.error` is used for logging because stdout is reserved for the MCP protocol.
- **Two request handlers** registered in `setupToolHandlers()`:
  - `ListToolsRequestSchema` — returns the static array of tool definitions (name, description, JSON `inputSchema`) plus each module's definitions.
  - `CallToolRequestSchema` — checks `moduleHandlers` for `request.params.name` first, then falls through to a `switch` dispatching to a private `_methodName` per static tool.
- **`_apiCall(endpoint, { params?, shape?, fields?, baseURL? })`** — the single chokepoint for all HTTP made by static tools. Every static tool method builds a path string and delegates here. It calls the shared axios instance (baseURL `https://api.sleeper.app/v1`), passes `response.data` through `shapeResponse` (see **Response shaping**), and wraps the result as compact MCP text content via `asContent` (`src/toolResult.ts`, shared with the player module). `baseURL` overrides the instance default for the one request — Sleeper serves a few undocumented endpoints off the API root rather than `/v1`, and `get_player_ownership` uses `SLEEPER_ROOT_BASE_URL` to reach one. Leave it unset for anything under `/v1`.
- **Error handling**: the `CallToolRequest` handler catches axios errors and returns them as `{ isError: true }` MCP content; non-axios errors are re-thrown.
- **Tool modules**: `src/ToolModule.ts` defines `{ definitions, handlers }`.
  `SleeperServer` concatenates each module's `definitions` onto its own tool list
  and checks `moduleHandlers` before falling through to its `switch`.
  `src/players/` is the only module today: `PlayerCache.ts` (memory → disk →
  network, 24h TTL), `playerSearch.ts` (pure filter/sort/project functions),
  `tools.ts` (definitions and handlers), and `types.ts` (the shared `Player` /
  `PlayerDictionary` / `CORE_FIELDS` definitions).

### Adding a new tool

This applies to tools implemented directly on `SleeperServer` (the static list). Because
that structure is rigidly parallel, such a tool touches four places in `SleeperServer.ts`:
1. Add an `Args` interface near the top.
2. Add a tool definition object to the array returned by `staticToolDefinitions()`.
3. Add a `case` to the `switch` in the `CallToolRequestSchema` handler.
4. Add the private `_method` that calls `_apiCall` with the right Sleeper endpoint path,
   plus a `shape` key if the endpoint has a drop-list in `src/responses/noise.ts`.
   If the endpoint is not under `/v1` (Sleeper has undocumented ones that are not), pass
   `baseURL` to `_apiCall` rather than standing up a second axios instance or hardcoding an
   absolute URL — that keeps `_apiCall` the only place this server makes HTTP requests.

If that new tool drops data, add its name to `SHAPED_TOOLS` in `SleeperServer.ts` so the
`fields` escape hatch is advertised on its schema.

Optional/defaulted params (e.g. `sport = 'nfl'`) are defaulted in the method body via destructuring, not enforced by the schema.

A tool belonging to an existing module (e.g. a new player tool) is added in that
module's `tools.ts` alone — its `definitions` and `handlers` are picked up automatically.

## Testing

- **Unit tests** (`tests/SleeperServer.test.ts`) mock axios (`vi.mock('axios')`) and invoke private methods by casting the server to `any` (`(server as any)[methodName](args)`) — a full MCP client/transport is intentionally not set up. Assertions check the exact endpoint path and params passed to axios.
- **Integration tests** (`tests/integration/`) hit the real Sleeper API and are excluded from the default `npm test`. They pin the `KNOWN_LEAGUE` fixture — the public `sleeper` demo account's completed 2021 league — and assert against it.
- **Pure logic** (`tests/players/playerSearch.test.ts`) uses a hand-written
  fixture and no mocks. **`PlayerCache`** (`tests/players/PlayerCache.test.ts`)
  uses a temp directory, `vi.useFakeTimers()` for TTL boundaries, and a stubbed
  axios instance.
- **Module handlers** (`tests/players/tools.test.ts`) exercises `search_players`
  and `get_players_by_id` against a stubbed `PlayerCache`, covering validation
  and error paths.
- Biome disables `noExplicitAny` for `tests/**` (see the override in `biome.json`), which is why the `any` casts above don't trip the linter.

## Conventions

- ES modules (`"type": "module"`). Imports of local files use the `.js` extension even for `.ts` sources (required by `Node16` module resolution), e.g. `import { SleeperServer } from './SleeperServer.js'`.
- Biome config: 2-space indent, 100 char line width, ES5 trailing commas, always semicolons, always arrow parens.

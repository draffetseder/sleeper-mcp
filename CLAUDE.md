# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

An MCP (Model Context Protocol) tool server that wraps the [Sleeper fantasy sports API](https://docs.sleeper.com/) and exposes it as a set of read-only tools an AI can call to query users, leagues, rosters, matchups, transactions, drafts, and players.

## Open Source

**This repo is public and open source ** Everything committed here is visible to
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
- **`_apiCall(endpoint, params?)`** — the single chokepoint for all HTTP made by static tools. Every static tool method builds a path string and delegates here. It calls the shared axios instance (baseURL `https://api.sleeper.app/v1`) and wraps `response.data` as MCP text content (`JSON.stringify`, 2-space indent).
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
4. Add the private `_method` that calls `_apiCall` with the right Sleeper endpoint path.

Optional/defaulted params (e.g. `sport = 'nfl'`) are defaulted in the method body via destructuring, not enforced by the schema.

A tool belonging to an existing module (e.g. a new player tool) is added in that
module's `tools.ts` alone — its `definitions` and `handlers` are picked up automatically.

## Testing

- **Unit tests** (`tests/SleeperServer.test.ts`) mock axios (`vi.mock('axios')`) and invoke private methods by casting the server to `any` (`(server as any)[methodName](args)`) — a full MCP client/transport is intentionally not set up. Assertions check the exact endpoint path and params passed to axios.
- **Integration tests** (`tests/integration/`) hit the real Sleeper API and are excluded from the default `npm test`. They chain calls (user → leagues → league → draft) and conditionally skip later assertions when upstream data is absent (`if (!leagueId) return`), so they tolerate changing live data.
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
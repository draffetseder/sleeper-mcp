# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

An MCP (Model Context Protocol) tool server that wraps the [Sleeper fantasy sports API](https://docs.sleeper.com/) and exposes it as a set of read-only tools an AI can call to query users, leagues, rosters, matchups, transactions, drafts, and players.

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

There is no separate lint command — Biome handles both linting and formatting via `npm run format`.

## Architecture

The entire server is one class. `src/index.ts` simply instantiates `SleeperServer` and calls `run()`. `src/SleeperServer.ts` contains everything:

- **Transport**: `StdioServerTransport` — the server communicates over stdio (intended to be launched as a subprocess by an MCP client). Note `console.error` is used for logging because stdout is reserved for the MCP protocol.
- **Two request handlers** registered in `setupToolHandlers()`:
  - `ListToolsRequestSchema` — returns the static array of tool definitions (name, description, JSON `inputSchema`).
  - `CallToolRequestSchema` — a `switch` on `request.params.name` dispatching to a private `_methodName` per tool.
- **`_apiCall(endpoint, params?)`** — the single chokepoint for all HTTP. Every tool method builds a path string and delegates here. It calls the shared axios instance (baseURL `https://api.sleeper.app/v1`) and wraps `response.data` as MCP text content (`JSON.stringify`, 2-space indent).
- **Error handling**: the `CallToolRequest` handler catches axios errors and returns them as `{ isError: true }` MCP content; non-axios errors are re-thrown.

### Adding a new tool

Because the structure is rigidly parallel, a new tool touches four places in `SleeperServer.ts`:
1. Add an `Args` interface near the top.
2. Add a tool definition object to the `tools` array in the `ListToolsRequestSchema` handler.
3. Add a `case` to the `switch` in the `CallToolRequestSchema` handler.
4. Add the private `_method` that calls `_apiCall` with the right Sleeper endpoint path.

Optional/defaulted params (e.g. `sport = 'nfl'`) are defaulted in the method body via destructuring, not enforced by the schema.

## Testing

- **Unit tests** (`tests/SleeperServer.test.ts`) mock axios (`vi.mock('axios')`) and invoke private methods by casting the server to `any` (`(server as any)[methodName](args)`) — a full MCP client/transport is intentionally not set up. Assertions check the exact endpoint path and params passed to axios.
- **Integration tests** (`tests/integration/`) hit the real Sleeper API and are excluded from the default `npm test`. They chain calls (user → leagues → league → draft) and conditionally skip later assertions when upstream data is absent (`if (!leagueId) return`), so they tolerate changing live data.
- Biome disables `noExplicitAny` for `tests/**` (see the override in `biome.json`), which is why the `any` casts above don't trip the linter.

## Conventions

- ES modules (`"type": "module"`). Imports of local files use the `.js` extension even for `.ts` sources (required by `Node16` module resolution), e.g. `import { SleeperServer } from './SleeperServer.js'`.
- Biome config: 2-space indent, 100 char line width, ES5 trailing commas, always semicolons, always arrow parens.
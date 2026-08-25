# sleeper-mcp
🤖 An MCP tool server exposing the [Sleeper fantasy sports API](https://docs.sleeper.com/), enabling AI models and agents to manage and query fantasy leagues.

### Features

With this server running, an AI can perform actions on your behalf, such as:

- 📊 Get Information: Fetch detailed data about users, leagues, rosters, and traded picks.

- 🏈 Analyze Players: Search players by name, position, or team, resolve player IDs to names, or see who is currently trending (being added or dropped the most).

- 🗓️ Check League Activity: View weekly matchups, transactions, and the current state of the NFL season.

- 🏆 Follow the Playoffs: Retrieve the winner's and loser's brackets for a league.

- 📝 Manage Drafts: Access information about past and upcoming drafts, including picks and draft boards.


### Setup

Build the server app:

```
npm install
npm run build
```

Claude Code picks up the checked-in `.mcp.json` automatically when started from the
repo root (approve it once when prompted). Build first — `build/` is not committed.

For other MCP clients, configure the server manually:

```
{
    "mcpServers": {
        "sleeper-mcp": {
            "command": "node",
            "args": ["/path/to/repo/build/index.js"],
            "env": {
                "SLEEPER_MCP_CACHE_DIR": "/path/to/cache/dir"
            }
        }
    }
}
```
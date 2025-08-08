# sleeper-mcp
🤖 An MCP tool server exposing the [Sleeper fantasy sports API](https://docs.sleeper.com/), enabling AI models and agents to manage and query fantasy leagues.

### Features

With this server running, an AI can perform actions on your behalf, such as:

- 📊 Get Information: Fetch detailed data about users, leagues, rosters, and traded picks.

- 🏈 Analyze Players: Look up all available players or see who is currently trending (being added or dropped the most).

- 🗓️ Check League Activity: View weekly matchups, transactions, and the current state of the NFL season.

- 🏆 Follow the Playoffs: Retrieve the winner's and loser's brackets for a league.

- 📝 Manage Drafts: Access information about past and upcoming drafts, including picks and draft boards.


### Setup

Build the server app:

```
npm install
npm run build
```

Configure MCP server:

```
{
    "mcpServers": {
        "sleeper-mcp": {
            "command": "node",
            "args": ["/path/to/repo/build/index.js"]
        }
    }
}
```
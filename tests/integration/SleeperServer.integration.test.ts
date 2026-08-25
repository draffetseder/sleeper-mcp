import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SleeperServer } from "../../src/SleeperServer.js";

// A completed 2021 league belonging to Sleeper's public `sleeper` demo account.
const KNOWN_LEAGUE = {
  id: "713883719282282496",
  season: "2021",
  name: "We Love Sleeper",
};

describe("SleeperServer Integration (Real API)", () => {
  let server: SleeperServer;
  let userId: string;
  let draftId: string;
  let cacheDir: string;
  let previousCacheDir: string | undefined;

  beforeAll(async () => {
    previousCacheDir = process.env.SLEEPER_MCP_CACHE_DIR;
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "sleeper-mcp-integration-"));
    process.env.SLEEPER_MCP_CACHE_DIR = cacheDir;

    server = new SleeperServer();
  });

  afterAll(async () => {
    if (previousCacheDir === undefined) {
      delete process.env.SLEEPER_MCP_CACHE_DIR;
    } else {
      process.env.SLEEPER_MCP_CACHE_DIR = previousCacheDir;
    }
    await fs.rm(cacheDir, { recursive: true, force: true });
  });

  const invokePrivateMethod = async (methodName: string, args?: any) => {
    return await (server as any)[methodName](args);
  };

  it("should fetch real NFL state", async () => {
    const result = await invokePrivateMethod("_getNflState");
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveProperty("season");
    expect(data).toHaveProperty("week");
    expect(data).toHaveProperty("season_type");
  });

  it("should fetch a real user (sleeper)", async () => {
    const result = await invokePrivateMethod("_getUser", { user_id_or_name: "sleeper" });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveProperty("username", "sleeper");
    expect(data).toHaveProperty("user_id");
    userId = data.user_id;
  });

  it("should fetch user leagues", async () => {
    const result = await invokePrivateMethod("_getUserLeagues", {
      user_id: userId,
      season: KNOWN_LEAGUE.season,
    });
    const data = JSON.parse(result.content[0].text);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data.map((league: any) => league.league_id)).toContain(KNOWN_LEAGUE.id);
  });

  it("should fetch league details", async () => {
    const result = await invokePrivateMethod("_getLeague", { league_id: KNOWN_LEAGUE.id });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveProperty("league_id", KNOWN_LEAGUE.id);
    expect(data).toHaveProperty("name", KNOWN_LEAGUE.name);
    expect(Array.isArray(data.roster_positions)).toBe(true);
    expect(data.roster_positions.length).toBeGreaterThan(0);
  });

  it("should fetch rosters in a league", async () => {
    const result = await invokePrivateMethod("_getRostersInLeague", { league_id: KNOWN_LEAGUE.id });
    const data = JSON.parse(result.content[0].text);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("roster_id");
    expect(data[0]).toHaveProperty("owner_id");
  });

  it("should fetch users in a league", async () => {
    const result = await invokePrivateMethod("_getUsersInLeague", { league_id: KNOWN_LEAGUE.id });
    const data = JSON.parse(result.content[0].text);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("user_id");
    expect(data[0]).toHaveProperty("display_name");
  });

  it("should fetch user drafts and discover a draft ID", async () => {
    const result = await invokePrivateMethod("_getUserDrafts", { user_id: userId, season: "2024" });
    const data = JSON.parse(result.content[0].text);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("draft_id");
    draftId = data[0].draft_id;
  });

  it("should fetch specific draft details", async () => {
    const result = await invokePrivateMethod("_getDraft", { draft_id: draftId });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveProperty("draft_id", draftId);
    expect(data).toHaveProperty("status");
  });

  it("omits scoring_settings from a live league by default", async () => {
    const result = await invokePrivateMethod("_getLeague", { league_id: KNOWN_LEAGUE.id });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveProperty("league_id", KNOWN_LEAGUE.id);
    expect(data).not.toHaveProperty("scoring_settings");
    expect(data).not.toHaveProperty("last_message_id");
  });

  it("returns scoring_settings for a live league when asked", async () => {
    const result = await invokePrivateMethod("_getLeague", {
      league_id: KNOWN_LEAGUE.id,
      fields: ["scoring_settings"],
    });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveProperty("scoring_settings");
    expect(data).not.toHaveProperty("last_message_id");
  });

  it("keeps the player identity on live draft picks while dropping the noise", async () => {
    // draftId above comes from the user's drafts and may belong to a league that never
    // drafted; go through KNOWN_LEAGUE to be sure of landing on a draft with picks.
    const drafts = await invokePrivateMethod("_getLeagueDrafts", { league_id: KNOWN_LEAGUE.id });
    const leagueDraftId = JSON.parse(drafts.content[0].text)[0].draft_id;

    const result = await invokePrivateMethod("_getDraftPicks", { draft_id: leagueDraftId });
    const data = JSON.parse(result.content[0].text);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].metadata).toHaveProperty("first_name");
    expect(data[0].metadata).toHaveProperty("position");
    expect(data[0].metadata).toHaveProperty("team");
    expect(data[0].metadata).not.toHaveProperty("news_updated");
  });

  it("should fetch trending players", async () => {
    const result = await invokePrivateMethod("_getTrendingPlayers", { type: "add", limit: 5 });
    const data = JSON.parse(result.content[0].text);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("player_id");
  });

  it("searches live players by position and team", async () => {
    const handler = (server as any).moduleHandlers.get("search_players");
    const result = await handler({ position: "QB", team: "BUF" });
    const body = JSON.parse(result.content[0].text);

    expect(result.isError).toBeUndefined();
    expect(typeof body.fetched_at).toBe("string");
    expect(body.total_matches).toBeGreaterThan(0);
    expect(body.players.length).toBeGreaterThan(0);
    expect(typeof body.players[0].full_name).toBe("string");
    expect(body.players[0].team).toBe("BUF");
  }, 60000);
});

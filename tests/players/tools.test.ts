import { describe, expect, it, vi } from "vitest";
import type { PlayerCache } from "../../src/players/PlayerCache.js";
import { createPlayersModule } from "../../src/players/tools.js";

const DICT = {
  "1": {
    player_id: "1",
    full_name: "A.J. Brown",
    search_full_name: "ajbrown",
    position: "WR",
    fantasy_positions: ["WR"],
    team: "PHI",
    search_rank: 12,
  },
  "2": {
    player_id: "2",
    full_name: "Backup Wideout",
    search_full_name: "backupwideout",
    position: "WR",
    fantasy_positions: ["WR"],
    team: "PHI",
    search_rank: 400,
  },
};

const stubCache = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    get: vi.fn().mockResolvedValue({
      players: DICT,
      fetched_at: "2026-08-22T12:00:00.000Z",
      stale: false,
      ...overrides,
    }),
  }) as unknown as PlayerCache;

const parse = (result: any) => JSON.parse(result.content[0].text);

describe("search_players", () => {
  it("registers both tools with read-only annotations", () => {
    const module = createPlayersModule(stubCache());
    const names = module.definitions.map((definition) => definition.name);

    expect(names).toEqual(["search_players", "get_players_by_id"]);
    for (const definition of module.definitions) {
      expect(definition.annotations?.readOnlyHint).toBe(true);
      expect(definition.annotations?.openWorldHint).toBe(true);
    }
  });

  it("returns a ranked, projected envelope", async () => {
    const module = createPlayersModule(stubCache());
    const body = parse(await module.handlers.search_players({ position: "WR" }));

    expect(body.fetched_at).toBe("2026-08-22T12:00:00.000Z");
    expect(body.stale).toBe(false);
    expect(body.total_matches).toBe(2);
    expect(body.returned).toBe(2);
    expect(body.players[0].full_name).toBe("A.J. Brown");
    expect(body.players[0]).not.toHaveProperty("search_rank");
  });

  it("reports total_matches when the limit truncates", async () => {
    const module = createPlayersModule(stubCache());
    const body = parse(await module.handlers.search_players({ position: "WR", limit: 1 }));

    expect(body.total_matches).toBe(2);
    expect(body.returned).toBe(1);
  });

  it("errors when no filter is supplied", async () => {
    const module = createPlayersModule(stubCache());
    const result = await module.handlers.search_players({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("at least one of");
  });

  it("errors on an unknown field name", async () => {
    const module = createPlayersModule(stubCache());
    const result = await module.handlers.search_players({ position: "WR", fields: ["nope"] });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("nope");
  });

  it("passes force_refresh through to the cache", async () => {
    const cache = stubCache();
    const module = createPlayersModule(cache);
    await module.handlers.search_players({ position: "WR", force_refresh: true });

    expect(cache.get).toHaveBeenCalledWith("nfl", { force: true });
  });

  it("propagates the stale flag", async () => {
    const module = createPlayersModule(stubCache({ stale: true }));
    const body = parse(await module.handlers.search_players({ position: "WR" }));

    expect(body.stale).toBe(true);
  });

  it("errors instead of throwing when fields is a non-empty string", async () => {
    const module = createPlayersModule(stubCache());
    const result = await module.handlers.search_players({ position: "WR", fields: "nope" });

    expect(result.isError).toBe(true);
  });

  it("errors instead of throwing when fields is a falsy non-array (0)", async () => {
    const module = createPlayersModule(stubCache());
    const result = await module.handlers.search_players({ position: "WR", fields: 0 });

    expect(result.isError).toBe(true);
  });

  it("clamps limit to at most 10 when fields includes 'all'", async () => {
    const bigDict: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) {
      bigDict[String(i)] = {
        player_id: String(i),
        full_name: `Player ${i}`,
        search_full_name: `player${i}`,
        position: "WR",
        fantasy_positions: ["WR"],
        team: "PHI",
        search_rank: i,
      };
    }
    const cache = {
      get: vi.fn().mockResolvedValue({
        players: bigDict,
        fetched_at: "2026-08-22T12:00:00.000Z",
        stale: false,
      }),
    } as unknown as PlayerCache;
    const module = createPlayersModule(cache);
    const body = parse(
      await module.handlers.search_players({ position: "WR", fields: ["all"], limit: 200 })
    );

    expect(body.players.length).toBeLessThanOrEqual(10);
  });
});

describe("get_players_by_id", () => {
  it("separates found players from unresolvable ids", async () => {
    const module = createPlayersModule(stubCache());
    const body = parse(await module.handlers.get_players_by_id({ player_ids: ["1", "999"] }));

    expect(body.players).toHaveLength(1);
    expect(body.players[0].player_id).toBe("1");
    expect(body.not_found).toEqual(["999"]);
  });

  it("errors on an empty id list", async () => {
    const module = createPlayersModule(stubCache());
    const result = await module.handlers.get_players_by_id({ player_ids: [] });

    expect(result.isError).toBe(true);
  });

  it("errors when the id cap is exceeded", async () => {
    const module = createPlayersModule(stubCache());
    const ids = Array.from({ length: 501 }, (_, index) => String(index));
    const result = await module.handlers.get_players_by_id({ player_ids: ids });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("500");
  });

  it("errors instead of throwing when fields is a non-empty string", async () => {
    const module = createPlayersModule(stubCache());
    const result = await module.handlers.get_players_by_id({
      player_ids: ["1"],
      fields: "nope",
    });

    expect(result.isError).toBe(true);
  });

  it("errors instead of throwing when fields is a falsy non-array (0)", async () => {
    const module = createPlayersModule(stubCache());
    const result = await module.handlers.get_players_by_id({ player_ids: ["1"], fields: 0 });

    expect(result.isError).toBe(true);
  });
});

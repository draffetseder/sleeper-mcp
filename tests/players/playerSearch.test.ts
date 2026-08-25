import { describe, expect, it } from "vitest";
import {
  collectValidFieldNames,
  findUnknownFields,
  matchesFilters,
  normalizeName,
  projectFields,
  searchPlayers,
} from "../../src/players/playerSearch.js";
import type { PlayerDictionary } from "../../src/players/types.js";
import { FIXTURE } from "./playerSearch.fixtures.js";

describe("normalizeName", () => {
  it("lowercases and strips every non-alphanumeric character", () => {
    expect(normalizeName("A.J. Brown")).toBe("ajbrown");
    expect(normalizeName("aj brown")).toBe("ajbrown");
    expect(normalizeName("ajbrown")).toBe("ajbrown");
  });
});

describe("matchesFilters", () => {
  it("matches a punctuated name from all three spellings", () => {
    for (const query of ["aj brown", "A.J. Brown", "ajbrown", "brown"]) {
      expect(matchesFilters(FIXTURE["1"], { name: query })).toBe(true);
    }
  });

  it("falls back to full_name when search_full_name is absent", () => {
    expect(matchesFilters(FIXTURE["5"], { name: "no search name" })).toBe(true);
  });

  it("falls back to first_name and last_name when both other fields are absent", () => {
    expect(matchesFilters(FIXTURE.BUF, { name: "buffalo bills" })).toBe(true);
  });

  it("matches a position via fantasy_positions even when position differs", () => {
    expect(matchesFilters(FIXTURE["2"], { position: "TE" })).toBe(true);
    expect(matchesFilters(FIXTURE["2"], { position: "te" })).toBe(true);
    expect(matchesFilters(FIXTURE["1"], { position: "TE" })).toBe(false);
  });

  it("treats FA as meaning no team", () => {
    expect(matchesFilters(FIXTURE["3"], { team: "FA" })).toBe(true);
    expect(matchesFilters(FIXTURE["1"], { team: "FA" })).toBe(false);
  });

  it("ANDs filters together", () => {
    expect(matchesFilters(FIXTURE["1"], { position: "WR", team: "PHI" })).toBe(true);
    expect(matchesFilters(FIXTURE["1"], { position: "WR", team: "BUF" })).toBe(false);
  });
});

describe("searchPlayers", () => {
  it("sorts by search_rank ascending with nulls last", () => {
    const result = searchPlayers(FIXTURE, { position: "WR" }, 10);
    expect(result.players.map((player) => player.player_id)).toEqual(["1", "4"]);
  });

  it("reports total_matches before truncation", () => {
    const result = searchPlayers(FIXTURE, { position: "WR" }, 1);
    expect(result.total_matches).toBe(2);
    expect(result.players).toHaveLength(1);
    expect(result.players[0].player_id).toBe("1");
  });

  it("returns an empty result rather than throwing when nothing matches", () => {
    const result = searchPlayers(FIXTURE, { team: "SEA" }, 25);
    expect(result).toEqual({ total_matches: 0, players: [] });
  });
});

describe("projectFields", () => {
  it("returns the core set and omits keys the player does not have", () => {
    const projected = projectFields(FIXTURE["1"]);
    expect(projected.player_id).toBe("1");
    expect(projected.full_name).toBe("A.J. Brown");
    expect(projected).not.toHaveProperty("search_rank");
    expect(projected).not.toHaveProperty("search_full_name");
  });

  it("adds requested fields on top of the core set", () => {
    const projected = projectFields(FIXTURE["1"], ["search_rank"]);
    expect(projected.search_rank).toBe(12);
    expect(projected.full_name).toBe("A.J. Brown");
  });

  it("returns the untrimmed object for the all token, even alongside other names", () => {
    const projected = projectFields(FIXTURE["1"], ["all", "search_rank"]);
    expect(projected.search_full_name).toBe("ajbrown");
  });
});

describe("field name validation", () => {
  it("accepts names present on cached players and rejects the rest", () => {
    const valid = collectValidFieldNames(FIXTURE);
    expect(findUnknownFields(["search_rank", "all"], valid)).toEqual([]);
    expect(findUnknownFields(["not_a_field"], valid)).toEqual(["not_a_field"]);
  });

  it("includes fields from non-numeric-keyed players regardless of dictionary size", () => {
    const dictionary: PlayerDictionary = {};
    for (let index = 1; index <= 150; index += 1) {
      dictionary[String(index)] = {
        player_id: String(index),
        full_name: `Player ${index}`,
      };
    }
    dictionary.BUF = { player_id: "BUF", first_name: "Buffalo", last_name: "Bills" };

    const valid = collectValidFieldNames(dictionary);
    expect(valid.has("first_name")).toBe(true);
    expect(findUnknownFields(["first_name"], valid)).toEqual([]);
  });
});

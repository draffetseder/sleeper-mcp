import { describe, expect, it } from "vitest";
import { dropFields, prune, shapeResponse } from "../../src/responses/shape.js";

describe("prune", () => {
  it("drops null and undefined values", () => {
    expect(prune({ a: 1, b: null, c: undefined })).toEqual({ a: 1 });
  });

  it("keeps empty strings", () => {
    expect(prune({ picked_by: "", player_id: "4034" })).toEqual({
      picked_by: "",
      player_id: "4034",
    });
  });

  it("keeps falsy numbers and booleans", () => {
    expect(prune({ points: 0, is_bot: false })).toEqual({ points: 0, is_bot: false });
  });

  it("drops empty arrays and empty objects", () => {
    expect(prune({ a: [], b: {}, c: [1] })).toEqual({ c: [1] });
  });

  it("prunes nested objects", () => {
    expect(prune({ metadata: { record: "WL", streak: null } })).toEqual({
      metadata: { record: "WL" },
    });
  });

  it("drops a nested object that becomes empty after pruning", () => {
    expect(prune({ settings: { only: null }, name: "x" })).toEqual({ name: "x" });
  });

  it("prunes each element of an array of objects", () => {
    expect(
      prune([
        { a: 1, b: null },
        { a: 2, b: null },
      ])
    ).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("returns primitives unchanged", () => {
    expect(prune("nfl")).toBe("nfl");
    expect(prune(7)).toBe(7);
  });
});

describe("dropFields", () => {
  it("drops a top-level key", () => {
    expect(dropFields({ name: "x", shard: 95 }, ["shard"])).toEqual({ name: "x" });
  });

  it("drops a nested key by dot path", () => {
    expect(
      dropFields({ metadata: { name: "x", news_updated: "1" } }, ["metadata.news_updated"])
    ).toEqual({ metadata: { name: "x" } });
  });

  it("drops nested keys by trailing wildcard", () => {
    const input = { metadata: { team_name: "Team", mascot_item_a: "ref", mascot_item_b: "ref" } };
    expect(dropFields(input, ["metadata.mascot_*"])).toEqual({ metadata: { team_name: "Team" } });
  });

  it("applies to every element of an array", () => {
    expect(
      dropFields(
        [
          { a: 1, shard: 2 },
          { a: 3, shard: 4 },
        ],
        ["shard"]
      )
    ).toEqual([{ a: 1 }, { a: 3 }]);
  });

  it("ignores paths that are not present", () => {
    expect(dropFields({ a: 1 }, ["nope", "also.nope"])).toEqual({ a: 1 });
  });

  it("does not mutate its input", () => {
    const input = { a: 1, shard: 2 };
    dropFields(input, ["shard"]);
    expect(input).toEqual({ a: 1, shard: 2 });
  });
});

describe("shapeResponse", () => {
  const league = { name: "x", shard: 95, scoring_settings: { rec: 1 }, keepers: null };

  it("prunes and drops the shape's noise fields by default", () => {
    expect(shapeResponse(league, "league")).toEqual({ name: "x" });
  });

  it("returns the input untouched when fields includes 'all'", () => {
    expect(shapeResponse(league, "league", ["all"])).toEqual(league);
  });

  it("re-includes a named noise field", () => {
    expect(shapeResponse(league, "league", ["scoring_settings"])).toEqual({
      name: "x",
      scoring_settings: { rec: 1 },
    });
  });

  it("prunes only when the shape has no drop-list", () => {
    expect(shapeResponse({ a: 1, b: null }, "roster")).toEqual({ a: 1 });
  });

  it("prunes only when no shape key is given", () => {
    expect(shapeResponse({ a: 1, b: null })).toEqual({ a: 1 });
  });

  it("keeps draft pick metadata that identifies the player", () => {
    const pick = {
      player_id: "4034",
      reactions: null,
      metadata: { first_name: "Christian", position: "RB", team: "CAR", news_updated: "162" },
    };
    expect(shapeResponse(pick, "draft_pick")).toEqual({
      player_id: "4034",
      metadata: { first_name: "Christian", position: "RB", team: "CAR" },
    });
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AxiosInstance } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerCache, resolveCacheDir } from "../../src/players/PlayerCache.js";

const DICT = { "1": { player_id: "1", full_name: "A.J. Brown" } };

let cacheDir: string;
let get: any;
let axiosStub: AxiosInstance;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-22T12:00:00.000Z"));
  cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "sleeper-cache-"));
  get = vi.fn().mockResolvedValue({ data: DICT });
  axiosStub = { get } as unknown as AxiosInstance;
});

afterEach(async () => {
  vi.useRealTimers();
  await fs.rm(cacheDir, { recursive: true, force: true });
});

describe("PlayerCache memory layer", () => {
  it("fetches on a cold cache and stamps fetched_at", async () => {
    const cache = new PlayerCache(axiosStub, cacheDir);
    const result = await cache.get("nfl");

    expect(get).toHaveBeenCalledWith("/players/nfl", { timeout: 30000 });
    expect(result.players).toEqual(DICT);
    expect(result.fetched_at).toBe("2026-08-22T12:00:00.000Z");
    expect(result.stale).toBe(false);
  });

  it("serves a warm memory hit without touching the network", async () => {
    const cache = new PlayerCache(axiosStub, cacheDir);
    await cache.get("nfl");
    await cache.get("nfl");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("refetches once the TTL has elapsed", async () => {
    const cache = new PlayerCache(axiosStub, cacheDir);
    await cache.get("nfl");
    vi.setSystemTime(new Date("2026-08-23T12:00:01.000Z"));
    await cache.get("nfl");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("still serves from cache just under the TTL boundary (23h59m)", async () => {
    const cache = new PlayerCache(axiosStub, cacheDir);
    await cache.get("nfl");
    vi.setSystemTime(new Date("2026-08-23T11:59:00.000Z"));
    const result = await cache.get("nfl");
    expect(get).toHaveBeenCalledTimes(1);
    expect(result.stale).toBe(false);
  });

  it("rejects a sport that does not look like a sport code", async () => {
    const cache = new PlayerCache(axiosStub, cacheDir);
    await expect(cache.get("../../../../evil")).rejects.toThrow(/Invalid sport/);
    await expect(cache.get("NFL")).rejects.toThrow(/Invalid sport/);
    await expect(cache.get("")).rejects.toThrow(/Invalid sport/);
  });

  it("bypasses a warm cache when force is set", async () => {
    const cache = new PlayerCache(axiosStub, cacheDir);
    await cache.get("nfl");
    await cache.get("nfl", { force: true });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("keys the cache by sport", async () => {
    const cache = new PlayerCache(axiosStub, cacheDir);
    await cache.get("nfl");
    await cache.get("nba");
    await cache.get("nfl");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent cold calls into one request", async () => {
    const cache = new PlayerCache(axiosStub, cacheDir);
    await Promise.all([cache.get("nfl"), cache.get("nfl"), cache.get("nfl")]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("serves stale memory data when a refresh fails", async () => {
    const cache = new PlayerCache(axiosStub, cacheDir);
    await cache.get("nfl");
    vi.setSystemTime(new Date("2026-08-23T12:00:01.000Z"));
    get.mockRejectedValueOnce(new Error("upstream down"));

    const result = await cache.get("nfl");
    expect(result.stale).toBe(true);
    expect(result.players).toEqual(DICT);
    expect(result.fetched_at).toBe("2026-08-22T12:00:00.000Z");
  });

  it("serves stale data when a forced refresh fails", async () => {
    const cache = new PlayerCache(axiosStub, cacheDir);
    await cache.get("nfl");
    get.mockRejectedValueOnce(new Error("upstream down"));

    const result = await cache.get("nfl", { force: true });
    expect(result.stale).toBe(true);
    expect(result.players).toEqual(DICT);
  });

  it("throws when a fetch fails and nothing is cached", async () => {
    get.mockRejectedValueOnce(new Error("upstream down"));
    const cache = new PlayerCache(axiosStub, cacheDir);
    await expect(cache.get("nfl")).rejects.toThrow("upstream down");
  });
});

describe("PlayerCache disk layer", () => {
  const filePath = () => path.join(cacheDir, "players-nfl.json");

  it("writes a versioned cache file after fetching", async () => {
    const cache = new PlayerCache(axiosStub, cacheDir);
    await cache.get("nfl");

    const written = JSON.parse(await fs.readFile(filePath(), "utf8"));
    expect(written.version).toBe(1);
    expect(written.sport).toBe("nfl");
    expect(written.fetched_at).toBe("2026-08-22T12:00:00.000Z");
    expect(written.players).toEqual(DICT);
  });

  it("serves a fresh file written by a previous process without fetching", async () => {
    await fs.writeFile(
      filePath(),
      JSON.stringify({
        version: 1,
        sport: "nfl",
        fetched_at: "2026-08-22T11:00:00.000Z",
        players: DICT,
      })
    );

    const cache = new PlayerCache(axiosStub, cacheDir);
    const result = await cache.get("nfl");

    expect(get).not.toHaveBeenCalled();
    expect(result.fetched_at).toBe("2026-08-22T11:00:00.000Z");
    expect(result.stale).toBe(false);
  });

  it("refetches when the file is older than the TTL", async () => {
    await fs.writeFile(
      filePath(),
      JSON.stringify({
        version: 1,
        sport: "nfl",
        fetched_at: "2026-08-20T11:00:00.000Z",
        players: DICT,
      })
    );

    const cache = new PlayerCache(axiosStub, cacheDir);
    await cache.get("nfl");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("treats a version mismatch as a miss", async () => {
    await fs.writeFile(
      filePath(),
      JSON.stringify({
        version: 99,
        sport: "nfl",
        fetched_at: "2026-08-22T11:00:00.000Z",
        players: DICT,
      })
    );

    const cache = new PlayerCache(axiosStub, cacheDir);
    await cache.get("nfl");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("treats an unparseable file as a miss", async () => {
    await fs.writeFile(filePath(), "{ this is not json");

    const cache = new PlayerCache(axiosStub, cacheDir);
    const result = await cache.get("nfl");

    expect(get).toHaveBeenCalledTimes(1);
    expect(result.players).toEqual(DICT);
  });

  it("still serves data when the cache directory cannot be created", async () => {
    const blocker = path.join(cacheDir, "blocker");
    await fs.writeFile(blocker, "not a directory");

    const cache = new PlayerCache(axiosStub, path.join(blocker, "nested"));
    const result = await cache.get("nfl");

    expect(result.players).toEqual(DICT);
    expect(result.stale).toBe(false);
  });

  it("collapses concurrent cold calls into a single disk read with no network call", async () => {
    await fs.writeFile(
      filePath(),
      JSON.stringify({
        version: 1,
        sport: "nfl",
        fetched_at: "2026-08-22T11:00:00.000Z",
        players: DICT,
      })
    );

    const cache = new PlayerCache(axiosStub, cacheDir);
    const [first, second] = await Promise.all([cache.get("nfl"), cache.get("nfl")]);

    expect(get).not.toHaveBeenCalled();
    expect(first.fetched_at).toBe("2026-08-22T11:00:00.000Z");
    expect(second.fetched_at).toBe("2026-08-22T11:00:00.000Z");
  });

  it("bypasses a fresh disk file when force is set", async () => {
    await fs.writeFile(
      filePath(),
      JSON.stringify({
        version: 1,
        sport: "nfl",
        fetched_at: "2026-08-22T11:00:00.000Z",
        players: DICT,
      })
    );

    const cache = new PlayerCache(axiosStub, cacheDir);
    const result = await cache.get("nfl", { force: true });

    expect(get).toHaveBeenCalledTimes(1);
    expect(result.fetched_at).toBe("2026-08-22T12:00:00.000Z");
  });
});

describe("resolveCacheDir", () => {
  it("prefers the explicit override", () => {
    expect(resolveCacheDir({ SLEEPER_MCP_CACHE_DIR: "/tmp/x" }, "linux")).toBe("/tmp/x");
  });

  it("uses LOCALAPPDATA on Windows", () => {
    const dir = resolveCacheDir({ LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" }, "win32");
    expect(dir).toContain("sleeper-mcp");
    expect(dir).toContain("AppData");
  });

  it("uses XDG_CACHE_HOME elsewhere", () => {
    expect(resolveCacheDir({ XDG_CACHE_HOME: "/home/x/.cache" }, "linux")).toBe(
      path.join("/home/x/.cache", "sleeper-mcp")
    );
  });
});

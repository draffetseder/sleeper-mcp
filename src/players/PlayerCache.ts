import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AxiosInstance } from "axios";
import type { CachedPlayers, PlayerDictionary } from "./types.js";

const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30000;
const CACHE_VERSION = 1;

interface CacheEntry {
  players: PlayerDictionary;
  fetched_at: string;
}

interface CacheFile {
  version: number;
  sport: string;
  fetched_at: string;
  players: PlayerDictionary;
}

const isFresh = (fetchedAt: string): boolean => Date.now() - Date.parse(fetchedAt) < TTL_MS;

export const resolveCacheDir = (
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform
): string => {
  if (env.SLEEPER_MCP_CACHE_DIR) return env.SLEEPER_MCP_CACHE_DIR;

  if (platform === "win32") {
    const base = env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "sleeper-mcp");
  }

  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "sleeper-mcp");
  }

  const base = env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
  return path.join(base, "sleeper-mcp");
};

const SPORT_PATTERN = /^[a-z]{2,10}$/;

export class PlayerCache {
  private memory = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<CachedPlayers>>();
  private diskReads = new Map<string, Promise<CacheEntry | null>>();
  private writeFailureLogged = false;

  constructor(
    private readonly axiosInstance: AxiosInstance,
    private readonly cacheDir: string = resolveCacheDir()
  ) {}

  async get(sport: string, options: { force?: boolean } = {}): Promise<CachedPlayers> {
    if (!SPORT_PATTERN.test(sport)) {
      throw new Error(`Invalid sport "${sport}": expected 2-10 lowercase letters.`);
    }

    if (!options.force) {
      const cached = this.memory.get(sport);
      if (cached && isFresh(cached.fetched_at)) return { ...cached, stale: false };
    }

    let read = this.diskReads.get(sport);
    if (!read) {
      read = this.readDisk(sport);
      this.diskReads.set(sport, read);
    }
    const fromDisk = await read;
    if (fromDisk) {
      this.memory.set(sport, fromDisk);
      if (!options.force && isFresh(fromDisk.fetched_at)) {
        return { ...fromDisk, stale: false };
      }
    }

    // A `force: true` call that arrives while an ordinary fetch is already in
    // flight joins that fetch rather than starting a second one. This is
    // intentional, not a bug: the joined promise is itself a live network
    // fetch, so force's contract (fresh data from Sleeper) is still met.
    // Only `fetched_at` can end up up to FETCH_TIMEOUT_MS older than the
    // caller assumes. Do not "fix" this into a stampede.
    let pending = this.inFlight.get(sport);
    if (!pending) {
      pending = this.fetchAndStore(sport);
      this.inFlight.set(sport, pending);
      pending
        .catch(() => undefined)
        .finally(() => {
          this.inFlight.delete(sport);
        });
    }

    try {
      return await pending;
    } catch (error) {
      const fallback = this.memory.get(sport);
      if (fallback) {
        console.error("[sleeper-mcp] player refresh failed; serving stale cache:", error);
        return { ...fallback, stale: true };
      }
      throw error;
    }
  }

  private async fetchAndStore(sport: string): Promise<CachedPlayers> {
    const response = await this.axiosInstance.get(`/players/${sport}`, {
      timeout: FETCH_TIMEOUT_MS,
    });
    const entry: CacheEntry = {
      players: response.data as PlayerDictionary,
      fetched_at: new Date().toISOString(),
    };
    this.memory.set(sport, entry);
    await this.writeDisk(sport, entry);
    return { ...entry, stale: false };
  }

  private filePath(sport: string): string {
    return path.join(this.cacheDir, `players-${sport}.json`);
  }

  private async readDisk(sport: string): Promise<CacheEntry | null> {
    try {
      const raw = await fs.readFile(this.filePath(sport), "utf8");
      const parsed = JSON.parse(raw) as CacheFile;

      if (parsed.version !== CACHE_VERSION) {
        console.error(
          `[sleeper-mcp] ignoring player cache v${parsed.version}; expected v${CACHE_VERSION}`
        );
        return null;
      }
      if (!parsed.fetched_at || !parsed.players) return null;

      return { players: parsed.players, fetched_at: parsed.fetched_at };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[sleeper-mcp] unusable player cache file; refetching:", error);
      }
      return null;
    }
  }

  private async writeDisk(sport: string, entry: CacheEntry): Promise<void> {
    const file: CacheFile = { version: CACHE_VERSION, sport, ...entry };
    const target = this.filePath(sport);
    const temp = `${target}.${process.pid}.tmp`;

    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await fs.writeFile(temp, JSON.stringify(file), "utf8");
      await fs.rename(temp, target);
    } catch (error) {
      await fs.unlink(temp).catch(() => undefined);
      if (!this.writeFailureLogged) {
        this.writeFailureLogged = true;
        console.error("[sleeper-mcp] player cache is not writable; using memory only:", error);
      }
    }
  }
}

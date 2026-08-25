export interface Player {
  player_id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  search_full_name?: string | null;
  position?: string | null;
  team?: string | null;
  status?: string | null;
  injury_status?: string | null;
  fantasy_positions?: string[] | null;
  age?: number | null;
  years_exp?: number | null;
  number?: number | null;
  search_rank?: number | null;
  [key: string]: unknown;
}

export type PlayerDictionary = Record<string, Player>;

export const CORE_FIELDS = [
  "player_id",
  "full_name",
  "position",
  "team",
  "status",
  "injury_status",
  "fantasy_positions",
  "age",
  "years_exp",
  "number",
] as const;

export const ALL_FIELDS_TOKEN = "all";

export interface SearchFilters {
  name?: string;
  position?: string;
  team?: string;
}

export interface CachedPlayers {
  players: PlayerDictionary;
  fetched_at: string;
  stale: boolean;
}

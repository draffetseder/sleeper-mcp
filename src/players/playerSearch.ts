import type { Player, PlayerDictionary, SearchFilters } from "./types.js";
import { ALL_FIELDS_TOKEN, CORE_FIELDS } from "./types.js";

export const normalizeName = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

export const searchableName = (player: Player): string => {
  if (player.search_full_name) return normalizeName(player.search_full_name);
  if (player.full_name) return normalizeName(player.full_name);
  const parts = [player.first_name, player.last_name].filter(Boolean).join(" ");
  return parts ? normalizeName(parts) : "";
};

export const matchesFilters = (player: Player, filters: SearchFilters): boolean => {
  if (filters.name) {
    const needle = normalizeName(filters.name);
    if (needle.length > 0 && !searchableName(player).includes(needle)) return false;
  }

  if (filters.position) {
    const wanted = filters.position.toUpperCase();
    const primary = player.position?.toUpperCase();
    const eligible = (player.fantasy_positions ?? []).map((entry) => entry.toUpperCase());
    if (primary !== wanted && !eligible.includes(wanted)) return false;
  }

  if (filters.team) {
    const wanted = filters.team.toUpperCase();
    if (wanted === "FA") {
      if (player.team) return false;
    } else if (player.team?.toUpperCase() !== wanted) {
      return false;
    }
  }

  return true;
};

export const compareByRank = (a: Player, b: Player): number => {
  const left = a.search_rank ?? Number.POSITIVE_INFINITY;
  const right = b.search_rank ?? Number.POSITIVE_INFINITY;
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

export const searchPlayers = (
  dictionary: PlayerDictionary,
  filters: SearchFilters,
  limit: number
): { total_matches: number; players: Player[] } => {
  const matches = Object.values(dictionary).filter((player) => matchesFilters(player, filters));
  matches.sort(compareByRank);
  return { total_matches: matches.length, players: matches.slice(0, limit) };
};

export const projectFields = (
  player: Player,
  extraFields: string[] = []
): Record<string, unknown> => {
  if (extraFields.includes(ALL_FIELDS_TOKEN)) return { ...player };

  const projected: Record<string, unknown> = {};
  for (const key of [...CORE_FIELDS, ...extraFields]) {
    if (key in player) projected[key] = player[key];
  }
  return projected;
};

export const collectValidFieldNames = (dictionary: PlayerDictionary): Set<string> => {
  const names = new Set<string>();
  for (const player of Object.values(dictionary)) {
    for (const key of Object.keys(player)) names.add(key);
  }
  return names;
};

export const findUnknownFields = (fields: string[], valid: Set<string>): string[] =>
  fields.filter((field) => field !== ALL_FIELDS_TOKEN && !valid.has(field));

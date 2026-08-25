/**
 * Per-endpoint drop-lists: the fields Sleeper returns that carry no fantasy
 * meaning (chat/telemetry bookkeeping, UI cosmetics, account-private nulls).
 *
 * These are drop-lists, not keep-lists, on purpose — a field Sleeper adds later
 * flows through to the caller instead of silently disappearing.
 *
 * Paths are dot-separated and may end in `*` to match a key prefix.
 */
export type ShapeKey =
  | "user"
  | "league"
  | "league_user"
  | "roster"
  | "matchup"
  | "draft"
  | "draft_pick";

export const NOISE: Record<ShapeKey, string[]> = {
  // Account-private fields. Always null for anyone but the authenticated owner,
  // and this server never authenticates — but never echo them regardless.
  user: [
    "cookies",
    "token",
    "email",
    "phone",
    "verification",
    "solicitable",
    "notifications",
    "currencies",
    "pending",
    "deleted",
    "data_updated",
    "summoner_name",
    "summoner_region",
  ],

  // `scoring_settings` is ~60 keys and is only needed for scoring questions;
  // callers ask for it back with fields: ["scoring_settings"].
  league: [
    "scoring_settings",
    "shard",
    "last_message_id",
    "last_message_time",
    "last_author_id",
    "last_author_display_name",
    "last_author_is_bot",
    "last_pinned_message_id",
  ],

  league_user: [
    "metadata.mascot_*",
    "metadata.allow_pn",
    "metadata.mention_pn",
    "metadata.archived",
  ],

  roster: [],
  matchup: [],

  draft: ["last_message_id", "last_message_time"],

  draft_pick: [
    "reactions",
    "metadata.sport",
  ],
};

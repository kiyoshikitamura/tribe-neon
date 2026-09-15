export const PREOPEN_GUILD_POWER_EVENT_KEY = "PREOPEN_GUILD_POWER_2026";

export type GuildSeasonMetadata = {
  event_key?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  status?: string | null;
  finalized_at?: string | null;
  updated_at?: string | null;
  is_current_context?: boolean | null;
};

type GuildRankingPayload = {
  rows: any[];
  selfRank: Record<string, any> | null;
  season: GuildSeasonMetadata | null;
  selfStatus: string | null;
};

const asRecord = (value: unknown): Record<string, any> | null => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, any>
  : null;

export function normalizeGuildRankingPayload(data: unknown): GuildRankingPayload {
  if (Array.isArray(data)) return { rows: data, selfRank: null, season: null, selfStatus: null };
  const payload = asRecord(data);
  if (!payload) return { rows: [], selfRank: null, season: null, selfStatus: null };
  const rows = [payload.rows, payload.rankings, payload.guilds, payload.data].find(Array.isArray) || [];
  const selfPayload = asRecord(payload.selfRank) || asRecord(payload.self_rank) || asRecord(payload.self_guild) || asRecord(payload.current_guild);
  const selfRank = asRecord(selfPayload?.row) || asRecord(selfPayload?.guild) || selfPayload;
  const nestedSeason = asRecord(payload.season) || asRecord(payload.metadata);
  const seasonSource = nestedSeason ? { ...payload, ...nestedSeason } : payload;
  const season: GuildSeasonMetadata | null = [
    "event_key",
    "starts_at",
    "ends_at",
    "status",
    "finalized_at",
    "updated_at",
    "is_current_context",
  ].some((key) => key in seasonSource)
    ? {
      event_key: seasonSource.event_key ?? seasonSource.eventKey,
      starts_at: seasonSource.starts_at ?? seasonSource.startsAt,
      ends_at: seasonSource.ends_at ?? seasonSource.endsAt,
      status: seasonSource.status,
      finalized_at: seasonSource.finalized_at ?? seasonSource.finalizedAt ?? (seasonSource.is_finalized ? seasonSource.server_updated_at : null),
      updated_at: seasonSource.updated_at ?? seasonSource.updatedAt ?? seasonSource.server_updated_at,
      is_current_context: seasonSource.is_current_context ?? seasonSource.isCurrentContext,
    }
    : null;
  return { rows, selfRank, season, selfStatus: typeof payload.self_status === "string" ? payload.self_status : null };
}

export function isPreopenGuildPowerSeasonContext(season: GuildSeasonMetadata | null | undefined): boolean {
  return season?.event_key === PREOPEN_GUILD_POWER_EVENT_KEY && season.is_current_context !== false;
}

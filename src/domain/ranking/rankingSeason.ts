export type AutoRankingSeasonType = "PVP" | "RAID";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RankingSeasonWindow = { startsAt: string; endsAt: string };

export function rankingSeasonWindow(type: AutoRankingSeasonType, at: Date = new Date()): RankingSeasonWindow {
  const jst = new Date(at.getTime() + JST_OFFSET_MS);
  let startJst: number;
  let endJst: number;
  if (type === "RAID") {
    const dayFromMonday = (jst.getUTCDay() + 6) % 7;
    startJst = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - dayFromMonday);
    endJst = startJst + 7 * DAY_MS;
  } else {
    startJst = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1);
    endJst = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + 1, 1);
  }
  return { startsAt: new Date(startJst - JST_OFFSET_MS).toISOString(), endsAt: new Date(endJst - JST_OFFSET_MS).toISOString() };
}

export function isInsideRankingSeason(createdAt: unknown, window: RankingSeasonWindow): boolean {
  const timestamp = new Date(String(createdAt || "")).getTime();
  return Number.isFinite(timestamp) && timestamp >= Date.parse(window.startsAt) && timestamp < Date.parse(window.endsAt);
}

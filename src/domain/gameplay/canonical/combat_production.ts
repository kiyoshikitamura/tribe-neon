import pvpSource from "./data/pvp_production_20260830.json" with { type: "json" };
import matchmakingSource from "./data/pvp_matchmaking_20260822.json" with { type: "json" };
import raidSource from "./data/raid_production_20260830.json" with { type: "json" };
import raidRewardsSource from "./data/raid_rewards_20260830.json" with { type: "json" };
import rankingSource from "./data/ranking_competition_20260822.json" with { type: "json" };
import rankingRewardsSource from "./data/ranking_season_rewards_20260830.json" with { type: "json" };

export const CANONICAL_PVP_PRODUCTION = Object.freeze(pvpSource);
export const CANONICAL_PVP_MATCHMAKING = Object.freeze(matchmakingSource);
export const CANONICAL_RANKING_REWARDS = Object.freeze(rankingRewardsSource);
export const CANONICAL_PVP_RANKING_REWARDS = Object.freeze(rankingRewardsSource);
export const CANONICAL_RAID_PRODUCTION = Object.freeze(raidSource);
export const CANONICAL_RAID_BOSSES = Object.freeze({
  version: raidSource.version,
  bosses: raidSource.variants.map((variant) => ({
    bossId: variant.raidVariantId,
    townId: variant.areaId.toLowerCase(),
    displayName: variant.raidName,
    profileType: "PARTY",
    attribute: "NEUTRAL",
    referenceLevel: 30,
    maxHp: variant.maxHp,
    atk: variant.atk,
    def: variant.def,
    spd: variant.spd,
    luk: 0,
    skillLoadout: [],
    memberCharacterIds: variant.memberCharacterIds,
  })),
});
export const CANONICAL_RAID_REWARDS = Object.freeze(raidRewardsSource);
export const CANONICAL_COMPETITION_RANKING = Object.freeze(rankingSource);

export function canonicalPvpExpectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / CANONICAL_PVP_PRODUCTION.rating.scale));
}

export function canonicalPvpRatingDelta(playerRating: number, opponentRating: number, result: "WIN" | "LOSS"): number {
  const expected = canonicalPvpExpectedScore(playerRating, opponentRating);
  return Math.round((result === "WIN" ? CANONICAL_PVP_PRODUCTION.rating.winK * (1 - expected) : CANONICAL_PVP_PRODUCTION.rating.lossK * (0 - expected)));
}

export function canonicalPvpRatingAfter(playerRating: number, opponentRating: number, result: "WIN" | "LOSS"): number {
  return Math.max(CANONICAL_PVP_PRODUCTION.rating.minimum, playerRating + canonicalPvpRatingDelta(playerRating, opponentRating, result));
}

export function canonicalPvpSoftReset(oldRating: number): number {
  const { softResetAnchor, softResetBp } = CANONICAL_PVP_PRODUCTION.season;
  return Math.max(0, softResetAnchor + Math.floor((oldRating - softResetAnchor) * softResetBp / 10000));
}

export function canonicalOpponentClass(playerRating: number, opponentRating: number): "STRONGER" | "EQUAL" | "WEAKER" {
  const difference = opponentRating - playerRating;
  return difference >= 101 ? "STRONGER" : difference <= -101 ? "WEAKER" : "EQUAL";
}

export function canonicalCompetitionRanks(scores: readonly number[]): number[] {
  let previous: number | undefined;
  let rank = 0;
  return scores.map((score, index) => {
    if (score !== previous) rank = index + 1;
    previous = score;
    return rank;
  });
}

export function canonicalRaidPair(jstDate: string): readonly string[] {
  const towns = CANONICAL_RAID_PRODUCTION.variants.map((variant) => variant.areaId.toLowerCase());
  const pairs = towns.flatMap((town, index) => towns.slice(index + 1).map((other) => [town, other] as const));
  const day = Math.floor(Date.parse(`${jstDate}T00:00:00+09:00`) / 86_400_000);
  return pairs[((day % pairs.length) + pairs.length) % pairs.length];
}

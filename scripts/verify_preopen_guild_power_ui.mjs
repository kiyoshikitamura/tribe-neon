import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isPreopenGuildPowerSeasonContext,
  normalizeGuildRankingPayload,
} from "../src/domain/ranking/preopenGuildPowerSeason.ts";
import { guildSeasonCosmeticRewardSectionsFromPayload } from "../src/domain/ranking/rankingRewardPresentation.ts";

const legacy = normalizeGuildRankingPayload([{ guild_id: "legacy", rank_position: 1 }]);
assert.equal(legacy.rows.length, 1);
assert.equal(legacy.season, null);
assert.equal(isPreopenGuildPowerSeasonContext(legacy.season), false);

const active = normalizeGuildRankingPayload({
  event_key: "PREOPEN_GUILD_POWER_2026",
  is_current_context: true,
  starts_at: "2026-09-03T15:00:00Z",
  ends_at: "2026-09-08T15:00:00Z",
  server_updated_at: "2026-09-04T01:23:00Z",
  rows: [{ guild_id: "top", rank_position: 1 }],
  self_guild: { guild_id: "outside-top-100", rank_position: 101, current_power: 120000 },
});
assert.equal(active.selfRank?.rank_position, 101);
assert.equal(active.season?.updated_at, "2026-09-04T01:23:00Z");
assert.equal(isPreopenGuildPowerSeasonContext(active.season), true);
assert.equal(isPreopenGuildPowerSeasonContext({ ...active.season, is_current_context: false }), false);
assert.equal(isPreopenGuildPowerSeasonContext({ ...active.season, event_key: "NEXT_GUILD_POWER_SEASON" }), false);

const cosmeticTiers = guildSeasonCosmeticRewardSectionsFromPayload(undefined)[0].tiers;
assert.deepEqual(cosmeticTiers.map((tier) => tier.itemId), [
  "guild_preopen_2026_participation",
  "guild_preopen_2026_rank_1",
  "guild_preopen_2026_rank_2",
  "guild_preopen_2026_rank_3",
]);

const rankingTab = fs.readFileSync("src/app/components/RankingTab.tsx", "utf8");
assert.match(rankingTab, /preopenGuildSeason=\{isPreopenGuildSeason\}/);
assert.match(rankingTab, /get_preopen_guild_power_ranking/);
assert.match(rankingTab, /get_public_guild_power_rankings/);
assert.match(rankingTab, /normalized\.season && !isPreopenGuildPowerSeasonContext\(normalized\.season\)/);

console.log("Pre-open guild Power season UI contract: PASS");

import assert from "node:assert/strict";
import fs from "node:fs";
import {
  aggregateRankingRewardReceipts,
  parsePendingRankingRewardNotification,
} from "../src/domain/ranking/rankingRewardNotification.ts";

const parsed = parsePendingRankingRewardNotification({
  notification_ids: ["10000000-0000-4000-8000-000000000001"],
  grants: [
    {
      period_kind: "DAILY",
      period_key: "2026-09-08",
      ranking_category: "GUILD_POWER",
      rank_position: 2,
      item_id: "CHAR_EXP_L",
      quantity: 1,
      granted_at: "2026-09-08T15:00:01Z",
    },
    {
      period_kind: "SEASON",
      period_key: "20000000-0000-4000-8000-000000000001",
      ranking_category: "RAID_PERSONAL",
      rank_position: 10,
      item_id: "RAID_POINT_TICKET",
      quantity: 2,
      granted_at: "2026-09-08T15:00:02Z",
    },
    {
      period_kind: "SEASON",
      period_key: "20000000-0000-4000-8000-000000000001",
      ranking_category: "GUILD_POWER",
      rank_position: 1,
      item_id: "guild_preopen_2026_participation",
      quantity: 1,
      granted_at: "2026-09-08T15:00:02Z",
    },
    {
      period_kind: "SEASON",
      period_key: "20000000-0000-4000-8000-000000000001",
      ranking_category: "GUILD_POWER",
      rank_position: 1,
      item_id: "guild_preopen_2026_rank_1",
      quantity: 1,
      granted_at: "2026-09-08T15:00:02Z",
    },
  ],
});

assert(parsed);
assert.equal(parsed.grants[0].rewardKind, "ITEM");
assert.equal(parsed.grants[1].rewardKind, "ITEM");
assert.equal(parsed.grants[2].rewardKind, "COSMETIC");
assert.equal(parsed.grants[2].displayName, "プレオープン参加記念ギルド装飾");
assert.equal(parsed.grants[3].displayName, "プレオープン第1位限定ギルド装飾");

const receipts = aggregateRankingRewardReceipts(parsed.grants);
assert.equal(receipts.filter((reward) => reward.rewardKind === "ITEM").length, 2);
assert.equal(receipts.filter((reward) => reward.rewardKind === "COSMETIC").length, 2);

const controller = fs.readFileSync("src/app/components/ranking/RankingRewardNotificationController.tsx", "utf8");
const receipt = fs.readFileSync("src/app/components/ui/RewardReceipt.tsx", "utf8");
assert.match(controller, /aggregateRankingRewardReceipts/);
assert.match(controller, /reward\.displayName \|\| canonicalItemName/);
assert.match(controller, /正式オープン後のギルド装飾機能追加時に使用できるようになります/);
assert.match(controller, /デイリーランキング報酬はバッグへ直接付与されました/);
assert.match(controller, /シーズンランキング報酬はプレゼントBOXへ付与されました/);
assert.match(controller, /hasSeasonItemRewards && !hasDailyItemRewards \? "PRESENT" : "INVENTORY"/);
assert.match(receipt, /data-reward-kind/);
assert.match(receipt, /item\.kind === "COSMETIC"/);

console.log("Guild cosmetic ranking notification UI contract: PASS");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rankingRewardSections,
  rankingRewardSectionsFromPayload,
} from "../src/domain/ranking/rankingRewardPresentation.ts";
import {
  aggregateRankingRewardItems,
  parsePendingRankingRewardNotification,
} from "../src/domain/ranking/rankingRewardNotification.ts";

assert.equal(rankingRewardSections("pvp", "season")[0]?.cadence, "MONTHLY");
assert.deepEqual(rankingRewardSections("raid", "season").map((section) => section.title), ["個人ランキング", "ギルドランキング"]);
assert.equal(rankingRewardSections("power", "daily").length, 0);
assert.equal(rankingRewardSections("guild_power", "season").length, 0);

const serverMaster = {
  periods: { POWER: "MONTHLY" },
  daily: { POWER: [
    { rankMin: 1, rankMax: 3, itemId: "CHAR_EXP_L", quantity: 1 },
    { rankMin: 1, rankMax: 3, itemId: "EQUIP_EXP_L", quantity: 1 },
  ] },
};
assert.deepEqual(rankingRewardSectionsFromPayload(serverMaster, "power", "daily"), [{
  title: "個人ランキング",
  cadence: "DAILY",
  tiers: [
    { from: 1, to: 3, itemId: "CHAR_EXP_L", quantity: 1 },
    { from: 1, to: 3, itemId: "EQUIP_EXP_L", quantity: 1 },
  ],
}]);
assert.equal(rankingRewardSectionsFromPayload({ progression: { PVP: [[0, 1, "CASH", 100]] } }, "pvp", "season").length, 0);

const pending = parsePendingRankingRewardNotification({
  notification_ids: ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"],
  grants: [
    { period_kind: "DAILY", period_key: "2026-09-03", ranking_category: "POWER", rank_position: 1, item_id: "CASH", quantity: 100, granted_at: "2026-09-02T15:00:00Z" },
    { period_kind: "SEASON", period_key: "2026-09", ranking_category: "PVP", rank_position: 2, item_id: "CASH", quantity: 50, granted_at: "2026-09-30T15:00:00Z" },
  ],
});
assert.ok(pending);
assert.deepEqual(aggregateRankingRewardItems(pending.grants), [{ id: "CASH", quantity: 150 }]);
assert.equal(parsePendingRankingRewardNotification({ notification_ids: [], grants: [] }), null);

const controller = readFileSync("src/app/components/ranking/RankingRewardNotificationController.tsx", "utf8");
const dialog = readFileSync("src/app/components/ranking/RankingRewardDialog.tsx", "utf8");
const dialogCss = readFileSync("src/app/components/ranking/RankingRewardDialog.css", "utf8");
assert.match(controller, /get_my_pending_ranking_reward_notification/);
assert.match(controller, /acknowledge_ranking_reward_notifications/);
assert.match(controller, /onConfirm: acknowledge/);
assert.match(controller, /onCancel: acknowledge/);
assert.match(controller, /setPending\(null\);\s*setConfirmDialogConfig\(null\);/);
assert.match(controller, /hasSeasonItemRewards && !hasDailyItemRewards \? "PRESENT" : "INVENTORY"/);
assert.match(controller, /デイリーランキング報酬はバッグへ直接付与されました/);
assert.match(controller, /シーズンランキング報酬はプレゼントBOXへ付与されました/);
assert.match(dialog, /className="ranking-reward-scroll"/);
assert.match(dialog, /aria-label="ランキング報酬一覧"/);
assert.match(dialogCss, /height:min\(72dvh,620px\)/);
assert.match(dialogCss, /background:#131b29/);
assert.match(dialogCss, /\.ranking-reward-scroll\{[^}]*overflow-y:auto/);
assert.match(dialogCss, /\.ranking-reward-scroll::-webkit-scrollbar-thumb/);

console.log("Ranking reward UI contract: PASS");

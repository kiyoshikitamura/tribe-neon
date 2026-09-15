import assert from "node:assert/strict";
import fs from "node:fs";
import rewards from "../src/domain/gameplay/canonical/data/ranking_season_rewards_20260830.json" with { type: "json" };

assert.deepEqual(Object.keys(rewards.progression).sort(), ["PVP", "RAID_GUILD", "RAID_PERSONAL"]);
assert.equal("dailyProgression" in rewards, false, "daily ranking values must not be invented");

const migration = fs.readFileSync("supabase/migrations/20260903000233_ranking_reward_notification_contract.sql", "utf8");
for (const contract of [
  "ranking_reward_notifications",
  "period_kind in ('DAILY','SEASON')",
  "unique (recipient_user_id,period_kind,period_key)",
  "get_public_ranking_reward_master",
  "get_my_pending_ranking_reward_notification",
  "acknowledge_ranking_reward_notifications",
  "notification.id=any(p_notification_ids)",
  "notification.recipient_user_id=v_uid",
  "acknowledged_at is null",
  "on conflict do nothing",
  "to authenticated",
  "to service_role",
]) assert.ok(migration.includes(contract), contract);
assert.match(migration, /if found then[\s\S]*insert into public\.presents[\s\S]*insert into public\.ranking_reward_notifications/);
assert.doesNotMatch(migration, /dailyProgression|DAILY_[A-Z]+/);

const postflight = fs.readFileSync("supabase/postflight/20260903000233_ranking_reward_notification_contract_postflight.sql", "utf8");
assert.ok(postflight.includes("daily ranking rewards must remain absent until canonical values are frozen"));
assert.ok(postflight.includes("has_table_privilege('authenticated'"));
console.log("Ranking reward notification contract verification passed.");

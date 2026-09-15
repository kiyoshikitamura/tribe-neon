import assert from "node:assert/strict";
import fs from "node:fs";
import { rankingSeasonWindow, isInsideRankingSeason } from "../src/domain/ranking/rankingSeason.ts";
import { rankingRewardSections } from "../src/domain/ranking/rankingRewardPresentation.ts";

const before = rankingSeasonWindow("RAID", new Date("2026-09-06T14:59:59.000Z"));
assert.deepEqual(before, { startsAt: "2026-08-30T15:00:00.000Z", endsAt: "2026-09-06T15:00:00.000Z" });
assert.deepEqual(rankingSeasonWindow("RAID", new Date("2026-09-06T15:00:00.000Z")), { startsAt: "2026-09-06T15:00:00.000Z", endsAt: "2026-09-13T15:00:00.000Z" });
assert.deepEqual(rankingSeasonWindow("PVP", new Date("2026-09-02T00:00:00.000Z")), { startsAt: "2026-08-31T15:00:00.000Z", endsAt: "2026-09-30T15:00:00.000Z" });
assert.equal(isInsideRankingSeason("2026-09-06T14:59:59Z", before), true);
assert.equal(isInsideRankingSeason("2026-09-06T15:00:00Z", before), false);
const currentWeekDamage = [
  { createdAt: "2026-09-06T14:59:59Z", damage: 1200 },
  { createdAt: "2026-08-29T14:59:59Z", damage: 9900 },
].filter((entry) => isInsideRankingSeason(entry.createdAt, before)).reduce((sum, entry) => sum + entry.damage, 0);
assert.equal(currentWeekDamage, 1200);
assert.deepEqual(rankingSeasonWindow("RAID", new Date("2026-09-02T00:00:00.000Z")), rankingSeasonWindow("RAID", new Date("2026-09-02T00:00:00.000Z")));

assert.equal(rankingRewardSections("pvp", "season")[0].cadence, "MONTHLY");
assert.deepEqual(rankingRewardSections("raid", "season").map((entry) => entry.cadence), ["WEEKLY", "WEEKLY"]);
assert.equal(rankingRewardSections("raid", "daily").length, 0);
assert.equal(rankingRewardSections("power", "season").length, 0);
assert.equal(rankingRewardSections("guild_power", "season").length, 0);

const migration = fs.readFileSync("supabase/migrations/20260902000229_ranking_season_lifecycle_authority.sql", "utf8");
for (const contract of [
  "canonical_ranking_reward_payload",
  "canonical_master_freeze_versions",
  "ranking_pvp_season_snapshots",
  "ranking_raid_personal_season_snapshots",
  "ranking_raid_guild_season_snapshots",
  "ranking_season_reward_grants",
  "finalize_pvp_season_rewards",
  "finalize_raid_season_rewards",
  "soft_reset_pvp_ratings",
  "pg_advisory_xact_lock",
  "advance_ranking_season('PVP'",
  "advance_ranking_season('RAID'",
  "ranking-pvp-monthly-jst",
  "ranking-raid-weekly-jst",
  "from public,anon,authenticated",
]) assert.ok(migration.toLowerCase().includes(contract.toLowerCase()), contract);
assert.ok(!migration.includes("create trigger raid_damage_logs_ensure_season"));
assert.ok(!migration.includes("ensure_current_ranking_season"));
const revert = fs.readFileSync("supabase/migrations/20260902000228_ranking_season_lifecycle_revert.sql", "utf8");
assert.ok(revert.includes("20260902000227"));
assert.ok(revert.includes("drop function if exists public.ensure_current_ranking_season"));
assert.ok(revert.includes("if (select count(*)"));
assert.ok(!revert.includes("identity mismatch"));
assert.ok(revert.indexOf("drop trigger if exists raid_damage_logs_ensure_season") > revert.indexOf("end;\n$$;"));
const convergence = fs.readFileSync("supabase/migrations/20260902000230_ranking_lifecycle_safety_convergence.sql", "utf8");
for (const contract of [
  "converge_ranking_lifecycle_safety",
  "assert_pvp_boundary_replay_continuity",
  "finalize_pvp_season_rewards",
  "reconcile_pvp_after_season_boundary",
  "finalize_raid_season_rewards",
  "Raid cutover overlap contains damage logs",
  "advance_ranking_season(''PVP''",
  "from public,anon,authenticated",
]) assert.ok(convergence.toLowerCase().includes(contract.toLowerCase()), contract);
assert.ok(migration.includes("event.event_no=event.event_total"));
const convergencePostflight = fs.readFileSync("supabase/postflight/20260902000230_ranking_lifecycle_safety_convergence_postflight.sql", "utf8");
assert.ok(convergencePostflight.includes("closed.ends_at<active.ends_at"));
const emergencyRollback = fs.readFileSync("supabase/manual/20260902000227_ranking_season_lifecycle_rollback.sql", "utf8");
for (const contract of [
  "ranking-pvp-monthly-jst",
  "ranking-raid-weekly-jst",
  "start_pvp_battle(uuid,text[],text)",
  "finalize_pvp_battle(uuid,jsonb)",
  "finalize_raid_battle(uuid,jsonb)",
  "drop function if exists public.advance_ranking_season",
]) assert.ok(emergencyRollback.includes(contract), contract);
const dialog = fs.readFileSync("src/app/components/ranking/RankingRewardDialog.tsx", "utf8");
assert.ok(dialog.includes("CanonicalDialog"));
assert.ok(dialog.includes("このランキングのデイリー報酬はありません"));
assert.ok(dialog.includes("このランキングのシーズン報酬はありません"));
assert.ok(!dialog.includes("SPECIAL_TICKET_RANDOM\", 2"));
console.log("TN-09 Raid ranking verification passed.");

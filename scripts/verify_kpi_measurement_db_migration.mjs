import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationNames = [
  "20260904000242_production_daily_activity_schema_parity.sql",
  "20260904000243_kpi_measurement_fact_foundation.sql",
  "20260904000244_kpi_measurement_lifecycle_hooks.sql",
  "20260904000245_kpi_snapshot_foundation.sql",
  "20260904000246_kpi_snapshot_refresh_rpcs.sql",
  "20260904000247_kpi_measurement_security.sql",
  "20260905000248_kpi_timeseries_dashboard.sql",
];
const migrations = migrationNames.map((name) => ({
  name,
  sql: readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"),
}));
const combined = migrations.map(({ sql }) => sql).join("\n");

for (const token of [
  "ranking_daily_activity_snapshots",
  "kpi_subjects",
  "kpi_daily_user_activity",
  "kpi_account_classification_periods",
  "kpi_guild_membership_periods",
  "kpi_tutorial_completion_facts",
  "kpi_gacha_execution_facts",
  "kpi_aggregation_runs",
  "kpi_metric_snapshots",
  "refresh_kpi_snapshots",
  "get_latest_kpi_snapshots",
  "Asia/Tokyo",
  "payment_closed",
  "observation_incomplete",
  "p0-v2-timeseries",
  "active.dau_authenticated",
  "active.mau_anonymous",
  "user.new_authenticated_eop",
  "guild.member_total",
]) {
  assert.ok(combined.includes(token), `KPI migration set missing ${token}`);
}

for (const { name, sql } of migrations) {
  assert.ok(!/\bdrop\s+table\b/i.test(sql), `${name} contains DROP TABLE`);
  assert.ok(!/\btruncate\b/i.test(sql), `${name} contains TRUNCATE`);
  assert.ok(
    !/delete\s+from\s+public\.(?:users|guilds|guild_members|gacha_execution_history|tutorial_progress|payment_transactions)\b/i.test(sql),
    `${name} deletes gameplay or payment data`,
  );
  assert.equal((sql.match(/\$\$/g) ?? []).length % 2, 0, `${name} has unbalanced dollar quotes`);
}

assert.match(
  combined,
  /primary key\s*\(activity_date,\s*subject_id\)/i,
  "daily user activity must be one row per JST day and subject",
);
assert.match(
  combined,
  /source_user_id\s*=\s*null/i,
  "gameplay deletion must detach the source user id",
);
assert.match(
  combined,
  /references public\.kpi_subjects\(subject_id\) on delete restrict/i,
  "durable KPI facts must not cascade with gameplay users",
);
assert.match(
  combined,
  /revoke all on function public\.refresh_kpi_snapshots[\s\S]*from public, anon, authenticated/i,
  "browser roles must not execute Production aggregation",
);
assert.doesNotMatch(
  combined,
  /grant execute on function public\.refresh_kpi_snapshots[\s\S]{0,200}\bto authenticated\b/i,
  "refresh function must not be granted to authenticated clients",
);

console.log("KPI measurement DB migration verification PASS");

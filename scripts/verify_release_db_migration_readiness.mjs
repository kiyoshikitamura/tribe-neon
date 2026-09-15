import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const allowKnownBlockers = process.argv.includes("--allow-known-blockers");
const migrationDirectory = "supabase/migrations";
const postflightDirectory = "supabase/postflight";
const manifest = JSON.parse(readFileSync("config/supabase-migration-collisions.json", "utf8"));
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();
const byVersion = new Map();
for (const name of migrationFiles) {
  const version = name.split("_", 1)[0];
  const entries = byVersion.get(version) || [];
  entries.push(join(migrationDirectory, name));
  byVersion.set(version, entries);
}

const duplicates = [...byVersion.entries()].filter(([, files]) => files.length > 1);
const declared = new Map((manifest.collisions || []).map((entry) => [entry.version, entry]));
assert.deepEqual(
  duplicates.map(([version]) => version),
  [...declared.keys()].sort(),
  "未登録または解消済みのmigration version衝突があります",
);

for (const [version, files] of duplicates) {
  const collision = declared.get(version);
  assert.equal(collision.status, "BLOCKED_DO_NOT_RENAME", `${version}の安全状態が不正です`);
  assert.deepEqual(
    files.map((file) => file.replaceAll("\\", "/")).sort(),
    collision.files.map((entry) => entry.path).sort(),
    `${version}の衝突ファイル集合が監査記録と異なります`,
  );
  for (const entry of collision.files) {
    const digest = createHash("sha256").update(readFileSync(entry.path)).digest("hex");
    assert.equal(digest, entry.sha256, `${entry.path}が履歴監査なしで変更されました`);
  }
}

const requiredPostflights = [
  "20260902000221_activation_membership_mission_handoff_postflight.sql",
  "20260902000224_starter_cash_authority_postflight.sql",
  "20260902000231_natural_patrol_encounter_authority_postflight.sql",
  "20260902000232_battle_snapshot_presentation_metadata_postflight.sql",
];
const postflightFiles = new Set(readdirSync(postflightDirectory));
for (const name of requiredPostflights) {
  assert.ok(postflightFiles.has(name), `${name}がありません`);
}
const postflightContracts = new Map([
  [requiredPostflights[0], ["complete_activation_mission_handoff", "auth.uid()", "has_function_privilege"]],
  [requiredPostflights[1], ["pg_get_expr", "public.users", "2600"]],
  [requiredPostflights[2], ["get_patrol_battle_enemy", "patrol.user_id = v_user_id", "patrol.expires_at <= now()"]],
  [requiredPostflights[3], ["build_server_battle_snapshot", "canonical_character_master", "service_role"]],
]);
for (const [name, tokens] of postflightContracts) {
  const sql = readFileSync(join(postflightDirectory, name), "utf8");
  for (const token of tokens) {
    assert.ok(sql.includes(token), `${name}に${token}検査がありません`);
  }
}

const patrolMigration = readFileSync(
  join(migrationDirectory, "20260902000231_natural_patrol_encounter_authority.sql"),
  "utf8",
);
assert.match(patrolMigration, /^\s*(?:--[^\n]*\n)*\s*begin\s*;/i, "00231はBEGINで開始する必要があります");
assert.match(patrolMigration, /commit\s*;\s*notify pgrst/im, "00231はschema reload前にCOMMITする必要があります");

const rankingPostflight = readFileSync(
  join(postflightDirectory, "20260902000229_ranking_season_lifecycle_authority_postflight.sql"),
  "utf8",
);
for (const previewOnlyId of [
  "90106a5f-ec9b-415f-98d0-754a525c1eb7",
  "2828d27e-ebfd-4005-ba3b-0d618618c286",
]) {
  assert.ok(!rankingPostflight.includes(previewOnlyId), "00229 postflightにPreview固有UUIDが残っています");
}
assert.ok(rankingPostflight.includes("active ranking seasons overlap"));

const result = {
  status: duplicates.length ? "BLOCKED" : "READY",
  migrationFiles: migrationFiles.length,
  uniqueVersions: byVersion.size,
  knownCollisions: duplicates.map(([version, files]) => ({
    version,
    files: files.map((file) => basename(file)),
  })),
  requiredPostflights: "PASS",
  transaction00231: "PASS",
  environmentNeutralPostflight00229: "PASS",
};
console.log(JSON.stringify(result, null, 2));

if (duplicates.length && !allowKnownBlockers) {
  console.error("Release DB gate BLOCKED: migration version衝突の実DB照合と収束migrationが必要です。");
  process.exit(1);
}

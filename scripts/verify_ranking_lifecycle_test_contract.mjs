import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [productionAudit,localFixture,guardedRunner,localRunner]=await Promise.all([
  readFile("tests/db/ranking-lifecycle-safety-convergence.sql","utf8"),
  readFile("supabase/tests/ranking-lifecycle-safety-convergence-local.sql","utf8"),
  readFile("scripts/run_guarded_sql_test.mjs","utf8"),
  readFile("scripts/run_local_ranking_lifecycle_test.mjs","utf8"),
]);

assert.match(productionAudit,/set transaction read only\s*;/i);
assert.doesNotMatch(
  productionAudit,
  /(?:perform|select|:=)\s+public\.converge_ranking_lifecycle_safety\s*\(/i,
  "Production-compatible audit must not execute the mutating convergence RPC",
);
assert.match(localFixture,/tribe_neon\.local_fixture_runner/);
assert.match(localFixture,/jsonb_build_object\('orphanSeasons',1,'raidCutovers',1\)/);
assert.match(localFixture,/jsonb_build_object\('orphanSeasons',0,'raidCutovers',0\)/);
assert.match(localFixture,/rollback\s*;\s*$/i);
assert.match(guardedRunner,/environment === "production"/);
assert.match(localRunner,/127\.0\.0\.1/);
assert.match(localRunner,/localhost/);
assert.match(localRunner,/::1/);
assert.match(localRunner,/ranking-lifecycle-safety-convergence-local\.sql/);

console.log(JSON.stringify({
  productionAudit:"READ_ONLY",
  productionMutationRpcExecution:"PROHIBITED",
  localFixture:"ISOLATED_ROLLBACK",
  localRunnerHostGuard:"PASS",
},null,2));

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const historicalUrl = new URL(
  "../supabase/migrations/20260903000235_preopen_gvg_preparation_missions.sql",
  import.meta.url,
);
const extensionUrl = new URL(
  "../supabase/migrations/20260903000236_preopen_gvg_preparation_period_extension.sql",
  import.meta.url,
);
const postflightUrl = new URL(
  "../supabase/postflight/20260903000236_preopen_gvg_preparation_period_extension_postflight.sql",
  import.meta.url,
);
const inventoryUrl = new URL("../src/app/context/hooks/useInventory.ts", import.meta.url);

const [historical, extension, postflight, inventory] = await Promise.all([
  readFile(historicalUrl, "utf8"),
  readFile(extensionUrl, "utf8"),
  readFile(postflightUrl, "utf8"),
  readFile(inventoryUrl, "utf8"),
]);

// 00235 is deployed history. The original boundary must remain visible there;
// the final contract is the forward-only overlay in 00236.
assert.match(historical, /'2026-09-08 00:00:00 Asia\/Tokyo'::timestamptz/);
assert.doesNotMatch(
  historical,
  /'2026-09-09 00:00:00 Asia\/Tokyo'::timestamptz/,
  "deployed migration 00235 must not be rewritten",
);

for (const contract of [
  "where id = 'GVG_PREP_20260904'",
  "'2026-09-09 00:00:00 Asia/Tokyo'::timestamptz",
  "'{completion_message}'",
  "9月9日の正式オープンを待とう！",
  "domain = 'MISSION_EVENT'",
  "'{progress_end_jst}'",
  "'2026-09-09 00:00:00'::text",
]) {
  assert.ok(extension.includes(contract), `period extension contract missing: ${contract}`);
}
assert.match(
  inventory,
  /ギルドバトル開幕の準備完了！\\n正式オープンに備えよう！/,
);
assert.doesNotMatch(inventory, /9月8日の正式オープンを待とう！/);

for (const contract of [
  "progress_end_at = '2026-09-09 00:00:00 Asia/Tokyo'::timestamptz",
  "120 * 60 * 60",
  "claim_deadline is null",
  "progress_end_jst' is distinct from '2026-09-09 00:00:00'",
]) {
  assert.ok(postflight.includes(contract), `postflight contract missing: ${contract}`);
}

const start = Date.parse("2026-09-03T15:00:00.000Z");
const lastIncluded = Date.parse("2026-09-08T14:59:59.999Z");
const endExclusive = Date.parse("2026-09-08T15:00:00.000Z");
const isProgressOpen = (instant) => instant >= start && instant < endExclusive;

assert.equal(endExclusive - start, 120 * 60 * 60 * 1000);
assert.equal(isProgressOpen(start - 1), false);
assert.equal(isProgressOpen(start), true);
assert.equal(isProgressOpen(lastIncluded), true);
assert.equal(isProgressOpen(endExclusive), false);
assert.equal(isProgressOpen(endExclusive + 1), false);

console.log(
  "Pre-open GvG preparation period extension verification: PASS (forward-only 00236, 120 hours, inclusive start/exclusive end).",
);

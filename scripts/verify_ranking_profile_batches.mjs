import assert from "node:assert/strict";
import { loadRankingProfiles } from "../src/domain/ranking/loadRankingProfiles.ts";
const ids = Array.from({length:105}, (_, i) => `user-${i}`);
const calls = [];
const result = await loadRankingProfiles([...ids, ids[0]], async batch => {
  calls.push(batch.length);
  assert.ok(batch.length <= 100);
  return batch.map(user_id => ({user_id, main_formation_character_ids: ["a", "b", "c", "d", "e"]}));
});
assert.deepEqual(calls, [100, 5]);
assert.equal(Object.keys(result).length, 105);
assert.equal(result["user-104"].main_formation_character_ids.length, 5);
await assert.rejects(() => loadRankingProfiles(ids, async batch => {
  if (batch.length === 5) throw new Error("read failed");
  return [];
}));
assert.deepEqual(await loadRankingProfiles([], async () => { throw new Error("must not request empty"); }), {});
console.log("PASS: top100 + self/nearby profiles, max100 batches, deduplication, error propagation, deck5");

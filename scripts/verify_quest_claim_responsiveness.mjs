import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app/context/hooks/usePatrol.ts", import.meta.url), "utf8");
const start = source.indexOf("      setLastPatrolRewards(rewardSummary);");
const end = source.indexOf("    } catch", start);
assert.ok(start > 0 && end > start);
const body = source.slice(start, end);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const suppressResultModal of [false, true]) {
  const events = [];
  let releaseRefresh;
  const refresh = new Promise(resolve => { releaseRefresh = resolve; });
  const args = {
    rewardSummary: { totalCash: 300, totalXp: 100, awardedItems: [{ item_id: "test", quantity: 1 }] },
    options: { suppressResultModal },
    setLastPatrolRewards: receipt => events.push(["receipt", receipt]),
    setShowPatrolRewardModal: open => events.push(["modal", open]),
    invalidatePatrolBootstrap: () => {},
    setActivePatrols: update => { assert.deepEqual(update([{ id: "claimed" }]), []); events.push(["remove"]); },
    setHasActivePatrolBattle: () => {},
    targetPatrol: { has_battle_event: false },
    patrolId: "claimed",
    session: { user: { id: "qa" } },
    syncBootstrapData: () => refresh,
    addGuildXpAndContributionByAction: () => refresh,
  };
  let completed = false;
  const claim = new AsyncFunction(...Object.keys(args), body)(...Object.values(args)).then(result => { completed = result; });
  // Keep both ancillary operations unresolved: claim and receipt must still finish.
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(completed, true, "claim must not await bootstrap or guild refresh");
  assert.deepEqual(events.map(event => event[0]), suppressResultModal ? ["receipt", "remove"] : ["receipt", "modal", "remove"]);
  releaseRefresh();
  await claim;
}
console.log("PASS: claim receipt is immediate; ancillary refresh cannot block result; battle-owned modal remains suppressed");

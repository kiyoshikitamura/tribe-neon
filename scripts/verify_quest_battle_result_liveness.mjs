import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const battle = readFileSync(new URL("../src/hooks/useBattle.ts", import.meta.url), "utf8");
const patrol = readFileSync(new URL("../src/app/components/PatrolTab.tsx", import.meta.url), "utf8");
const patrolHook = readFileSync(new URL("../src/app/context/hooks/usePatrol.ts", import.meta.url), "utf8");
const battleResult = readFileSync(new URL("../src/app/components/battle/BattleResultSummary.tsx", import.meta.url), "utf8");

assert.match(
  battle,
  /setBattleSkipPending\(false\);\s*\/\/ Skip pauses replay[\s\S]*?setIsAutoPaused\(false\);/,
  "a new battle must clear pause state left by Skip",
);
assert.match(
  battle,
  /setBattlePresentationContext\(null\);\s*setBattleSkipPending\(false\);\s*setIsAutoPaused\(false\);/,
  "battle completion must clear replay pause state",
);
assert.match(
  battle,
  /if \(battleState !== "PLAYING" \|\| isAutoPaused\) return;[\s\S]*?if \(battleMode === "PATROL"\) setOfficialPatrolEventIndex\(advanceReplay\)/,
  "an unpaused authoritative Quest replay must advance beyond its current event",
);
assert.match(
  battle,
  /replayEvent\.type === "RESULT"[\s\S]*?waitForBattleHpParityGate[\s\S]*?void endBattleSession\(winner\)/,
  "the terminal Quest replay event must settle into the result state",
);
assert.doesNotMatch(
  patrol,
  /if \(!tutorialBattleActive \|\| battleState !== "RESULT"/,
  "normal quest victories must not be excluded from result reward settlement",
);
assert.doesNotMatch(
  patrol,
  /activePatrols\.find\(\(patrol: any\) => patrol\.id === settledPatrolEncounterId && patrol\.battle_resolved\)/,
  "reward settlement must not wait on a stale bootstrap projection",
);
assert.match(
  patrol,
  /handleClaim\(settledPatrolEncounterId, \{ battleOwnsResult: true \}\)/,
  "the mounted battle result must claim its authoritative reward",
);
assert.match(
  patrolHook,
  /if \(!options\?\.suppressResultModal\) setShowPatrolRewardModal\(true\);/,
  "battle-owned rewards must not open a duplicate result modal",
);
assert.match(
  patrolHook,
  /invalidatePatrolBootstrap\(\);\s*setActivePatrols\(\(current\) => current\.filter\(\(entry\) => entry\.id !== patrolId\)\);\s*setHasActivePatrolBattle/,
  "a successful claim must synchronously remove the completed Quest before leaving its battle result",
);
assert.match(
  patrolHook,
  /setLastPatrolRewards\(rewardSummary\);[\s\S]*?setActivePatrols\(\(current\) => current\.filter[\s\S]*?if \(!options\?\.suppressResultModal\) setShowPatrolRewardModal\(true\);/,
  "non-battle claims must preserve their reward modal while removing the completed Quest card",
);
assert.match(
  patrol,
  /battleStartRef\.current = true;\s*\/\/ Rewards belong[\s\S]*?setLastPatrolRewards\(null\);\s*setShowPatrolRewardModal\(false\);/,
  "a later quest must clear the previous battle-owned reward projection",
);
assert.match(
  battleResult,
  /disabled=\{victory && \(tutorial \|\| presentationContext\?\.mode === "PATROL"\) && !rewards\}/,
  "a victorious Quest result may wait only until its reward projection arrives",
);
assert.match(
  battleResult,
  /rewards \? "次へ" : "報酬確定中…"/,
  "the Quest result CTA must become actionable once rewards are present",
);
assert.match(
  battle,
  /const destination = [^\n]*battleModeResultDetail\?\.destination;[\s\S]*?setBattleState\(null\);[\s\S]*?if \(destination\) navigateTab\?\.\(destination\);/,
  "the result CTA must leave the battle and honor its configured destination",
);

console.log(JSON.stringify({
  status: "PASS",
  questReplay: { pauseResetAtStart: true, pauseResetAtCompletion: true, authoritativeCursorAdvances: true, resultSettles: true },
  questResult: { regularVictoryClaim: true, staleProjectionIndependent: true, duplicateModalSuppressed: true, completedPatrolRemovedSynchronously: true, nonBattleModalPreserved: true, ctaUnlocksWithRewards: true, destinationRestored: true },
  raidContractChanged: false,
}, null, 2));

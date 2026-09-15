import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { QA_PRESENTATION_SCENARIOS, VISUAL_COMPLIANCE_GATE, isQaHarnessAvailable } from "../src/domain/presentation/qaHarness.ts";

const requiredScenarios = [
  "world-introduction", "name-input-error", "gacha-page", "gacha-character-v3", "gacha-production", "gacha-asset-transition", "gacha-authority-loading", "gacha-entitlement-empty", "gacha-resource-empty", "gacha-skill-result", "gacha-skill-result-one", "gacha-equipment-result", "gacha-equipment-result-one", "gacha-standard-reveal", "gacha-ssr-reveal",
  "skill-tutorial", "shared-skill-presentation", "public-user-profile", "growth-before", "growth-result", "formation", "auto-formation", "quest-encounter",
  "quest-normal-battle", "quest-instant-battle", "battle-5v3",
  "battle-5v5", "battle-2x", "battle-ssr-skill", "battle-consecutive-skill", "battle-final-hit", "battle-result-win", "battle-result-lose",
  "first-home-fresh", "first-home-identity-loading", "first-home-raid", "first-home-guild-out", "first-home-guild-in", "first-home-guild-pending",
  "first-home-favorite-missing", "first-home-favorite-invalid", "first-home-activity-self", "first-home-character-tall", "first-home-character-hair", "first-home-campaign", "first-home-prep",
];
assert.deepEqual(QA_PRESENTATION_SCENARIOS.map(([id]) => id), requiredScenarios, "QA launcher scenario contract drifted");
assert.equal(isQaHarnessAvailable("production", "development"), false, "Production must never expose QA harness");
assert.equal(isQaHarnessAvailable(undefined, "production"), false, "Unknown production build must fail closed");
for (const environment of ["preview", "development", "test"]) assert.equal(isQaHarnessAvailable(environment, "production"), true);

const allowed = new Set(["PASS", "PARTIAL", "FAIL", "HUMAN_REQUIRED"]);
assert.equal(VISUAL_COMPLIANCE_GATE.length, 9);
for (const item of VISUAL_COMPLIANCE_GATE) {
  assert.ok(allowed.has(item.status), `${item.id}: invalid status`);
  assert.ok(item.evidence.trim(), `${item.id}: missing evidence`);
}
for (const subjective of ["world-intro", "growth", "battle-start", "variable-roster", "skill-2x", "ssr-skill", "battle-result", "first-home"]) {
  assert.equal(VISUAL_COMPLIANCE_GATE.find((entry) => entry.id === subjective)?.status, "HUMAN_REQUIRED", `${subjective} must not be auto-PASSed`);
}

const page = await readFile(new URL("../src/app/qa/presentation/page.tsx", import.meta.url), "utf8");
assert.match(page, /notFound\(\)/, "QA route must fail closed");
assert.match(page, /isQaHarnessAvailable/, "QA route must use canonical environment gate");
console.log(`Visual compliance gate PASS (${requiredScenarios.length} scenarios, ${VISUAL_COMPLIANCE_GATE.length} checks)`);

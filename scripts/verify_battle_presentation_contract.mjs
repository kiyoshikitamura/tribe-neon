import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveCanonicalBattle } from "../src/domain/battle/canonical_runtime.ts";
import { parseCanonicalEffects } from "../src/domain/battle/canonical_effects.ts";
import { CANONICAL_SKILLS } from "../src/domain/gameplay/canonical/masters.ts";
import {
  battlePresentationBudget,
  buildBattlePresentationUnit,
  reconcileBattleHpFromReplay,
} from "../src/domain/presentation/battlePresentationUnit.ts";
import {
  battleStatusApplyLabel,
  battleStatusPersistentLabel,
  battleStatusPresentationTone,
} from "../src/domain/presentation/battleStatusPresentation.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const unit = (id, team, skills = []) => ({
  id,
  characterId: id,
  name: id,
  team,
  level: 12,
  awakeningLevel: 1,
  rarity: team === "PLAYER" ? "SSR" : "SR",
  alignment: "ORDER",
  stats: { hp: 100000, atk: 10000, def: 5000, spd: team === "PLAYER" ? 200 : 100, luk: 0 },
  skills,
});
const shieldSkill = {
  id: "presentation-shield",
  name: "Presentation Shield",
  activationType: "ACTIVE",
  cooldown: 3,
  availableFromRound: 1,
  target: "SELF",
  effects: ["SHIELD 30% MaxHP / 2T"],
};
const input = {
  seed: 20260824,
  tactic: "SKILL_PRIORITY",
  enemyTactic: "BALANCED",
  maxRounds: 3,
  player: [unit("player-1", "PLAYER", [shieldSkill])],
  enemy: [unit("enemy-1", "ENEMY")],
};
const first = resolveCanonicalBattle(input);
const second = resolveCanonicalBattle(input);
assert.deepEqual(first, second, "The same authoritative replay seed must remain deterministic");
assert.ok(first.events.some((event) => Array.isArray(event.payload.activeEffectsAfter)), "Replay events must project authoritative active effect snapshots");
assert.ok(first.events.some((event) => event.type === "EFFECT" && event.payload.kind === "ACTIVE_EFFECT_SYNC"), "Effect expiry must be projected without client duration calculation");
const canonicalEffectTypes = [...new Set(CANONICAL_SKILLS.flatMap((skill) => parseCanonicalEffects(skill.effects).map((effect) => effect.type)))].sort();
assert.deepEqual(canonicalEffectTypes, ["BLEED", "BLIND", "BUFF", "COUNTER", "DAMAGE", "DEBUFF", "HEAL", "IGNORE_DEF", "LIFESTEAL", "POISON", "REGEN", "REMOVE_STATUS", "SHIELD", "SILENCE", "STUN", "TAUNT", "TRIGGER", "TRIGGER_LIMIT"], "Canonical effect inventory changed without a Presentation audit");
const grouped = buildBattlePresentationUnit([
  { index: 0, round: 1, type: "ACTION", payload: { actorId: "player-1", skillId: "SKILL_AOE" } },
  { index: 1, round: 1, type: "DAMAGE", payload: { targetId: "enemy-1", amount: 100, remainingHp: 900 } },
  { index: 2, round: 1, type: "DAMAGE", payload: { targetId: "enemy-2", amount: 120, remainingHp: 880 } },
  { index: 3, round: 1, type: "STATUS", payload: { targetId: "enemy-2", status: "ATK_DOWN", activeEffectsAfter: [] } },
  { index: 4, round: 1, type: "ACTION", payload: { actorId: "enemy-1", skillId: "BASIC_ATTACK" } },
], 0);
assert.deepEqual(grouped?.targets.map((target) => target.targetId), ["enemy-1", "enemy-2"], "One ACTION must group all canonical targets for simultaneous presentation");
assert.deepEqual(grouped?.targets[1].events.map((event) => event.type), ["DAMAGE", "STATUS"], "Target result order must remain authoritative");
assert.equal(grouped?.nextReplayCursor, 4, "Presentation grouping must stop at the next ACTION");
const groupedTaunt = buildBattlePresentationUnit([
  { index: 0, round: 1, type: "ACTION", payload: { actorId: "player-1", skillId: "TAUNT_ALL" } },
  { index: 1, round: 1, type: "STATUS", payload: { targetId: "enemy-1", status: "TAUNT" } },
  { index: 2, round: 1, type: "STATUS", payload: { targetId: "enemy-2", status: "TAUNT" } },
  { index: 3, round: 1, type: "ACTION", payload: { actorId: "enemy-1", skillId: "BASIC_ATTACK" } },
], 0);
assert.deepEqual(groupedTaunt?.targets.map((target) => target.targetId), ["enemy-1", "enemy-2"], "Multi-target TAUNT must remain one simultaneous ActionPresentationUnit");
assert.equal(battlePresentationBudget("NORMAL", 1), 1440, "1x normal budget must be twice the former 1x target");
assert.equal(battlePresentationBudget("SSR", 1), 2400, "1x premium budget must preserve the expanded recognition window");
assert.equal(battlePresentationBudget("NORMAL", 2), 720, "2x normal budget must track the former 1x target");
assert.equal(battlePresentationBudget("SSR", 2), 1200, "2x premium budget must track the former 1x target");
const reconciled = reconcileBattleHpFromReplay([
  { id: "enemy-1", hp: 1000, maxHp: 1000, isDead: false },
  { id: "enemy-2", hp: 1000, maxHp: 1000, isDead: false },
], [
  { index: 0, round: 1, type: "DAMAGE", payload: { targetId: "enemy-1", hpAfter: 125 } },
  { index: 1, round: 1, type: "DEFEAT", payload: { targetId: "enemy-2" } },
]);
assert.deepEqual(reconciled.map((entry) => [entry.hp, entry.isDead]), [[125, false], [0, true]], "Result HP projection must copy canonical replay HP without calculation");

const runtime = read("src/hooks/useBattle.ts");
const viewer = read("src/app/components/battle/QuestBattleViewer.tsx");
const portrait = read("src/app/components/battle/BattleUnitPortrait.tsx");
const effects = read("src/app/components/battle/BattleEffectPresentation.tsx");
const portraitCss = read("src/app/components/battle/BattleUnitPortrait.css");
const effectsCss = read("src/app/components/battle/BattleEffectPresentation.css");
const viewerCss = read("src/app/components/battle/QuestBattleViewer.css");
const result = read("src/app/components/battle/BattleResultSummary.tsx");
const audioProvider = read("src/audio/AudioProvider.tsx");
const audioContract = read("src/audio/audioContract.ts");
const fullSkillHarness = read("src/app/qa/battle-full-skill-load/BattleFullSkillLoadHarness.tsx");
const globals = read("src/app/globals.css");
const setup = read("src/app/components/SetupView.tsx");
const mockRpc = read("src/utils/mock/mockRpc.ts");
const snapshotMetadataMigration = read("supabase/migrations/20260902000232_battle_snapshot_presentation_metadata.sql");
assert.match(runtime, /setBattleResultReplayEvents\(replayEventsTemp\)/, "Result must retain an immutable replay event snapshot");
assert.match(runtime, /if \(tutorialBattleActive \|\| battleState !== "PLAYING"/, "In-battle skip must explicitly reject the first tutorial");
assert.match(runtime, /find\(\(entry\) => entry\.type === "RESULT"\)/, "Skip must use the authoritative result event");
assert.match(runtime, /battleHpSkipProjection/, "Explicit Skip must project the replay endpoint before entering Result");
assert.match(viewer, /data-party-size=/, "Roster must expose its authoritative party length");
assert.doesNotMatch(viewer, />CURRENT<|`NEXT \$\{index\}`/, "Battle V2 must not render CURRENT/NEXT presentation");
assert.doesNotMatch(viewer, /className="battle-action-stage/, "Battle V2 must not render a central action stage");
assert.match(runtime, /buildBattlePresentationUnit\(authoritativeEvents/, "Production replay must use the presentation-only ACTION builder");
for (const field of ["characterId", "level", "awakeningLevel", "rarity"]) {
  assert.match(snapshotMetadataMigration, new RegExp(`'${field}'`), `Production snapshot must project ${field}`);
}
assert.match(mockRpc, /rarity: characterMaster\?\.rarity \|\| "N"/, "Mock replay snapshot must preserve Canonical Character rarity");
assert.match(runtime, /waitForRenderedBattleHpParity/, "RESULT must wait for rendered HP parity before leaving the field");
assert.match(runtime, /waitForBattleHpParityGate/, "ACTION, RESULT and Skip parity must use the finite liveness gate");
assert.doesNotMatch(runtime, /setTimeout\(\(\) => void finishCanonicalResult\(\), 120\)/, "RESULT parity must not retry forever");
assert.match(runtime, /playerPartyStatesRef\.current = canonicalPlayers;[\s\S]*enemyPartyStatesRef\.current = canonicalEnemies;/, "RESULT must commit the canonical terminal HP projection before its visual gate");
assert.match(runtime, /waitForRenderedBattleActionHpParity/, "Every HP-changing ACTION must wait for DOM and fill parity before advancing");
assert.match(runtime, /recordBattleHpProjection/, "Every ACTION HP projection must be traced before RESULT");
assert.match(viewer, /battle-cutin-slot/, "SR/SSR cut-in must use the reserved lower strip");
assert.ok(portrait.indexOf("<BattleTargetReaction") > portrait.indexOf("<div className=\"battle-unit-art\""), "Target reaction must be mounted inside the character icon");
assert.match(effects, /data-target-effect-scope="icon"/, "Target effects must declare icon-local scope");
assert.match(effects, /event\.type === "STATUS" \|\| \(event\.type === "EFFECT"/, "Only canonical STATUS/EFFECT events may enter the Apply-label route; IGNORE_DEF/TRIGGER metadata must stay hidden");
assert.match(effects, /data-unit-effect-scope="row"/, "Buff and debuff apply presentation must cover the complete HUD row");
assert.match(effects, /defensive = cues\.filter\(\(\{ tone \}\) => tone === "shield"\)/, "Shield Apply must share the unit-wide overlay contract");
const statusPresentation = [
  [{ kind: "BUFF", stat: "ATK" }, "攻撃UP", { id: "BUFF_ATK", kind: "BUFF", stat: "ATK" }, "攻↑"],
  [{ kind: "BUFF", stat: "DEF" }, "防御UP", { id: "BUFF_DEF", kind: "BUFF", stat: "DEF" }, "防↑"],
  [{ kind: "BUFF", stat: "SPD" }, "速度UP", { id: "BUFF_SPD", kind: "BUFF", stat: "SPD" }, "速↑"],
  [{ kind: "DEBUFF", stat: "ATK" }, "攻撃DOWN", { id: "DEBUFF_ATK", kind: "DEBUFF", stat: "ATK" }, "攻↓"],
  [{ kind: "DEBUFF", stat: "DEF" }, "防御DOWN", { id: "DEBUFF_DEF", kind: "DEBUFF", stat: "DEF" }, "防↓"],
  [{ kind: "DEBUFF", stat: "SPD" }, "速度DOWN", { id: "DEBUFF_SPD", kind: "DEBUFF", stat: "SPD" }, "速↓"],
  [{ kind: "SHIELD" }, "シールド", { id: "SHIELD", kind: "SHIELD" }, "盾"],
  [{ status: "BLIND" }, "暗闇", { id: "BLIND", kind: "STATUS" }, "闇"],
  [{ status: "SILENCE" }, "沈黙", { id: "SILENCE", kind: "STATUS" }, "黙"],
  [{ status: "STUN" }, "スタン", { id: "STUN", kind: "STATUS" }, "気絶"],
  [{ status: "POISON" }, "毒", { id: "POISON", kind: "STATUS" }, "毒"],
  [{ status: "BLEED" }, "出血", { id: "BLEED", kind: "STATUS" }, "血"],
  [{ status: "TAUNT" }, "挑発", { id: "TAUNT", kind: "STATUS" }, "挑"],
  [{ kind: "REGEN" }, "継続回復", { id: "REGEN", kind: "REGEN" }, "回復"],
  [{ kind: "COUNTER" }, "反撃", { id: "COUNTER_SKILL_054", kind: "COUNTER" }, "反"],
  [{ kind: "BUFF", stat: "LUK" }, "運UP", { id: "BUFF_LUK", kind: "BUFF", stat: "LUK" }, "運↑"],
  [{ kind: "DEBUFF", stat: "LUK" }, "運DOWN", { id: "DEBUFF_LUK", kind: "DEBUFF", stat: "LUK" }, "運↓"],
];
for (const [applyPayload, applyLabel, persistentStatus, persistentLabel] of statusPresentation) {
  assert.equal(battleStatusApplyLabel(applyPayload), applyLabel, `${applyLabel} Apply label`);
  assert.equal(battleStatusPersistentLabel(persistentStatus), persistentLabel, `${applyLabel} persistent label`);
}
assert.equal(battleStatusApplyLabel({ kind: "REMOVE_STATUS" }), "弱体解除");
assert.equal(battleStatusApplyLabel({ status: "INTERNAL_UNKNOWN_CODE" }), "状態変化", "Internal status code must never be human-facing");
assert.equal(battleStatusPresentationTone({ status: "BLIND" }), "blind", "BLIND must resolve to its dedicated treatment");
assert.equal(battleStatusPresentationTone({ status: "SILENCE" }), "debuff", "SILENCE must use the common unit-wide debuff overlay");
assert.equal(battleStatusPresentationTone({ status: "TAUNT" }), "taunt", "TAUNT must resolve to its dedicated unit-wide treatment");
assert.match(effects, /taunt = cues\.filter\(\(\{ tone \}\) => tone === "taunt"\)/, "TAUNT must enter the unit-wide Apply overlay route");
assert.match(effects, /const tone = blind\.length \? "blind" : taunt\.length \? "taunt"/, "TAUNT must use one overlay after BLIND priority");
assert.match(portraitCss, /\.battle-unit-apply-overlay\.is-blind i/, "BLIND must add a unit-local vision-obstruction treatment");
assert.match(portraitCss, /\.battle-unit-apply-overlay\.is-taunt i/, "TAUNT must have a dedicated non-gray unit-local treatment");
assert.match(portrait, /battleStatusPersistentLabel\(status\)/, "Every persistent activeEffect must use the normalized compact mapping");
assert.doesNotMatch(effects, /stateCues\.slice\([^\n]+<small/, "Support Apply must not render a second icon-local rectangular label");
assert.match(viewer, /action\.unit\.replayStartCursor[^\n]+action\.unit\.actorId/, "Action SE must be keyed once per ActionPresentationUnit");
assert.match(viewer, /action\.unit\.replayStartCursor}:impact/, "Impact SE must be keyed once per ActionPresentationUnit");
assert.match(viewer, /damageEvents\.some\(\(\{ event \}\) => event\.payload\.critical === true\)/, "Critical SE must come from canonical grouped replay results");
assert.match(audioProvider, /BATTLE_ACTION_SE\.has\(recent\.event\) && BATTLE_RESOLUTION_SE\.has\(event\)/, "Action start must not suppress its grouped Impact audio beat");
assert.match(audioContract, /BATTLE_BUFF: "\/sounds\/se\/se_battle_buff\.mp3"/, "Existing Buff SE asset must remain canonical");
assert.match(audioContract, /BATTLE_DEBUFF: "\/sounds\/se\/se_battle_debuff\.mp3"/, "Existing Debuff SE asset must remain canonical");
assert.match(fullSkillHarness, /await audio\.unlockAudio\(\);[\s\S]*audio\.playBgm\("BATTLE"\);[\s\S]*audio\.playSe\("BATTLE_START"\);/, "QA start gesture must unlock Production audio before BGM and SE");
assert.match(fullSkillHarness, /return \(\) => audio\.stopBgm\(\)/, "QA route must stop Battle BGM on unmount");
assert.match(effects, /battle-target-impact-asset[^\n]+BATTLE_EFFECT_ASSETS\.heavyImpact/, "Damage impact must reuse the existing image VFX asset at the icon");
assert.match(effects, /hasDamage \? <strong[^>]+data-battle-number="damage"/, "Every DAMAGE event must mount a number even when its amount is zero");
assert.match(effects, /hasHeal && <strong[^>]+data-battle-number="heal"/, "Every HEAL event must mount a number even when effectiveAmount is zero");
assert.match(effects, /hpDamage \?\? event\.payload\.amount|hpDamage \?\? payload\.amount/, "Damage number must use canonical HP damage when shield absorption differs from total damage");
assert.match(effectsCss, /\.battle-target-reaction-copy strong \{[\s\S]*opacity: 1;[\s\S]*visibility: visible;/, "Damage and heal numbers must remain visible independently of CSS animation timing");
assert.match(portraitCss, /\.battle-unit-party \.battle-unit-art \{[\s\S]*overflow: visible;/, "Icon-local number layers must not be clipped by the icon HUD container");
assert.match(portraitCss, /\.battle-unit-party \.battle-unit-hp \{[\s\S]*width: 75%;/, "Player HP track must use the reduced 75% width");
assert.match(portraitCss, /\.battle-unit-party\.battle-unit-enemy \.battle-unit-hp \{[^}]*width: 75%;/, "Enemy HP track must mirror the reduced 75% width");
assert.match(portrait, /hp\.toLocaleString\(\)\} \/ \{maxHp\.toLocaleString\(\)/, "Visible HP must use canonical current / max values with digit grouping");
assert.doesNotMatch(portrait, /Math\.round\(hpPercent\)\}%/, "Visible Battle HP must not use percentage copy");
for (const tone of ["damage", "heal", "status"]) assert.match(effects, new RegExp(`battle-target-effect is-${tone}`), `${tone} must retain its distinct icon-local effect layer`);
for (const tone of ["buff", "debuff", "shield", "poison", "bleed", "stun"]) assert.doesNotMatch(effects, new RegExp(`battle-target-effect is-${tone}`), `${tone} Apply must not duplicate the unit overlay inside the icon`);
const raidPortrait = portrait.slice(portrait.indexOf("className={`battle-unit-art"));
assert.ok(raidPortrait.indexOf("battle-unit-identity-badges") < raidPortrait.indexOf("<strong>{participant.name}</strong>"), "Legacy Raid attribute badge must precede the character name on both mirrored sides");
assert.match(portraitCss, /--character-battle-icon-scale/, "Battle icons must use presentation-only face crop metadata");
assert.match(effectsCss, /--character-cutin-scale/, "Premium cut-ins must use normalized presentation-only crop metadata");
assert.match(effectsCss, /\.battle-cutin-slot \.battle-skill-cutin \.battle-cutin-character/, "SR and SSR cut-ins must share one crop template with equal specificity");
assert.doesNotMatch(viewer, /battle-enemy-compact/, "Variable enemy rosters must not use a fixed tutorial-only slot");
assert.doesNotMatch(portraitCss, /data-party-size=/, "Unit icon geometry must not scale with roster length");
assert.doesNotMatch(viewerCss, /data-party-size=/, "Battle row geometry must not scale with roster length");
assert.match(viewer, /battle-skip-btn/, "Repeat battles must expose presentation skip");
assert.match(result, /battle-result-opponent/, "Result must present the opponent before the outcome");
assert.match(result, /battle-result-mvp-hero/, "Result must preserve the MVP hero hierarchy");
assert.match(result, /data-result-reason="ROUND_LIMIT"/, "A surviving round-limit defeat must explain why LOSE is authoritative");
assert.match(result, /canonicalFinalRound >= configuredRoundLimit/, "ROUND_LIMIT classification must require canonical final round parity");
assert.doesNotMatch(result, /analysis\.player\.survivors > 0 && analysis\.enemy\.survivors > 0/, "Result must never infer ROUND_LIMIT from survivors alone");
assert.match(globals, /--font-ui:/);
assert.match(globals, /--font-display:/);
assert.match(setup, /setup-world-motion/, "World introduction must use the existing scene foundation for cinematic motion");

console.log(JSON.stringify({
  status: "PASS",
  replayDeterministic: true,
  activeEffectProjection: true,
  variableRoster: "1-5 per side",
  tutorialSkip: false,
  resultReplayRetention: true,
  typographyTokens: true,
  worldIntroMotion: true,
  actionPresentationAuthorityImpact: 0,
  actionBudgets: { normal1x: 1440, normal2x: 720, ssr1x: 2400, ssr2x: 1200 },
  resultHpParityGate: true,
  targetEffectScope: "character-icon",
}, null, 2));

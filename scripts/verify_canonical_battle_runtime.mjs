import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CanonicalRng, DAMAGE_CONTRACT, criticalChanceBp, effectiveStat, finalStatusChanceBp,
  getAttributeMultiplierBp, productionDamage, resolveCanonicalBattle,
} from "../src/domain/battle/canonical_runtime.ts";
import { missingHpScalingRate, parseCanonicalEffects, skillEffectMultiplierBp, STATUS_RUNTIME_RULES } from "../src/domain/battle/canonical_effects.ts";
import { resolveBattle } from "../supabase/functions/resolve-battle/engine.ts";
import { resolveDeterministicBattle } from "../src/lib/battle/deterministicBattle.ts";

const master = JSON.parse(readFileSync(new URL("../src/domain/gameplay/canonical/data/skills_20260821.json", import.meta.url), "utf8"));
const byId = new Map(master.skills.map((skill) => [skill.skill_id, skill]));
const skill = (id, overrides = {}) => {
  const value = byId.get(id); assert.ok(value, id);
  return { id: value.skill_id, name: value.name, activationType: value.activation_type, cooldown: value.cooldown, availableFromRound: value.available_from_round, target: value.target, effects: value.effects, exclusiveCharacterId: value.exclusive_character_id, skillPlusVal: 0, ...overrides };
};
const unit = (id, team, alignment = "ORDER", skills = [], stats = {}) => ({ id, characterId: id, name: id, team, alignment, stats: { hp: 100000, atk: 10000, def: 5000, spd: team === "PLAYER" ? 200 : 100, luk: 0, ...stats }, skills });
const battle = (player, enemy, options = {}) => resolveCanonicalBattle({ seed: options.seed ?? 7, tactic: options.tactic ?? "SKILL_PRIORITY", maxRounds: options.maxRounds ?? 6, player, enemy });
const actions = (result, id) => result.events.filter((event) => event.type === "ACTION" && event.payload.actorId === id);
const damages = (result, source) => result.events.filter((event) => event.type === "DAMAGE" && (!source || event.payload.source === source));

// Machine curves, parser coverage, and all 70 raw payloads.
assert.deepEqual([0,1,3,5,6,9,10].map((v) => skillEffectMultiplierBp("DAMAGE", v)), [10000,10410,11230,12050,12460,13690,14100]);
assert.deepEqual([0,1,3,5,6,9,10].map((v) => skillEffectMultiplierBp("SUPPORT", v)), [10000,10205,10615,11025,11230,11845,12050]);
assert.deepEqual([0,1,3,5,6,9,10].map((v) => skillEffectMultiplierBp("DOT", v)), [10000,10307,10922,11537,11845,12767,13075]);
assert.deepEqual([0,1,3,5,6,9,10].map((v) => skillEffectMultiplierBp("STATUS_CHANCE_BONUS", v)), [0,0,200,200,400,600,800]);
for (const item of master.skills) assert.ok(parseCanonicalEffects(item.effects).every((effect) => effect.type !== "RAW"), `${item.skill_id} contains an unparsed effect`);
assert.equal(parseCanonicalEffects([{ type: "RAW", raw: "DAMAGE 320% ATK" }])[0].powerBp, 32000);
const requiredEffectTypes = {
  SKILL_001: ["DAMAGE"], SKILL_005: ["DAMAGE", "POISON"], SKILL_013: ["HEAL", "REMOVE_STATUS"],
  SKILL_016: ["SHIELD", "TAUNT"], SKILL_025: ["DEBUFF", "BLIND"], SKILL_028: ["DAMAGE", "IGNORE_DEF"],
  SKILL_031: ["SHIELD", "COUNTER"], SKILL_042: ["DAMAGE", "LIFESTEAL", "BLEED"], SKILL_044: ["DAMAGE"],
  SKILL_049: ["BLIND", "SILENCE", "DEBUFF"], SKILL_051: ["DAMAGE", "IGNORE_DEF"],
  SKILL_053: ["SHIELD", "TAUNT", "BUFF"], SKILL_054: ["TRIGGER", "COUNTER", "TRIGGER_LIMIT"],
  SKILL_055: ["TRIGGER", "BUFF", "BUFF"], SKILL_058: ["BLIND", "SILENCE", "DEBUFF"],
  SKILL_060: ["HEAL", "REGEN"], SKILL_062: ["DAMAGE"], SKILL_064: ["SHIELD", "COUNTER"], SKILL_069: ["DAMAGE", "BLEED"],
};
for (const [id, expected] of Object.entries(requiredEffectTypes)) assert.deepEqual(parseCanonicalEffects(byId.get(id).effects).map((effect) => effect.type), expected, id);

// Damage production contract.
assert.equal(DAMAGE_CONTRACT.NORMAL_ATTACK_POWER_BP, 8000);
assert.equal(productionDamage({ atk: 10000, def: 0, powerBp: 8000 }), 8000);
assert.equal(productionDamage({ atk: 10000, def: 45000, powerBp: 8000 }), 4000);
assert.equal(criticalChanceBp(0), 500); assert.equal(criticalChanceBp(100), 1500); assert.equal(criticalChanceBp(999), 3000);
assert.equal(criticalChanceBp(999, { criticalRatePositiveBp: 9999 }), 4500);
const rng = new CanonicalRng(1); for (let i = 0; i < 10000; i += 1) assert.ok((v => v >= 9500 && v <= 10500)(rng.randomDamageBp()));
for (const attacker of ["JUSTICE","ORDER","EVIL","CHAOS"]) for (const defender of ["JUSTICE","ORDER","EVIL","CHAOS"]) {
  const value = getAttributeMultiplierBp(attacker, defender); assert.ok(value === 10000 || value === 12000); assert.notEqual(value, 8000);
}
assert.equal(getAttributeMultiplierBp("JUSTICE", "EVIL"), 12000); assert.equal(getAttributeMultiplierBp("EVIL", "JUSTICE"), 10000);

// Status chance and resistance contract (LUK is intentionally absent).
assert.equal(finalStatusChanceBp({ status: "BLIND", baseChanceBp: 7500, skillPlusVal: 6, attacker: { statusChanceGenericBp: 1000 }, target: { statusResistanceGenericBp: 1800, statusResistanceIndividualBp: { BLIND: 2500 } } }), 6400);
assert.equal(finalStatusChanceBp({ status: "STUN", baseChanceBp: 10000, skillPlusVal: 10 }), 6500);
assert.equal(finalStatusChanceBp({ status: "SILENCE", baseChanceBp: 10000, skillPlusVal: 10 }), 8000);
assert.equal(finalStatusChanceBp({ status: "TAUNT", baseChanceBp: 10000, skillPlusVal: 0, target: { statusResistanceGenericBp: 2000 } }), 8000);

// availableFromRound and exact N+C cooldown.
let result = battle([unit("p", "PLAYER", "ORDER", [skill("SKILL_001", { availableFromRound: 3, cooldown: 3 })])], [unit("e", "ENEMY", "ORDER", [], { hp: 999999 })], { maxRounds: 8 });
assert.deepEqual(actions(result, "p").filter((event) => event.payload.skillId === "SKILL_001").map((event) => event.round), [3,6]);

// LEGACY policy keeps available damage first and continues selecting an
// available skill when its cooldown permits it.
result = battle([
  unit("p", "PLAYER", "ORDER", [
    skill("SKILL_002", { cooldown: 0, availableFromRound: 1 }),
    skill("SKILL_001", { cooldown: 9, availableFromRound: 1 }),
  ]),
], [unit("e", "ENEMY", "ORDER", [], { hp: 999999 })], { tactic: "ATTACK_PRIORITY", maxRounds: 3 });
assert.equal(actions(result, "p")[0].payload.skillId, "SKILL_001", "available damage must remain ATTACK_PRIORITY first choice");

result = battle([unit("p", "PLAYER", "ORDER", [skill("SKILL_002", { cooldown: 0, availableFromRound: 1, effects: ["SHIELD 10% MaxHP / 4T"] })])], [unit("e", "ENEMY", "ORDER", [], { hp: 999999, atk: 100 })], { tactic: "ATTACK_PRIORITY", maxRounds: 3 });
assert.deepEqual(actions(result, "p").map((event) => event.payload.skillId), ["SKILL_002", "SKILL_002", "SKILL_002"], "LEGACY policy recasts the available skill");

result = battle([unit("p", "PLAYER", "ORDER", [skill("SKILL_060", { cooldown: 0, availableFromRound: 1 })])], [unit("e", "ENEMY", "ORDER", [], { hp: 999999 })], { tactic: "ATTACK_PRIORITY", maxRounds: 1 });
assert.equal(actions(result, "p")[0].payload.skillId, "BASIC_ATTACK", "full-HP healing must stay below the normal attack");

// Battle start once, buff application and strongest-only stat evaluation.
result = battle([unit("p", "PLAYER", "ORDER", [skill("SKILL_055", { exclusiveCharacterId: null }), skill("SKILL_001")])], [unit("e", "ENEMY", "ORDER", [], { hp: 999999 })], { maxRounds: 2 });
assert.equal(actions(result, "p").filter((event) => event.payload.action === "BATTLE_START").length, 1);
assert.ok(result.events.some((event) => event.type === "EFFECT" && event.payload.stat === "ATK" && event.payload.magnitudeBp === 2000));
result = battle([unit("p", "PLAYER", "ORDER", [
  { id: "start-20", name: "start-20", activationType: "BATTLE_START", cooldown: null, target: "SELF", effects: ["ATK +20% / 3T"] },
  { id: "start-18", name: "start-18", activationType: "BATTLE_START", cooldown: null, target: "SELF", effects: ["ATK +18% / 3T"] },
])], [unit("e", "ENEMY")], { maxRounds: 0 });
assert.equal(effectiveStat(result.player[0], "ATK"), 12000, "same-direction buffs must use strongest-only");

// Shield absorbs, lifesteal uses actual HP damage, and Ignore DEF 55% executes.
result = battle([unit("p", "PLAYER", "JUSTICE", [skill("SKILL_051", { exclusiveCharacterId: null, availableFromRound: 1 })], { atk: 20000, luk: 0 })], [unit("e", "ENEMY", "EVIL", [skill("SKILL_002")], { hp: 250000, def: 45000, spd: 300 })], { maxRounds: 1, seed: 9 });
const skill51 = result.events.find((event) => event.type === "DAMAGE" && event.payload.actorId === "p"); assert.ok(skill51);
assert.equal(skill51.payload.ignoreDefBp, 5500); assert.ok(Number(skill51.payload.shieldDamage) > 0);
assert.equal(Number(skill51.payload.amount), productionDamage({ atk: 20000, def: 45000, powerBp: 32000, ignoreDefBp: 5500, attributeBp: 12000, criticalDamageBp: skill51.payload.critical ? 15000 : 10000, randomBp: Number(skill51.payload.randomBp) }));
result = battle([unit("p", "PLAYER", "ORDER", [skill("SKILL_042", { availableFromRound: 1 })], { hp: 50000, atk: 10000 })], [unit("e", "ENEMY", "ORDER", [], { hp: 1000, def: 0 })], { maxRounds: 1 });
const ls = result.events.find((event) => event.type === "HEAL" && event.payload.source === "LIFESTEAL"); assert.ok(ls); assert.equal(ls.payload.amount, 400);

// DoT: source ATK snapshot, coefficients, no crit/random/DEF, no application-action tick, target action-end tick.
result = battle([unit("p", "PLAYER", "JUSTICE", [skill("SKILL_005", { availableFromRound: 1, effects: ["DAMAGE 55% ATK", "POISON 100% / 2T"] })], { atk: 10000 })], [unit("e", "ENEMY", "EVIL", [], { hp: 100000, def: 999999, spd: 100 })], { maxRounds: 3, seed: 2 });
const poison = damages(result, "POISON"); assert.equal(poison.length, 2); assert.ok(poison.every((event) => event.payload.amount === 1800 && event.payload.critical === false && event.payload.random === false));
assert.equal(STATUS_RUNTIME_RULES.POISON.dotCoefficientBp, 1500); assert.equal(STATUS_RUNTIME_RULES.BLEED.dotCoefficientBp, 2000);
result = battle([unit("p", "PLAYER", "ORDER", [skill("SKILL_069", { exclusiveCharacterId: null, availableFromRound: 1, effects: ["DAMAGE 205% ATK", "BLEED 100% / 3T"] })], { atk: 10000 })], [unit("e", "ENEMY", "ORDER", [], { hp: 100000, def: 0 })], { maxRounds: 4 });
assert.deepEqual(damages(result, "BLEED").map((event) => event.payload.amount), [2000,2000,2000]);

// Heal utility suppresses full-HP casts, then Regen ticks after a useful cast.
result = battle([unit("p", "PLAYER", "ORDER", [skill("SKILL_060", { exclusiveCharacterId: null, availableFromRound: 1 })], { hp: 100000, spd: 100 })], [unit("e", "ENEMY", "ORDER", [], { hp: 999999, atk: 50000, spd: 300 })], { maxRounds: 4 });
const regenHeals = result.events.filter((event) => event.type === "HEAL" && event.payload.source === "REGEN");
assert.equal(regenHeals.length, 2);
assert.ok(regenHeals.every((event) => event.payload.actorId === "p" && event.payload.effectiveAmount === event.payload.amount));
assert.ok(!result.events.some((event) => event.type === "HEAL" && Number(event.payload.effectiveAmount) === 0), "SKILL_PRIORITY must suppress zero-utility full-HP healing");

// Counter is max once per round and never chains into another counter.
result = battle([unit("p", "PLAYER", "ORDER", [skill("SKILL_054", { exclusiveCharacterId: null })], { hp: 999999 })], [unit("e", "ENEMY", "ORDER", [skill("SKILL_012", { availableFromRound: 1 })], { hp: 999999, spd: 300 })], { maxRounds: 2 });
const counters = result.events.filter((event) => event.type === "ACTION" && event.payload.action === "COUNTER"); assert.equal(counters.length, 2);
assert.ok(!result.events.some((event, index) => event.payload.action === "COUNTER" && result.events[index - 1]?.payload.action === "COUNTER"));
result = battle([unit("p", "PLAYER", "ORDER", [skill("SKILL_054", { exclusiveCharacterId: null })], { hp: 999999, spd: 50 })], [unit("e1", "ENEMY", "ORDER", [], { hp: 999999, spd: 300 }), unit("e2", "ENEMY", "ORDER", [], { hp: 999999, spd: 200 })], { maxRounds: 1 });
assert.equal(result.events.filter((event) => event.type === "ACTION" && event.payload.action === "COUNTER").length, 1, "counter max-per-round");

// Multiple taunt: earliest sequence wins and ENEMY_ALL remains all-target.
result = battle([unit("a", "PLAYER", "ORDER", [skill("SKILL_016", { availableFromRound: 1 })], { spd: 300 }), unit("b", "PLAYER", "ORDER", [skill("SKILL_016", { availableFromRound: 1 })], { spd: 200 })], [unit("e", "ENEMY", "ORDER", [], { spd: 100, atk: 100 })], { maxRounds: 1 });
const enemyDamage = result.events.find((event) => event.type === "DAMAGE" && event.payload.actorId === "e"); assert.equal(enemyDamage.payload.targetId, "a");

// Remove Status removes negative state without touching positive buffs.
result = battle([unit("p", "PLAYER", "ORDER", [skill("SKILL_033", { availableFromRound: 1 })], { spd: 100 })], [unit("e", "ENEMY", "ORDER", [skill("SKILL_070", { exclusiveCharacterId: null, availableFromRound: 1, effects: ["ATK -22% / 2T", "BLIND 100% / 2T"] })], { spd: 300 })], { maxRounds: 1 });
assert.equal(result.player[0].statuses.length, 0); assert.equal(result.player[0].modifiers.filter((item) => item.type === "DEBUFF").length, 0);

// BLIND affects damage (including attached status) but never status-only actions.
let sawBlindMiss = false;
for (let seed = 1; seed <= 100 && !sawBlindMiss; seed += 1) {
  const blinded = battle([unit("p", "PLAYER", "ORDER", [{ id: "blind", name: "blind", activationType: "ACTIVE", cooldown: 9, availableFromRound: 1, target: "ENEMY_SINGLE", effects: ["BLIND 100% / 2T"] }], { spd: 300 })], [unit("e", "ENEMY", "ORDER", [skill("SKILL_069", { exclusiveCharacterId: null, availableFromRound: 1, effects: ["DAMAGE 205% ATK", "BLEED 100% / 3T"] })], { hp: 999999, spd: 100 })], { maxRounds: 1, seed });
  const attack = blinded.events.find((event) => event.type === "DAMAGE" && event.payload.actorId === "e" && event.payload.hit === false);
  if (attack) {
    sawBlindMiss = true;
    assert.ok(!blinded.events.some((event) => event.type === "STATUS" && event.payload.actorId === "e" && event.payload.status === "BLEED"));
  }
}
assert.ok(sawBlindMiss, "BLIND 20% miss must execute in runtime");

// Different-source DoT is capped at two; AI suppresses a useless third active application.
result = battle([
  unit("p1", "PLAYER", "ORDER", [{ id: "poison-1", name: "poison", activationType: "ACTIVE", cooldown: 9, availableFromRound: 1, target: "ENEMY_SINGLE", effects: ["POISON 100% / 3T"] }], { spd: 400 }),
  unit("p2", "PLAYER", "ORDER", [{ id: "poison-2", name: "poison", activationType: "ACTIVE", cooldown: 9, availableFromRound: 1, target: "ENEMY_SINGLE", effects: ["POISON 100% / 3T"] }], { spd: 350 }),
  unit("p3", "PLAYER", "ORDER", [{ id: "poison-3", name: "poison", activationType: "ACTIVE", cooldown: 9, availableFromRound: 1, target: "ENEMY_SINGLE", effects: ["POISON 100% / 3T"] }], { spd: 300 }),
], [unit("e", "ENEMY", "ORDER", [], { hp: 999999, spd: 100 })], { maxRounds: 1 });
assert.deepEqual(result.enemy[0].dots.map((dot) => dot.sourceCharacterId).sort(), ["p2", "p3"]);

// DoT death prevents a later Regen tick from reviving the unit.
result = battle([unit("p", "PLAYER", "JUSTICE", [{ id: "poison-only", name: "poison", activationType: "ACTIVE", cooldown: 9, availableFromRound: 1, target: "ENEMY_SINGLE", effects: ["POISON 100% / 3T"] }], { atk: 10000, spd: 300 })], [unit("e", "ENEMY", "EVIL", [{ id: "regen-start", name: "regen", activationType: "BATTLE_START", cooldown: null, target: "SELF", effects: ["REGEN 7% MaxHP/Turn / 3T"] }], { hp: 1000, spd: 100 })], { maxRounds: 1 });
const poisonDeathIndex = result.events.findIndex((event) => event.type === "DEFEAT" && event.payload.targetId === "e"); assert.ok(poisonDeathIndex >= 0);
assert.ok(!result.events.slice(poisonDeathIndex + 1).some((event) => event.type === "HEAL" && event.payload.source === "REGEN"));

// Missing-HP curves are payload-driven, including runtime formulas used by 044 and 062.
const e44 = parseCanonicalEffects(byId.get("SKILL_044").effects)[0]; const e62 = parseCanonicalEffects(byId.get("SKILL_062").effects)[0];
assert.equal(missingHpScalingRate(e44, 10000), 23000); assert.equal(missingHpScalingRate(e44, 5000), 27500); assert.equal(missingHpScalingRate(e44, 2500), 32000);
assert.equal(missingHpScalingRate(e62, 10000), 19000); assert.equal(missingHpScalingRate(e62, 5000), 21500); assert.equal(missingHpScalingRate(e62, 2500), 24000);
for (const scalingSkill of [skill("SKILL_044", { availableFromRound: 1 }), skill("SKILL_062", { exclusiveCharacterId: null, availableFromRound: 1 })]) {
  const scaled = battle([unit("p", "PLAYER", "ORDER", [scalingSkill], { hp: 100000, atk: 10000, def: 0, spd: 100, luk: 0 })], [unit("e", "ENEMY", "ORDER", [], { hp: 999999, atk: 10000, def: 0, spd: 300, luk: 0 })], { maxRounds: 1, seed: 41 });
  const incoming = scaled.events.find((event) => event.type === "DAMAGE" && event.payload.actorId === "e");
  const outgoing = scaled.events.find((event) => event.type === "DAMAGE" && event.payload.actorId === "p"); assert.ok(incoming && outgoing);
  const actorHpAfterHitBp = Math.floor((100000 - Number(incoming.payload.hpDamage)) * 10000 / 100000);
  const parsed = parseCanonicalEffects(scalingSkill.effects)[0]; const runtimePower = missingHpScalingRate(parsed, actorHpAfterHitBp); assert.ok(runtimePower);
  assert.equal(Number(outgoing.payload.amount), productionDamage({ atk: 10000, def: 0, powerBp: runtimePower, attributeBp: 10000, criticalDamageBp: outgoing.payload.critical ? 15000 : 10000, randomBp: Number(outgoing.payload.randomBp) }));
}

// Shared Server/Client entry points must be byte-identical for one snapshot/seed.
const parityInput = { seed: 91337, tactic: "SKILL_PRIORITY", maxRounds: 5, player: [unit("p", "PLAYER", "JUSTICE", [skill("SKILL_042", { availableFromRound: 1 })])], enemy: [unit("e", "ENEMY", "EVIL", [skill("SKILL_031", { availableFromRound: 1 })])] };
const client = resolveDeterministicBattle(parityInput); const server = resolveBattle(parityInput.seed, parityInput.tactic, parityInput.maxRounds, parityInput.player, parityInput.enemy);
assert.deepEqual(client, server);

console.log("canonical battle runtime verification: PASS");

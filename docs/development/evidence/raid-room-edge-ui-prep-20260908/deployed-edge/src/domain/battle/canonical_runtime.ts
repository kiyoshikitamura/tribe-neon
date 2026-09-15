import {
  STATUS_RUNTIME_RULES,
  missingHpScalingRate,
  parseCanonicalEffects,
  skillEffectMultiplierBp,
  type CanonicalEffect,
  type CanonicalStat,
  type CanonicalStatus,
} from "./canonical_effects.ts";

export type BattleTactic = "ATTACK_PRIORITY" | "HEAL_PRIORITY" | "SKILL_PRIORITY" | "BALANCED" | "WEAKNESS_FOCUS";
export type BattleTeam = "PLAYER" | "ENEMY";
export type Alignment = "JUSTICE" | "EVIL" | "ORDER" | "CHAOS";
export type ActivationType = "ACTIVE" | "BATTLE_START" | "ON_DAMAGE_TAKEN";
export type TargetType = "ENEMY_SINGLE" | "ENEMY_ALL" | "ALLY_SINGLE" | "ALLY_ALL" | "SELF" | "ATTACKER_WHO_DAMAGED_SELF";
export type StatusId = CanonicalStatus;

export interface BattleStats {
  hp: number; atk: number; def: number; spd: number; luk: number;
  statusResistance?: number;
}

export interface BattleStatusModifiers {
  statusChanceGenericBp?: number;
  statusChanceIndividualBp?: Partial<Record<CanonicalStatus, number>>;
  statusResistanceGenericBp?: number;
  statusResistanceIndividualBp?: Partial<Record<CanonicalStatus, number>>;
}

export interface BattleCombatModifiers {
  criticalRatePositiveBp?: number;
  criticalRateNegativeBp?: number;
  criticalDamageBp?: number;
  damageDealtPositiveBp?: number;
  damageDealtNegativeBp?: number;
  damageReductionBp?: number;
}

export interface BattleSkill {
  id: string; name: string;
  activationType?: ActivationType;
  target: TargetType;
  effects?: readonly (string | CanonicalEffect)[];
  cooldown: number | null;
  availableFromRound?: number;
  exclusiveCharacterId?: string | null;
  skillPlusVal?: number;
  plusValue?: number;
}

export interface BattleUnitInput {
  id: string; characterId?: string; name: string; team: BattleTeam; alignment: Alignment;
  stats: BattleStats; skills: BattleSkill[];
  level?: number;
  awakeningLevel?: number;
  rarity?: string;
  statusModifiers?: BattleStatusModifiers;
  combatModifiers?: BattleCombatModifiers;
}

export interface BattleReplayEvent {
  index: number; round: number;
  type: "ACTION" | "DAMAGE" | "HEAL" | "STATUS" | "EFFECT" | "DEFEAT" | "RESULT";
  payload: Record<string, unknown>;
}

export interface DeterministicBattleInput {
  seed: number; tactic: BattleTactic; enemyTactic?: BattleTactic; maxRounds: number; player: BattleUnitInput[]; enemy: BattleUnitInput[];
}

type ModifierInstance = { type: "BUFF" | "DEBUFF"; stat: CanonicalStat; magnitudeBp: number; remainingDuration: number; appliedAction: number; applicationSequence: number };
type StatusInstance = { type: Exclude<CanonicalStatus, "POISON" | "BLEED">; remainingDuration: number; appliedAction: number; applicationSequence: number };
type DotInstance = { type: "POISON" | "BLEED"; sourceCharacterId: string; sourceFinalAtkAtApplication: number; sourceAttribute: Alignment; targetAttribute: Alignment; attributeMultiplierBp: number; dotCoefficientBp: number; dotMultiplierBp: number; remainingDuration: number; appliedAction: number; applicationSequence: number };
type ShieldInstance = { amount: number; remainingDuration: number; appliedAction: number; applicationSequence: number };
type RegenInstance = { sourceCharacterId: string; tickAmount: number; remainingDuration: number; appliedAction: number; applicationSequence: number };
type CounterInstance = { sourceSkillId: string; powerBp: number; awakeningMultiplierBp: number; remainingDuration: number | null; appliedAction: number; applicationSequence: number; maxPerRound: number };

export interface BattleUnit extends BattleUnitInput {
  hp: number; rawDamage: number; nextAvailableRound: Record<string, number>;
  modifiers: ModifierInstance[]; statuses: StatusInstance[]; dots: DotInstance[]; shields: ShieldInstance[]; regens: RegenInstance[]; counters: CounterInstance[];
  triggerCounts: Record<string, number>; battleStartTriggered: Set<string>;
}

export interface DeterministicBattleResult {
  winner: BattleTeam; rounds: number; events: BattleReplayEvent[];
  playerRawDamage: number; enemyRawDamage: number; player: BattleUnit[]; enemy: BattleUnit[];
}

export const DAMAGE_CONTRACT = {
  NORMAL_ATTACK_POWER_BP: 8000,
  DEFENSE_CONSTANT: 45000,
  ATTRIBUTE_ADVANTAGE_BP: 12000,
  ATTRIBUTE_OTHERWISE_BP: 10000,
  BASE_CRITICAL_BP: 500,
  LUK_CRITICAL_BP: 10,
  NATURAL_CRITICAL_CAP_BP: 3000,
  ABSOLUTE_CRITICAL_CAP_BP: 4500,
  CRITICAL_DAMAGE_BP: 15000,
  RANDOM_MIN_BP: 9500,
  RANDOM_SPAN: 1001,
  MINIMUM_DAMAGE: 1,
  BLIND_MISS_BP: 2000,
} as const;

const ADVANTAGE: Record<Alignment, Alignment> = { JUSTICE: "EVIL", EVIL: "ORDER", ORDER: "CHAOS", CHAOS: "JUSTICE" };
const STATUS_TYPES = new Set<string>(["BLIND", "SILENCE", "STUN", "POISON", "BLEED", "TAUNT"]);
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, Math.trunc(value)));
const bpProduct = (...values: number[]): number => Number(values.map((value) => BigInt(Math.trunc(value))).reduce((total, value) => total * value, BigInt(1)) / BigInt(10000 ** (values.length - 1)));

export class CanonicalRng {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 1; }
  next(): number { this.state ^= this.state << 13; this.state ^= this.state >>> 17; this.state ^= this.state << 5; return (this.state >>> 0) / 0x1_0000_0000; }
  rollBp(): number { return Math.floor(this.next() * 10000); }
  randomDamageBp(): number { return DAMAGE_CONTRACT.RANDOM_MIN_BP + Math.floor(this.next() * DAMAGE_CONTRACT.RANDOM_SPAN); }
}

export function getAttributeMultiplierBp(attacker: Alignment, defender: Alignment): number {
  return ADVANTAGE[attacker] === defender ? DAMAGE_CONTRACT.ATTRIBUTE_ADVANTAGE_BP : DAMAGE_CONTRACT.ATTRIBUTE_OTHERWISE_BP;
}

export function criticalChanceBp(luk: number, modifiers: BattleCombatModifiers = {}): number {
  const natural = Math.min(DAMAGE_CONTRACT.NATURAL_CRITICAL_CAP_BP, DAMAGE_CONTRACT.BASE_CRITICAL_BP + Math.max(0, Math.trunc(luk)) * DAMAGE_CONTRACT.LUK_CRITICAL_BP);
  return clamp(natural + (modifiers.criticalRatePositiveBp ?? 0) - (modifiers.criticalRateNegativeBp ?? 0), 0, DAMAGE_CONTRACT.ABSOLUTE_CRITICAL_CAP_BP);
}

export function finalStatusChanceBp(args: { status: CanonicalStatus; baseChanceBp: number; skillPlusVal: number; attacker?: BattleStatusModifiers; target?: BattleStatusModifiers }): number {
  const genericChance = args.attacker?.statusChanceGenericBp ?? 0;
  const individualChance = args.attacker?.statusChanceIndividualBp?.[args.status] ?? 0;
  const genericResistance = Math.min(4000, args.target?.statusResistanceGenericBp ?? 0);
  const individualResistance = Math.min(5000, args.target?.statusResistanceIndividualBp?.[args.status] ?? 0);
  const resistance = args.status === "TAUNT" ? genericResistance : Math.max(genericResistance, individualResistance);
  const chance = args.baseChanceBp + skillEffectMultiplierBp("STATUS_CHANCE_BONUS", args.skillPlusVal) + Math.max(genericChance, individualChance) - resistance;
  return clamp(chance, 0, STATUS_RUNTIME_RULES[args.status].capBp);
}

export function productionDamage(args: { atk: number; def: number; powerBp: number; awakeningMultiplierBp?: number; ignoreDefBp?: number; battleModifierBp?: number; attributeBp?: number; criticalDamageBp?: number; randomBp?: number }): number {
  const effectiveDef = Math.floor(Math.max(0, args.def) * (10000 - clamp(args.ignoreDefBp ?? 0, 0, 10000)) / 10000);
  const factors = [args.atk, args.powerBp, args.awakeningMultiplierBp ?? 10000, args.battleModifierBp ?? 10000, args.attributeBp ?? 10000, args.criticalDamageBp ?? 10000, args.randomBp ?? 10000, DAMAGE_CONTRACT.DEFENSE_CONSTANT];
  const numerator = factors.map((value) => BigInt(Math.trunc(value))).reduce((total, value) => total * value, BigInt(1));
  const denominator = BigInt(10000) ** BigInt(6) * BigInt(effectiveDef + DAMAGE_CONTRACT.DEFENSE_CONSTANT);
  return Math.max(DAMAGE_CONTRACT.MINIMUM_DAMAGE, Number(numerator / denominator));
}

const maxHp = (unit: BattleUnit) => Math.max(1, Math.trunc(unit.stats.hp));
const hpBp = (unit: BattleUnit) => Math.floor(unit.hp * 10000 / maxHp(unit));
const alive = (units: BattleUnit[]) => units.filter((unit) => unit.hp > 0);

function strongestModifier(unit: BattleUnit, stat: CanonicalStat): number {
  const matching = unit.modifiers.filter((item) => item.stat === stat);
  const positive = Math.max(0, ...matching.filter((item) => item.type === "BUFF").map((item) => item.magnitudeBp));
  const negative = Math.max(0, ...matching.filter((item) => item.type === "DEBUFF").map((item) => item.magnitudeBp));
  return 10000 + positive - negative;
}

export function effectiveStat(unit: BattleUnit, stat: CanonicalStat): number {
  const base = stat === "ATK" ? unit.stats.atk : stat === "DEF" ? unit.stats.def : stat === "SPD" ? unit.stats.spd : unit.stats.luk;
  return Math.max(0, Math.floor(base * strongestModifier(unit, stat) / 10000));
}

type NormalizedSkill = Omit<BattleSkill, "effects"> & { activationType: ActivationType; availableFromRound: number; effects: CanonicalEffect[]; skillPlusVal: number };

function normalizeSkill(skill: BattleSkill): NormalizedSkill {
  return { ...skill, activationType: skill.activationType ?? "ACTIVE", availableFromRound: Math.max(1, skill.availableFromRound ?? 1), effects: parseCanonicalEffects(skill.effects ?? []), skillPlusVal: clamp(skill.skillPlusVal ?? skill.plusValue ?? 0, 0, 10) };
}

function toRuntimeUnit(unit: BattleUnitInput): BattleUnit {
  const characterId = unit.characterId ?? unit.id;
  const skills = unit.skills.filter((skill) => !skill.exclusiveCharacterId || skill.exclusiveCharacterId === characterId).map(normalizeSkill);
  return { ...unit, characterId, skills, hp: maxHp({ ...unit, hp: unit.stats.hp } as BattleUnit), rawDamage: 0, nextAvailableRound: Object.fromEntries(skills.map((skill) => [skill.id, skill.availableFromRound])), modifiers: [], statuses: [], dots: [], shields: [], regens: [], counters: [], triggerCounts: {}, battleStartTriggered: new Set<string>() };
}

const emit = (events: BattleReplayEvent[], round: number, type: BattleReplayEvent["type"], payload: Record<string, unknown>) => events.push({ index: events.length, round, type, payload });

function activeEffectsAfter(unit: BattleUnit) {
  return [
    ...unit.statuses.map((effect) => ({ id: effect.type, kind: "STATUS", remainingDuration: effect.remainingDuration })),
    ...unit.dots.map((effect) => ({ id: effect.type, kind: "DOT", remainingDuration: effect.remainingDuration })),
    ...unit.modifiers.map((effect) => ({ id: `${effect.type}_${effect.stat}`, kind: effect.type, stat: effect.stat, magnitudeBp: effect.magnitudeBp, remainingDuration: effect.remainingDuration })),
    ...unit.shields.map((effect) => ({ id: "SHIELD", kind: "SHIELD", amount: effect.amount, remainingDuration: effect.remainingDuration })),
    ...unit.regens.map((effect) => ({ id: "REGEN", kind: "REGEN", amount: effect.tickAmount, remainingDuration: effect.remainingDuration })),
    ...unit.counters.map((effect) => ({ id: `COUNTER_${effect.sourceSkillId}`, kind: "COUNTER", remainingDuration: effect.remainingDuration })),
  ].sort((a, b) => a.id.localeCompare(b.id));
}
const hasStatus = (unit: BattleUnit, status: CanonicalStatus) => status === "POISON" || status === "BLEED" ? unit.dots.some((item) => item.type === status) : unit.statuses.some((item) => item.type === status);

function selectEnemy(actor: BattleUnit, enemies: BattleUnit[], tactic: BattleTactic): BattleUnit {
  const candidates = alive(enemies);
  const taunts = candidates.flatMap((unit) => unit.statuses.filter((item) => item.type === "TAUNT").map((item) => ({ unit, sequence: item.applicationSequence })));
  if (taunts.length) return taunts.sort((a, b) => a.sequence - b.sequence || a.unit.id.localeCompare(b.unit.id))[0].unit;
  return candidates.slice().sort((a, b) => {
    const advantageDifference = tactic === "WEAKNESS_FOCUS" ? Number(getAttributeMultiplierBp(actor.alignment, b.alignment) > 10000) - Number(getAttributeMultiplierBp(actor.alignment, a.alignment) > 10000) : 0;
    return advantageDifference || hpBp(a) - hpBp(b) || a.id.localeCompare(b.id);
  })[0];
}

const selectAlly = (allies: BattleUnit[]) => alive(allies).slice().sort((a, b) => hpBp(a) - hpBp(b) || a.id.localeCompare(b.id))[0];

function chooseSkill(actor: BattleUnit, allies: BattleUnit[], tactic: BattleTactic, round: number): ReturnType<typeof normalizeSkill> | undefined {
  if (hasStatus(actor, "SILENCE")) return undefined;
  const active = (actor.skills as ReturnType<typeof normalizeSkill>[]).filter((skill) => skill.activationType === "ACTIVE" && round >= skill.availableFromRound && round >= (actor.nextAvailableRound[skill.id] ?? skill.availableFromRound));
  const damage = active.filter((skill) => skill.effects.some((effect) => effect.type === "DAMAGE"));
  const heal = active.filter((skill) => skill.effects.some((effect) => effect.type === "HEAL"));
  const strongest = (skills: typeof active) => skills.slice().sort((a, b) => Math.max(0, ...b.effects.map((effect) => Number(effect.powerBp ?? 0))) - Math.max(0, ...a.effects.map((effect) => Number(effect.powerBp ?? 0))) || a.id.localeCompare(b.id))[0];
  const needsHeal = hpBp(selectAlly(allies)) < 7000;
  if (tactic === "HEAL_PRIORITY" && needsHeal && heal.length) return strongest(heal);
  if (tactic === "SKILL_PRIORITY") return strongest(active);
  if ((tactic === "ATTACK_PRIORITY" || tactic === "WEAKNESS_FOCUS") && damage.length) return strongest(damage);
  if (tactic === "BALANCED" && needsHeal && heal.length) return strongest(heal);
  return strongest(damage) ?? strongest(active);
}

type RuntimeContext = { rng: CanonicalRng; events: BattleReplayEvent[]; round: number; action: number; sequence: number; players: BattleUnit[]; enemies: BattleUnit[] };
const nextSequence = (context: RuntimeContext) => ++context.sequence;

function actionTargets(actor: BattleUnit, skill: NormalizedSkill, allies: BattleUnit[], foes: BattleUnit[], tactic: BattleTactic): BattleUnit[] {
  if (skill.target === "SELF") return [actor];
  if (skill.target === "ALLY_ALL") return alive(allies).sort((a, b) => a.id.localeCompare(b.id));
  if (skill.target === "ENEMY_ALL") return alive(foes).sort((a, b) => a.id.localeCompare(b.id));
  if (skill.target === "ALLY_SINGLE") return [selectAlly(allies)];
  return [selectEnemy(actor, foes, tactic)];
}

function applyShield(target: BattleUnit, amount: number, duration: number, context: RuntimeContext) {
  const instance = { amount, remainingDuration: duration, appliedAction: context.action, applicationSequence: nextSequence(context) };
  const strongest = target.shields.slice().sort((a, b) => b.amount - a.amount || a.applicationSequence - b.applicationSequence)[0];
  if (!strongest || amount > strongest.amount) target.shields = [instance];
  else if (amount === strongest.amount) strongest.remainingDuration = Math.max(strongest.remainingDuration, duration);
}

function applyDot(actor: BattleUnit, target: BattleUnit, effect: CanonicalEffect, skill: NormalizedSkill, context: RuntimeContext) {
  const type = effect.type as "POISON" | "BLEED";
  const existing = target.dots.find((item) => item.type === type && item.sourceCharacterId === actor.id);
  if (existing) { existing.remainingDuration = Math.max(existing.remainingDuration, Number(effect.duration)); existing.appliedAction = context.action; return; }
  const instance: DotInstance = { type, sourceCharacterId: actor.id, sourceFinalAtkAtApplication: effectiveStat(actor, "ATK"), sourceAttribute: actor.alignment, targetAttribute: target.alignment, attributeMultiplierBp: getAttributeMultiplierBp(actor.alignment, target.alignment), dotCoefficientBp: STATUS_RUNTIME_RULES[type].dotCoefficientBp, dotMultiplierBp: skillEffectMultiplierBp("DOT", skill.skillPlusVal), remainingDuration: Number(effect.duration), appliedAction: context.action, applicationSequence: nextSequence(context) };
  const sameType = target.dots.filter((item) => item.type === type);
  if (sameType.length >= 2) {
    const replaced = sameType.slice().sort((a, b) => a.remainingDuration - b.remainingDuration || a.applicationSequence - b.applicationSequence)[0];
    target.dots = target.dots.filter((item) => item !== replaced);
  }
  target.dots.push(instance);
}

function applyStatus(actor: BattleUnit, target: BattleUnit, effect: CanonicalEffect, skill: NormalizedSkill, context: RuntimeContext): boolean {
  const status = effect.type as CanonicalStatus;
  const chance = finalStatusChanceBp({ status, baseChanceBp: Number(effect.baseChanceBp), skillPlusVal: skill.skillPlusVal, attacker: actor.statusModifiers, target: target.statusModifiers });
  if (context.rng.rollBp() >= chance) return false;
  if (status === "POISON" || status === "BLEED") applyDot(actor, target, effect, skill, context);
  else {
    const existing = target.statuses.find((item) => item.type === status);
    if (existing) { existing.remainingDuration = Math.max(existing.remainingDuration, Number(effect.duration)); existing.appliedAction = context.action; }
    else target.statuses.push({ type: status, remainingDuration: Number(effect.duration), appliedAction: context.action, applicationSequence: nextSequence(context) });
  }
  emit(context.events, context.round, "STATUS", { actorId: actor.id, targetId: target.id, status, duration: effect.duration, chanceBp: chance, activeEffectsAfter: activeEffectsAfter(target) });
  return true;
}

function absorbDamage(target: BattleUnit, damage: number): { shieldDamage: number; hpDamage: number } {
  let remaining = damage; let shieldDamage = 0;
  while (remaining > 0 && target.shields.length) {
    const shield = target.shields.slice().sort((a, b) => b.amount - a.amount || a.applicationSequence - b.applicationSequence)[0];
    const absorbed = Math.min(remaining, shield.amount); shield.amount -= absorbed; remaining -= absorbed; shieldDamage += absorbed;
    if (shield.amount === 0) target.shields = target.shields.filter((item) => item !== shield);
  }
  const hpDamage = Math.min(target.hp, remaining); target.hp -= hpDamage;
  return { shieldDamage, hpDamage };
}

function damageModifierBp(actor: BattleUnit, target: BattleUnit): number {
  const dealt = Math.max(0, actor.combatModifiers?.damageDealtPositiveBp ?? 0) - Math.max(0, actor.combatModifiers?.damageDealtNegativeBp ?? 0);
  const reduction = Math.min(6000, Math.max(0, target.combatModifiers?.damageReductionBp ?? 0));
  return Math.max(0, 10000 + dealt - reduction);
}

function executeDamage(actor: BattleUnit, target: BattleUnit, powerBp: number, awakeningMultiplierBp: number, ignoreDefBp: number, context: RuntimeContext, isCounter: boolean): { hit: boolean; hpDamage: number; totalDamage: number } {
  if (hasStatus(actor, "BLIND") && context.rng.rollBp() < DAMAGE_CONTRACT.BLIND_MISS_BP) {
    emit(context.events, context.round, "DAMAGE", { actorId: actor.id, targetId: target.id, amount: 0, hit: false, counter: isCounter });
    return { hit: false, hpDamage: 0, totalDamage: 0 };
  }
  const critical = context.rng.rollBp() < criticalChanceBp(effectiveStat(actor, "LUK"), actor.combatModifiers);
  const criticalDamage = critical ? DAMAGE_CONTRACT.CRITICAL_DAMAGE_BP + Math.max(0, actor.combatModifiers?.criticalDamageBp ?? 0) : 10000;
  const randomBp = context.rng.randomDamageBp();
  const amount = productionDamage({ atk: effectiveStat(actor, "ATK"), def: effectiveStat(target, "DEF"), powerBp, awakeningMultiplierBp, ignoreDefBp, battleModifierBp: damageModifierBp(actor, target), attributeBp: getAttributeMultiplierBp(actor.alignment, target.alignment), criticalDamageBp: criticalDamage, randomBp });
  const applied = absorbDamage(target, amount); actor.rawDamage += applied.hpDamage;
  emit(context.events, context.round, "DAMAGE", { actorId: actor.id, targetId: target.id, amount, hpDamage: applied.hpDamage, shieldDamage: applied.shieldDamage, critical, hit: true, ignoreDefBp, randomBp, counter: isCounter, remainingHp: target.hp, activeEffectsAfter: activeEffectsAfter(target) });
  if (target.hp === 0) emit(context.events, context.round, "DEFEAT", { targetId: target.id });
  return { hit: true, hpDamage: applied.hpDamage, totalDamage: amount };
}

function executeCounter(defender: BattleUnit, attacker: BattleUnit, context: RuntimeContext) {
  if (defender.hp <= 0 || attacker.hp <= 0) return;
  const counters = defender.counters.slice().sort((a, b) => a.applicationSequence - b.applicationSequence);
  for (const counter of counters) {
    const key = `${counter.sourceSkillId}:${context.round}`;
    if ((defender.triggerCounts[key] ?? 0) >= counter.maxPerRound) continue;
    defender.triggerCounts[key] = (defender.triggerCounts[key] ?? 0) + 1;
    emit(context.events, context.round, "ACTION", { actorId: defender.id, skillId: counter.sourceSkillId, action: "COUNTER", target: "ATTACKER_WHO_DAMAGED_SELF" });
    executeDamage(defender, attacker, counter.powerBp, counter.awakeningMultiplierBp, 0, context, true);
  }
}

function executeEffects(actor: BattleUnit, targets: BattleUnit[], skill: NormalizedSkill, context: RuntimeContext, isCounter = false) {
  const damageEffects = skill.effects.filter((effect) => effect.type === "DAMAGE");
  const ignoreDefBp = Number(skill.effects.find((effect) => effect.type === "IGNORE_DEF")?.rateBp ?? 0);
  const lifestealBp = Number(skill.effects.find((effect) => effect.type === "LIFESTEAL")?.rateBp ?? 0);
  const attached = damageEffects.length > 0;
  for (const originalTarget of targets) {
    let hit = true; let hpDamage = 0;
    let selectedDamage = damageEffects[0];
    const replacement = damageEffects.find((effect) => effect.replacement && context.rng.rollBp() < Number(effect.chanceBp));
    if (replacement) selectedDamage = replacement;
    if (selectedDamage) {
      const scaling = missingHpScalingRate(selectedDamage, hpBp(actor));
      const result = executeDamage(actor, originalTarget, scaling ?? Number(selectedDamage.powerBp), skillEffectMultiplierBp(isCounter ? "COUNTER" : "DAMAGE", skill.skillPlusVal), ignoreDefBp, context, isCounter);
      hit = result.hit; hpDamage = result.hpDamage;
      if (lifestealBp && hpDamage > 0) {
        const heal = Math.floor(hpDamage * lifestealBp / 10000); const hpBeforeHeal = actor.hp; actor.hp = Math.min(maxHp(actor), actor.hp + heal);
        emit(context.events, context.round, "HEAL", { actorId: actor.id, targetId: actor.id, amount: heal, effectiveAmount: actor.hp - hpBeforeHeal, source: "LIFESTEAL", remainingHp: actor.hp });
      }
      if (result.totalDamage > 0 && !isCounter) executeCounter(originalTarget, actor, context);
    }
    if (!hit && attached) continue;
    for (const effect of skill.effects) {
      if (effect.type === "DAMAGE" || effect.type === "IGNORE_DEF" || effect.type === "LIFESTEAL" || effect.type === "TRIGGER" || effect.type === "TRIGGER_LIMIT") continue;
      const target = effect.self ? actor : originalTarget;
      if (effect.type === "HEAL") {
        const amount = bpProduct(maxHp(target), Number(effect.maxHpBp), skillEffectMultiplierBp("SUPPORT", skill.skillPlusVal));
        const hpBeforeHeal = target.hp; target.hp = Math.min(maxHp(target), target.hp + amount); emit(context.events, context.round, "HEAL", { actorId: actor.id, targetId: target.id, amount, effectiveAmount: target.hp - hpBeforeHeal, remainingHp: target.hp });
      } else if (effect.type === "SHIELD") {
        const amount = bpProduct(maxHp(target), Number(effect.maxHpBp), skillEffectMultiplierBp("SUPPORT", skill.skillPlusVal)); applyShield(target, amount, Number(effect.duration), context);
        emit(context.events, context.round, "EFFECT", { actorId: actor.id, targetId: target.id, kind: "SHIELD", amount, duration: effect.duration, activeEffectsAfter: activeEffectsAfter(target) });
      } else if (effect.type === "REGEN") {
        const tickAmount = bpProduct(maxHp(target), Number(effect.maxHpBp), skillEffectMultiplierBp("SUPPORT", skill.skillPlusVal));
        target.regens = [{ sourceCharacterId: actor.id, tickAmount, remainingDuration: Number(effect.duration), appliedAction: context.action, applicationSequence: nextSequence(context) }];
        emit(context.events, context.round, "EFFECT", { actorId: actor.id, targetId: target.id, kind: "REGEN", tickAmount, duration: effect.duration, activeEffectsAfter: activeEffectsAfter(target) });
      } else if (effect.type === "BUFF" || effect.type === "DEBUFF") {
        if (context.rng.rollBp() < Number(effect.chanceBp ?? 10000)) {
          const magnitudeBp = Math.floor(Number(effect.magnitudeBp) * skillEffectMultiplierBp("SUPPORT", skill.skillPlusVal) / 10000);
          target.modifiers.push({ type: effect.type, stat: effect.stat as CanonicalStat, magnitudeBp, remainingDuration: Number(effect.duration), appliedAction: context.action, applicationSequence: nextSequence(context) });
          emit(context.events, context.round, "EFFECT", { actorId: actor.id, targetId: target.id, kind: effect.type, stat: effect.stat, magnitudeBp, duration: effect.duration, activeEffectsAfter: activeEffectsAfter(target) });
        }
      } else if (STATUS_TYPES.has(effect.type)) applyStatus(actor, target, effect, skill, context);
      else if (effect.type === "REMOVE_STATUS") {
        const negative = [...target.statuses, ...target.dots, ...target.modifiers.filter((item) => item.type === "DEBUFF")].sort((a, b) => a.applicationSequence - b.applicationSequence);
        const remove = effect.count === "all" ? negative : negative.slice(0, 1);
        target.statuses = target.statuses.filter((item) => !remove.includes(item)); target.dots = target.dots.filter((item) => !remove.includes(item)); target.modifiers = target.modifiers.filter((item) => !remove.includes(item));
        emit(context.events, context.round, "EFFECT", { actorId: actor.id, targetId: target.id, kind: "REMOVE_STATUS", count: remove.length, activeEffectsAfter: activeEffectsAfter(target) });
      } else if (effect.type === "COUNTER") {
        const limit = Number(skill.effects.find((item) => item.type === "TRIGGER_LIMIT")?.maxPerRound ?? 1);
        target.counters.push({ sourceSkillId: skill.id, powerBp: Number(effect.powerBp), awakeningMultiplierBp: skillEffectMultiplierBp("COUNTER", skill.skillPlusVal), remainingDuration: effect.duration == null ? null : Number(effect.duration), appliedAction: context.action, applicationSequence: nextSequence(context), maxPerRound: limit });
        emit(context.events, context.round, "EFFECT", { actorId: actor.id, targetId: target.id, kind: "COUNTER", powerBp: effect.powerBp, duration: effect.duration, activeEffectsAfter: activeEffectsAfter(target) });
      }
    }
  }
}

function endAction(actor: BattleUnit, context: RuntimeContext) {
  const activeEffectsBeforeAging = JSON.stringify(activeEffectsAfter(actor));
  for (const dot of actor.dots.slice().sort((a, b) => a.applicationSequence - b.applicationSequence)) {
    if (dot.appliedAction >= context.action) continue;
    const numerator = BigInt(dot.sourceFinalAtkAtApplication) * BigInt(dot.dotCoefficientBp) * BigInt(dot.dotMultiplierBp) * BigInt(dot.attributeMultiplierBp);
    const amount = Math.max(1, Number(numerator / (BigInt(10000) ** BigInt(3))));
    actor.hp = Math.max(0, actor.hp - amount); emit(context.events, context.round, "DAMAGE", { actorId: dot.sourceCharacterId, targetId: actor.id, amount, hpDamage: amount, source: dot.type, critical: false, random: false, defenseIgnored: true, remainingHp: actor.hp });
  }
  if (actor.hp === 0) { emit(context.events, context.round, "DEFEAT", { targetId: actor.id }); }
  else for (const regen of actor.regens.slice().sort((a, b) => a.applicationSequence - b.applicationSequence)) {
    if (regen.appliedAction >= context.action) continue;
    const amount = Math.min(maxHp(actor) - actor.hp, regen.tickAmount); actor.hp += amount;
    emit(context.events, context.round, "HEAL", { actorId: regen.sourceCharacterId, targetId: actor.id, amount, effectiveAmount: amount, source: "REGEN", remainingHp: actor.hp });
  }
  const age = <T extends { remainingDuration: number; appliedAction: number }>(items: T[]) => items.map((item) => item.appliedAction < context.action ? { ...item, remainingDuration: item.remainingDuration - 1 } : item).filter((item) => item.remainingDuration > 0);
  actor.statuses = age(actor.statuses); actor.dots = age(actor.dots); actor.shields = age(actor.shields); actor.regens = age(actor.regens);
  actor.modifiers = age(actor.modifiers); actor.counters = actor.counters.map((item) => item.remainingDuration !== null && item.appliedAction < context.action ? { ...item, remainingDuration: item.remainingDuration - 1 } : item).filter((item) => item.remainingDuration === null || item.remainingDuration > 0);
  const projectedEffects = activeEffectsAfter(actor);
  if (activeEffectsBeforeAging !== JSON.stringify(projectedEffects)) {
    emit(context.events, context.round, "EFFECT", { actorId: actor.id, targetId: actor.id, kind: "ACTIVE_EFFECT_SYNC", activeEffectsAfter: projectedEffects });
  }
}

function battleStart(units: BattleUnit[], context: RuntimeContext) {
  for (const actor of units.slice().sort((a, b) => a.team.localeCompare(b.team) || a.id.localeCompare(b.id))) {
    const allies = actor.team === "PLAYER" ? context.players : context.enemies;
    for (const skill of actor.skills as ReturnType<typeof normalizeSkill>[]) {
      if (skill.activationType === "ON_DAMAGE_TAKEN") {
        const counter = skill.effects.find((effect) => effect.type === "COUNTER");
        if (counter && !actor.counters.some((item) => item.sourceSkillId === skill.id)) {
          actor.counters.push({ sourceSkillId: skill.id, powerBp: Number(counter.powerBp), awakeningMultiplierBp: skillEffectMultiplierBp("COUNTER", skill.skillPlusVal), remainingDuration: null, appliedAction: context.action, applicationSequence: nextSequence(context), maxPerRound: Number(skill.effects.find((effect) => effect.type === "TRIGGER_LIMIT")?.maxPerRound ?? 1) });
        }
        continue;
      }
      if (skill.activationType !== "BATTLE_START" || actor.battleStartTriggered.has(skill.id)) continue;
      actor.battleStartTriggered.add(skill.id);
      const targets = skill.target === "ALLY_ALL" ? alive(allies).sort((a, b) => a.id.localeCompare(b.id)) : [actor];
      emit(context.events, 0, "ACTION", { actorId: actor.id, skillId: skill.id, action: "BATTLE_START", target: skill.target }); executeEffects(actor, targets, skill, context);
    }
  }
}

export function resolveCanonicalBattle(input: DeterministicBattleInput): DeterministicBattleResult {
  const players = input.player.map(toRuntimeUnit); const enemies = input.enemy.map(toRuntimeUnit); const events: BattleReplayEvent[] = [];
  const context: RuntimeContext = { rng: new CanonicalRng(input.seed), events, round: 0, action: 0, sequence: 0, players, enemies };
  battleStart([...players, ...enemies], context);
  let round = 0;
  while (round < input.maxRounds && alive(players).length && alive(enemies).length) {
    round += 1; context.round = round;
    const order = [...alive(players), ...alive(enemies)].sort((a, b) => effectiveStat(b, "SPD") - effectiveStat(a, "SPD") || a.team.localeCompare(b.team) || a.id.localeCompare(b.id));
    for (const actor of order) {
      if (actor.hp <= 0 || !alive(players).length || !alive(enemies).length) continue;
      context.action += 1;
      if (hasStatus(actor, "STUN")) emit(events, round, "ACTION", { actorId: actor.id, action: "STUN_SKIP" });
      else {
        const allies = actor.team === "PLAYER" ? players : enemies; const foes = actor.team === "PLAYER" ? enemies : players;
        const activeTactic = actor.team === "ENEMY" ? (input.enemyTactic ?? input.tactic) : input.tactic;
        const skill = chooseSkill(actor, allies, activeTactic, round);
        const chosen = skill ?? normalizeSkill({ id: "BASIC_ATTACK", name: "通常攻撃", activationType: "ACTIVE", target: "ENEMY_SINGLE", cooldown: 0, availableFromRound: 1, effects: [`DAMAGE ${DAMAGE_CONTRACT.NORMAL_ATTACK_POWER_BP / 100}% ATK`] });
        const targets = actionTargets(actor, chosen, allies, foes, activeTactic);
        emit(events, round, "ACTION", { actorId: actor.id, skillId: chosen.id, target: chosen.target }); executeEffects(actor, targets, chosen, context);
        if (skill && skill.cooldown !== null) actor.nextAvailableRound[skill.id] = round + skill.cooldown;
      }
      endAction(actor, context);
    }
  }
  const winner: BattleTeam = alive(enemies).length === 0 ? "PLAYER" : "ENEMY";
  emit(events, round, "RESULT", { winner, rounds: round });
  return { winner, rounds: round, events, playerRawDamage: players.reduce((sum, item) => sum + item.rawDamage, 0), enemyRawDamage: enemies.reduce((sum, item) => sum + item.rawDamage, 0), player: players, enemy: enemies };
}

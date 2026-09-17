import { resolveCanonicalBattle, type BattleAiPolicy, type BattleTactic, type BattleUnitInput } from "../../../src/domain/battle/canonical_runtime.ts";

export type Tactic = BattleTactic;

/** Authoritative Edge Function entry point backed by the shared canonical runtime. */
export function resolveBattle(seed: number, tactic: Tactic, maxRounds: number, player: BattleUnitInput[], enemy: BattleUnitInput[], enemyTactic?: Tactic, battleMode?: "QUEST" | "RAID" | "PVP" | "GVG") {
  const aiPolicy: BattleAiPolicy = battleMode === "QUEST" || battleMode === "RAID" ? "CONTEXTUAL_ENEMY" : "LEGACY";
  return resolveCanonicalBattle({ seed, tactic, enemyTactic, aiPolicy, maxRounds, player, enemy });
}

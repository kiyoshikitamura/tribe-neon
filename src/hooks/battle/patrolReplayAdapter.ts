import type { ParticipantState } from "./battleTypes";

export type ServerBattleEvent = {
  index: number;
  round: number;
  type: "ACTION" | "DAMAGE" | "HEAL" | "STATUS" | "DEFEAT" | "RESULT" | string;
  payload: Record<string, unknown>;
};

type JsonRecord = Record<string, unknown>;

const records = (value: unknown): JsonRecord[] => Array.isArray(value)
  ? value.filter((entry): entry is JsonRecord => typeof entry === "object" && entry !== null && !Array.isArray(entry))
  : [];

const numberValue = (value: unknown, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function patrolSnapshotToParticipants(snapshot: unknown, isEnemy: boolean): ParticipantState[] {
  return records(snapshot).map((unit, index) => {
    const stats = typeof unit.stats === "object" && unit.stats !== null && !Array.isArray(unit.stats)
      ? unit.stats as JsonRecord
      : {};
    const id = String(unit.id ?? `${isEnemy ? "enemy" : "ally"}_snapshot_${index}`);
    const hp = Math.max(1, numberValue(stats.hp, 1));
    const skills = records(unit.skills).map((skill) => ({
      id: String(skill.id ?? "BASIC_ATTACK"),
      skill_card_id: String(skill.id ?? "BASIC_ATTACK"),
      name: String(skill.name ?? "通常攻撃"),
      power: numberValue(skill.powerPercent, 100),
      effect_type: skill.kind === "HEAL" ? "HEAL" : skill.kind === "BUFF" ? "SUPPORT" : skill.kind === "DEBUFF" ? "JAMMER" : "ATTACK",
      target_type: String(skill.target ?? "ENEMY_SINGLE"),
      cooldown_turns: numberValue(skill.cooldown, 0),
    }));
    return {
      id,
      name: String(unit.name ?? (isEnemy ? "ENEMY" : "ALLY")),
      characterId: String(unit.characterId ?? (isEnemy ? id.replace(/^enemy_/, "") : id.replace(/^ally_/, ""))),
      equipmentMasterIds: records(unit.equipment).map((entry) => String(entry.equipmentId ?? "")).filter(Boolean),
      alignment: String(unit.alignment ?? (isEnemy ? "CHAOS" : "ORDER")),
      level: Math.max(1, numberValue(unit.level, 1)),
      awakeningLevel: Math.max(0, numberValue(unit.awakeningLevel ?? unit.awakening_level, 0)),
      rarity: typeof unit.rarity === "string" ? unit.rarity : undefined,
      hp,
      maxHp: hp,
      shield: 0,
      isDead: false,
      isEnemy,
      tauntTurns: 0,
      stunTurns: 0,
      activeEffects: [],
      stats: {
        hp,
        atk: Math.max(0, numberValue(stats.atk, 0)),
        def: Math.max(0, numberValue(stats.def, 0)),
        spd: Math.max(0, numberValue(stats.spd, 0)),
        luk: Math.max(0, numberValue(stats.luk, 0)),
      },
      skills,
    };
  });
}

export function serverBattleEvents(value: unknown): ServerBattleEvent[] {
  return records(value).map((entry, index) => ({
    index: numberValue(entry.index, index),
    round: Math.max(1, numberValue(entry.round, 1)),
    type: String(entry.type ?? "UNKNOWN"),
    payload: typeof entry.payload === "object" && entry.payload !== null && !Array.isArray(entry.payload)
      ? entry.payload as Record<string, unknown>
      : {},
  }));
}

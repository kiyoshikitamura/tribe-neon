import { exclusiveAssetName } from "./exclusiveAssetLabels";
import { CANONICAL_SKILLS } from "@/domain/gameplay/canonical/masters";
import { parseCanonicalEffects } from "@/domain/battle/canonical_effects";

/** UI compatibility view. Gameplay consumes canonical fields and never AP. */
export interface SkillCardMaster {
  id: string; name: string; rarity: string; alignment: "NONE";
  power: number; effect_type: string; is_exclusive: boolean; exclusive_character_id: string | null;
  description: string; is_obtainable: true;
  activationType: "ACTIVE" | "BATTLE_START" | "ON_DAMAGE_TAKEN";
  cooldown: number | null; availableFromRound: number; target: string;
  effects: ReturnType<typeof parseCanonicalEffects>;
}

export const CANONICAL_SKILL_VIEW: SkillCardMaster[] = CANONICAL_SKILLS.map((skill) => {
  const effects = parseCanonicalEffects(skill.effects);
  const damage = effects.find((effect) => effect.type === "DAMAGE");
  const effectType = damage ? "ATTACK" : effects.some((effect) => effect.type === "HEAL" || effect.type === "REGEN") ? "HEAL"
    : effects.some((effect) => effect.type === "DEBUFF" || ["BLIND", "SILENCE", "STUN", "POISON", "BLEED", "TAUNT"].includes(effect.type)) ? "DEBUFF" : "BUFF";
  return {
    id: skill.skill_id, name: exclusiveAssetName(skill.name, skill.exclusive_character_id), rarity: skill.rarity, alignment: "NONE",
    power: Number(damage?.powerBp ?? 0) / 100, effect_type: effectType,
    is_exclusive: skill.kind === "EXCLUSIVE", exclusive_character_id: skill.exclusive_character_id,
    description: skill.effects.join(" / "), is_obtainable: true,
    activationType: skill.activation_type as SkillCardMaster["activationType"], cooldown: skill.cooldown,
    availableFromRound: skill.available_from_round, target: skill.target, effects,
  };
});

/** @deprecated Canonical compatibility alias retained for the frozen presentation adapter. */
export const SKILLS_MASTER_DATA = CANONICAL_SKILL_VIEW;

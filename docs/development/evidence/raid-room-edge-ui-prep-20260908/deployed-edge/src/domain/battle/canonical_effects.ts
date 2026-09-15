export type CanonicalStatus = "BLIND" | "SILENCE" | "STUN" | "POISON" | "BLEED" | "TAUNT";
export type CanonicalStat = "ATK" | "DEF" | "SPD" | "LUK";
export type CanonicalEffect = Readonly<Record<string, unknown>> & { type: string; raw: string };

export const SKILL_EFFECT_MULTIPLIER_BP = {
  DAMAGE: [10000, 10410, 10820, 11230, 11640, 12050, 12460, 12870, 13280, 13690, 14100],
  COUNTER: [10000, 10410, 10820, 11230, 11640, 12050, 12460, 12870, 13280, 13690, 14100],
  SUPPORT: [10000, 10205, 10410, 10615, 10820, 11025, 11230, 11435, 11640, 11845, 12050],
  DOT: [10000, 10307, 10615, 10922, 11230, 11537, 11845, 12152, 12460, 12767, 13075],
  STATUS_CHANCE_BONUS: [0, 0, 0, 200, 200, 200, 400, 400, 400, 600, 800],
} as const;

export const STATUS_RUNTIME_RULES = {
  BLIND: { capBp: 9500, missChanceBp: 2000 }, SILENCE: { capBp: 8000 }, STUN: { capBp: 6500 },
  POISON: { capBp: 10000, dotCoefficientBp: 1500 }, BLEED: { capBp: 10000, dotCoefficientBp: 2000 }, TAUNT: { capBp: 10000 },
} as const;

const toBp = (value: string): number => Math.round(Number(value) * 100);
const durationFrom = (raw: string): number | null => {
  const match = raw.match(/(?:\/\s*|×)(\d+)T|\/Turn\s*(?:\/\s*|×)(\d+)T?/i);
  return match ? Number(match[1] ?? match[2]) : null;
};

export function parseCanonicalEffect(raw: string): CanonicalEffect {
  let match = raw.match(/^DAMAGE\s+(\d+(?:\.\d+)?)%\s+ATK$/i);
  if (match) return { type: "DAMAGE", powerBp: toBp(match[1]), raw };
  match = raw.match(/^(\d+(?:\.\d+)?)% chance:\s*DAMAGE\s+(\d+(?:\.\d+)?)%\s+ATK$/i);
  if (match) return { type: "DAMAGE", chanceBp: toBp(match[1]), powerBp: toBp(match[2]), replacement: true, raw };
  if (/^DAMAGE (?:continuous )?scaling/i.test(raw)) {
    const points = [...new Map([...raw.matchAll(/HP\s*(?:<=\s*)?(100|50|25)%\s*(?:=|≈)\s*(\d+(?:\.\d+)?)%/gi)]
      .map((item) => [Number(item[1]) * 100, { hpBp: Number(item[1]) * 100, powerBp: toBp(item[2]) }])).values()]
      .sort((a, b) => a.hpBp - b.hpBp);
    return { type: "DAMAGE", scaling: "MISSING_HP_LINEAR", points, raw };
  }
  match = raw.match(/^HEAL\s+(\d+(?:\.\d+)?)%.*MaxHP/i);
  if (match) return { type: "HEAL", maxHpBp: toBp(match[1]), raw };
  match = raw.match(/^IGNORE_DEF\s+(\d+(?:\.\d+)?)%$/i);
  if (match) return { type: "IGNORE_DEF", rateBp: toBp(match[1]), raw };
  match = raw.match(/^(?:SELF\s+)?(ATK|DEF|SPD|LUK)\s+([+-]\d+(?:\.\d+)?)%\s*\/\s*(\d+)T(?:\s*\/\s*chance\s*(\d+(?:\.\d+)?)%)?$/i);
  if (match) return { type: Number(match[2]) < 0 ? "DEBUFF" : "BUFF", stat: match[1].toUpperCase(), magnitudeBp: Math.abs(toBp(match[2])), duration: Number(match[3]), chanceBp: match[4] ? toBp(match[4]) : 10000, self: /^SELF/i.test(raw), raw };
  match = raw.match(/^(BLIND|SILENCE|STUN|BLEED|POISON|TAUNT)\s+(\d+(?:\.\d+)?)%/i);
  if (match) return { type: match[1].toUpperCase(), baseChanceBp: toBp(match[2]), duration: durationFrom(raw) ?? 1, raw };
  match = raw.match(/^REGEN\s+(\d+(?:\.\d+)?)%\s+MaxHP\/Turn/i);
  if (match) return { type: "REGEN", maxHpBp: toBp(match[1]), duration: durationFrom(raw) ?? 1, raw };
  match = raw.match(/^SHIELD\s+(\d+(?:\.\d+)?)%\s+MaxHP(?:\s*\/\s*(\d+)T)?$/i);
  if (match) return { type: "SHIELD", maxHpBp: toBp(match[1]), duration: match[2] ? Number(match[2]) : 1, raw };
  match = raw.match(/^COUNTER\s+(\d+(?:\.\d+)?)%\s+ATK(?:\s*\/\s*(\d+)T)?/i);
  if (match) return { type: "COUNTER", powerBp: toBp(match[1]), duration: match[2] ? Number(match[2]) : null, raw };
  match = raw.match(/^LIFESTEAL\s+(\d+(?:\.\d+)?)%/i);
  if (match) return { type: "LIFESTEAL", rateBp: toBp(match[1]), raw };
  match = raw.match(/^REMOVE_STATUS\s+(1|all)$/i);
  if (match) return { type: "REMOVE_STATUS", count: match[1].toLowerCase() === "all" ? "all" : 1, raw };
  if (/^TRIGGER ON_BATTLE_START/i.test(raw)) return { type: "TRIGGER", trigger: "BATTLE_START", oncePerBattle: true, raw };
  if (/^TRIGGER ON_DAMAGE_TAKEN/i.test(raw)) return { type: "TRIGGER", trigger: "ON_DAMAGE_TAKEN", raw };
  match = raw.match(/^MAX\s+(\d+)\s+activation\s*\/\s*round$/i);
  if (match) return { type: "TRIGGER_LIMIT", maxPerRound: Number(match[1]), raw };
  return { type: "RAW", raw };
}

export function parseCanonicalEffects(effects: readonly (string | CanonicalEffect)[]): CanonicalEffect[] {
  // The DB may contain an older structured projection. `raw` remains the frozen
  // authority, so every runtime reparses it through the shared current semantics.
  return effects.map((effect) => typeof effect === "string" ? parseCanonicalEffect(effect) : parseCanonicalEffect(effect.raw));
}

export function skillEffectMultiplierBp(group: keyof typeof SKILL_EFFECT_MULTIPLIER_BP, plusValue: number): number {
  const index = Math.max(0, Math.min(10, Math.trunc(plusValue)));
  return SKILL_EFFECT_MULTIPLIER_BP[group][index];
}

export function missingHpScalingRate(effect: CanonicalEffect | string, hpBasisPoints: number): number | null {
  const parsed = typeof effect === "string" ? parseCanonicalEffect(effect) : effect;
  const points = parsed.points as Array<{ hpBp: number; powerBp: number }> | undefined;
  if (!points || points.length !== 3) return null;
  const hp = Math.max(0, Math.min(10000, Math.trunc(hpBasisPoints)));
  if (hp <= points[0].hpBp) return points[0].powerBp;
  for (let index = 1; index < points.length; index += 1) {
    const lower = points[index - 1]; const upper = points[index];
    if (hp <= upper.hpBp) return lower.powerBp + Math.floor((upper.powerBp - lower.powerBp) * (hp - lower.hpBp) / (upper.hpBp - lower.hpBp));
  }
  return points[points.length - 1].powerBp;
}

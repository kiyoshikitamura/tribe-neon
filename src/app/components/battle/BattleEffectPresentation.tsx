"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import CharacterPresentation from "../character/CharacterPresentation";
import type { BattleParticipantView } from "./BattleUnitPortrait";
import type { BattleTargetResolutionGroup } from "@/domain/presentation/battlePresentationUnit";
import "./BattleEffectPresentation.css";
import "./ExclusiveBattlePresentation.css";
import { ExclusiveSkillSequence } from "./ExclusiveBattlePresentation";
import { exclusiveSkillForBattleMember } from "@/domain/presentation/exclusiveContent";
import { EXCLUSIVE_SKILL_DIALOGUE, EXCLUSIVE_SKILL_PREFIX_MS } from "@/domain/presentation/exclusiveSkillDialogue";
import { isInternalBattleLabel, safeBattleCharacterName } from "@/domain/presentation/battleSkillLabels";
import {
  battleStatusApplyLabel,
  battleStatusPresentationTone,
  type BattleStatusPresentationTone,
} from "@/domain/presentation/battleStatusPresentation";

export const BATTLE_EFFECT_ASSETS = {
  heavyImpact: "/effects/fx_heavy_impact.png",
  heavySlash: "/effects/fx_heavy_slash.png",
  muzzleFlash: "/effects/fx_muzzle_flash.png",
  cutInSr: "/effects/cutin_bg_sr.png",
  cutInSsr: "/effects/cutin_bg_ssr.png",
  screenDarken: "/effects/fx_screen_darken.png",
  speedLines: "/effects/fx_speed_lines.png",
} as const;

export type BattleImpactKind = "impact" | "slash" | "muzzle";
type BattleCutInTier = "STANDARD" | "SR" | "SSR";

export type BattleSkillPresentation = {
  skillId?: string;
  charName: string;
  skillName: string;
  tier: BattleCutInTier | null;
  impact: BattleImpactKind;
  dialogue?: string;
};

const effectAsset: Record<BattleImpactKind, string> = {
  impact: BATTLE_EFFECT_ASSETS.heavyImpact,
  slash: BATTLE_EFFECT_ASSETS.heavySlash,
  muzzle: BATTLE_EFFECT_ASSETS.muzzleFlash,
};

const stringValue = (value: unknown) => typeof value === "string" ? value.trim().toUpperCase() : "";

export const battleStatusLabel = battleStatusApplyLabel;
export const battleReactionTone = battleStatusPresentationTone;
export type BattleReactionTone = BattleStatusPresentationTone;

const targetStateCues = (group: BattleTargetResolutionGroup) => group.events
  .filter((event) => event.type === "STATUS" || (event.type === "EFFECT" && event.payload.kind !== "ACTIVE_EFFECT_SYNC"))
  .map((event) => ({ event, tone: battleReactionTone(event.payload) }));

export function BattleUnitApplyOverlay({ group, side }: { group: BattleTargetResolutionGroup; side: "player" | "enemy" }) {
  const cues = targetStateCues(group);
  const blind = cues.filter(({ tone }) => tone === "blind");
  const taunt = cues.filter(({ tone }) => tone === "taunt");
  const negative = cues.filter(({ tone }) => tone === "debuff" || tone === "poison" || tone === "bleed" || tone === "stun");
  const defensive = cues.filter(({ tone }) => tone === "shield");
  const positive = cues.filter(({ tone }) => tone === "buff");
  const visible = blind.length ? blind : taunt.length ? taunt : negative.length ? negative : defensive.length ? defensive : positive;
  if (!visible.length) return null;
  const tone = blind.length ? "blind" : taunt.length ? "taunt" : negative.length ? "debuff" : defensive.length ? "shield" : "buff";
  return <div className={`battle-unit-apply-overlay is-${tone} is-${side}`} data-unit-effect-scope="row" role="status">
    <i aria-hidden="true" />
    <span>{visible.slice(0, 2).map(({ event }) => battleStatusLabel(event.payload)).join(" / ")}</span>
  </div>;
}

export function BattleTargetReaction({ group, side, advantage = false }: { group: BattleTargetResolutionGroup; side: "player" | "enemy"; advantage?: boolean }) {
  const damageEvents = group.events.filter((event) => event.type === "DAMAGE");
  const healEvents = group.events.filter((event) => event.type === "HEAL");
  const hasDamage = damageEvents.length > 0;
  const hasHeal = healEvents.length > 0;
  const damage = damageEvents.reduce((sum, event) => sum + Math.max(0, Number(event.payload.hpDamage ?? event.payload.amount ?? 0)), 0);
  const heal = healEvents.reduce((sum, event) => sum + Math.max(0, Number(event.payload.effectiveAmount ?? event.payload.amount ?? 0)), 0);
  const defeated = group.events.some((event) => event.type === "DEFEAT");
  const missed = damageEvents.length > 0 && damageEvents.every((event) => event.payload.hit === false);
  const critical = damageEvents.some((event) => event.payload.critical === true);
  const stateCues = targetStateCues(group);
  // Buff, debuff and shield Apply Presentation belongs exclusively to the
  // unit-wide translucent overlay. Keeping the same cue here produced the
  // second large rectangular label reported by Human Acceptance.
  const iconStateCues = stateCues.filter(({ tone }) => tone === "status");
  const tones = new Set(iconStateCues.map((cue) => cue.tone));
  const classes = [
    "battle-target-reaction",
    `is-${side}`,
    hasDamage ? "has-damage" : "",
    hasHeal ? "has-heal" : "",
    tones.has("buff") ? "has-buff" : "",
    tones.has("debuff") ? "has-debuff" : "",
    tones.has("shield") ? "has-shield" : "",
    tones.has("poison") ? "has-poison" : "",
    tones.has("bleed") ? "has-bleed" : "",
    tones.has("stun") ? "has-stun" : "",
    tones.has("status") ? "has-status" : "",
    defeated ? "has-defeat" : "",
  ].filter(Boolean).join(" ");

  return <div className={classes} role="status" data-target-effect-scope="icon" data-number-visible={(hasDamage || hasHeal) ? "true" : "false"}>
    {hasDamage && !missed && <img className="battle-target-impact-asset" src={BATTLE_EFFECT_ASSETS.heavyImpact} alt="" aria-hidden="true" />}
    {hasDamage && !missed && <i className="battle-target-effect is-damage" aria-hidden="true" />}
    {hasHeal && <i className="battle-target-effect is-heal" aria-hidden="true" />}
    {tones.has("status") && <i className="battle-target-effect is-status" aria-hidden="true" />}
    <span className="battle-target-reaction-copy">
      {critical && !missed && <em className="is-critical">CRITICAL</em>}
      {advantage && hasDamage && !missed && <em className="is-weak">WEAK</em>}
      {missed ? <strong className="battle-target-number is-miss">MISS</strong> : hasDamage ? <strong className="battle-target-number is-damage" data-battle-number="damage">−{damage.toLocaleString()}</strong> : null}
      {hasHeal && <strong className="battle-target-number is-heal" data-battle-number="heal">+{heal.toLocaleString()}</strong>}
      {iconStateCues.slice(0, 2).map(({ event, tone }, index) => <small key={`${event.index}-${index}`} className={`is-${tone}`}>{battleStatusLabel(event.payload)}</small>)}
      {defeated && <b>戦闘不能</b>}
    </span>
  </div>;
}

const isBasicAttackPresentation = (skillId: string, skillName: string) => {
  const normalizedId = stringValue(skillId).replace(/[\s-]+/g, "_");
  const normalizedName = stringValue(skillName).replace(/[\s-]+/g, "_");
  return /(^|_)BASIC_ATTACK($|_)/.test(normalizedId)
    || /(^|_)NORMAL_ATTACK($|_)/.test(normalizedId)
    || /^(BASIC_ATTACK|NORMAL_ATTACK|ATTACK)$/.test(normalizedName)
    || skillName.trim() === "通常攻撃";
};

function resolveImpactKind(skill: Record<string, unknown> | undefined): BattleImpactKind {
  const explicitType = stringValue(
    skill?.battle_effect
      ?? skill?.effect_asset
      ?? skill?.attack_type
      ?? skill?.weapon_type,
  );
  if (["SLASH", "BLADE", "HEAVY_SLASH", "FX_HEAVY_SLASH"].includes(explicitType)) return "slash";
  if (["GUN", "FIREARM", "PROJECTILE", "MUZZLE", "MUZZLE_FLASH", "FX_MUZZLE_FLASH"].includes(explicitType)) return "muzzle";
  return "impact";
}

export function resolveBattleSkillPresentation(
  cutIn: { charName: string; skillName: string } | null,
  participant?: BattleParticipantView,
): BattleSkillPresentation | null {
  if (!cutIn) return null;
  const safeSkillName = isInternalBattleLabel(cutIn.skillName) ? "スキル発動" : cutIn.skillName;
  const skill = participant?.skills?.find((entry) => String(entry.name ?? "") === safeSkillName);
  const skillId = String(skill?.id ?? skill?.skill_card_id ?? skill?.skill_id ?? "");
  const actorRarity = stringValue(participant?.rarity);
  const isBasicAttack = isBasicAttackPresentation(skillId, safeSkillName);

  return {
    skillId,
    charName: safeBattleCharacterName(cutIn.charName),
    skillName: safeSkillName,
    tier: isBasicAttack ? null : actorRarity === "SSR" ? "SSR" : actorRarity === "SR" ? "SR" : "STANDARD",
    impact: resolveImpactKind(skill),
    dialogue: exclusiveSkillForBattleMember(participant?.characterId ?? "", skillId) ? EXCLUSIVE_SKILL_DIALOGUE[skillId] : undefined,
  };
}

export function preloadBattleEffects() {
  if (typeof window === "undefined") return;
  Object.values(BATTLE_EFFECT_ASSETS).forEach((src) => {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    void image.decode().catch(() => undefined);
  });
}

type CutInProps = {
  presentation: BattleSkillPresentation | null;
  participant?: BattleParticipantView;
  imageSrc?: string;
  speed: number;
  actionKey?: string | number;
  paused?: boolean;
};

export function BattleSkillCutIn({ presentation, participant, imageSrc, speed, actionKey, paused = false }: CutInProps) {
  const [visible, setVisible] = useState<BattleSkillPresentation | null>(null);
  const clockRef = useRef({ remainingMs: 0 });
  const lastPresentationKeyRef = useRef("");

  useLayoutEffect(() => {
    if (!presentation?.tier) {
      lastPresentationKeyRef.current = "";
      setVisible(null);
      return;
    }
    const presentationKey = `${actionKey ?? "legacy"}:${presentation.charName}:${presentation.skillName}:${presentation.tier}`;
    if (lastPresentationKeyRef.current === presentationKey) return;
    lastPresentationKeyRef.current = presentationKey;
    setVisible(presentation);
    const minimumDuration = speed > 1 ? 780 : presentation.tier === "SSR" ? 1300 : 1100;
    clockRef.current = { remainingMs: minimumDuration + (presentation.dialogue ? EXCLUSIVE_SKILL_PREFIX_MS : 0) };
  }, [actionKey, presentation, speed]);

  useEffect(() => {
    if (!visible || paused) return;
    const clock = clockRef.current;
    const startedAt = performance.now();
    const timer = setTimeout(() => setVisible(null), clock.remainingMs);
    return () => {
      clearTimeout(timer);
      clock.remainingMs = Math.max(0, clock.remainingMs - (performance.now() - startedAt));
    };
  }, [visible, paused]);

  if (!visible?.tier) return null;
  const tier = visible.tier.toLowerCase();
  return (
    <ExclusiveSkillSequence key={actionKey} dialogue={visible.dialogue} paused={paused}>
    <div className={`battle-skill-cutin is-${tier} is-speed-${speed > 1 ? "fast" : "normal"}`} aria-label={`${visible.charName} ${visible.skillName}`}>
      <img className="battle-cutin-darken" src={BATTLE_EFFECT_ASSETS.screenDarken} alt="" aria-hidden="true" />
      <img
        className="battle-cutin-frame"
        src={visible.tier === "SSR" ? BATTLE_EFFECT_ASSETS.cutInSsr : BATTLE_EFFECT_ASSETS.cutInSr}
        alt=""
        aria-hidden="true"
      />
      <img className="battle-cutin-speed-lines" src={BATTLE_EFFECT_ASSETS.speedLines} alt="" aria-hidden="true" />
      <div className="battle-cutin-character">
        <CharacterPresentation src={imageSrc} alt={participant?.name || visible.charName} variant="battle" className="character-presentation-battle-cutin" />
      </div>
      <div className="battle-cutin-copy">
        <small>{visible.tier} SKILL</small>
        <strong>{visible.skillName}</strong>
        <span>{visible.charName}</span>
      </div>
    </div></ExclusiveSkillSequence>
  );
}

export function BattleImpactEffect({ kind, speed }: { kind: BattleImpactKind; speed: number }) {
  return (
    <div className={`battle-asset-impact is-${kind} is-speed-${speed > 1 ? "fast" : "normal"}`} aria-hidden="true">
      <img src={effectAsset[kind]} alt="" />
    </div>
  );
}

export function BattleSkillResolutionVfx({
  presentation,
  phase,
  actorSide,
}: {
  presentation: BattleSkillPresentation | null;
  phase: "TARGET_FOCUS" | "ATTACK_MOTION";
  actorSide: "player" | "enemy";
}) {
  if (!presentation?.tier) return null;
  return (
    <div className={`battle-skill-resolution-vfx is-${phase.toLowerCase().replaceAll("_", "-")} is-${actorSide}`} role="status" aria-label={`${presentation.skillName} 攻撃演出`}>
      <img src={BATTLE_EFFECT_ASSETS.speedLines} alt="" aria-hidden="true" />
      <i aria-hidden="true" />
      <strong>{presentation.skillName}</strong>
    </div>
  );
}

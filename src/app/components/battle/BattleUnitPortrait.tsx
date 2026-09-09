"use client";

import { useLayoutEffect, type ReactNode } from "react";
import CharacterPresentation from "../character/CharacterPresentation";
import { getAttributeBadgeAsset, getAttributeLabel } from "@/utils/attributeAssets";
import { battleReactionTone, BattleTargetReaction, BattleUnitApplyOverlay } from "./BattleEffectPresentation";
import type { BattleTargetResolutionGroup } from "@/domain/presentation/battlePresentationUnit";
import { battleStatusPersistentLabel } from "@/domain/presentation/battleStatusPresentation";
import "./BattleUnitPortrait.css";
import { getRarityBadgeAsset } from "@/utils/rarityAssets";
import StreetStatuses from "./StreetStatuses";

export type BattleParticipantView = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  level?: number;
  awakeningLevel?: number;
  rarity?: string;
  shield?: number;
  isDead?: boolean;
  tauntTurns?: number;
  stunTurns?: number;
  alignment?: string;
  skills?: Array<Record<string, unknown>>;
  activeEffects?: Array<{ id: string; kind: string; remainingDuration: number | null; stat?: string; magnitudeBp?: number; amount?: number }>;
};

export type BattleDamagePopup = {
  val: number;
  type: "dmg" | "heal" | "shield";
  isCritical?: boolean;
};

type Props = {
  participant: BattleParticipantView;
  imageSrc?: string;
  side: "player" | "enemy";
  frame?: "party" | "action";
  domId?: string;
  actor?: boolean;
  target?: boolean;
  placeholderAsset?: boolean;
  advantage?: boolean;
  popup?: BattleDamagePopup | null;
  impactOverlay?: ReactNode;
  rarity?: string;
  attribute?: string;
  reaction?: BattleTargetResolutionGroup;
  skillCue?: string;
  street?: boolean;
};

export default function BattleUnitPortrait({
  participant,
  imageSrc,
  side,
  frame = "party",
  domId,
  actor = false,
  target = false,
  placeholderAsset = false,
  advantage = false,
  popup,
  impactOverlay,
  rarity,
  attribute,
  reaction,
  skillCue,
  street = false,
}: Props) {
  const maxHp = Math.max(1, Number(participant.maxHp) || 1);
  const hp = Math.max(0, Number(participant.hp) || 0);
  const hpPercent = Math.min(100, (hp / maxHp) * 100);
  const legacyStatuses = [
    Number(participant.stunTurns || 0) > 0 ? { id: "STUN", kind: "STATUS", remainingDuration: participant.stunTurns || 0 } : null,
    Number(participant.tauntTurns || 0) > 0 ? { id: "TAUNT", kind: "STATUS", remainingDuration: participant.tauntTurns || 0 } : null,
    Number(participant.shield || 0) > 0 ? { id: "SHIELD", kind: "SHIELD", remainingDuration: null } : null,
  ].filter(Boolean) as NonNullable<BattleParticipantView["activeEffects"]>;
  const statuses = participant.activeEffects?.length ? participant.activeEffects : legacyStatuses;
  const groupedStatuses = [...statuses.reduce((groups, status) => {
    const key = `${status.id}-${status.kind}-${status.stat ?? ""}`;
    const current = groups.get(key);
    groups.set(key, current ? { status: current.status, count: current.count + 1 } : { status, count: 1 });
    return groups;
  }, new Map<string, { status: (typeof statuses)[number]; count: number }>()).values()];
  const visibleStatuses = groupedStatuses.slice(0, 3);
  const popupSign = popup?.type === "dmg" ? "−" : "+";
  const reactionHpEventIndex = reaction
    ? [...reaction.events].reverse().find((event) => event.type === "DAMAGE" || event.type === "HEAL" || event.type === "DEFEAT")?.index
    : undefined;
  const iconReactionTones = new Set(reaction?.events.map((event) => event.type === "DAMAGE" ? "damage" : event.type === "HEAL" ? "heal" : battleReactionTone(event.payload)) ?? []);
  const iconReactionClasses = [...iconReactionTones].filter(Boolean).map((tone) => `is-reacting-${tone}`).join(" ");

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    let settleTimer = 0;
    const frame = window.requestAnimationFrame(() => {
      const unit = domId ? document.getElementById(domId) : null;
      const track = unit?.querySelector<HTMLElement>(".battle-unit-hp");
      const fill = unit?.querySelector<HTMLElement>("[data-hp-fill]");
      const battleWindow = window as typeof window & { __TRIBE_BATTLE_HP_TRACE__?: any[] };
      const trace = battleWindow.__TRIBE_BATTLE_HP_TRACE__;
      if (!trace?.length) return;
      const projected = [...trace].reverse().find((entry) => entry.kind === "ACTION_HP_PROJECTION" && entry.targetId === participant.id && entry.renderedAt == null);
      if (projected) {
        projected.renderedHp = hp;
        projected.renderedPercent = Number(hpPercent.toFixed(2));
        projected.renderedTrackPx = track?.getBoundingClientRect().width ?? null;
        projected.renderedFillPx = fill?.getBoundingClientRect().width ?? null;
        projected.renderedIsDead = participant.isDead === true;
        projected.renderedAt = performance.now();
        if (unit) {
          unit.dataset.hpTraceEventIndex = String(projected.eventIndex);
          unit.dataset.hpTraceRound = String(projected.round);
          unit.dataset.hpTraceActor = String(projected.actorId);
          unit.dataset.hpTraceTarget = String(projected.targetId);
          unit.dataset.hpTraceSide = String(projected.side);
          unit.dataset.hpTraceEventType = String(projected.eventType);
          unit.dataset.hpTraceBefore = projected.canonicalHpBefore == null ? "" : String(projected.canonicalHpBefore);
          unit.dataset.hpTraceDamage = String(projected.canonicalDamage);
          unit.dataset.hpTraceHeal = String(projected.canonicalHeal);
          unit.dataset.hpTraceReplay = String(projected.replayRemainingHp);
          unit.dataset.hpTraceProjected = String(projected.presentationProjectedHp);
          unit.dataset.hpTraceRendered = String(hp);
          unit.dataset.hpTraceRenderedPercent = hpPercent.toFixed(2);
          unit.dataset.hpTraceRenderedAt = String(projected.renderedAt);
          unit.dataset.hpTraceDead = projected.renderedIsDead ? "true" : "false";
        }
        settleTimer = window.setTimeout(() => {
          const settledTrackPx = track?.getBoundingClientRect().width ?? 0;
          const settledFillPx = fill?.getBoundingClientRect().width ?? 0;
          const settledFillPercent = settledTrackPx > 0 ? Math.min(100, settledFillPx / settledTrackPx * 100) : null;
          const visualParity = settledFillPercent != null && Math.abs(settledFillPercent - projected.renderedPercent) <= 1;
          projected.settledFillPx = settledFillPx;
          projected.settledFillPercent = settledFillPercent == null ? null : Number(settledFillPercent.toFixed(2));
          projected.settledAt = performance.now();
          projected.parity = projected.renderedHp === projected.replayRemainingHp
            && projected.renderedHp === projected.presentationProjectedHp
            && projected.renderedIsDead === projected.isDead
            && visualParity;
          if (unit) {
            unit.dataset.hpTraceFillPx = settledFillPx.toFixed(2);
            unit.dataset.hpTraceParity = projected.parity ? "pass" : "fail";
          }
          const actionTraces = trace.filter((entry) => entry.kind === "ACTION_HP_PROJECTION" && entry.settledAt != null);
          document.documentElement.dataset.battleHpStepParity = actionTraces.every((entry) => entry.parity === true) ? "pass" : "fail";
          document.documentElement.dataset.battleHpStepCount = String(actionTraces.length);
        }, 420);
      }
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, [domId, hp, hpPercent, participant.id, participant.isDead, reactionHpEventIndex]);

  if (street) return <article id={domId} data-participant-id={participant.id} data-hp={hp} data-max-hp={maxHp} data-hp-percent={hpPercent.toFixed(2)} data-is-dead={participant.isDead ? "true" : "false"} className={`sb-unit ${side} ${actor ? "acting" : ""} ${participant.isDead ? "defeated" : ""}`} aria-label={`${participant.name} HP ${hp} / ${maxHp}`}>
    <div className="sb-face" data-character={imageSrc?.toLowerCase().includes("koharu") ? "koharu" : undefined}>{imageSrc ? <img src={imageSrc} alt={participant.name}/> : <span>{participant.name.slice(0,1)}</span>}</div>
    <div className="sb-identity"><strong>{participant.name}</strong><div className="sb-badges"><img src={getRarityBadgeAsset(rarity || participant.rarity || "N")} alt={rarity || participant.rarity || "N"}/>{getAttributeBadgeAsset(attribute) && <img src={getAttributeBadgeAsset(attribute)!} alt={`属性：${getAttributeLabel(attribute)}`}/>}</div><div className="battle-unit-hp"><i data-hp-fill style={{width:`${hpPercent}%`}}/></div><small>{hp.toLocaleString()} / {maxHp.toLocaleString()}</small></div>
    {statuses.length > 0 && <StreetStatuses name={participant.name} statuses={statuses} shield={participant.shield}/>}
    {participant.isDead && <b className="sb-ko">戦闘不能</b>}
    {impactOverlay}
  </article>;

  return (
    <article
      id={domId}
      data-participant-id={participant.id}
      data-hp={hp}
      data-max-hp={maxHp}
      data-hp-percent={hpPercent.toFixed(2)}
      data-is-dead={participant.isDead ? "true" : "false"}
      className={`battle-unit battle-unit-${frame} battle-unit-${side} is-rarity-${String(rarity || participant.rarity || "N").toLowerCase()} ${placeholderAsset ? "has-placeholder-art" : ""} ${actor ? "is-actor" : ""} ${target ? "is-target" : ""} ${participant.isDead ? "is-defeated" : ""} ${hp > 0 && hpPercent <= 25 ? "is-hp-low" : ""}`.trim()}
      aria-label={`${participant.name} HP ${hp} / ${maxHp}${actor ? " 行動中" : ""}${target ? " 対象" : ""}`}
    >
      <div className={`battle-unit-art ${iconReactionClasses}`.trim()}>
        <CharacterPresentation src={imageSrc} alt={participant.name} variant="battle" rarity={rarity || participant.rarity} frameKind={false} metadata={false} className={`character-presentation-battle-${frame}`} />
        {reaction && <BattleTargetReaction group={reaction} side={side} advantage={advantage} />}
        {participant.isDead && <span className="battle-unit-defeated">戦闘不能</span>}
      </div>
      {reaction && <BattleUnitApplyOverlay group={reaction} side={side} />}

      {popup && !reaction && (
        <div className={`battle-unit-popup is-${popup.type} ${popup.isCritical ? "is-critical" : ""} ${advantage && popup.type === "dmg" ? "is-weak" : ""}`}>
          <strong>{popupSign}{Math.max(0, Number(popup.val) || 0).toLocaleString()}</strong>
        </div>
      )}
      {!reaction && impactOverlay}
      {skillCue && <div className="battle-unit-skill-cue">{skillCue}</div>}

      <div className={`battle-unit-meta ${frame === "action" ? "is-action-identity" : ""}`}>
        <span className="battle-unit-identity-badges">
          {getAttributeBadgeAsset(attribute) && <img src={getAttributeBadgeAsset(attribute) || ""} alt={getAttributeLabel(attribute)} />}
        </span>
        <strong>{participant.name}</strong>
      </div>
      {frame === "party" && <div className="battle-unit-growth"><span>Lv.{Math.max(1, Number(participant.level || 1))}</span>{Number(participant.awakeningLevel || 0) > 0 && <b>+{Number(participant.awakeningLevel)}</b>}</div>}
      <div className="battle-unit-hp" aria-hidden="true"><i data-hp-fill style={{ width: `${hpPercent}%` }} /></div>
      <div className="battle-unit-hp-copy" aria-label={`現在HP ${hp.toLocaleString()} / 最大HP ${maxHp.toLocaleString()}`}>
        <b>{hp.toLocaleString()} / {maxHp.toLocaleString()}</b>
      </div>
      {statuses.length > 0 && <div className="battle-unit-statuses" aria-label={statuses.map((status) => status.id).join("、")}>
        {visibleStatuses.map(({ status, count }) => <span key={`${status.id}-${status.kind}-${status.stat ?? ""}`} title={`${status.id}${status.remainingDuration == null ? "" : ` ${status.remainingDuration}`}`}>{battleStatusPersistentLabel(status)}{count > 1 ? count : ""}</span>)}
        {groupedStatuses.length > visibleStatuses.length && <span title={groupedStatuses.slice(visibleStatuses.length).map(({ status }) => status.id).join("、")}>+{groupedStatuses.length - visibleStatuses.length}</span>}
      </div>}
    </article>
  );
}

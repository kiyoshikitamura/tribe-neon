"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import BattleUnitPortrait, { BattleDamagePopup, BattleParticipantView } from "./BattleUnitPortrait";
import {
  BattleImpactEffect,
  BattleSkillCutIn,
  BattleSkillResolutionVfx,
  resolveBattleSkillPresentation,
  type BattleImpactKind,
} from "./BattleEffectPresentation";
import "./QuestBattleViewer.css";
import StreetBattleViewer from "./StreetBattleViewer";
import { useAudio } from "@/audio/AudioProvider";
import type { BattlePresentationPhase } from "@/hooks/useBattle";
import { isInternalBattleLabel } from "@/domain/presentation/battleSkillLabels";
import { isActiveEffectSync, type BattleActionPresentation, type BattleTargetResolutionGroup } from "@/domain/presentation/battlePresentationUnit";

type Participant = BattleParticipantView & {
  characterId?: string;
  isEnemy?: boolean;
};

type TimelineNode = { id: string; name: string; isEnemy?: boolean };

export type QuestBattleViewerProps = {
  battleMode: string;
  street?: boolean;
  opponentName: string;
  playerParty: Participant[];
  enemyParty: Participant[];
  timeline: TimelineNode[];
  timelineIndex: number;
  authoritativeTimeline?: TimelineNode[];
  presentationPhase?: BattlePresentationPhase;
  actionPresentation?: BattleActionPresentation | null;
  round: number;
  roundLimit?: number;
  skillCutIn: { charName: string; skillName: string } | null;
  targetLine: { fromId: string; toId: string } | null;
  shakingId: string | null;
  damagePopup: (BattleDamagePopup & { charId: string }) | null;
  tactic: string;
  speed: number;
  monthlyPassActive: boolean;
  paused: boolean;
  tutorial: boolean;
  onSpeedChange: (speed: number) => void;
  onPauseChange: (paused: boolean) => void;
  canSkip: boolean;
  skipPending: boolean;
  onSkip: () => void;
  onRetreat: () => void;
  onSound: () => void;
  backgroundPath?: string;
};

const advantageMap: Record<string, string> = {
  JUSTICE: "EVIL",
  EVIL: "ORDER",
  ORDER: "CHAOS",
  CHAOS: "JUSTICE",
};

const tacticLabel: Record<string, string> = {
  ATTACK_PRIORITY: "攻撃優先",
  HEAL_PRIORITY: "回復優先",
  SKILL_PRIORITY: "スキル優先",
  WEAKNESS_FOCUS: "弱点集中",
  BALANCED: "バランス",
};

export default function QuestBattleViewer(props: QuestBattleViewerProps) {
  const { playSe } = useAudio();
  const allParticipants = [...props.playerParty, ...props.enemyParty];
  const activeTimelineNode = props.actionPresentation
    ? { id: props.actionPresentation.unit.actorId, name: "" }
    : props.authoritativeTimeline?.[0] || props.timeline[props.timelineIndex] || props.timeline[0];
  const explicitActiveParticipant = allParticipants.find((entry) => entry.id === activeTimelineNode?.id);
  const activeParticipant = explicitActiveParticipant
    || (props.presentationPhase === "IDLE" ? props.playerParty[0] || props.enemyParty[0] : undefined);
  const targetId = props.actionPresentation?.unit.targets[0]?.targetId || props.damagePopup?.charId || props.targetLine?.toId;
  const targetParticipant = targetId ? allParticipants.find((entry) => entry.id === targetId) : undefined;

  const sideOf = (participant?: Participant): "player" | "enemy" => participant?.isEnemy ? "enemy" : "player";
  const visualOf = (participant: Participant | undefined, side: "player" | "enemy") => {
    const master = CHARACTERS_MASTER.find((character: any) => character.id === participant?.characterId || character.name === participant?.characterId);
    return {
      src: master ? getCharacterTransparentImg(master.name) : undefined,
      placeholder: !master,
      rarity: master?.rarity ? String(master.rarity) : undefined,
      attribute: participant?.alignment || master?.alignment,
    };
  };
  const popupFor = (participant: Participant) => !props.actionPresentation && props.damagePopup?.charId === participant.id ? props.damagePopup : null;
  const hasAdvantage = (target?: Participant) => Boolean(
    activeParticipant?.alignment
      && target?.alignment
      && advantageMap[activeParticipant.alignment] === target.alignment,
  );

  const activeSide = sideOf(activeParticipant);
  const activeVisual = visualOf(activeParticipant, activeSide);
  const targetHasAdvantage = hasAdvantage(targetParticipant);
  const rawSkillName = props.skillCutIn?.skillName || "通常攻撃";
  const skillName = isInternalBattleLabel(rawSkillName) ? "スキル発動" : rawSkillName;
  const isSkillAction = Boolean(props.skillCutIn && !/通常攻撃|ATTACK/i.test(skillName));
  const safeCutIn = props.skillCutIn ? { ...props.skillCutIn, skillName } : null;
  const skillPresentation = resolveBattleSkillPresentation(safeCutIn, activeParticipant ? { ...activeParticipant, rarity: activeVisual.rarity } : undefined);
  const impactFor = (participant: Participant) => !props.actionPresentation && props.damagePopup?.charId === participant.id ? (
    <div className={`battle-unit-impact-vfx is-${props.damagePopup.type}`} aria-hidden="true">
      {props.damagePopup.type === "dmg" && <BattleImpactEffect kind={(skillPresentation?.impact || "impact") as BattleImpactKind} speed={props.speed} />}
      <div className={`battle-impact-burst is-${props.damagePopup.type}`}><i /><i /><i /></div>
    </div>
  ) : null;
  const actorMoving = props.actionPresentation
    ? props.actionPresentation.beat !== "RETURN"
    : props.presentationPhase !== "IDLE" && props.presentationPhase !== "ACTION_HOLD";
  const reactionById = new Map<string, BattleTargetResolutionGroup>(
    props.actionPresentation && (props.actionPresentation.beat === "IMPACT" || props.actionPresentation.beat === "RETURN")
      ? props.actionPresentation.unit.targets
        .filter((group) => group.events.some((event) => !isActiveEffectSync(event)))
        .map((group) => [group.targetId, group])
      : [],
  );
  const standardSkillCue = props.actionPresentation?.tier === "STANDARD" ? props.actionPresentation.skillName : undefined;
  const lastActionAudioKeyRef = useRef<string>("");
  const lastResolutionAudioKeyRef = useRef<string>("");
  const lastLegacySkillCueRef = useRef<unknown>(null);
  const lastLegacyDamageCueRef = useRef<unknown>(null);
  useEffect(() => {
    const action = props.actionPresentation;
    if (!action || action.beat !== "ACTOR") return;
    const key = `${action.unit.replayStartCursor}:${action.unit.actorId}`;
    if (lastActionAudioKeyRef.current === key) return;
    lastActionAudioKeyRef.current = key;
    if (action.tier !== "NORMAL") playSe("BATTLE_SKILL");
    else if (skillPresentation?.impact === "slash") playSe("BATTLE_SLASH");
    else if (skillPresentation?.impact === "muzzle") playSe("BATTLE_GUN");
    else playSe("BATTLE_ATTACK");
  }, [playSe, props.actionPresentation, skillPresentation?.impact]);
  useEffect(() => {
    const action = props.actionPresentation;
    if (!action || action.beat !== "IMPACT") return;
    const key = `${action.unit.replayStartCursor}:impact`;
    if (lastResolutionAudioKeyRef.current === key) return;
    lastResolutionAudioKeyRef.current = key;
    const events = action.unit.targets.flatMap((group) => group.events.map((event) => ({ group, event })));
    const damageEvents = events.filter(({ event }) => event.type === "DAMAGE" && event.payload.hit !== false);
    if (damageEvents.some(({ event }) => event.payload.critical === true)) playSe("BATTLE_CRITICAL");
    else if (damageEvents.length) {
      const advantageous = damageEvents.some(({ group }) => hasAdvantage(allParticipants.find((entry) => entry.id === group.targetId)));
      playSe(advantageous ? "BATTLE_WEAK" : "BATTLE_DAMAGE");
    } else {
      const effectKeys = events.map(({ event }) => String(event.payload.status ?? event.payload.kind ?? "").toUpperCase());
      if (effectKeys.some((keyValue) => keyValue === "DEBUFF" || ["BLIND", "SILENCE", "STUN", "POISON", "BLEED"].includes(keyValue))) playSe("BATTLE_DEBUFF");
      else if (effectKeys.some((keyValue) => keyValue === "BUFF" || keyValue === "REGEN" || keyValue === "COUNTER" || keyValue === "REMOVE_STATUS")) playSe("BATTLE_BUFF");
    }
  }, [allParticipants, hasAdvantage, playSe, props.actionPresentation]);
  useEffect(() => {
    if (props.actionPresentation || !props.skillCutIn || lastLegacySkillCueRef.current === props.skillCutIn) return;
    lastLegacySkillCueRef.current = props.skillCutIn;
    if (isSkillAction) playSe("BATTLE_SKILL");
    else if (skillPresentation?.impact === "slash") playSe("BATTLE_SLASH");
    else if (skillPresentation?.impact === "muzzle") playSe("BATTLE_GUN");
    else playSe("BATTLE_ATTACK");
  }, [isSkillAction, playSe, props.actionPresentation, props.skillCutIn, skillPresentation?.impact]);
  useEffect(() => {
    if (props.actionPresentation || !props.damagePopup || lastLegacyDamageCueRef.current === props.damagePopup) return;
    lastLegacyDamageCueRef.current = props.damagePopup;
    if (props.damagePopup.isCritical) playSe("BATTLE_CRITICAL");
    else if (targetHasAdvantage) playSe("BATTLE_WEAK");
    else if (props.damagePopup.type === "dmg") playSe("BATTLE_DAMAGE");
  }, [playSe, props.actionPresentation, props.damagePopup, targetHasAdvantage]);
  const actionPhase = (props.presentationPhase || "IDLE").toLowerCase().replaceAll("_", "-");
  const acceptanceState = props.damagePopup
    ? (props.enemyParty.every((entry) => entry.isDead || entry.hp <= 0) ? "B5" : isSkillAction ? "B4" : "B3")
    : isSkillAction ? "B4" : "B3";
  const isFinalHit = acceptanceState === "B5";
  const roundLimit = props.roundLimit
    ?? (props.battleMode === "RAID" ? 30 : props.battleMode === "PVP" || props.battleMode === "PVP_PRACTICE" || props.battleMode === "GVG" ? 20 : 15);

  if (props.street || props.battleMode !== "RAID") return <StreetBattleViewer {...props} />;

  return (
    <div className={`playing-container quest-battle-viewer ${props.tutorial ? "is-tutorial is-stress-parity" : ""}`} style={props.backgroundPath ? { "--battle-background-image": `url(${props.backgroundPath})` } as React.CSSProperties : undefined} data-battle-speed={props.speed} data-acceptance-state={props.tutorial ? acceptanceState : undefined} data-action-phase={actionPhase} data-action-kind={isSkillAction ? "skill" : "normal"} data-action-actor-id={activeParticipant?.id || ""} data-action-target-id={targetParticipant?.id || ""}>
      <header className="battle-viewer-header">
        <span>{props.battleMode}</span>
        <strong data-displayed-round={props.round} data-configured-round-limit={roundLimit}>ROUND {props.round}<small> / {roundLimit}</small></strong>
        <i>AUTO</i>
      </header>

      <main className="battle-roster-stage">
        <PartyZone side="player" label="YOUR TEAM" party={props.playerParty} activeId={actorMoving ? activeParticipant?.id : undefined} targetId={targetParticipant?.id} shakingId={props.shakingId} visualOf={visualOf} popupFor={popupFor} impactFor={impactFor} hasAdvantage={hasAdvantage} tutorial={props.tutorial} reactions={reactionById} skillCue={standardSkillCue} />
        <PartyZone side="enemy" label="ENEMY" party={props.enemyParty} activeId={actorMoving ? activeParticipant?.id : undefined} targetId={targetParticipant?.id} shakingId={props.shakingId} visualOf={visualOf} popupFor={popupFor} impactFor={impactFor} hasAdvantage={hasAdvantage} tutorial={props.tutorial} reactions={reactionById} skillCue={standardSkillCue} />
        {isSkillAction && props.actionPresentation && (props.actionPresentation.beat === "ACTOR" || props.actionPresentation.beat === "IMPACT") && <BattleSkillResolutionVfx key={`${props.actionPresentation.unit.replayStartCursor}:${props.actionPresentation.beat}`} presentation={skillPresentation} phase={props.actionPresentation.beat === "ACTOR" ? "TARGET_FOCUS" : "ATTACK_MOTION"} actorSide={activeSide} />}
      </main>

      <section className="battle-cutin-slot" aria-hidden={!skillPresentation?.tier}>
        <BattleSkillCutIn actionKey={props.actionPresentation?.unit.replayStartCursor} presentation={skillPresentation} participant={activeParticipant ? { ...activeParticipant, rarity: activeVisual.rarity } : undefined} imageSrc={activeVisual.src} speed={props.speed} />
      </section>
      {isFinalHit && <div className="battle-final-hit-overlay" role="status"><strong>FINAL HIT</strong><i /></div>}
      <footer className="battle-viewer-controls">
        <span className="battle-tactic-label">{tacticLabel[props.tactic] || tacticLabel.BALANCED}</span>
        <button
          className={`speed-toggle-btn active-scale-effect ${props.speed > 1 ? "active" : ""}`}
          onClick={() => {
            const nextSpeed = props.speed === 2 ? 1 : props.speed === 1 && props.monthlyPassActive ? 3 : 2;
            props.onSpeedChange(nextSpeed);
            props.onSound();
          }}
          title={props.monthlyPassActive ? "1倍・2倍・3倍速を切替" : "通常は1倍・2倍速。3倍速はVIPパス限定"}
        >
          {props.speed}x
        </button>
        <button className="pause-toggle-btn active-scale-effect" onClick={() => { props.onPauseChange(!props.paused); props.onSound(); }}>
          {props.paused ? "再開" : "一時停止"}
        </button>
        {props.canSkip && <button className="battle-skip-btn active-scale-effect" onClick={props.onSkip} disabled={props.skipPending} aria-busy={props.skipPending}>{props.skipPending ? "結果へ移動中" : "スキップ"}</button>}
        {!props.tutorial && <button className="battle-retreat-btn active-scale-effect" onClick={props.onRetreat}>撤退</button>}
      </footer>
    </div>
  );
}

type PartyZoneProps = {
  side: "player" | "enemy";
  label: string;
  party: Participant[];
  activeId?: string;
  targetId?: string;
  shakingId: string | null;
  visualOf: (participant: Participant, side: "player" | "enemy") => { src?: string; placeholder: boolean; rarity?: string; attribute?: string };
  popupFor: (participant: Participant) => (BattleDamagePopup & { charId: string }) | null;
  impactFor: (participant: Participant) => ReactNode;
  hasAdvantage: (participant: Participant) => boolean;
  tutorial: boolean;
  reactions: Map<string, BattleTargetResolutionGroup>;
  skillCue?: string;
};

function PartyZone({ side, label, party, activeId, targetId, visualOf, popupFor, impactFor, hasAdvantage, tutorial, reactions, skillCue }: PartyZoneProps) {
  return (
    <section className={`battle-party-zone is-${side} ${tutorial ? "is-tutorial-party" : ""}`} data-party-size={Math.max(1, Math.min(5, party.length))} aria-label={side === "enemy" ? "敵パーティ" : "味方パーティ"}>
      <div className="battle-party-label"><span>{side === "enemy" ? "ENEMY" : "YOUR TEAM"}</span><strong>{label}</strong></div>
      <div className="battle-party-grid">
        {party.map((participant) => {
          const visual = visualOf(participant, side);
          return (
            <div key={participant.id}>
              <BattleUnitPortrait
                participant={participant}
                imageSrc={visual.src}
                side={side}
                domId={participant.id}
                actor={activeId === participant.id}
                target={targetId === participant.id}
                placeholderAsset={visual.placeholder}
                popup={popupFor(participant)}
                impactOverlay={impactFor(participant)}
                advantage={hasAdvantage(participant)}
                rarity={visual.rarity}
                attribute={visual.attribute}
                reaction={reactions.get(participant.id)}
                skillCue={activeId === participant.id ? skillCue : undefined}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

"use client";

import { projectRaidResultReceipt, type RaidResultReceipt } from '@/domain/raidResultPresentation';
import type { RaidRoomBriefing } from "../domain/raidRoomClient";
import { readRaidRoomPending, saveRaidRoomPending, clearRaidRoomPending, type RaidRoomBattlePayload } from "../domain/raidRoomBattlePending";
import { createRaidRoomBattleAttempt } from "../domain/raidRoomBattleAttempt";


import { useRef, useState, useEffect, useLayoutEffect, useCallback, type RefObject, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/utils/supabase";
import {
  CHARACTERS_MASTER,
  ENEMIES_MASTER
} from "@/utils/game_constants";
import { getCharacterTotalStats } from "@/utils/stats_calculator";
import { criticalChanceBp, getAttributeMultiplierBp, productionDamage } from "@/domain/battle/canonical_runtime";
import { parseCanonicalEffects, skillEffectMultiplierBp } from "@/domain/battle/canonical_effects";
import { CANONICAL_SKILLS } from "@/domain/gameplay/canonical/masters";

import { CompatibleBattleTacticId, UseBattleOptions, ParticipantState, CardState, SkillLogItem } from "./battle/battleTypes";
import { selectCharacterSkillByTactic } from "./battle/battleAI";
import { postNpcYajiMessage, saveBattleSessionState } from "./battle/battleUtils";
import { participantsToBattleUnits, toDeterministicTactic } from "./battle/deterministicBattleAdapter";
import { resolveDeterministicBattle } from "@/lib/battle/deterministicBattle";
import { gvgDefenseSnapshotToParticipants } from "./battle/gvgSnapshotAdapter";
import { patrolSnapshotToParticipants, serverBattleEvents, type ServerBattleEvent } from "./battle/patrolReplayAdapter";
import { beginActionPerformance } from "@/utils/actionPerformance";
import { traceTutorialJourney } from "@/utils/tutorialJourneyTrace";
import {
  battlePresentationBudget,
  battlePresentationImpactAt,
  battlePresentationTier,
  buildBattlePresentationUnit,
  recordBattleHpProjection,
  reconcileBattleHpFromReplay,
  waitForBattleHpParityGate,
  waitForRenderedBattleActionHpParity,
  waitForRenderedBattleHpParity,
  type BattleActionPresentation,
} from "@/domain/presentation/battlePresentationUnit";
import { resolveBattleSkillLabel, safeBattleCharacterName } from "@/domain/presentation/battleSkillLabels";
import { canonicalItemName } from "@/domain/gameplay/canonical/items";
import { battleDisplayText } from "@/domain/presentation/battleTerminology";
import { loadRaidReplayBackground, type RaidReplayBackground } from "@/domain/presentation/raidReplayBackground";

export type { UseBattleOptions, ParticipantState, CardState, SkillLogItem };

const BASIC_ATTACK_SKILL = {
  id: "basic_attack",
  skill_card_id: "basic_attack",
  name: "通常攻撃",
  power: 80,
  effect_type: "ATTACK",
  plus_val: 0,
  ownerId: null,
  activationType: "ACTIVE" as const,
  cooldown: 0,
  availableFromRound: 1,
  target: "ENEMY_SINGLE" as const,
  effects: ["DAMAGE 80% ATK"],
  exclusiveCharacterId: null,
};

function canonicalParticipantSkill(owned: any) {
  const master = CANONICAL_SKILLS.find((skill) => skill.skill_id === owned?.skill_card_id);
  if (!master) return null;
  const plusValue = Math.max(0, Math.min(10, Number(owned?.plus_val || 0)));
  const effects = parseCanonicalEffects(master.effects);
  const damage = effects.find((effect) => effect.type === "DAMAGE");
  const effectType = damage ? "ATTACK" : effects.some((effect) => effect.type === "HEAL" || effect.type === "REGEN") ? "HEAL"
    : effects.some((effect) => effect.type === "DEBUFF" || ["BLIND", "SILENCE", "STUN", "POISON", "BLEED", "TAUNT"].includes(effect.type)) ? "DEBUFF" : "BUFF";
  return {
    id: owned?.id || master.skill_id,
    skill_card_id: master.skill_id,
    name: master.name,
    power: Math.floor(Number(damage?.powerBp ?? 0) * skillEffectMultiplierBp("DAMAGE", plusValue) / 1000000),
    effect_type: effectType,
    plus_val: plusValue,
    ownerId: master.exclusive_character_id,
    activationType: master.activation_type,
    cooldown: master.cooldown,
    availableFromRound: master.available_from_round,
    target: master.target,
    effects,
    exclusiveCharacterId: master.exclusive_character_id,
  };
}

const patrolReplayCursorKey = (replayId: string) => `tribe_neon_patrol_replay_cursor_${replayId}`;
export type BattleMode = "PVP" | "PVP_PRACTICE" | "RAID" | "GVG" | "PATROL";
export type BattlePresentationPhase = "IDLE" | "ACTOR_FOCUS" | "TARGET_FOCUS" | "ATTACK_MOTION" | "IMPACT" | "DAMAGE" | "HP_TRANSITION" | "ACTION_HOLD";
export type BattlePresentationTimelineNode = { id: string; name: string; isEnemy?: boolean };
export type BattlePresentationContext = {
  mode: BattleMode;
  /** Display routing only; server Room receipts remain authoritative. */
  raidRoomId?: string;
  /** Presentation copy of the canonical battle configuration. Never used to resolve battle authority. */
  roundLimit?: number;
  opponentLabel: string;
  encounterLabel?: string;
  opponentLeaderCharacterId?: string;
  opponentLeaderName?: string;
  opponentTotalPower?: number;
  opponentProfile?: string;
  backgroundPath?: string;
  backgroundLabel?: string;
  opponentSkills?: Array<{
    id: string;
    name: string;
    activationType?: string;
    target?: string;
    cooldown?: number | null;
    availableFromRound?: number;
    effects?: string[];
  }>;
};
export type BattleModeResultDetail = {
  raidReceipt?: RaidResultReceipt;
  resultLabel?: string;
  stats?: Array<{ label: string; value: string }>;
  reward?: string;
  rewards?: Array<{ id: string; name: string; quantity: number }>;
  note?: string;
  continueLabel?: string;
  destination?: string;
};

const activeEffectsFromPayload = (payload: Record<string, unknown>) => Array.isArray(payload.activeEffectsAfter)
  ? payload.activeEffectsAfter.filter((entry): entry is NonNullable<ParticipantState["activeEffects"]>[number] => Boolean(entry) && typeof entry === "object")
  : null;

const projectActiveEffects = (participant: ParticipantState, payload: Record<string, unknown>): ParticipantState => {
  const activeEffects = activeEffectsFromPayload(payload);
  if (!activeEffects) return participant;
  const shield = activeEffects.filter((entry) => entry.kind === "SHIELD").reduce((sum, entry) => sum + Math.max(0, Number(entry.amount || 0)), 0);
  return {
    ...participant,
    activeEffects,
    shield,
    stunTurns: activeEffects.some((entry) => entry.id === "STUN") ? 1 : 0,
    tauntTurns: activeEffects.some((entry) => entry.id === "TAUNT") ? 1 : 0,
  };
};

function isRetryableResolveFailure(error: unknown): boolean {
  const context = typeof error === "object" && error !== null && "context" in error
    ? (error as { context?: { status?: unknown } }).context
    : undefined;
  const status = Number(context?.status);
  // A missing HTTP response is a transport failure. HTTP 408/429/5xx can
  // also be retried against the same idempotent replay session. Contract
  // errors such as 400/401/403/404/409 must remain visible and are not retried.
  return !Number.isFinite(status) || status === 408 || status === 429 || status >= 500;
}

function savedPatrolReplayCursor(replayId: unknown, fallback: unknown): number {
  const fallbackIndex = Math.max(0, Number(fallback || 0));
  if (typeof window === "undefined" || typeof replayId !== "string" || !replayId) return fallbackIndex;
  const saved = Number(window.localStorage.getItem(patrolReplayCursorKey(replayId)));
  return Number.isFinite(saved) && saved >= 0 ? saved : fallbackIndex;
}

interface BattleStartContext {
  session: any;
  roomUserRef: RefObject<any>;
  roomAttemptRef: RefObject<ReturnType<typeof createRaidRoomBattleAttempt> | null>;
  settledPatrolEncounterId: string | null;
  setTutorialBattleActive: Dispatch<SetStateAction<boolean>>;
  tutorialStep: string | null | undefined;
  activePatrolEncounterIdRef: RefObject<string | null>;
  patrol: any;
  userCharactersDbList: any[];
  setErrorMessage: (msg: string | null) => void;
  userLevel: number;
  setBattleLoading: Dispatch<SetStateAction<boolean>>;
  playCyberSe: (type: "click" | "attack" | "hit" | "gacha") => void;
  setOfficialGvgAttackId: Dispatch<SetStateAction<string | null>>;
  setOfficialGvgReplayId: Dispatch<SetStateAction<string | null>>;
  setOfficialGvgWinner: Dispatch<SetStateAction<"PLAYER" | "ENEMY" | null>>;
  setOfficialPatrolReplayId: Dispatch<SetStateAction<string | null>>;
  setOfficialPatrolWinner: Dispatch<SetStateAction<"PLAYER" | "ENEMY" | null>>;
  setOfficialPatrolEvents: Dispatch<SetStateAction<ServerBattleEvent[]>>;
  setOfficialPatrolEventIndex: Dispatch<SetStateAction<number>>;
  setOfficialPvpReplayId: Dispatch<SetStateAction<string | null>>;
  setOfficialPvpWinner: Dispatch<SetStateAction<"PLAYER" | "ENEMY" | null>>;
  setOfficialPvpEvents: Dispatch<SetStateAction<ServerBattleEvent[]>>;
  setOfficialPvpEventIndex: Dispatch<SetStateAction<number>>;
  setOfficialPvpResult: Dispatch<any>;
  setCanonicalAuxReplayId: Dispatch<SetStateAction<string | null>>;
  setCanonicalAuxEvents: Dispatch<SetStateAction<ServerBattleEvent[]>>;
  setCanonicalAuxEventIndex: Dispatch<SetStateAction<number>>;
  setOfficialRaidReplayId: Dispatch<SetStateAction<string | null>>;
  setOfficialRaidWinner: Dispatch<SetStateAction<"PLAYER" | "ENEMY" | null>>;
  setOfficialRaidEvents: Dispatch<SetStateAction<ServerBattleEvent[]>>;
  setOfficialRaidEventIndex: Dispatch<SetStateAction<number>>;
  setOfficialRaidResult: Dispatch<any>;
  setBattleResultReplayEvents: Dispatch<SetStateAction<ServerBattleEvent[]>>;
  setBattleModeResultDetail: Dispatch<SetStateAction<BattleModeResultDetail | null>>;
  setBattleSkipPending: Dispatch<SetStateAction<boolean>>;
  setIsAutoPaused: Dispatch<SetStateAction<boolean>>;
  setBattleState: Dispatch<SetStateAction<"SETUP" | "PLAYING" | "ENDING" | "OUTCOME" | "RESULT" | null>>;
  setBattleMode: Dispatch<SetStateAction<BattleMode | null>>;
  raidBossHp: number;
  raidBossMaxHp: number;
  patrolNpcs: any[];
  userGuildMember: any;
  setHasRaidControlBonus: Dispatch<SetStateAction<boolean>>;
  setOpponentPoints: Dispatch<SetStateAction<number>>;
  setEnemyTactic: Dispatch<SetStateAction<string>>;
  setBattleOpponentName: Dispatch<SetStateAction<string>>;
  setVitality: Dispatch<SetStateAction<number>>;
  vitality: number;
  setGvgTargetBaseId: Dispatch<SetStateAction<string | null>>;
  selectedMembers: string[];
  userSkillsList: any[];
  userEquipmentsList: any[];
  setMaxAp: Dispatch<SetStateAction<number>>;
  setAp: Dispatch<SetStateAction<number>>;
  userGuild: any;
  setPlayerPartyStates: Dispatch<SetStateAction<ParticipantState[]>>;
  pendingPvpStartRef: RefObject<any[] | null>;
  setEnemyPartyStates: Dispatch<SetStateAction<ParticipantState[]>>;
  setTimeline: Dispatch<SetStateAction<any[]>>;
  setTimelineIndex: Dispatch<SetStateAction<number>>;
  setBattleRound: Dispatch<SetStateAction<number>>;
  setBattleLog: Dispatch<SetStateAction<string[]>>;
  tactic: CompatibleBattleTacticId;
  createPersistentRoomAttempt: (roomId: string, userId: string, initialPayload?: RaidRoomBattlePayload) => ReturnType<typeof createRaidRoomBattleAttempt>;
  setBattlePresentationContext: Dispatch<SetStateAction<BattlePresentationContext | null>>;
  officialPatrolReplayIdRef: RefObject<string | null>;
  officialPatrolWinnerRef: RefObject<"PLAYER" | "ENEMY" | null>;
  playerPartyStatesRef: RefObject<ParticipantState[]>;
  enemyPartyStatesRef: RefObject<ParticipantState[]>;
  pvpCommitSucceededRef: RefObject<boolean>;
  setPvpPoints: Dispatch<SetStateAction<number>>;
  pvpPoints: number;
  raidCommitSucceededRef: RefObject<boolean>;
  roomPresentationUserRef: RefObject<string | null>;
  setRaidPoints: Dispatch<SetStateAction<number>> | undefined;
  raidPoints: number | undefined;
  setRaidFirstEntryFree: Dispatch<SetStateAction<boolean>> | undefined;
  setBattleSessionId: Dispatch<SetStateAction<string | null>>;
}

/** Battle startup is an imperative transaction; React owns its supplied state. */
async function runBattleStart(context: BattleStartContext,
  mode: BattleMode,
  targetName: string,
  areaIdOrOpponentUserId?: string,
  oppPoints?: number,
  oppTactic?: string,
  opponentMainAlign?: string,
  opponentSubAlign?: string,
  opponentDefenseCharIds?: string[],
  _supportCharacter?: any,
  patrolNpcOverride?: any,
  patrolIdOverride?: string,
  presentationOverride?: Partial<BattlePresentationContext>,
  prepareOnly: boolean = false,
  roomBriefing?: RaidRoomBriefing
) {
  const {
    session,
    roomUserRef,
    roomAttemptRef,
    settledPatrolEncounterId,
    setTutorialBattleActive,
    tutorialStep,
    activePatrolEncounterIdRef,
    patrol,
    userCharactersDbList,
    setErrorMessage,
    userLevel,
    setBattleLoading,
    playCyberSe,
    setOfficialGvgAttackId,
    setOfficialGvgReplayId,
    setOfficialGvgWinner,
    setOfficialPatrolReplayId,
    setOfficialPatrolWinner,
    setOfficialPatrolEvents,
    setOfficialPatrolEventIndex,
    setOfficialPvpReplayId,
    setOfficialPvpWinner,
    setOfficialPvpEvents,
    setOfficialPvpEventIndex,
    setOfficialPvpResult,
    setCanonicalAuxReplayId,
    setCanonicalAuxEvents,
    setCanonicalAuxEventIndex,
    setOfficialRaidReplayId,
    setOfficialRaidWinner,
    setOfficialRaidEvents,
    setOfficialRaidEventIndex,
    setOfficialRaidResult,
    setBattleResultReplayEvents,
    setBattleModeResultDetail,
    setBattleSkipPending,
    setIsAutoPaused,
    setBattleState,
    setBattleMode,
    raidBossHp,
    raidBossMaxHp,
    patrolNpcs,
    userGuildMember,
    setHasRaidControlBonus,
    setOpponentPoints,
    setEnemyTactic,
    setBattleOpponentName,
    setVitality,
    vitality,
    setGvgTargetBaseId,
    selectedMembers,
    userSkillsList,
    userEquipmentsList,
    setMaxAp,
    setAp,
    userGuild,
    setPlayerPartyStates,
    pendingPvpStartRef,
    setEnemyPartyStates,
    setTimeline,
    setTimelineIndex,
    setBattleRound,
    setBattleLog,
    tactic,
    createPersistentRoomAttempt,
    setBattlePresentationContext,
    officialPatrolReplayIdRef,
    officialPatrolWinnerRef,
    playerPartyStatesRef,
    enemyPartyStatesRef,
    pvpCommitSucceededRef,
    setPvpPoints,
    pvpPoints,
    raidCommitSucceededRef,
    roomPresentationUserRef,
    setRaidPoints,
    raidPoints,
    setRaidFirstEntryFree,
    setBattleSessionId,
  } = context;
    if (!session) return;
    const startingRoomUserId = session.user.id;
    const staleRoomUser = () => Boolean(roomBriefing && roomUserRef.current !== startingRoomUserId);
    if (staleRoomUser()) return;
    const savedRoomReceipt = roomBriefing ? roomAttemptRef.current?.savedReceipt() : null;
    if (mode === "PATROL" && patrolIdOverride && patrolIdOverride === settledPatrolEncounterId) return;
    setTutorialBattleActive(mode === "PATROL" && tutorialStep === "TUTORIAL_BATTLE");
    if (mode === "PATROL") activePatrolEncounterIdRef.current = patrolIdOverride || patrol?.id || null;
    const tutorialBattleRequestId = mode === "PATROL"
      ? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `quest-${Date.now()}`)
      : null;
    const writeTutorialBattleTrace = (phase: string, detail: Record<string, unknown> = {}) => {
      if (mode !== "PATROL" || typeof window === "undefined") return;
      const trace = {
        phase,
        requestId: tutorialBattleRequestId,
        tutorialStep: tutorialStep || null,
        patrolId: patrolIdOverride || patrol?.id || null,
        patrolStatus: patrol?.status || null,
        dispatchedCharacterId: patrol?.characterId || null,
        dispatchedUserCharacterId: userCharactersDbList.find((owned: any) => owned.character_id === patrol?.characterId)?.id || null,
        occurredAt: new Date().toISOString(),
        ...detail,
      };
      (window as any).__TRIBE_TUTORIAL_BATTLE_TRACE__ = [
        ...((window as any).__TRIBE_TUTORIAL_BATTLE_TRACE__ || []),
        trace,
      ].slice(-30);
      traceTutorialJourney(`battle_${phase}`, trace);
      console.info("[Tutorial Battle Trace]", trace);
    };
    writeTutorialBattleTrace("start_requested");
    if (mode === "GVG" && !areaIdOrOpponentUserId?.startsWith("gvg_match:")) {
      setErrorMessage("GvGは公式マッチが開催中の場合のみ開始できます。");
      return;
    }
    if (mode === "RAID" && !savedRoomReceipt && userLevel < 5) {
      setErrorMessage("レイドへの参加にはプレイヤーレベル5以上が必要です。");
      return;
    }
    setBattleLoading(true);
    playCyberSe("click");
    setOfficialGvgAttackId(null);
    setOfficialGvgReplayId(null);
    setOfficialGvgWinner(null);
    setOfficialPatrolReplayId(null);
    setOfficialPatrolWinner(null);
    setOfficialPatrolEvents([]);
    setOfficialPatrolEventIndex(0);
    setOfficialPvpReplayId(null);
    setOfficialPvpWinner(null);
    setOfficialPvpEvents([]);
    setOfficialPvpEventIndex(0);
    setOfficialPvpResult(null);
    setCanonicalAuxReplayId(null); setCanonicalAuxEvents([]); setCanonicalAuxEventIndex(0);
    setOfficialRaidReplayId(null); setOfficialRaidWinner(null); setOfficialRaidEvents([]); setOfficialRaidEventIndex(0); setOfficialRaidResult(null);
    setBattleResultReplayEvents([]);
    setBattleModeResultDetail(null);
    setBattleSkipPending(false);
    // Skip pauses replay while it projects the terminal state. A completed
    // battle must never leak that transport pause into the next encounter.
    setIsAutoPaused(false);
    let officialGvgDefenseDeck: unknown = null;
    let officialGvgAttackIdForBattle: string | null = null;
    let officialGvgReplayIdForBattle: string | null = null;
    let officialGvgWinnerForBattle: "PLAYER" | "ENEMY" | null = null;
    let canonicalAuxReplayIdForBattle: string | null = null;
    let canonicalAuxEventsForBattle: ServerBattleEvent[] = [];
    let officialPatrolReplayIdForBattle: string | null = null;
    let officialPatrolWinnerForBattle: "PLAYER" | "ENEMY" | null = null;
    let officialPatrolEventsForBattle: ServerBattleEvent[] = [];
    let officialPvpReplayIdForBattle: string | null = null;
    let officialPvpWinnerForBattle: "PLAYER" | "ENEMY" | null = null;
    let officialPvpEventsForBattle: ServerBattleEvent[] = [];
    let officialPvpResultForBattle: any | null = null;
    let officialRaidReplayIdForBattle: string | null = null;
    let officialRaidWinnerForBattle: "PLAYER" | "ENEMY" | null = null;
    let officialRaidEventsForBattle: ServerBattleEvent[] = [];
    let officialRaidResultForBattle: any | null = null;
    let raidReplayBackground: RaidReplayBackground | undefined;
    let patrolPresentationEntered = false;

    const releaseFailedPatrolTransition = (message: string) => {
      if (mode !== "PATROL") return;
      setBattleState(null);
      setBattleMode(null);
      setTutorialBattleActive(false);
      setBattleLoading(false);
      setErrorMessage(message);
      patrolPresentationEntered = false;
    };

    // レイドボスマスターデータの取得
    let raidInstanceCurrentHp = raidBossHp;
    let bossMaster = {
      id: "BOSS_001",
      boss_name: targetName,
      level: 99,
      max_hp: raidBossMaxHp,
      atk: 250,
      def: 150,
      spd: 100,
      luk: 5,
      skills: [
        { ...BASIC_ATTACK_SKILL, id: "boss_basic_attack" }
      ]
    };

    if (mode === "PATROL") {
      const npcMaster = patrolNpcOverride || patrolNpcs.find(n => n.id === areaIdOrOpponentUserId);
      if (npcMaster) {
        const enemyData = npcMaster.enemy_data || {};
        bossMaster = {
          id: npcMaster.id,
          boss_name: npcMaster.npc_name,
          level: npcMaster.npc_level || npcMaster.level || 1,
          max_hp: enemyData.hp || npcMaster.hp || 1000,
          atk: enemyData.atk || npcMaster.atk || 100,
          def: enemyData.def || npcMaster.def || 100,
          spd: enemyData.spd || npcMaster.spd || 100,
          luk: enemyData.luk || npcMaster.luk || 10,
          skills: (((enemyData.skills || (typeof npcMaster.skills === "string" ? JSON.parse(npcMaster.skills) : npcMaster.skills) || []) as any[])
            .map(canonicalParticipantSkill).filter(Boolean) as any[]).concat([{ ...BASIC_ATTACK_SKILL, id: "quest_canonical_basic_attack" }])
        };
      }
    }

    if (mode === "RAID" && !savedRoomReceipt) {
      try {
        const { data: currentRaids, error: raidsError } = roomBriefing
          ? await supabase.rpc("get_raid_room_v1", { p_room_id: roomBriefing.roomId }).then(({ data, error }: any) => ({ data: data ? [{ id: roomBriefing.raidBossInstanceId, bossMasterId: roomBriefing.raidVariantId, currentHp: data.hp?.value?.current }] : [], error }))
          : await supabase.rpc("get_active_raids");
        if (staleRoomUser()) return;
        const currentRaid = Array.isArray(currentRaids)
          ? currentRaids.find((entry: any) => String(entry.id) === String(areaIdOrOpponentUserId))
          : null;
        if (raidsError || !currentRaid) throw raidsError || new Error("Selected Raid is no longer active.");
        const { data: dbMaster, error: masterError } = await supabase.from("raid_boss_master")
          .select("*")
          .eq("id", currentRaid.bossMasterId)
          .maybeSingle();
        if (staleRoomUser()) return;
        if (masterError || !dbMaster) throw masterError || new Error("Raid boss master is unavailable.");
        raidInstanceCurrentHp = Number(currentRaid.currentHp ?? dbMaster.max_hp);
        if (dbMaster) {
          bossMaster = {
            id: dbMaster.id,
            boss_name: dbMaster.boss_name,
            level: dbMaster.level || 99,
            max_hp: Number(dbMaster.max_hp),
            atk: dbMaster.atk || 250,
            def: dbMaster.def || 150,
            spd: dbMaster.spd || 100,
            luk: dbMaster.luk || 5,
            skills: typeof dbMaster.skills === "string" ? JSON.parse(dbMaster.skills) : dbMaster.skills
          };
        }
      } catch (err) {
        if (staleRoomUser()) return;
        console.warn("Failed to load raid boss master:", err);
        setBattleLoading(false);
        setErrorMessage("レイド情報を確認できませんでした。レイド画面へ戻って、もう一度お試しください。");
        return;
      }

      // 支配ギルドボーナスの判定
      let isControlledByUs = false;
      if (areaIdOrOpponentUserId) {
        try {
          const { data: publicBaseControls } = await supabase.rpc("get_public_guild_base_controls");
          if (staleRoomUser()) return;
          const baseControls = (publicBaseControls || []).filter(
            (control: any) => control.base_id === areaIdOrOpponentUserId,
          );
          if (baseControls && baseControls.length > 0) {
            const controllingRecord = baseControls.find((control: any) => control.is_controlling);
            const topGuildId = controllingRecord?.guild_id;
            const myGuildId = userGuildMember?.guild_id;
            if (myGuildId && topGuildId === myGuildId) {
              isControlledByUs = true;
            }
          }
        } catch (err) {
          console.warn("Failed to evaluate control bonus:", err);
        }
      }
      setHasRaidControlBonus(isControlledByUs);
    }

    if (mode === "PVP" || mode === "PVP_PRACTICE") {
      // Cost consumption, canonical rosters and the random seed are committed
      // together by start_pvp_battle below.
      setOpponentPoints(oppPoints || 1000);
      setEnemyTactic(oppTactic || "OFFENSIVE");
    }

    setBattleMode(mode);
    setBattleOpponentName(targetName);
    
    if (mode === "RAID") {
      // Attempt count and currency are committed atomically by start_raid_battle.
    }
    
    if (mode === "GVG") {
      if (areaIdOrOpponentUserId?.startsWith("gvg_match:")) {
        const { data, error } = await supabase.rpc("begin_gvg_attack", {
          p_match_session_id: areaIdOrOpponentUserId.slice("gvg_match:".length),
        });
        if (error || !data?.attack_id) {
          setErrorMessage(error?.message || "公式GvG攻撃を開始できませんでした。");
          setBattleLoading(false);
          return;
        }
        officialGvgDefenseDeck = data.defense_deck;
        officialGvgAttackIdForBattle = data.attack_id;
        setOfficialGvgAttackId(data.attack_id);
        setVitality(Number(data.remaining_ap ?? Math.max(0, vitality - 20)));
      }
      if (areaIdOrOpponentUserId && !areaIdOrOpponentUserId.startsWith("npc_dummy")) {
        setGvgTargetBaseId(areaIdOrOpponentUserId);
      } else {
        setGvgTargetBaseId(null);
      }
      
      // 本番侵攻の行動力消費
      if (!officialGvgAttackIdForBattle && !areaIdOrOpponentUserId?.startsWith("npc_dummy")) {
        if (vitality < 20) {
          setErrorMessage("行動力が不足しています。");
          setBattleLoading(false);
          return;
        }
        try {
          const res = await supabase.rpc("consume_vitality_for_gvg", { p_user_id: session.user.id, p_cost: 20 });
          if (res.error) {
            setErrorMessage("行動力が不足しています。");
            setBattleLoading(false);
            return;
          }
          setVitality(prev => prev - 20);
        } catch (err) {
          console.warn("GVG consume vitality error", err);
          setBattleLoading(false);
          return;
        }
      }
    } else {
      setGvgTargetBaseId(null);
    }

    // PvP preparation and commit are two separate UI phases. Both must read the
    // same server-owned Main Formation instead of re-reading mutable patrol UI
    // state, otherwise the commit phase can replace a visible deck with zero
    // participants.
    let party = selectedMembers.length > 0 ? selectedMembers : userCharactersDbList.slice(0, 5).map(c => c.character_id);
    let battleUserCharacters = userCharactersDbList;
    let battleUserSkills = userSkillsList;
    let battleUserEquipments = userEquipmentsList;
    const retryCharacters = roomBriefing ? roomAttemptRef.current?.characters() : null;
    if (retryCharacters) party = retryCharacters;
    if ((mode === "PVP" || mode === "RAID") && !retryCharacters) {
      const { data: mainFormation, error: mainFormationError } = await supabase.rpc("get_current_main_formation");
      if (staleRoomUser()) return;
      const canonicalParty = Array.isArray(mainFormation?.characters)
        ? mainFormation.characters.map((entry: any) => String(entry.character_id || "")).filter(Boolean).slice(0, 5)
        : [];
      if (mainFormationError || canonicalParty.length === 0) {
        setBattleLoading(false);
        setErrorMessage("出撃編成を確認できませんでした。編成を保存してから、もう一度お試しください。");
        return;
      }
      party = canonicalParty;
      if (party.some((characterId) => !battleUserCharacters.some((owned: any) => owned.character_id === characterId))) {
        const [{ data: ownedRows, error: ownedError }, { data: skillRows }, { data: equipmentRows }] = await Promise.all([
          supabase.from("user_characters").select("*").in("character_id", party),
          supabase.from("user_skills").select("*"),
          supabase.from("user_equipments").select("*"),
        ]);
        if (staleRoomUser()) return;
        if (ownedError || !ownedRows?.length) {
          setBattleLoading(false);
          setErrorMessage("出撃メンバーを読み込めませんでした。もう一度お試しください。");
          return;
        }
        battleUserCharacters = ownedRows;
        battleUserSkills = skillRows || [];
        battleUserEquipments = equipmentRows || [];
      }
    }
    const userCharRecords = party.map(charId => battleUserCharacters.find((c: any) => c.character_id === charId)).filter(Boolean);

    // AP remains presentation compatibility state only; Canonical Gameplay does not consume it.
    setMaxAp(0);
    setAp(0);

    // 味方部隊の個別ステータス構築
    let initialPlayerParty: ParticipantState[] = savedRoomReceipt
      ? patrolSnapshotToParticipants(savedRoomReceipt.player_snapshot, false) : userCharRecords.map((charRecord, idx) => {
      const stats = getCharacterTotalStats(charRecord, battleUserEquipments);
      const master = CHARACTERS_MASTER.find(c => c.id === charRecord.character_id);

      let finalHp = stats.hp;
      let finalAtk = stats.atk;
      let hasBonus = false;
      let bonusLabel = "";

      if (mode === "GVG" && userGuild && master && master.alignment) {
        if (userGuild.main_alignment && master.alignment === userGuild.main_alignment) {
          finalHp = Math.floor(stats.hp * 1.20);
          finalAtk = Math.floor(stats.atk * 1.20);
          hasBonus = true;
          bonusLabel = " (主属性一致 +20%)";
        } else if (userGuild.sub_alignment && master.alignment === userGuild.sub_alignment) {
          finalHp = Math.floor(stats.hp * 1.10);
          finalAtk = Math.floor(stats.atk * 1.10);
          hasBonus = true;
          bonusLabel = " (副属性一致 +10%)";
        }
      }

      // キャラクターごとの装備スキルを取得
      const charSkills = battleUserSkills
        .filter(us => us.equipped_character_id === charRecord.id && us.slot_index !== null)
        .map(canonicalParticipantSkill)
        .filter(Boolean) as any[];

      // Every combatant needs a damage action. Tutorial gacha can award a
      // support-only skill, and an empty/support-only loadout otherwise stalls
      // until the round limit and incorrectly defeats a new player.
      if (!charSkills.some(skill => skill.effect_type === "ATTACK")) {
        charSkills.push({ ...BASIC_ATTACK_SKILL, id: `basic_attack_${charRecord.id}`, ownerId: charRecord.character_id });
      }

      return {
        id: `ally_${charRecord.character_id}`,
        name: (master?.jpName || "味方") + bonusLabel,
        characterId: charRecord.character_id,
        alignment: master?.alignment || "ORDER",
        level: charRecord.level,
        hp: finalHp,
        maxHp: finalHp,
        shield: 0,
        isDead: false,
        isEnemy: false,
        tauntTurns: 0,
        stunTurns: 0,
        stats: {
          ...stats,
          hp: finalHp,
          atk: finalAtk
        },
        skills: charSkills
      };
    });

    setPlayerPartyStates(initialPlayerParty);

    // 敵（エネミー）部隊の構築
    let initialEnemyParty: ParticipantState[] = savedRoomReceipt ? patrolSnapshotToParticipants(savedRoomReceipt.enemy_snapshot, true) : [];
    let loadedRealEnemy = Boolean(savedRoomReceipt);

    if (mode === "PATROL") {
      initialEnemyParty = [{
        id: "ENEMY",
        name: bossMaster.boss_name,
        characterId: bossMaster.id,
        alignment: "CHAOS",
        level: bossMaster.level,
        hp: bossMaster.max_hp,
        maxHp: bossMaster.max_hp,
        shield: 0,
        isDead: false,
        isEnemy: true,
        tauntTurns: 0,
        stunTurns: 0,
        stats: {
          hp: bossMaster.max_hp,
          atk: bossMaster.atk,
          def: bossMaster.def,
          spd: bossMaster.spd,
          luk: bossMaster.luk
        },
        skills: (bossMaster.skills.map(canonicalParticipantSkill).filter(Boolean) as any[]).concat([
          { ...BASIC_ATTACK_SKILL, id: "quest_canonical_basic_attack", ownerId: bossMaster.id }
        ])
      }];
      loadedRealEnemy = true;
    } else if (mode === "PVP" && areaIdOrOpponentUserId && !areaIdOrOpponentUserId.startsWith("npc_dummy_")) {
      try {
        const { data: publicRoster, error: rosterError } = await supabase.rpc("get_public_battle_roster", { p_target_user_id: areaIdOrOpponentUserId });
        const dbChars = (publicRoster?.characters || []).map((character: any) => ({
          ...character,
          id: character.id,
          user_id: areaIdOrOpponentUserId
        }));

        if (!rosterError && dbChars.length > 0) {
          const charIds = dbChars.map((c: any) => c.id);
          const enemyEquips = dbChars.flatMap((character: any) => (character.equipments || []).map((equipment: any) => ({ ...equipment, equipped_character_id: character.id })));
          const enemySkills = dbChars.flatMap((character: any) => (character.skills || []).map((skill: any) => ({ ...skill, id: `${character.id}_${skill.skill_card_id}`, equipped_character_id: character.id })));

          // 対戦相手の防衛デッキのキャラクター順序を再現
          let sortedEnemyChars = [...dbChars];
          if (opponentDefenseCharIds && opponentDefenseCharIds.length > 0) {
            sortedEnemyChars = opponentDefenseCharIds.map(id => {
              return dbChars.find((c: any) => c.id === id || c.character_id === id || c.character_id === id.replace("c_", ""));
            }).filter(Boolean);
          }
          if (sortedEnemyChars.length === 0) {
            sortedEnemyChars = dbChars.slice(0, 5);
          }

          initialEnemyParty = sortedEnemyChars.map((charRecord, idx) => {
            const stats = getCharacterTotalStats(charRecord, enemyEquips);
            const master = CHARACTERS_MASTER.find(c => c.id === charRecord.character_id);

            let finalHp = stats.hp;
            let finalAtk = stats.atk;
            let bonusLabel = "";

            // 敵ギルドメイン・サブアライメント一致防衛ボーナス適用
            if (opponentMainAlign && master && master.alignment === opponentMainAlign) {
              finalHp = Math.floor(stats.hp * 1.20);
              finalAtk = Math.floor(stats.atk * 1.20);
              bonusLabel = " (主属性一致 +20%)";
            } else if (opponentSubAlign && master && master.alignment === opponentSubAlign) {
              finalHp = Math.floor(stats.hp * 1.10);
              finalAtk = Math.floor(stats.atk * 1.10);
              bonusLabel = " (副属性一致 +10%)";
            }

            const charSkills = enemySkills
              .filter((us: any) => us.equipped_character_id === charRecord.id && us.slot_index !== null)
              .map(canonicalParticipantSkill)
              .filter(Boolean) as any[];

            if (charSkills.length === 0) {
              charSkills.push({ ...BASIC_ATTACK_SKILL, id: `enemy_basic_attack_${idx}`, ownerId: charRecord.character_id });
            }

            return {
              id: `enemy_${charRecord.character_id}`,
              name: (master?.jpName || "敵キャラクター") + bonusLabel,
              characterId: charRecord.character_id,
              alignment: master?.alignment || "ORDER",
              level: charRecord.level,
              hp: finalHp,
              maxHp: finalHp,
              shield: 0,
              isDead: false,
              isEnemy: true,
              tauntTurns: 0,
              stunTurns: 0,
              stats: {
                ...stats,
                hp: finalHp,
                atk: finalAtk
              },
              skills: charSkills
            };
          });
          loadedRealEnemy = true;
        }
      } catch (err: any) {
        console.warn("Failed to load real opponent team, falling back to dummy NPC:", err.message);
      }
    }

    // GvG リアル対戦相手（または演習相手）のロード
    if (mode === "GVG" && officialGvgDefenseDeck) {
      initialEnemyParty = gvgDefenseSnapshotToParticipants(officialGvgDefenseDeck);
      loadedRealEnemy = initialEnemyParty.length > 0;
    }
    if (mode === "GVG" && areaIdOrOpponentUserId && !officialGvgDefenseDeck) {
      try {
        const myGuildId = userGuildMember?.guild_id || "";
        const isPractice = areaIdOrOpponentUserId === myGuildId;

        if (myGuildId) {
          let oppGuildId = myGuildId;

          if (!isPractice) {
            // シーズン経過日数の取得
            const { data: dayRec } = await supabase.from("gvg_season_status").select("current_day").eq("id", 1).maybeSingle();
            const currentDay = dayRec?.current_day || 1;
            const isFinalDay = currentDay === 7;

            // マッチング情報の取得
            const { data: matchRecs } = await supabase
              .from("gvg_matches")
              .select("*")
              .eq("status", "ONGOING")
              .eq("is_finals", isFinalDay);
            
            let myMatch = null;
            if (matchRecs) {
              myMatch = matchRecs.find((m: any) => m.guild_a_id === myGuildId || m.guild_b_id === myGuildId);
            }

            if (myMatch) {
              oppGuildId = myMatch.guild_a_id === myGuildId ? myMatch.guild_b_id : myMatch.guild_a_id;
            }
          }

          // 相手（または自ギルド）の守備デッキを取得
          const { data: oppDecks } = await supabase
            .from("gvg_defense_decks")
            .select("*")
            .eq("guild_id", oppGuildId);

          if (oppDecks && oppDecks.length > 0) {
            // ランダムに1件選択
            const randomDeck = oppDecks[Math.floor(Math.random() * oppDecks.length)];
            const opponentUserId = randomDeck.user_id;

            // 相手ユーザー情報を取得
            const { data: oppProfiles } = await supabase.rpc("get_public_profiles", { p_user_ids: [opponentUserId] });
            const oppUser = oppProfiles?.[0];

            const oppUsername = oppUser?.username || "対戦相手";

            // キャラクターID配列を抽出 (character_1_id 〜 character_5_id)
            const charIds = [
              randomDeck.character_1_id,
              randomDeck.character_2_id,
              randomDeck.character_3_id,
              randomDeck.character_4_id,
              randomDeck.character_5_id
            ].filter(Boolean);

            if (charIds.length > 0) {
              // キャラクター・装備・スキルのロード
              const { data: publicRoster, error: rosterError } = await supabase.rpc("get_public_battle_roster_by_character_ids", { p_character_ids: charIds });
              const dbChars = (publicRoster || []).map((character: any) => ({ ...character, user_id: "public" }));

              if (!rosterError && dbChars.length > 0) {
                // ソート順の維持
                const sortedChars = charIds.map(cid => dbChars.find((c: any) => c.id === cid)).filter(Boolean);

                const enemyEquips = dbChars.flatMap((character: any) => (character.equipments || []).map((equipment: any) => ({ ...equipment, equipped_character_id: character.id })));
                const enemySkills = dbChars.flatMap((character: any) => (character.skills || []).map((skill: any) => ({ ...skill, id: `${character.id}_${skill.skill_card_id}`, equipped_character_id: character.id })));

                // 支配ギルド判定 (防衛バフ +10% 適用)
                let isOpponentControlling = false;
                if (!isPractice) {
                  const { data: publicBaseControls } = await supabase.rpc("get_public_guild_base_controls");
                  const baseControl = (publicBaseControls || []).find(
                    (control: any) =>
                      control.base_id === areaIdOrOpponentUserId && control.guild_id === oppGuildId,
                  );
                  isOpponentControlling = Boolean(baseControl?.is_controlling);
                }

                const baseNames: { [key: string]: string } = {
                  neon_tower: "ネオンタワー",
                  deep_dock: "ディープドック",
                  junk_bazar: "ジャンクバザール",
                  kitakura_gate: "キタクラゲート"
                };
                const baseName = baseNames[areaIdOrOpponentUserId] || "GvGエリア";
                const teamLabel = isPractice ? "防衛演習" : `${baseName}防衛チーム`;

                initialEnemyParty = sortedChars.map((charRecord: any, idx) => {
                  const stats = getCharacterTotalStats(charRecord, enemyEquips);
                  const master = CHARACTERS_MASTER.find(c => c.id === charRecord.character_id);

                  let finalHp = stats.hp;
                  let finalAtk = stats.atk;
                  let buffLabel = "";

                  if (isOpponentControlling) {
                    finalHp = Math.floor(stats.hp * 1.10);
                    finalAtk = Math.floor(stats.atk * 1.10);
                    buffLabel = " (支配バフ +10%)";
                  }

                  const charSkills = enemySkills
                    .filter((us: any) => us.equipped_character_id === charRecord.id && us.slot_index !== null)
                    .map(canonicalParticipantSkill)
                    .filter(Boolean) as any[];

                  if (charSkills.length === 0) {
                    charSkills.push({ ...BASIC_ATTACK_SKILL, id: `enemy_basic_attack_${idx}`, ownerId: charRecord.character_id });
                  }

                  return {
                    id: `enemy_${charRecord.character_id}`,
                    name: `${master?.jpName || "敵キャラクター"}${buffLabel} (${teamLabel})`,
                    characterId: charRecord.character_id,
                    alignment: master?.alignment || "ORDER",
                    level: charRecord.level,
                    hp: finalHp,
                    maxHp: finalHp,
                    shield: 0,
                    isDead: false,
                    isEnemy: true,
                    tauntTurns: 0,
                    stunTurns: 0,
                    stats: {
                      ...stats,
                      hp: finalHp,
                      atk: finalAtk
                    },
                    skills: charSkills
                  };
                });

                loadedRealEnemy = true;

                // 実戦時のみ、相手ギルドチャットへシステム警告を投稿
                if (!isPractice) {
                  const myUser = session.user.user_metadata?.username || "他ギルドのプレイヤー";
                  await supabase.from("board_posts").insert({
                    user_id: session.user.id,
                    author_name: "GvG警報",
                    content: `【GvG警告】他ギルドの ${myUser} から、我がギルドの守備メンバー ${oppUsername} への攻撃を受けました！`,
                    target_type: "GUILD",
                    target_id: oppGuildId,
                    is_system: true
                  });
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.warn("Failed to load GvG opponent, falling back to official NPC:", err.message);
      }
    }

    if (!loadedRealEnemy && mode === "PVP") {
      setBattleLoading(false);
      setBattleMode(null);
      setBattleOpponentName("");
      setErrorMessage("対戦相手の防衛編成を取得できませんでした。対戦相手一覧へ戻って、もう一度お試しください。");
      pendingPvpStartRef.current = null;
      return;
    }

    if (!loadedRealEnemy) {
      if (mode === "PVP" || mode === "PVP_PRACTICE" || mode === "GVG") {
        const baseHp = mode === "GVG" ? 1400 : 1200;
        const myGuildId = userGuildMember?.guild_id || "";
        const isPractice = areaIdOrOpponentUserId === myGuildId;

        const baseNames: { [key: string]: string } = {
          neon_tower: "ネオンタワー",
          deep_dock: "ディープドック",
          junk_bazar: "ジャンクバザール",
          kitakura_gate: "キタクラゲート"
        };
        const baseName = (mode === "GVG" && areaIdOrOpponentUserId) ? baseNames[areaIdOrOpponentUserId] || "GvGエリア" : "GvGエリア";
        const teamLabel = isPractice ? "防衛演習" : `${baseName}防衛チーム`;

        if (mode === "GVG") {
          const gvgNpcs = ENEMIES_MASTER.filter(e => e.enemy_type === "GVG_NPC_DEFENSE");
          initialEnemyParty = gvgNpcs.map((npc, idx) => {
            return {
              id: `enemy_${npc.id}`,
              name: `${npc.name} (${teamLabel})`,
              characterId: npc.id,
              alignment: "CHAOS",
              level: npc.level,
              hp: npc.hp,
              maxHp: npc.hp,
              shield: 0,
              isDead: false,
              isEnemy: true,
              tauntTurns: 0,
              stunTurns: 0,
              stats: { hp: npc.hp, atk: npc.atk, def: npc.def, spd: npc.spd, luk: npc.luk },
              skills: npc.skills.map(s => ({ ...s, ownerId: npc.id }))
            };
          });
        } else {
          // PVP
          const pvpDummies = ENEMIES_MASTER.filter(e => e.enemy_type === "PVP_DUMMY");
          initialEnemyParty = pvpDummies.map((npc, idx) => {
            return {
              id: `enemy_${npc.id}`,
              name: npc.name,
              characterId: npc.id,
              alignment: "CHAOS",
              level: npc.level,
              hp: npc.hp,
              maxHp: npc.hp,
              shield: 0,
              isDead: false,
              isEnemy: true,
              tauntTurns: 0,
              stunTurns: 0,
              stats: { hp: npc.hp, atk: npc.atk, def: npc.def, spd: npc.spd, luk: npc.luk },
              skills: npc.skills.map(s => ({ ...s, ownerId: npc.id }))
            };
          });
        }
      } else {
        // レイド戦の場合は巨大ボス1体 (マスタ値に基づく動的構築)
        initialEnemyParty = [{
          id: "ENEMY",
          name: bossMaster.boss_name,
          characterId: "BOSS",
          alignment: "CHAOS",
          level: bossMaster.level,
          hp: raidInstanceCurrentHp,
          maxHp: bossMaster.max_hp,
          shield: 0,
          isDead: false,
          isEnemy: true,
          tauntTurns: 0,
          stunTurns: 0,
          stats: {
            hp: bossMaster.max_hp,
            atk: bossMaster.atk,
            def: bossMaster.def,
            spd: bossMaster.spd,
            luk: bossMaster.luk
          },
          skills: (bossMaster.skills.map(canonicalParticipantSkill).filter(Boolean) as any[]).concat([
            { ...BASIC_ATTACK_SKILL, id: "raid_basic_attack", ownerId: "BOSS" }
          ])
        }];
      }
    }

    setEnemyPartyStates(initialEnemyParty);

    // タイムラインの構築（SPD順で完全ソート）
    const timelineQueue = [
      ...initialPlayerParty.map(p => ({ id: p.id, name: p.name, isEnemy: false, spd: p.stats.spd })),
      ...initialEnemyParty.map(e => ({ id: e.id, name: e.name, isEnemy: true, spd: e.stats.spd }))
    ];
    timelineQueue.sort((a, b) => b.spd - a.spd);

    setTimeline(timelineQueue);
    setTimelineIndex(0);
    setBattleRound(1);

    const startLogs = [`出撃準備完了: VS ${targetName} (${mode}戦)`];
    setBattleLog(startLogs);

    const abortOfficialGvgStart = async (message: string) => {
      if (officialGvgAttackIdForBattle) {
        const { error: cancelError } = await supabase.rpc("cancel_unresolved_gvg_attack", {
          p_attack_id: officialGvgAttackIdForBattle,
        });
        if (cancelError) console.warn("Failed to cancel unresolved official GvG attack:", cancelError.message);
      }
      setOfficialGvgAttackId(null);
      setOfficialGvgReplayId(null);
      setOfficialGvgWinner(null);
      setBattleLoading(false);
      setErrorMessage(message);
    };

    // Practice is deliberately client-local: it reuses the viewer and turn
    // presentation without creating an official replay, consuming PvP Point,
    // or entering any result/reward/ranking contract.
    if (mode !== "PVP_PRACTICE" && !prepareOnly) try {
      if (staleRoomUser()) return;
      const playerSnapshot = participantsToBattleUnits(initialPlayerParty);
      const enemySnapshot = participantsToBattleUnits(initialEnemyParty);
      const replayMode = mode === "PATROL" ? "QUEST" : mode;
      const patrolIdForBattle = patrolIdOverride || patrol?.id || null;
      const replayCreation = replayMode === "QUEST"
        ? await supabase.rpc("create_patrol_battle_replay", {
            p_patrol_id: patrolIdForBattle,
            p_tactic_id: toDeterministicTactic(tactic),
          })
        : replayMode === "PVP"
          ? await supabase.rpc("start_pvp_battle", {
              p_opponent_user_id: areaIdOrOpponentUserId,
              p_character_ids: party,
              p_tactic: toDeterministicTactic(tactic),
            })
        : replayMode === "RAID"
          ? roomBriefing
            ? await (roomAttemptRef.current ??= createPersistentRoomAttempt(roomBriefing.roomId, startingRoomUserId)).start(supabase, party, toDeterministicTactic(tactic))
            : await supabase.rpc("start_raid_battle", {
              p_instance_id: areaIdOrOpponentUserId,
              p_character_ids: party,
              p_tactic: toDeterministicTactic(tactic),
            })
        : await supabase.rpc("create_battle_replay_pending", {
            p_battle_mode: replayMode,
            p_tactic_id: toDeterministicTactic(tactic),
            p_random_seed: Math.floor(Math.random() * 2_000_000_000),
            p_player_snapshot: playerSnapshot,
            p_enemy_snapshot: enemySnapshot,
            p_source_reference_id: officialGvgAttackIdForBattle,
          });
      if (replayMode === "QUEST") {
        writeTutorialBattleTrace("replay_response", {
          accepted: !replayCreation.error && Boolean(replayCreation.data?.replay_session_id),
          replaySessionId: replayCreation.data?.replay_session_id || null,
          errorCode: replayCreation.error?.code || null,
          errorMessage: replayCreation.error?.message || null,
        });
      }
      if (staleRoomUser()) return;
      const error = replayCreation.error;
      const replaySessionId = replayMode === "QUEST"
        ? replayCreation.data?.replay_session_id
        : replayMode === "PVP"
          ? replayCreation.data?.replay_session_id
          : replayMode === "RAID"
            ? replayCreation.data?.replay_session_id
          : replayCreation.data;
      if (error) console.warn("Failed to create replay snapshot:", error.message);
      if (replayMode === "QUEST" && (!replaySessionId || error)) {
        setBattleLoading(false);
        setErrorMessage("NPCバトルの開始をサーバーで確定できませんでした。もう一度お試しください。");
        return;
      }
      if (replayMode === "PVP" && (!replaySessionId || error)) {
        setBattleLoading(false);
        const isInsufficientPoint = error?.code === "23514" || /insufficient pvp points/i.test(error?.message || "");
        setErrorMessage(isInsufficientPoint
          ? "BPが不足しています。回復を待ってから、もう一度お試しください。"
          : battleDisplayText(error?.message) || "バトルの開始をサーバーで確定できませんでした。もう一度お試しください。");
        return;
      }
      if (replayMode === "RAID" && (!replaySessionId || error)) {
        setBattleLoading(false); setErrorMessage(error?.message || "レイド開始をサーバーで確定できませんでした。"); return;
      }
      if (replayMode === "GVG" && (!replaySessionId || error) && !officialGvgAttackIdForBattle) {
        setBattleLoading(false); setErrorMessage(error?.message || "GvGバトルの開始をサーバーで確定できませんでした。"); return;
      }
      if (officialGvgAttackIdForBattle && (!replaySessionId || error)) {
        await abortOfficialGvgStart("公式GvGのサーバー確定に失敗しました。もう一度お試しください。");
        return;
      }
      // GvG gameplay is always resolved by the authoritative server. Official
      // result settlement additionally requires the begin_gvg_attack reference.
      if (replaySessionId && replayMode === "GVG") {
        let { data: resolvedReplay, error: resolveError } = await supabase.functions.invoke("resolve-battle", {
          body: { replaySessionId },
        });
        if (resolveError) {
          // The function may have persisted the result before a transient
          // response failure. Its idempotent read path returns that result.
          const retry = await supabase.functions.invoke("resolve-battle", {
            body: { replaySessionId },
          });
          resolvedReplay = retry.data;
          resolveError = retry.error;
        }
        if (resolveError) {
          console.warn("Failed to resolve replay on the server:", resolveError.message);
          if (officialGvgAttackIdForBattle) await abortOfficialGvgStart("公式GvGのサーバー解決に失敗しました。もう一度お試しください。");
          else { setBattleLoading(false); setErrorMessage("GvGのサーバー解決に失敗しました。もう一度お試しください。"); }
          return;
        }
        if (resolvedReplay?.winner !== "PLAYER" && resolvedReplay?.winner !== "ENEMY") {
          if (officialGvgAttackIdForBattle) await abortOfficialGvgStart("公式GvGのサーバー確定に失敗しました。もう一度お試しください。");
          else { setBattleLoading(false); setErrorMessage("GvGのCanonical結果を取得できませんでした。"); }
          return;
        }
        canonicalAuxEventsForBattle = serverBattleEvents(resolvedReplay.events);
        if (canonicalAuxEventsForBattle.length === 0) {
          if (officialGvgAttackIdForBattle) await abortOfficialGvgStart("公式GvGのCanonical Replayを取得できませんでした。もう一度お試しください。");
          else { setBattleLoading(false); setErrorMessage("GvGのCanonical Replayを取得できませんでした。"); }
          return;
        }
        canonicalAuxReplayIdForBattle = replaySessionId;
        setCanonicalAuxReplayId(replaySessionId);
        setCanonicalAuxEvents(canonicalAuxEventsForBattle);
        setCanonicalAuxEventIndex(0);
        if (officialGvgAttackIdForBattle) {
          officialGvgReplayIdForBattle = replaySessionId;
          setOfficialGvgReplayId(replaySessionId);
          officialGvgWinnerForBattle = resolvedReplay.winner;
          setOfficialGvgWinner(officialGvgWinnerForBattle);
        }
      }
      if (replaySessionId && replayMode === "QUEST") {
        const canonicalPlayers = patrolSnapshotToParticipants(replayCreation.data?.player_snapshot, false);
        const canonicalEnemies = patrolSnapshotToParticipants(replayCreation.data?.enemy_snapshot, true);
        if (canonicalPlayers.length === 0 || canonicalEnemies.length === 0) {
          releaseFailedPatrolTransition("NPCバトルの正規編成を取得できませんでした。もう一度お試しください。");
          return;
        }
        initialPlayerParty = canonicalPlayers;
        initialEnemyParty = canonicalEnemies;
        setPlayerPartyStates(canonicalPlayers);
        setEnemyPartyStates(canonicalEnemies);
        const canonicalTimeline = [
          ...canonicalPlayers.map((participant) => ({ id: participant.id, name: participant.name, isEnemy: false, spd: participant.stats.spd })),
          ...canonicalEnemies.map((participant) => ({ id: participant.id, name: participant.name, isEnemy: true, spd: participant.stats.spd })),
        ].sort((a, b) => b.spd - a.spd || (a.isEnemy === b.isEnemy ? a.id.localeCompare(b.id) : a.isEnemy ? 1 : -1));
        setTimeline(canonicalTimeline);
        setTimelineIndex(0);

        // The replay snapshot is the authoritative hand-off from Encounter to
        // Battle Presentation. Claim the screen before server resolution so a
        // slower mobile request cannot let the tutorial navigation effect put
        // the player back on the quest/dispatch surface while the encounter is
        // being finalized.
        const opponentLeader = canonicalEnemies[0];
        setBattlePresentationContext({
          mode,
          opponentLabel: presentationOverride?.opponentLabel || targetName,
          encounterLabel: presentationOverride?.encounterLabel,
          opponentLeaderCharacterId: presentationOverride?.opponentLeaderCharacterId || opponentLeader?.characterId,
          opponentLeaderName: presentationOverride?.opponentLeaderName || opponentLeader?.name,
          opponentTotalPower: presentationOverride?.opponentTotalPower,
          opponentProfile: presentationOverride?.opponentProfile,
        });
        setBattleState("SETUP");
        patrolPresentationEntered = true;
        writeTutorialBattleTrace("presentation_entered", { accepted: true, replaySessionId });

        let { data: resolvedReplay, error: resolveError } = await supabase.functions.invoke("resolve-battle", {
          body: { replaySessionId },
        });
        if (resolveError && isRetryableResolveFailure(resolveError)) {
          const retry = await supabase.functions.invoke("resolve-battle", { body: { replaySessionId } });
          resolvedReplay = retry.data;
          resolveError = retry.error;
        }
        if (resolveError || (resolvedReplay?.winner !== "PLAYER" && resolvedReplay?.winner !== "ENEMY")) {
          console.warn("Failed to resolve patrol replay on the server:", resolveError?.message);
          releaseFailedPatrolTransition("NPCバトルの勝敗をサーバーで確定できませんでした。もう一度お試しください。");
          return;
        }
        officialPatrolReplayIdForBattle = replaySessionId;
        officialPatrolWinnerForBattle = resolvedReplay.winner;
        officialPatrolEventsForBattle = serverBattleEvents(resolvedReplay.events);
        if (officialPatrolEventsForBattle.length === 0) {
          releaseFailedPatrolTransition("NPCバトルの確定記録を取得できませんでした。もう一度お試しください。");
          return;
        }
        setOfficialPatrolReplayId(replaySessionId);
        setOfficialPatrolWinner(resolvedReplay.winner);
        officialPatrolReplayIdRef.current = replaySessionId;
        officialPatrolWinnerRef.current = resolvedReplay.winner;
        setOfficialPatrolEvents(officialPatrolEventsForBattle);
        setOfficialPatrolEventIndex(0);
        writeTutorialBattleTrace("replay_resolved", {
          accepted: true,
          replaySessionId,
          winner: resolvedReplay.winner,
          playerCharacterIds: canonicalPlayers.map((participant) => participant.characterId),
        });
      }
      if (replaySessionId && replayMode === "PVP") {
        const canonicalPlayers = patrolSnapshotToParticipants(replayCreation.data?.player_snapshot, false);
        const canonicalEnemies = patrolSnapshotToParticipants(replayCreation.data?.enemy_snapshot, true);
        if (canonicalPlayers.length === 0 || canonicalEnemies.length === 0) {
          setBattleLoading(false);
          setErrorMessage("バトルの正規編成を取得できませんでした。もう一度お試しください。");
          return;
        }
        initialPlayerParty = canonicalPlayers;
        initialEnemyParty = canonicalEnemies;
        // Replay events address the immutable snapshot participant IDs
        // (`player_<owned-character-uuid>` / `enemy_<owned-character-uuid>`).
        // Update the synchronous projection refs together with React state so
        // the first DAMAGE event cannot race the post-render ref effects and
        // miss only the player target while an `ally_<master-id>` remains.
        playerPartyStatesRef.current = canonicalPlayers;
        enemyPartyStatesRef.current = canonicalEnemies;
        setPlayerPartyStates(canonicalPlayers);
        setEnemyPartyStates(canonicalEnemies);
        const canonicalTimeline = [
          ...canonicalPlayers.map((participant) => ({ id: participant.id, name: participant.name, isEnemy: false, spd: participant.stats.spd })),
          ...canonicalEnemies.map((participant) => ({ id: participant.id, name: participant.name, isEnemy: true, spd: participant.stats.spd })),
        ].sort((a, b) => b.spd - a.spd || (a.isEnemy === b.isEnemy ? a.id.localeCompare(b.id) : a.isEnemy ? 1 : -1));
        setTimeline(canonicalTimeline);
        setTimelineIndex(0);

        let { data: resolvedReplay, error: resolveError } = await supabase.functions.invoke("resolve-battle", {
          body: { replaySessionId },
        });
        if (resolveError) {
          const retry = await supabase.functions.invoke("resolve-battle", { body: { replaySessionId } });
          resolvedReplay = retry.data;
          resolveError = retry.error;
        }
        const events = serverBattleEvents(resolvedReplay?.events);
        if (resolveError || (resolvedReplay?.winner !== "PLAYER" && resolvedReplay?.winner !== "ENEMY") || events.length === 0) {
          console.warn("Failed to resolve PvP replay on the server:", resolveError?.message);
          setBattleLoading(false);
          setErrorMessage("バトルの勝敗をサーバーで確定できませんでした。もう一度お試しください。");
          return;
        }
        officialPvpReplayIdForBattle = replaySessionId;
        officialPvpWinnerForBattle = resolvedReplay.winner;
        officialPvpEventsForBattle = events;
        officialPvpResultForBattle = resolvedReplay;
        setOfficialPvpReplayId(replaySessionId);
        setOfficialPvpWinner(resolvedReplay.winner);
        setOfficialPvpEvents(events);
        setOfficialPvpEventIndex(0);
        setOfficialPvpResult(resolvedReplay);
        pvpCommitSucceededRef.current = true;
        setPvpPoints(Number(resolvedReplay.remainingPvpPoints ?? replayCreation.data?.remaining_pvp_points ?? Math.max(0, pvpPoints - 1)));
      }
      if (replaySessionId && replayMode === "RAID") {
        const canonicalPlayers = patrolSnapshotToParticipants(replayCreation.data?.player_snapshot, false);
        const canonicalEnemies = patrolSnapshotToParticipants(replayCreation.data?.enemy_snapshot, true);
        let { data: resolvedReplay, error: resolveError } = await supabase.functions.invoke("resolve-battle", { body: { replaySessionId } });
        if (staleRoomUser()) return;
        if (resolveError) { const retry = await supabase.functions.invoke("resolve-battle", { body: { replaySessionId } }); resolvedReplay=retry.data; resolveError=retry.error; }
        if (staleRoomUser()) return;
        const events=serverBattleEvents(resolvedReplay?.events);
        if(resolveError||!resolvedReplay?.winner||!events.length||(roomBriefing && (resolvedReplay.roomId !== roomBriefing.roomId || !["PLAYER", "ENEMY"].includes(resolvedReplay.winner)))){setBattleLoading(false);setErrorMessage("レイド結果をサーバーで確定できませんでした。");return;}
        if (roomBriefing) {
          raidReplayBackground = await loadRaidReplayBackground(async (replayId, userId) => {
            const { data, error } = await supabase.from('battle_replay_sessions')
              .select('id,battle_mode,source_reference_id,official_context')
              .eq('id', replayId).eq('requester_user_id', userId).maybeSingle();
            return { data: data as unknown, error };
          }, {
            replayId: replaySessionId, roomId: roomBriefing.roomId, userId: startingRoomUserId,
            sourceReferenceId: roomBriefing.raidBossInstanceId,
          }, replayCreation.data, resolvedReplay);
          if (staleRoomUser()) return;
        }
        const { data: grantedRewards, error: rewardProjectionError } = roomBriefing
          ? { data: [], error: null }
          : await supabase.rpc("get_current_raid_battle_rewards", { p_replay_id: replaySessionId });
        if (rewardProjectionError) {
          // Battle finalization has already succeeded. Never start another
          // Raid attempt merely because the read-only reward projection had a
          // transient failure; the Result remains recoverable from the replay.
          console.warn("Failed to read finalized Raid rewards:", rewardProjectionError.message);
        }
        resolvedReplay = {
          ...resolvedReplay,
          roomId: roomBriefing?.roomId,
          rewardProjectionUnavailable: Boolean(rewardProjectionError),
          grantedRewards: (!rewardProjectionError && Array.isArray(grantedRewards) ? grantedRewards : []).map((entry: any) => ({
            itemId: String(entry.itemId || ""),
            name: canonicalItemName(String(entry.itemId || "")),
            quantity: Number(entry.quantity || 0),
          })),
        };
        initialPlayerParty=canonicalPlayers; initialEnemyParty=canonicalEnemies;
        // レイドReplayも不変Snapshotの参加者IDを使う。最初のACTIONより前に
        // PvPと同じく同期参照も揃え、描画後Effectとの競合を防ぐ。
        playerPartyStatesRef.current=canonicalPlayers; enemyPartyStatesRef.current=canonicalEnemies;
        setPlayerPartyStates(canonicalPlayers); setEnemyPartyStates(canonicalEnemies);
        setTimeline([...canonicalPlayers.map(p=>({id:p.id,name:p.name,isEnemy:false,spd:p.stats.spd})),...canonicalEnemies.map(p=>({id:p.id,name:p.name,isEnemy:true,spd:p.stats.spd}))].sort((a,b)=>b.spd-a.spd));
        officialRaidReplayIdForBattle=replaySessionId; officialRaidWinnerForBattle=resolvedReplay.winner; officialRaidEventsForBattle=events; officialRaidResultForBattle=resolvedReplay;
        setOfficialRaidReplayId(replaySessionId);setOfficialRaidWinner(resolvedReplay.winner);setOfficialRaidEvents(events);setOfficialRaidEventIndex(0);setOfficialRaidResult(resolvedReplay);
        raidCommitSucceededRef.current = true;
        if (roomBriefing) roomPresentationUserRef.current = startingRoomUserId;
        if (!roomBriefing || !roomAttemptRef.current?.isRecovered()) {
          setRaidPoints?.(Number(replayCreation.data?.remaining_raid_points ?? Math.max(0, (raidPoints ?? 0) - 1)));
          setRaidFirstEntryFree?.(false);
        } else {
          try {
            const currentAttempt = await supabase.rpc("get_current_raid_attempt_state");
            if (staleRoomUser()) return;
            if (!currentAttempt.error && currentAttempt.data) {
              setRaidPoints?.(Number(currentAttempt.data.raidPoints ?? 0));
              setRaidFirstEntryFree?.(Boolean(currentAttempt.data.firstEntryFree));
            }
          } catch (error) {
            // 現在値の参照失敗は確定済み戦闘を再開始する理由にしない。
            if (staleRoomUser()) return;
            console.warn("Failed to refresh current Raid attempts:", error);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to create replay snapshot:", err);
      writeTutorialBattleTrace("start_exception", {
        accepted: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      if (staleRoomUser()) return;
      if (mode === "RAID" && roomBriefing) {
        setBattleLoading(false);
        setErrorMessage("レイドの開始・結果を確認できませんでした。同じ出撃を再確認してください。");
        return;
      }
      if (officialGvgAttackIdForBattle) {
        await abortOfficialGvgStart("公式GvGのサーバー確定に失敗しました。もう一度お試しください。");
        return;
      }
      if (mode === "PATROL") {
        releaseFailedPatrolTransition("NPCバトルの開始処理に失敗しました。もう一度お試しください。");
        return;
      }
    }

    if (mode === "PVP_PRACTICE") {
      const practiceResult = resolveDeterministicBattle({
        seed: Math.floor(Math.random() * 2_000_000_000) || 1,
        tactic: toDeterministicTactic(tactic),
        maxRounds: 20,
        player: participantsToBattleUnits(initialPlayerParty),
        enemy: participantsToBattleUnits(initialEnemyParty),
      });
      canonicalAuxReplayIdForBattle = `practice_${Date.now()}`;
      canonicalAuxEventsForBattle = serverBattleEvents(practiceResult.events);
      setCanonicalAuxReplayId(canonicalAuxReplayIdForBattle);
      setCanonicalAuxEvents(canonicalAuxEventsForBattle);
      setCanonicalAuxEventIndex(0);
      setOfficialPvpWinner(practiceResult.winner);
    }

    const opponentLeader = initialEnemyParty[0];
    const presentationContextForBattle: BattlePresentationContext = {
      mode,
      raidRoomId: roomBriefing?.roomId,
      roundLimit: mode === "RAID" ? 30 : mode === "PVP" || mode === "PVP_PRACTICE" || mode === "GVG" ? 20 : 15,
      opponentLabel: presentationOverride?.opponentLabel || targetName,
      encounterLabel: presentationOverride?.encounterLabel,
      opponentLeaderCharacterId: presentationOverride?.opponentLeaderCharacterId || opponentLeader?.characterId,
      opponentLeaderName: presentationOverride?.opponentLeaderName || opponentLeader?.name,
      opponentTotalPower: presentationOverride?.opponentTotalPower,
      opponentProfile: presentationOverride?.opponentProfile,
      backgroundPath: raidReplayBackground?.backgroundPath ?? presentationOverride?.backgroundPath,
      backgroundLabel: raidReplayBackground?.backgroundLabel ?? presentationOverride?.backgroundLabel,
      opponentSkills: presentationOverride?.opponentSkills,
    };

    if (staleRoomUser()) return;
    let roomCompatibilitySaved = false;
    // 旧セッションは中断再開の互換用。再生UI移行後に廃止する。
    if (mode !== "PVP_PRACTICE" && !prepareOnly) try {
      const existingRoomSession = roomBriefing && officialRaidReplayIdForBattle
        ? await supabase.from("battle_sessions").select("id").eq("user_id", startingRoomUserId)
            .eq("status", "ACTIVE").eq("player_state->>officialRaidReplayId", officialRaidReplayIdForBattle).maybeSingle()
        : { data: null, error: null };
      if (staleRoomUser()) return;
      if (existingRoomSession.error) throw existingRoomSession.error;
      const { data: sessionData, error: sessionError } = existingRoomSession.data
        ? existingRoomSession
        : await supabase.from("battle_sessions").insert({
        user_id: session.user.id,
        battle_type: mode,
        target_id: targetName,
        player_state: {
          playerStates: initialPlayerParty, ap: 0, maxAp: 0, tactic: "OFFENSIVE", log: startLogs, timelineIndex: 0,
          gvgAreaId: (mode === "GVG" ? areaIdOrOpponentUserId : null),
          officialGvgAttackId: officialGvgAttackIdForBattle,
          officialGvgReplayId: officialGvgReplayIdForBattle,
          officialGvgWinner: officialGvgWinnerForBattle,
          canonicalAuxReplayId: canonicalAuxReplayIdForBattle,
          canonicalAuxEvents: canonicalAuxEventsForBattle,
          canonicalAuxEventIndex: 0,
          officialPatrolReplayId: officialPatrolReplayIdForBattle,
          officialPatrolWinner: officialPatrolWinnerForBattle,
          officialPatrolEvents: officialPatrolEventsForBattle,
          officialPatrolEventIndex: 0,
          officialPvpReplayId: officialPvpReplayIdForBattle,
          officialPvpWinner: officialPvpWinnerForBattle,
          officialPvpEvents: officialPvpEventsForBattle,
          officialPvpEventIndex: 0,
          officialPvpResult: officialPvpResultForBattle,
          officialRaidReplayId: officialRaidReplayIdForBattle, officialRaidWinner: officialRaidWinnerForBattle,
          officialRaidEvents: officialRaidEventsForBattle, officialRaidEventIndex: 0, officialRaidResult: officialRaidResultForBattle,
          battlePresentationContext: presentationContextForBattle,
        },
        enemy_state: { enemyStates: initialEnemyParty },
        status: "ACTIVE"
      }).select().single();

      if (staleRoomUser()) return;
      if (sessionError) throw sessionError;
      if (sessionData) { setBattleSessionId(sessionData.id); roomCompatibilitySaved = true; }
    } catch (err) {
      console.warn(err);
    }

    if (staleRoomUser()) return;
    setBattlePresentationContext(presentationContextForBattle);
    if (!patrolPresentationEntered) setBattleState("SETUP");
    setBattleLoading(false);
    if (roomBriefing && roomCompatibilitySaved && raidCommitSucceededRef.current) {
      try {
        const attempt = roomAttemptRef.current;
        if (attempt) {
          const ack = await supabase.rpc("acknowledge_raid_room_battle_recovery_v1", { p_request_id: attempt.requestId() });
          if (staleRoomUser()) return;
          if (ack.error || ack.data?.status !== "acknowledged" || ack.data.requestId !== attempt.requestId()) throw new Error("出撃結果の確認記録を保存できませんでした。");
          attempt.clear();
        }
      } catch (error) {
        // 保存済み結果は表示できる。削除失敗でも次回は同じサーバーReplayのみ再確認する。
        console.warn("Failed to clear saved Room request:", error);
      }
    }
  }

export function useBattle(options: UseBattleOptions) {
  const {
    session,
    userCharactersDbList,
    userEquipmentsList,
    userSkillsList,
    selectedMembers,
    selectedLeader,
    userGuild,
    userGuildMember,
    gvgBaseControls,
    currentBaseId,
    username,
    playCyberSe,
    syncBootstrapData,
    pvpPoints,
    setPvpPoints,
    userLevel,
    setUserLevel,
    userXp,
    setUserXp,
    vitality,
    setVitality,
    pvpRate,
    setPvpRate,
    pvpRankings,
    raidPoints,
    setRaidPoints,
    setRaidFirstEntryFree,
    requestRaidTopRefresh,
    cash,
    setCash,
    diamonds,
    setDiamonds,
    raidBossHp,
    raidBossMaxHp,
    raidTotalDamage,
    setRaidTotalDamage,
    setErrorMessage,
    addGuildXpAndContributionByAction,
    setConfirmDialogConfig,
    setGlobalInteractionBlocking,
    patrolNpcs = [],
    patrol,
    tutorialStep,
    setTutorialStep,
    navigateTab,
  } = options;

  const [battleSessionId, setBattleSessionId] = useState<string | null>(null);
  const [battleMode, setBattleMode] = useState<BattleMode | null>(null);
  const [hasRaidControlBonus, setHasRaidControlBonus] = useState<boolean>(false);
  const [battleOpponentName, setBattleOpponentName] = useState<string>("");
  const [battleState, setBattleState] = useState<"SETUP" | "PLAYING" | "ENDING" | "OUTCOME" | "RESULT" | null>(null);
  // Capture the encounter kind when the authoritative battle is opened.
  // The onboarding bootstrap may refresh while a replay is playing; result
  // ownership must not be reclassified from that mutable snapshot.
  const [tutorialBattleActive, setTutorialBattleActive] = useState(false);
  const [battleOutcome, setBattleOutcome] = useState<"VICTORY" | "DEFEAT" | null>(null);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [ap, setAp] = useState<number>(0);
  const [maxAp, setMaxAp] = useState<number>(0);
  const [tactic, setTactic] = useState<CompatibleBattleTacticId>("ATTACK_PRIORITY");
  const [battleSpeed, setBattleSpeed] = useState<number>(2); // 1 = 1x, 2 = 2x（初期値）
  const [isAutoPaused, setIsAutoPaused] = useState<boolean>(false);
  const [gvgTargetBaseId, setGvgTargetBaseId] = useState<string | null>(null);
  const [battleLoading, setBattleLoading] = useState<boolean>(false);
  const battleStartInFlightRef = useRef(false);
  const battleEndingInFlightRef = useRef(false);
  const pendingPvpStartRef = useRef<any[] | null>(null);
  const pvpCommitSucceededRef = useRef(false);
  const roomAttemptRef = useRef<ReturnType<typeof createRaidRoomBattleAttempt> | null>(null);
  const roomUserRef = useRef(session?.user?.id);
  const roomCancelBlockingRef = useRef(false);
  const roomRecoveryRef = useRef<Promise<boolean> | null>(null);
  const roomPresentationUserRef = useRef<string | null>(null);
  const previousRoomUserRef = useRef(session?.user?.id);
  useLayoutEffect(() => {
    roomUserRef.current = session?.user?.id;
    if (previousRoomUserRef.current === session?.user?.id) return;
    previousRoomUserRef.current = session?.user?.id;
    if (roomCancelBlockingRef.current) { roomCancelBlockingRef.current = false; setGlobalInteractionBlocking?.(false); }
    roomAttemptRef.current = null;
    pendingRaidStartRef.current = null;
    raidCommitSucceededRef.current = false;
    roomRecoveryRef.current = null;
    roomPresentationUserRef.current = null;
    battleStartInFlightRef.current = false;
    setBattleState(null);
    setBattleMode(null);
    setBattleLoading(false);
    setOfficialRaidResult(null);
    setOfficialRaidReplayId(null);
    setOfficialRaidEvents([]);
    setPlayerPartyStates([]);
    setEnemyPartyStates([]);
  }, [session?.user?.id]);
  const createPersistentRoomAttempt = (roomId: string, userId: string, initialPayload?: RaidRoomBattlePayload) =>
    createRaidRoomBattleAttempt(roomId, initialPayload?.p_request_id ?? crypto.randomUUID(), {
      initialPayload,
      assertCurrent: () => { if (roomUserRef.current !== userId) throw new Error("アカウントが切り替わりました。"); },
      beforeSend: payload => saveRaidRoomPending(userId, payload),
      clear: requestId => clearRaidRoomPending(userId, requestId),
    });

  const pendingRaidStartRef = useRef<any[] | null>(null);
  const raidCommitSucceededRef = useRef(false);
  const [settledPatrolEncounterId, setSettledPatrolEncounterId] = useState<string | null>(null);
  const activePatrolEncounterIdRef = useRef<string | null>(null);
  const [enemyTactic, setEnemyTactic] = useState<string>("OFFENSIVE");
  const [opponentPoints, setOpponentPoints] = useState<number>(1000);
  const [officialGvgAttackId, setOfficialGvgAttackId] = useState<string | null>(null);
  const [officialGvgReplayId, setOfficialGvgReplayId] = useState<string | null>(null);
  const [officialGvgWinner, setOfficialGvgWinner] = useState<"PLAYER" | "ENEMY" | null>(null);
  const [canonicalAuxReplayId, setCanonicalAuxReplayId] = useState<string | null>(null);
  const [canonicalAuxEvents, setCanonicalAuxEvents] = useState<ServerBattleEvent[]>([]);
  const [canonicalAuxEventIndex, setCanonicalAuxEventIndex] = useState(0);
  const [officialPatrolReplayId, setOfficialPatrolReplayId] = useState<string | null>(null);
  const [officialPatrolWinner, setOfficialPatrolWinner] = useState<"PLAYER" | "ENEMY" | null>(null);
  const officialPatrolReplayIdRef = useRef<string | null>(null);
  const officialPatrolWinnerRef = useRef<"PLAYER" | "ENEMY" | null>(null);
  const [officialPatrolEvents, setOfficialPatrolEvents] = useState<ServerBattleEvent[]>([]);
  const [officialPatrolEventIndex, setOfficialPatrolEventIndex] = useState(0);
  const [officialPvpReplayId, setOfficialPvpReplayId] = useState<string | null>(null);
  const [officialPvpWinner, setOfficialPvpWinner] = useState<"PLAYER" | "ENEMY" | null>(null);
  const [officialPvpEvents, setOfficialPvpEvents] = useState<ServerBattleEvent[]>([]);
  const [officialPvpEventIndex, setOfficialPvpEventIndex] = useState(0);
  const [officialPvpResult, setOfficialPvpResult] = useState<any | null>(null);
  const [officialRaidReplayId, setOfficialRaidReplayId] = useState<string | null>(null);
  const [officialRaidWinner, setOfficialRaidWinner] = useState<"PLAYER" | "ENEMY" | null>(null);
  const [officialRaidEvents, setOfficialRaidEvents] = useState<ServerBattleEvent[]>([]);
  const [officialRaidEventIndex, setOfficialRaidEventIndex] = useState(0);
  const [officialRaidResult, setOfficialRaidResult] = useState<any | null>(null);
  const [battleResultReplayEvents, setBattleResultReplayEvents] = useState<ServerBattleEvent[]>([]);
  const [battlePresentationContext, setBattlePresentationContext] = useState<BattlePresentationContext | null>(null);
  const [battleModeResultDetail, setBattleModeResultDetail] = useState<BattleModeResultDetail | null>(null);
  const [battleSkipPending, setBattleSkipPending] = useState(false);

  // 5v5 状態管理
  const [playerPartyStates, setPlayerPartyStates] = useState<ParticipantState[]>([]);
  const [enemyPartyStates, setEnemyPartyStates] = useState<ParticipantState[]>([]);
  // Replay presentation timers must not read the render that scheduled them.
  // Snapshot hydration and the first ACTION can otherwise cross on slower
  // clients, which drops canonical names and applies HP events to stale rows.
  const playerPartyStatesRef = useRef<ParticipantState[]>([]);
  const enemyPartyStatesRef = useRef<ParticipantState[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineIndex, setTimelineIndex] = useState<number>(0);
  const [battleRound, setBattleRound] = useState<number>(1);

  // 演出・ポップアップ
  const [activeSkillCutIn, setActiveSkillCutIn] = useState<{ charName: string; skillName: string } | null>(null);
  const [targetLine, setTargetLine] = useState<{ fromId: string; toId: string } | null>(null);
  const [activeShakingCharId, setActiveShakingCharId] = useState<string | null>(null);
  const [damagePopup, setDamagePopup] = useState<{ val: number; type: "dmg" | "heal" | "shield"; isCritical?: boolean; x: number; y: number; charId: string } | null>(null);
  const [presentationPhase, setPresentationPhase] = useState<BattlePresentationPhase>("IDLE");
  const [actionPresentation, setActionPresentation] = useState<BattleActionPresentation | null>(null);
  const [authoritativeTimeline, setAuthoritativeTimeline] = useState<BattlePresentationTimelineNode[]>([]);
  const presentationTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const presentationGateGenerationRef = useRef(0);

  const clearPresentationTimers = useCallback(() => {
    presentationGateGenerationRef.current += 1;
    presentationTimersRef.current.forEach(clearTimeout);
    presentationTimersRef.current = [];
  }, []);

  const recordPresentationStage = (stage: "actorFocusAt" | "targetFocusAt" | "impactAt" | "damageAt" | "hpSettledAt" | "actionCompleteAt", targetId?: string) => {
    if (typeof window === "undefined") return;
    const battleWindow = window as typeof window & { __TRIBE_BATTLE_PRESENTATION__?: { current?: any; history: any[] } };
    const current = battleWindow.__TRIBE_BATTLE_PRESENTATION__?.current;
    if (current && typeof current[stage] !== "number") {
      current[stage] = performance.now();
      if (targetId) current[`${stage}TargetId`] = targetId;
    }
  };

  useEffect(() => () => clearPresentationTimers(), [clearPresentationTimers]);
  useEffect(() => { playerPartyStatesRef.current = playerPartyStates; }, [playerPartyStates]);
  useEffect(() => { enemyPartyStatesRef.current = enemyPartyStates; }, [enemyPartyStates]);



  // 進行中のバトルセッションを復元 (Resume) する関数
  const resumeActiveBattleSession = async (patrolIdOverride?: string | null) => {
    if (!session?.user?.id) return false;
    if (await resumePendingRaidRoomBattle()) return true;
    try {
      const canonicalPatrolId = patrolIdOverride || patrol?.id || null;
      if (canonicalPatrolId) {
        const { data: replayRows, error: replayError } = await supabase
          .from("battle_replay_sessions")
          .select("*")
          .eq("requester_user_id", session.user.id)
          .eq("battle_mode", "QUEST")
          .eq("source_reference_id", canonicalPatrolId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (replayError) throw replayError;
        const canonicalReplay = replayRows?.[0];
        if (canonicalReplay) {
          let resolvedResult = canonicalReplay.result;
          if (canonicalReplay.status !== "RESOLVED" || !resolvedResult) {
            const resolved = await supabase.functions.invoke("resolve-battle", {
              body: { replaySessionId: canonicalReplay.id },
            });
            if (resolved.error) throw resolved.error;
            resolvedResult = resolved.data;
          }
          const canonicalPlayers = patrolSnapshotToParticipants(canonicalReplay.player_snapshot, false);
          const canonicalEnemies = patrolSnapshotToParticipants(canonicalReplay.enemy_snapshot, true);
          const { data: replayEventRows, error: eventError } = await supabase
            .from("battle_replay_events")
            .select("event_index,round_number,event_type,payload")
            .eq("battle_replay_session_id", canonicalReplay.id)
            .order("event_index", { ascending: true });
          if (eventError) throw eventError;
          const canonicalEvents = Array.isArray(resolvedResult?.events) && resolvedResult.events.length > 0
            ? serverBattleEvents(resolvedResult.events)
            : serverBattleEvents((replayEventRows || []).map((event: any) => ({
                index: event.event_index,
                round: event.round_number,
                type: event.event_type,
                payload: event.payload,
              })));
          const winner = resolvedResult?.winner;
          if (canonicalPlayers.length > 0 && canonicalEnemies.length > 0 && canonicalEvents.length > 0
            && (winner === "PLAYER" || winner === "ENEMY")) {
            activePatrolEncounterIdRef.current = canonicalPatrolId;
            setTutorialBattleActive(tutorialStep === "TUTORIAL_BATTLE");
            setBattleMode("PATROL");
            setBattleOpponentName("クエストバトル");
            setPlayerPartyStates(canonicalPlayers);
            setEnemyPartyStates(canonicalEnemies);
            playerPartyStatesRef.current = canonicalPlayers;
            enemyPartyStatesRef.current = canonicalEnemies;
            setTimeline([
              ...canonicalPlayers.map((participant) => ({ id: participant.id, name: participant.name, isEnemy: false, spd: participant.stats.spd })),
              ...canonicalEnemies.map((participant) => ({ id: participant.id, name: participant.name, isEnemy: true, spd: participant.stats.spd })),
            ].sort((left, right) => right.spd - left.spd));
            setTimelineIndex(0);
            setBattleRound(1);
            setOfficialPatrolReplayId(canonicalReplay.id);
            setOfficialPatrolWinner(winner);
            officialPatrolReplayIdRef.current = canonicalReplay.id;
            officialPatrolWinnerRef.current = winner;
            setOfficialPatrolEvents(canonicalEvents);
            // A closed browser may leave a cursor at the final event without
            // allowing the result paint. Replay from the canonical beginning;
            // never strand Continue on an exhausted local cursor.
            setOfficialPatrolEventIndex(0);
            if (typeof window !== "undefined") window.localStorage.removeItem(patrolReplayCursorKey(canonicalReplay.id));
            setBattlePresentationContext({
              mode: "PATROL",
              opponentLabel: "クエストバトル",
              opponentLeaderCharacterId: canonicalEnemies[0]?.characterId,
              opponentLeaderName: canonicalEnemies[0]?.name,
            });
            setBattleState("PLAYING");
            return true;
          }
        }
      }

      const { data: activeSessions, error } = await supabase
        .from("battle_sessions")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("status", "ACTIVE")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (error || !activeSessions || activeSessions.length === 0) {
        return false;
      }

      const activeSession = activeSessions[0];
      const playerStateData = activeSession.player_state;
      const enemyStateData = activeSession.enemy_state;

      if (playerStateData && enemyStateData) {
        setBattleSessionId(activeSession.id);
        const mappedMode = activeSession.battle_type === "ARENA" ? "PVP" : activeSession.battle_type;
        setBattleMode(mappedMode);
        setPlayerPartyStates(playerStateData.playerStates || []);
        setEnemyPartyStates(enemyStateData.enemyStates || []);
        setAp(0);
        setMaxAp(0);
        if (playerStateData.tactic) setTactic(playerStateData.tactic);
        if (playerStateData.log) setBattleLog(playerStateData.log);
        if (playerStateData.timelineIndex !== undefined) setTimelineIndex(playerStateData.timelineIndex);
        setBattleRound(1);
        if (playerStateData.gvgAreaId) setGvgTargetBaseId(playerStateData.gvgAreaId);
        setOfficialGvgAttackId(playerStateData.officialGvgAttackId || null);
        setOfficialGvgReplayId(playerStateData.officialGvgReplayId || null);
        setOfficialGvgWinner(playerStateData.officialGvgWinner === "PLAYER" ? "PLAYER" : playerStateData.officialGvgWinner === "ENEMY" ? "ENEMY" : null);
        setCanonicalAuxReplayId(playerStateData.canonicalAuxReplayId || null);
        setCanonicalAuxEvents(serverBattleEvents(playerStateData.canonicalAuxEvents));
        setCanonicalAuxEventIndex(savedPatrolReplayCursor(playerStateData.canonicalAuxReplayId, playerStateData.canonicalAuxEventIndex));
        setOfficialPatrolReplayId(playerStateData.officialPatrolReplayId || null);
        setOfficialPatrolWinner(playerStateData.officialPatrolWinner === "PLAYER" ? "PLAYER" : playerStateData.officialPatrolWinner === "ENEMY" ? "ENEMY" : null);
        setOfficialPatrolEvents(serverBattleEvents(playerStateData.officialPatrolEvents));
        setOfficialPatrolEventIndex(savedPatrolReplayCursor(playerStateData.officialPatrolReplayId, playerStateData.officialPatrolEventIndex));
        setOfficialPvpReplayId(playerStateData.officialPvpReplayId || null);
        setOfficialPvpWinner(playerStateData.officialPvpWinner === "PLAYER" ? "PLAYER" : playerStateData.officialPvpWinner === "ENEMY" ? "ENEMY" : null);
        setOfficialPvpEvents(serverBattleEvents(playerStateData.officialPvpEvents));
        setOfficialPvpEventIndex(savedPatrolReplayCursor(playerStateData.officialPvpReplayId, playerStateData.officialPvpEventIndex));
        setOfficialPvpResult(playerStateData.officialPvpResult || null);
        setOfficialRaidReplayId(playerStateData.officialRaidReplayId || null);
        setOfficialRaidWinner(playerStateData.officialRaidWinner === "PLAYER" ? "PLAYER" : playerStateData.officialRaidWinner === "ENEMY" ? "ENEMY" : null);
        setOfficialRaidEvents(serverBattleEvents(playerStateData.officialRaidEvents));
        setOfficialRaidEventIndex(savedPatrolReplayCursor(playerStateData.officialRaidReplayId, playerStateData.officialRaidEventIndex));
        setOfficialRaidResult(playerStateData.officialRaidResult || null);

        setBattleState("PLAYING");
        return true;
      }
    } catch (err) {
      console.warn("Failed to resume active battle session:", err);
    }
    return false;
  };

  // バトルの初期設定フェーズへ移行
  const startCardBattleInternal = (mode: BattleMode,
  targetName: string,
  areaIdOrOpponentUserId?: string,
  oppPoints?: number,
  oppTactic?: string,
  opponentMainAlign?: string,
  opponentSubAlign?: string,
  opponentDefenseCharIds?: string[],
  _supportCharacter?: any,
  patrolNpcOverride?: any,
  patrolIdOverride?: string,
  presentationOverride?: Partial<BattlePresentationContext>,
  prepareOnly: boolean = false,
  roomBriefing?: RaidRoomBriefing) => runBattleStart({
    session,
    roomUserRef,
    roomAttemptRef,
    settledPatrolEncounterId,
    setTutorialBattleActive,
    tutorialStep,
    activePatrolEncounterIdRef,
    patrol,
    userCharactersDbList,
    setErrorMessage,
    userLevel,
    setBattleLoading,
    playCyberSe,
    setOfficialGvgAttackId,
    setOfficialGvgReplayId,
    setOfficialGvgWinner,
    setOfficialPatrolReplayId,
    setOfficialPatrolWinner,
    setOfficialPatrolEvents,
    setOfficialPatrolEventIndex,
    setOfficialPvpReplayId,
    setOfficialPvpWinner,
    setOfficialPvpEvents,
    setOfficialPvpEventIndex,
    setOfficialPvpResult,
    setCanonicalAuxReplayId,
    setCanonicalAuxEvents,
    setCanonicalAuxEventIndex,
    setOfficialRaidReplayId,
    setOfficialRaidWinner,
    setOfficialRaidEvents,
    setOfficialRaidEventIndex,
    setOfficialRaidResult,
    setBattleResultReplayEvents,
    setBattleModeResultDetail,
    setBattleSkipPending,
    setIsAutoPaused,
    setBattleState,
    setBattleMode,
    raidBossHp,
    raidBossMaxHp,
    patrolNpcs,
    userGuildMember,
    setHasRaidControlBonus,
    setOpponentPoints,
    setEnemyTactic,
    setBattleOpponentName,
    setVitality,
    vitality,
    setGvgTargetBaseId,
    selectedMembers,
    userSkillsList,
    userEquipmentsList,
    setMaxAp,
    setAp,
    userGuild,
    setPlayerPartyStates,
    pendingPvpStartRef,
    setEnemyPartyStates,
    setTimeline,
    setTimelineIndex,
    setBattleRound,
    setBattleLog,
    tactic,
    createPersistentRoomAttempt,
    setBattlePresentationContext,
    officialPatrolReplayIdRef,
    officialPatrolWinnerRef,
    playerPartyStatesRef,
    enemyPartyStatesRef,
    pvpCommitSucceededRef,
    setPvpPoints,
    pvpPoints,
    raidCommitSucceededRef,
    roomPresentationUserRef,
    setRaidPoints,
    raidPoints,
    setRaidFirstEntryFree,
    setBattleSessionId,
  }, mode, targetName, areaIdOrOpponentUserId, oppPoints, oppTactic, opponentMainAlign, opponentSubAlign, opponentDefenseCharIds, _supportCharacter, patrolNpcOverride, patrolIdOverride, presentationOverride, prepareOnly, roomBriefing);

  const preparedBattleArgs = (args: readonly unknown[], prepareOnly: boolean): Parameters<typeof startCardBattleInternal> => {
    const fixed = Array.from({ length: 12 }, (_, index) => args[index]);
    return [...fixed, prepareOnly, args[13]] as unknown as Parameters<typeof startCardBattleInternal>;
  };

  const startCardBattle = async (...args: Parameters<typeof startCardBattleInternal>) => {
    if (roomUserRef.current !== session?.user?.id) return;
    if (battleStartInFlightRef.current || battleEndingInFlightRef.current || battleState !== null) return;
    battleStartInFlightRef.current = true;
    const actionPerformance = beginActionPerformance("battle_start");
    try {
      actionPerformance.mark("request_start");
      if (args[0] === "PVP" || args[0] === "RAID") {
        if (args[0] === "PVP") {
          pendingPvpStartRef.current = args;
          pvpCommitSucceededRef.current = false;
        } else {
          roomAttemptRef.current = null;
          pendingRaidStartRef.current = args;
          raidCommitSucceededRef.current = false;
        }
        await startCardBattleInternal(...preparedBattleArgs(args, true));
      } else {
        await startCardBattleInternal(...args);
      }
      actionPerformance.mark("response");
      actionPerformance.mark("state_update");
      actionPerformance.markVisualReady();
    } finally {
      battleStartInFlightRef.current = false;
    }
  };

  /** trueは未確定Roomを処理/保留した意味。旧セッション復帰と混在させない。 */
  const resumePendingRaidRoomBattle = async (forceServerLookup = false): Promise<boolean> => {
    const userId = session?.user?.id;
    if (!userId || roomUserRef.current !== userId) return false;
    if (roomPresentationUserRef.current === userId) return true;
    if (roomRecoveryRef.current) return roomRecoveryRef.current;
    let record: ReturnType<typeof readRaidRoomPending> = null;
    let storageError: unknown = null;
    try { record = readRaidRoomPending(userId); } catch (error) { storageError = error; }
    if (!record && !storageError && !forceServerLookup && process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED !== "true") return false;
    if (battleStartInFlightRef.current || battleState !== null) return true;
    const recovery = (async () => {
      battleStartInFlightRef.current = true;
      setBattleLoading(true);
      let payload = record?.payload;
      let receiptAccepted = false;
      const displayReceipt = async (attempt: ReturnType<typeof createRaidRoomBattleAttempt>, receipt: any) => {
        if (roomUserRef.current !== userId) return;
        if (receipt.error) throw new Error(receipt.error.message || "出撃を再確認できませんでした。");
        receiptAccepted = true;
        roomAttemptRef.current = attempt;
        const { data: briefing, error } = await supabase.rpc("get_raid_room_briefing_v1", { p_room_id: receipt.data.room_id });
        if (roomUserRef.current !== userId) return;
        if (error || briefing?.roomId !== receipt.data.room_id) throw new Error("レイド情報を再確認できませんでした。");
        const args = ["RAID", briefing.bossName || "レイド", briefing.raidBossInstanceId,
          undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, false, briefing];
        pendingRaidStartRef.current = args;
        raidCommitSucceededRef.current = false;
        await startCardBattleInternal(...preparedBattleArgs(args, false));
        if (roomUserRef.current === userId && raidCommitSucceededRef.current) pendingRaidStartRef.current = null;
      };
      try {
        if (!payload) {
          const response = await supabase.rpc("list_raid_room_battle_recoveries_v1", { p_limit: 1 });
          if (roomUserRef.current !== userId) return true;
          if (response.error || !Array.isArray(response.data)) throw new Error("出撃履歴を確認できませんでした。");
          if (response.data.length === 0) {
            if (storageError) throw storageError;
            return false;
          }
          const saved = response.data[0];
          const p = saved?.payload;
          if (!p || saved.requestId !== p.p_request_id || saved.roomId !== p.p_room_id
            || typeof p.p_room_id !== "string" || !p.p_room_id || typeof p.p_request_id !== "string" || !p.p_request_id
            || typeof p.p_tactic !== "string" || !p.p_tactic || !Array.isArray(p.p_character_ids)
            || !p.p_character_ids.length || p.p_character_ids.length > 5
            || p.p_character_ids.some((id: unknown) => typeof id !== "string" || !id)
            || new Set(p.p_character_ids).size !== p.p_character_ids.length) throw new Error("出撃履歴を確認できませんでした。");
          payload = p;
          const attempt = createPersistentRoomAttempt(p.p_room_id, userId, p);
          // サーバーにある開始済み記録だけを採用。空の一覧・壊れた保存情報から開始は作らない。
          await displayReceipt(attempt, attempt.acceptRecovery(saved.receipt));
        } else {
          const attempt = createPersistentRoomAttempt(payload.p_room_id, userId, payload);
          roomAttemptRef.current = attempt;
          await displayReceipt(attempt, await attempt.recover(supabase));
        }
      } catch (error) {
        if (roomUserRef.current === userId) {
          setErrorMessage(error instanceof Error ? error.message : "出撃を再確認できませんでした。");
          // 有効なローカル要求だけが取消対象。開始済みなら取消せず同じ結果へ戻す。
          if (record && !receiptAccepted && setConfirmDialogConfig) {
            const localPayload = record.payload;
            setConfirmDialogConfig({ isOpen: true, title: "出撃を確認できませんでした",
              message: "未開始の出撃を取り消しますか？ すでに開始している場合は、その戦闘を再開します。",
              confirmText: "未開始の出撃を取消", cancelText: "戻る", confirmPendingText: "",
              onCancel: () => { if (roomUserRef.current === userId) setConfirmDialogConfig(null); },
              onConfirm: async () => {
                if (roomUserRef.current !== userId || battleStartInFlightRef.current) return;
                battleStartInFlightRef.current = true;
                roomCancelBlockingRef.current = true;
                setGlobalInteractionBlocking?.(true);
                setBattleLoading(true);
                try {
                  const cancelled = await supabase.rpc("cancel_raid_room_battle_request_v1", { p_request_id: localPayload.p_request_id });
                  if (roomUserRef.current !== userId) return;
                  if (cancelled.error) throw new Error(cancelled.error.message || "出撃を取り消せませんでした。");
                  if (cancelled.data?.status === "started") {
                    const attempt = createPersistentRoomAttempt(localPayload.p_room_id, userId, localPayload);
                    await displayReceipt(attempt, attempt.acceptRecovery(cancelled.data.receipt));
                  } else if (cancelled.data?.status === "cancelled") {
                    clearRaidRoomPending(userId, localPayload.p_request_id);
                    roomAttemptRef.current = null;
                    pendingRaidStartRef.current = null;
                  } else throw new Error("出撃の取消結果を確認できませんでした。");
                  if (roomUserRef.current === userId) {
                    if (cancelled.data?.status === "cancelled" || raidCommitSucceededRef.current) setErrorMessage(null);
                    setConfirmDialogConfig(null);
                  }
                } catch (cancelError) {
                  if (roomUserRef.current === userId) setErrorMessage(cancelError instanceof Error ? cancelError.message : "出撃を取り消せませんでした。");
                  throw cancelError;
                } finally {
                  if (roomUserRef.current === userId) { roomCancelBlockingRef.current = false; setGlobalInteractionBlocking?.(false); battleStartInFlightRef.current = false; setBattleLoading(false); }
                }
              },
            });
          }
        }
      } finally {
        if (roomUserRef.current === userId) { battleStartInFlightRef.current = false; setBattleLoading(false); }
      }
      return true;
    })();
    roomRecoveryRef.current = recovery;
    try { return await recovery; } finally { if (roomRecoveryRef.current === recovery) roomRecoveryRef.current = null; }
  };

  const prepareRaidRoomBattle = async (briefing: RaidRoomBriefing, presentation?: Partial<BattlePresentationContext>) => {
    const preparingUserId = session?.user?.id;
    if (!preparingUserId || roomUserRef.current !== preparingUserId) return;
    if (await resumePendingRaidRoomBattle(true)) return;
    const { data, error } = await supabase.rpc("get_raid_room_briefing_v1", { p_room_id: briefing.roomId });
    if (roomUserRef.current !== preparingUserId) return;
    if (error || data?.roomId !== briefing.roomId || data?.membershipStatus !== "joined" || !data?.battleStartEnabled) {
      setErrorMessage("このレイドには現在出撃できません。"); return;
    }
    await startCardBattle("RAID", data.bossName || "レイド", data.raidBossInstanceId, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, presentation, false, data);
  };

  // 割合防御減算モデル ＋ 乱数±5% ＋ LUK連動クリティカル ＋ アライメント相性計算
  const calcDynamicDamage = (
    attacker: ParticipantState,
    defender: ParticipantState,
    skillPower: number,
    hasRaidBonus: boolean = false
  ): { damage: number; isCritical: boolean } => {
    const attackerAlignment = (attacker.alignment || "ORDER") as "JUSTICE" | "ORDER" | "EVIL" | "CHAOS";
    const defenderAlignment = (defender.alignment || "ORDER") as "JUSTICE" | "ORDER" | "EVIL" | "CHAOS";
    const isCritical = Math.floor(Math.random() * 10000) < criticalChanceBp(attacker.stats.luk);
    const damage = productionDamage({
      atk: attacker.stats.atk, def: defender.stats.def, powerBp: Math.max(1, Math.round(skillPower * 100)),
      battleModifierBp: hasRaidBonus ? 12000 : 10000,
      attributeBp: getAttributeMultiplierBp(attackerAlignment, defenderAlignment),
      criticalDamageBp: isCritical ? 15000 : 10000,
      randomBp: 9500 + Math.floor(Math.random() * 1001),
    });
    return { damage, isCritical };
  };

  // 戦闘オート進行を開始
  const launchBattlePlaying = () => {
    playCyberSe("click");
    setBattleState("PLAYING");

    // バトル開始時発動スキル (START_OF_BATTLE) の評価
    const nextLogs = [...battleLog, "戦闘開始！初期バフ適用。"];
    const hasAuthoritativeReplay = (battleMode === "PATROL" && officialPatrolEvents.length > 0)
      // The setup-screen callback can capture the pre-commit empty event
      // array. The commit ref is synchronous and is the authoritative guard.
      || (battleMode === "PVP" && pvpCommitSucceededRef.current)
      || (battleMode === "RAID" && raidCommitSucceededRef.current)
      || ((battleMode === "GVG" || battleMode === "PVP_PRACTICE") && canonicalAuxEvents.length > 0);
    if (hasAuthoritativeReplay) {
      // The confirmation callback may still close over the pre-replay setup
      // roster (`ally_<master-id>`). Never write that stale array back over
      // the immutable replay snapshot immediately before playback.
      setBattleLog(nextLogs);
      return;
    }
    const updatedPlayers = playerPartyStates.map(p => {
      return p;
    });

    setPlayerPartyStates(updatedPlayers);
    setBattleLog(nextLogs);
  };

  const confirmPreparedPvpBattle = async () => {
    const pending = pendingPvpStartRef.current;
    if (!pending || battleStartInFlightRef.current) return false;
    battleStartInFlightRef.current = true;
    pvpCommitSucceededRef.current = false;
    try {
      await startCardBattleInternal(...preparedBattleArgs(pending, false));
      if (pvpCommitSucceededRef.current) pendingPvpStartRef.current = null;
      return pvpCommitSucceededRef.current;
    } finally {
      battleStartInFlightRef.current = false;
    }
  };

  const cancelPreparedPvpBattle = () => {
    if (battleMode !== "PVP" || !pendingPvpStartRef.current || pvpCommitSucceededRef.current) return false;
    pendingPvpStartRef.current = null;
    setBattleState(null);
    setBattleMode(null);
    setBattleOpponentName("");
    setBattlePresentationContext(null);
    setPlayerPartyStates([]);
    setEnemyPartyStates([]);
    setTimeline([]);
    setBattleLoading(false);
    return true;
  };

  const confirmPreparedRaidBattle = async () => {
    if (battleStartInFlightRef.current) return false;
    // A recovered Room replay is already committed and has no pending start.
    // Confirm playback without creating or resolving another battle.
    if (raidCommitSucceededRef.current && roomPresentationUserRef.current === session?.user?.id) return true;
    const pending = pendingRaidStartRef.current;
    if (!pending || battleStartInFlightRef.current) return false;
    battleStartInFlightRef.current = true;
    raidCommitSucceededRef.current = false;
    try {
      await startCardBattleInternal(...preparedBattleArgs(pending, false));
      if (raidCommitSucceededRef.current) pendingRaidStartRef.current = null;
      return raidCommitSucceededRef.current;
    } finally {
      battleStartInFlightRef.current = false;
    }
  };

  const cancelPreparedRaidBattle = () => {
    if (battleMode !== "RAID" || !pendingRaidStartRef.current || raidCommitSucceededRef.current) return false;
    if (roomAttemptRef.current?.hasSubmitted()) return false;
    try { roomAttemptRef.current?.clear(); } catch (error) { setErrorMessage("出撃の保存情報を更新できませんでした。"); return false; }
    roomAttemptRef.current = null;
    pendingRaidStartRef.current = null;
    setBattleState(null);
    setBattleMode(null);
    setBattleOpponentName("");
    setBattlePresentationContext(null);
    setPlayerPartyStates([]);
    setEnemyPartyStates([]);
    setTimeline([]);
    setBattleLoading(false);
    return true;
  };

  const skipBattlePresentation = () => {
    if (tutorialBattleActive || battleState !== "PLAYING" || battleSkipPending) return;
    const events = battleMode === "PATROL" ? officialPatrolEvents
      : battleMode === "PVP" ? officialPvpEvents
      : battleMode === "RAID" ? officialRaidEvents
      : battleMode === "PVP_PRACTICE" ? canonicalAuxEvents
      : [];
    const resultEvent = [...events].reverse().find((entry) => entry.type === "RESULT");
    if (!resultEvent || events.length === 0) return;
    setBattleSkipPending(true);
    setIsAutoPaused(true);
    clearPresentationTimers();
    const gateGeneration = presentationGateGenerationRef.current;
    setBattleResultReplayEvents(events);
    setBattleRound(Math.max(1, Number(resultEvent.payload.rounds ?? resultEvent.round ?? 1)));
    // Skip intentionally projects the already-resolved replay endpoint. This
    // is distinct from natural playback: no intermediate parity defect is
    // hidden, because the human explicitly requested that presentation be skipped.
    const canonicalPlayers = reconcileBattleHpFromReplay(playerPartyStatesRef.current, events);
    const canonicalEnemies = reconcileBattleHpFromReplay(enemyPartyStatesRef.current, events);
    playerPartyStatesRef.current = canonicalPlayers;
    enemyPartyStatesRef.current = canonicalEnemies;
    setPlayerPartyStates(canonicalPlayers);
    setEnemyPartyStates(canonicalEnemies);
    if (typeof document !== "undefined") document.documentElement.dataset.battleHpSkipProjection = "true";
    const finishSkip = async () => {
      const gate = await waitForBattleHpParityGate(
        () => waitForRenderedBattleHpParity([...canonicalPlayers, ...canonicalEnemies]),
        { boundary: "SKIP", replayId: battleMode === "RAID" ? officialRaidReplayId : null, round: Number(resultEvent.payload.rounds ?? resultEvent.round ?? 1) },
        { isActive: () => presentationGateGenerationRef.current === gateGeneration },
      );
      if (gate.status === "cancelled") return;
      void endBattleSession(resultEvent.payload.winner === "PLAYER" ? "VICTORY" : "DEFEAT");
    };
    presentationTimersRef.current.push(setTimeout(() => void finishSkip(), 0));
  };

  const handleEndTurn = (overrideIndex?: number) => {
    if (timeline.length === 0) return;
    const nextIndex = overrideIndex !== undefined ? overrideIndex : (timelineIndex + 1) % timeline.length;
    if (nextIndex === 0) {
      const roundLimit = battleMode === "RAID" ? 30 : battleMode === "PVP" || battleMode === "PVP_PRACTICE" || battleMode === "GVG" ? 20 : 15;
      if (battleRound >= roundLimit) {
        void endBattleSession("DEFEAT");
        return;
      }
      setBattleRound((previous) => previous + 1);
    }
    setTimelineIndex(nextIndex);
  };

  // 敵のターン自動AI
  const executeEnemyTurn = (enemyId: string, curTlIdx: number) => {
    const enemy = enemyPartyStates.find(e => e.id === enemyId);
    if (!enemy || enemy.isDead) {
      handleEndTurn((curTlIdx + 1) % timeline.length);
      return;
    }

    // スタン (STUN) 手番スキップ判定
    if ((enemy.stunTurns || 0) > 0) {
      const skipLog = `[${enemy.name}] はスタンにより行動不能！`;
      setBattleLog(prev => [...prev, skipLog]);
      setEnemyPartyStates(prev => prev.map(e => e.id === enemyId ? { ...e, stunTurns: Math.max((e.stunTurns || 0) - 1, 0) } : e));
      setTimeout(() => {
        handleEndTurn((curTlIdx + 1) % timeline.length);
      }, 500 / battleSpeed);
      return;
    }

    // 攻撃対象（味方）の決定
    const alivePlayers = playerPartyStates.filter(p => !p.isDead);
    if (alivePlayers.length === 0) return;

    // 挑発中の生存者を最優先、いなければ最もHP割合の低い生存者をターゲット
    let defaultPlayerTarget = alivePlayers.find(p => p.tauntTurns > 0);
    if (!defaultPlayerTarget) {
      defaultPlayerTarget = alivePlayers.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
    }

    // 作戦AIに基づいたスキル＆ターゲットの選定
    let chosenSkill = enemy.skills[0];
    let target = defaultPlayerTarget;

    const attackSkills = enemy.skills.filter(s => s.effect_type === "ATTACK");
    const defenseSkills = enemy.skills.filter(s => s.effect_type === "DEFENSE" || s.effect_type === "SUPPORT");
    const healSkills = enemy.skills.filter(s => s.effect_type === "HEAL");

    if (enemyTactic === "OFFENSIVE") {
      if (attackSkills.length > 0) {
        chosenSkill = attackSkills.sort((a, b) => b.power - a.power)[0];
      }
      target = defaultPlayerTarget;
    } else if (enemyTactic === "DEFENSIVE") {
      if (defenseSkills.length > 0) {
        chosenSkill = defenseSkills[0];
      } else if (attackSkills.length > 0) {
        chosenSkill = attackSkills[0];
      }
      target = enemy; // 自分自身（シールドバリア等）
    } else if (enemyTactic === "HEALING") {
      const aliveEnemies = enemyPartyStates.filter(e => !e.isDead);
      const damagedEnemy = aliveEnemies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
      const enemyNeedsHeal = damagedEnemy && (damagedEnemy.hp / damagedEnemy.maxHp) < 0.7;

      if (enemyNeedsHeal && healSkills.length > 0) {
        chosenSkill = healSkills.sort((a, b) => b.power - a.power)[0];
        target = damagedEnemy;
      } else {
        if (attackSkills.length > 0) chosenSkill = attackSkills[0];
        target = defaultPlayerTarget;
      }
    } else if (enemyTactic === "BALANCED") {
      const aliveEnemies = enemyPartyStates.filter(e => !e.isDead);
      const damagedEnemy = aliveEnemies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
      const enemyNeedsHeal = damagedEnemy && (damagedEnemy.hp / damagedEnemy.maxHp) < 0.5;

      if (enemyNeedsHeal && healSkills.length > 0) {
        chosenSkill = healSkills[0];
        target = damagedEnemy;
      } else if (attackSkills.length > 0) {
        chosenSkill = attackSkills.sort((a, b) => b.power - a.power)[0];
        target = defaultPlayerTarget;
      } else {
        target = enemy;
      }
    } else {
      chosenSkill = enemy.skills[Math.floor(Math.random() * enemy.skills.length)];
      target = defaultPlayerTarget;
    }

    if (!target) target = defaultPlayerTarget;

    // 演出表示
    setActiveSkillCutIn({
      charName: safeBattleCharacterName(enemy.name),
      skillName: resolveBattleSkillLabel(chosenSkill.skill_card_id ?? chosenSkill.skill_id ?? chosenSkill.id, enemy.skills as Array<Record<string, unknown>>),
    });
    setTargetLine({ fromId: enemy.id, toId: target.id });

    setTimeout(() => {
      playCyberSe(chosenSkill.effect_type === "HEAL" ? "click" : chosenSkill.effect_type === "DEFENSE" ? "click" : "hit");
      
      let val = 0;
      let logText = "";
      let type: "dmg" | "heal" | "shield" = "dmg";
      let isCrit = false;

      if (chosenSkill.effect_type === "ATTACK") {
        const { damage, isCritical } = calcDynamicDamage(enemy, target, chosenSkill.power);
        val = damage;
        isCrit = isCritical;
        type = "dmg";
        logText = `[${enemy.name}] が [${chosenSkill.name}] ➔ [${target.name}] に ${val.toLocaleString()}${isCrit ? " 【CRITICAL!】" : ""} ダメージ！`;
        setActiveShakingCharId(target.id);
      } else if (chosenSkill.effect_type === "HEAL") {
        val = Math.max(chosenSkill.power + Math.floor(enemy.stats.def * 0.5), 20);
        type = "heal";
        logText = `[${enemy.name}] が [${chosenSkill.name}] ➔ [${target.name}] のHPを ${val.toLocaleString()} 回復！`;
      } else if (chosenSkill.effect_type === "DEFENSE" || chosenSkill.effect_type === "SUPPORT") {
        val = chosenSkill.power > 0 ? chosenSkill.power : 50;
        type = "shield";
        logText = `[${enemy.name}] が [${chosenSkill.name}] ➔ 自身にシールドバリア(${val.toLocaleString()})を展開！`;
      }

      setPlayerPartyStates(prev => {
        const next = prev.map(p => {
          if (p.id === target.id) {
            if (type === "dmg") {
              let nextShield = p.shield;
              let nextHp = p.hp;
              if (nextShield > 0) {
                if (nextShield >= val) {
                  nextShield -= val;
                } else {
                  nextHp = Math.max(nextHp - (val - nextShield), 0);
                  nextShield = 0;
                }
              } else {
                nextHp = Math.max(nextHp - val, 0);
              }
              return { ...p, hp: nextHp, shield: nextShield, isDead: nextHp <= 0 };
            } else if (type === "heal") {
              return { ...p, hp: Math.min(p.hp + val, p.maxHp) };
            }
            return p;
          }
          return p;
        });

        setEnemyPartyStates(prevEnemies => {
          const nextEnemies = prevEnemies.map(e => {
            if (type === "heal" && e.id === target.id) {
              return { ...e, hp: Math.min(e.hp + val, e.maxHp) };
            }
            if (type === "shield" && e.id === enemy.id) {
              return { ...e, shield: e.shield + val, tauntTurns: 2 };
            }
            return e;
          });

          // ログの追加
          const updatedLogs = [...battleLog, logText];
          setBattleLog(updatedLogs);

          // ダメージポップアップ
          setDamagePopup({ val, type, x: 120, y: 40, charId: target.id });

          setTimeout(() => {
            setActiveSkillCutIn(null);
            setTargetLine(null);
            setActiveShakingCharId(null);
            setDamagePopup(null);

            // 勝敗チェック
            const isPlayerDead = next.every(p => p.isDead);
            if (isPlayerDead) {
              endBattleSession("DEFEAT");
            } else {
              // 挑発ターンの減少
              const nextPlayers = next.map(p => p.id === enemy.id && p.tauntTurns > 0 ? { ...p, tauntTurns: p.tauntTurns - 1 } : p);
              setPlayerPartyStates(nextPlayers);

              const nextIndex = (curTlIdx + 1) % timeline.length;
              handleEndTurn(nextIndex);

              if (session && battleSessionId) {
                saveBattleSessionState(battleSessionId, nextPlayers, nextEnemies, ap, maxAp, tactic, updatedLogs, nextIndex, gvgTargetBaseId);
              }
            }
          }, 800 / battleSpeed);

          return nextEnemies;
        });

        return next;
      });
    }, 800 / battleSpeed);
  };

  // 味方の自動ターン実行
  const executeAutoPlayerTurn = (charId: string, curTlIdx: number) => {
    const actor = playerPartyStates.find(p => p.id === charId);
    if (!actor || actor.isDead) {
      handleEndTurn((curTlIdx + 1) % timeline.length);
      return;
    }

    // スタン (STUN) 手番スキップ判定
    if ((actor.stunTurns || 0) > 0) {
      const skipLog = `[${actor.name}] はスタンにより行動不能！`;
      setBattleLog(prev => [...prev, skipLog]);
      setPlayerPartyStates(prev => prev.map(p => p.id === charId ? { ...p, stunTurns: Math.max((p.stunTurns || 0) - 1, 0) } : p));
      setTimeout(() => {
        handleEndTurn((curTlIdx + 1) % timeline.length);
      }, 500 / battleSpeed);
      return;
    }

    // 1. スキル候補の選定
    const aiResult = selectCharacterSkillByTactic(actor, tactic, playerPartyStates, enemyPartyStates);
    if (!aiResult) return;
    const { chosenSkill, target } = aiResult;

    const nextAp = 0;

    // 演出設定
    setActiveSkillCutIn({
      charName: safeBattleCharacterName(actor.name),
      skillName: resolveBattleSkillLabel(chosenSkill.skill_card_id ?? chosenSkill.skill_id ?? chosenSkill.id, actor.skills as Array<Record<string, unknown>>),
    });
    setTargetLine({ fromId: actor.id, toId: target.id });

    setTimeout(() => {
      playCyberSe("attack");

      let val = 0;
      let logText = "";
      let type: "dmg" | "heal" | "shield" = "dmg";
      let isCrit = false;

      if (chosenSkill.effect_type === "ATTACK") {
        const { damage, isCritical } = calcDynamicDamage(actor, target, chosenSkill.power, battleMode === "RAID" && hasRaidControlBonus);
        val = damage;
        isCrit = isCritical;
        type = "dmg";
        if (battleMode === "RAID" && hasRaidControlBonus) {
          logText = `【支配ボーナス発動】[${actor.name}] が [${chosenSkill.name}] ➔ [${target.name}] に ${val.toLocaleString()}${isCrit ? " 【CRITICAL!】" : ""} ダメージ！`;
        } else {
          logText = `[${actor.name}] が [${chosenSkill.name}] ➔ [${target.name}] に ${val.toLocaleString()}${isCrit ? " 【CRITICAL!】" : ""} ダメージ！`;
        }
        setActiveShakingCharId(target.id);
      } else if (chosenSkill.effect_type === "HEAL") {
        val = Math.max(chosenSkill.power + Math.floor(actor.stats.def * 0.5), 20);
        type = "heal";
        logText = `[${actor.name}] が [${chosenSkill.name}] ➔ [${target.name}] のHPを ${val.toLocaleString()} 回復！`;
      } else if (chosenSkill.effect_type === "DEFENSE" || chosenSkill.effect_type === "SUPPORT") {
        val = chosenSkill.power > 0 ? chosenSkill.power : 50;
        type = "shield";
        logText = `[${actor.name}] が [${chosenSkill.name}] ➔ 自身にシールドバリア(${val.toLocaleString()})を展開！`;
      }

      setEnemyPartyStates(prevEnemies => {
        let updatedEnemies = prevEnemies;
        if (type === "dmg") {
          updatedEnemies = prevEnemies.map(e => {
            if (e.id === target.id) {
              const nextHp = Math.max(e.hp - val, 0);
              return { ...e, hp: nextHp, isDead: nextHp <= 0 };
            }
            return e;
          });
        }

        setPlayerPartyStates(prevPlayers => {
          let updatedPlayers = prevPlayers;
          if (type === "heal") {
            updatedPlayers = prevPlayers.map(p => {
              if (p.id === target.id) {
                return { ...p, hp: Math.min(p.hp + val, p.maxHp) };
              }
              return p;
            });
          } else if (type === "shield") {
            updatedPlayers = prevPlayers.map(p => {
              if (p.id === actor.id) {
                return { ...p, shield: p.shield + val, tauntTurns: 2 };
              }
              return p;
            });
          }

          const updatedLogs = [...battleLog, logText];
          setBattleLog(updatedLogs);
          setDamagePopup({ val, type, isCritical: isCrit, x: 120, y: 40, charId: target.id });

          setTimeout(() => {
            setActiveSkillCutIn(null);
            setTargetLine(null);
            setActiveShakingCharId(null);
            setDamagePopup(null);

            // 勝敗チェック
            const isEnemyDead = updatedEnemies.every(e => e.isDead);
            if (isEnemyDead) {
              endBattleSession("VICTORY");
            } else {
              const nextIndex = (curTlIdx + 1) % timeline.length;
              handleEndTurn(nextIndex);

              if (session && battleSessionId) {
                saveBattleSessionState(battleSessionId, updatedPlayers, updatedEnemies, nextAp, maxAp, tactic, updatedLogs, nextIndex, gvgTargetBaseId);
              }
            }
          }, 800 / battleSpeed);

          return updatedPlayers;
        });

        return updatedEnemies;
      });
    }, 800 / battleSpeed);
  };

  // オート戦闘進行タイマー
  useEffect(() => {
    if (battleState !== "PLAYING" || isAutoPaused) return;

    const authoritativeEvents = battleMode === "PATROL" ? officialPatrolEvents
      : battleMode === "PVP" ? officialPvpEvents
      : battleMode === "RAID" ? officialRaidEvents
      : battleMode === "GVG" || battleMode === "PVP_PRACTICE" ? canonicalAuxEvents
      : [];
    const authoritativeEventIndex = battleMode === "PATROL" ? officialPatrolEventIndex
      : battleMode === "PVP" ? officialPvpEventIndex
      : battleMode === "RAID" ? officialRaidEventIndex
      : battleMode === "GVG" || battleMode === "PVP_PRACTICE" ? canonicalAuxEventIndex
      : 0;
    const authoritativeReplayId = battleMode === "PATROL" ? officialPatrolReplayId
      : battleMode === "PVP" ? officialPvpReplayId
      : battleMode === "RAID" ? officialRaidReplayId
      : battleMode === "GVG" || battleMode === "PVP_PRACTICE" ? canonicalAuxReplayId
      : null;
    if (authoritativeEvents.length > 0) {
      const replayEvent = authoritativeEvents[authoritativeEventIndex];
      if (!replayEvent) return;
      const previousReplayEvent = authoritativeEvents[authoritativeEventIndex - 1];
      const previousPreviousReplayEvent = authoritativeEvents[authoritativeEventIndex - 2];
      const previousSkillId = String(previousReplayEvent?.payload?.skillId ?? "BASIC_ATTACK");
      const isPresentationOutcome = (event: ServerBattleEvent | undefined) => Boolean(event)
        && (event!.type === "DAMAGE" || event!.type === "HEAL" || event!.type === "STATUS"
          || (event!.type === "EFFECT" && event!.payload.kind !== "ACTIVE_EFFECT_SYNC"));
      const followsSkill = isPresentationOutcome(replayEvent)
        && previousReplayEvent?.type === "ACTION"
        && previousSkillId !== "BASIC_ATTACK";
      const followsNormalAttack = replayEvent.type === "DAMAGE"
        && previousReplayEvent?.type === "ACTION"
        && previousSkillId === "BASIC_ATTACK";
      const holdsSkillImpact = isPresentationOutcome(previousReplayEvent)
        && previousPreviousReplayEvent?.type === "ACTION"
        && String(previousPreviousReplayEvent.payload?.skillId ?? "BASIC_ATTACK") !== "BASIC_ATTACK";
      const holdsNormalImpact = previousReplayEvent?.type === "DAMAGE"
        && previousPreviousReplayEvent?.type === "ACTION"
        && String(previousPreviousReplayEvent.payload?.skillId ?? "BASIC_ATTACK") === "BASIC_ATTACK";
      const followsFinalHit = replayEvent.type === "RESULT" && previousReplayEvent?.type === "DEFEAT";
      const previousAction = authoritativeEvents.slice(0, authoritativeEventIndex).reverse().find((entry) => entry.type === "ACTION");
      const previousActionWasSkill = previousAction
        ? String(previousAction.payload?.skillId ?? "BASIC_ATTACK") !== "BASIC_ATTACK"
        : false;
      const outcomeUnit = previousReplayEvent?.type === "ACTION"
        ? buildBattlePresentationUnit(authoritativeEvents, authoritativeEventIndex - 1)
        : null;
      const participantSnapshot = [...playerPartyStatesRef.current, ...enemyPartyStatesRef.current];
      const previousActor = previousAction
        ? participantSnapshot.find((participant) => participant.id === String(previousAction.payload.actorId ?? ""))
        : undefined;
      const previousTier = battlePresentationTier(previousActionWasSkill, previousActor?.rarity);
      const delay = replayEvent.type === "ACTION"
        ? previousAction
          // The previous Presentation Unit already consumed its complete
          // budget before advancing to this ACTION cursor. Do not apply the
          // post-impact remainder a second time between actions.
          ? 80
          : 500
        : outcomeUnit
          ? battlePresentationImpactAt(battleSpeed, previousTier, battleMode !== "RAID" || Boolean(battlePresentationContext?.raidRoomId))
          : replayEvent.type === "EFFECT" && replayEvent.payload.kind === "ACTIVE_EFFECT_SYNC"
            ? 40
            : replayEvent.type === "RESULT"
              ? followsFinalHit ? 260 : 180
              : 80;
      const replayDelay = delay;
      const timer = setTimeout(async () => {
        const payload = replayEvent.payload;
        const actorId = String(payload.actorId ?? "");
        const targetId = String(payload.targetId ?? "");
        const currentPlayers = playerPartyStatesRef.current;
        const currentEnemies = enemyPartyStatesRef.current;
        const allParticipants = [...currentPlayers, ...currentEnemies];
        const actor = allParticipants.find((participant) => participant.id === actorId);
        const target = allParticipants.find((participant) => participant.id === targetId);
        setBattleRound(replayEvent.round);

        if (replayEvent.type === "ACTION") {
          const skillId = String(payload.skillId ?? "BASIC_ATTACK");
          const isSkill = skillId !== "BASIC_ATTACK";
          const unit = buildBattlePresentationUnit(authoritativeEvents, authoritativeEventIndex);
          clearPresentationTimers();
          setActiveSkillCutIn(null);
          setTargetLine(null);
          setActiveShakingCharId(null);
          setDamagePopup(null);
          setPresentationPhase("ACTOR_FOCUS");
          const nextTargetId = String(payload.targetId ?? unit?.targets[0]?.targetId ?? "");
          if (typeof window !== "undefined") {
            const battleWindow = window as typeof window & { __TRIBE_BATTLE_PRESENTATION__?: { current?: any; history: any[] } };
            const metrics = battleWindow.__TRIBE_BATTLE_PRESENTATION__ ||= { history: [] };
            if (metrics.current) {
              metrics.history.push({ ...metrics.current, totalMs: Math.round(performance.now() - metrics.current.startedAt) });
            }
            const startedAt = performance.now();
            metrics.current = { kind: isSkill ? "skill" : "normal", skillId, actorId, targetId: nextTargetId || null, startedAt, actorFocusAt: startedAt };
          }
          const actorName = safeBattleCharacterName(actor?.name);
          const skillName = resolveBattleSkillLabel(skillId, (actor?.skills || []) as Array<Record<string, unknown>>);
          const tier = battlePresentationTier(isSkill, actor?.rarity);
          setActionPresentation(unit ? { unit, beat: "ACTOR", tier, skillName } : null);
          const nextActions = authoritativeEvents
            .slice(authoritativeEventIndex)
            .filter((entry) => entry.type === "ACTION")
            .slice(0, 3)
            .map((entry) => {
              const id = String(entry.payload.actorId ?? "");
              const participant = allParticipants.find((candidate) => candidate.id === id);
              return { id, name: participant?.name ?? "キャラクター", isEnemy: currentEnemies.some((candidate) => candidate.id === id) };
            })
            .filter((entry) => entry.id);
          setAuthoritativeTimeline(nextActions);
          setActiveSkillCutIn({ charName: actorName, skillName });
          const actorTimelineIndex = timeline.findIndex((entry) => entry.id === actorId);
          if (actorTimelineIndex >= 0) setTimelineIndex(actorTimelineIndex);
          setBattleLog((previous) => [...previous, `[ROUND ${replayEvent.round}] ${actorName}：${skillName}`]);
        } else if (outcomeUnit) {
          const actionEvent = authoritativeEvents[outcomeUnit.replayStartCursor];
          const actionActorId = outcomeUnit.actorId;
          const actionActor = allParticipants.find((participant) => participant.id === actionActorId);
          const actionSkillId = outcomeUnit.skillId;
          const actionIsSkill = actionSkillId !== "BASIC_ATTACK";
          const actionSkillName = resolveBattleSkillLabel(actionSkillId, (actionActor?.skills || []) as Array<Record<string, unknown>>);
          const actionTier = battlePresentationTier(actionIsSkill, actionActor?.rarity);
          const groupByTarget = new Map(outcomeUnit.targets.map((group) => [group.targetId, group]));
          const projectParticipant = (participant: ParticipantState) => {
            const group = groupByTarget.get(participant.id);
            if (!group) return participant;
            let next = participant;
            for (const event of group.events) {
              if (event.type === "DAMAGE") {
                const remainingHp = Math.max(0, Number(event.payload.remainingHp ?? event.payload.hpAfter ?? next.hp));
                next = projectActiveEffects({ ...next, hp: remainingHp, isDead: remainingHp <= 0 }, event.payload);
              } else if (event.type === "HEAL") {
                const remainingHp = Math.max(0, Number(event.payload.remainingHp ?? event.payload.hpAfter ?? next.hp));
                next = { ...next, hp: remainingHp, isDead: false };
              } else if (event.type === "STATUS" || event.type === "EFFECT") {
                next = projectActiveEffects(next, event.payload);
              } else if (event.type === "DEFEAT") {
                next = { ...next, hp: 0, isDead: true };
              }
            }
            return next;
          };
          const nextPlayers = currentPlayers.map(projectParticipant);
          const nextEnemies = currentEnemies.map(projectParticipant);
          for (const group of outcomeUnit.targets) {
            const hpEvent = [...group.events].reverse().find((event) => event.type === "DAMAGE" || event.type === "HEAL" || event.type === "DEFEAT");
            if (!hpEvent || (hpEvent.type !== "DAMAGE" && hpEvent.type !== "HEAL" && hpEvent.type !== "DEFEAT")) continue;
            const before = [...currentPlayers, ...currentEnemies].find((participant) => participant.id === group.targetId);
            const after = [...nextPlayers, ...nextEnemies].find((participant) => participant.id === group.targetId);
            if (!after) continue;
            const replayRemainingHp = hpEvent.type === "DEFEAT"
              ? 0
              : Math.max(0, Number(hpEvent.payload.remainingHp ?? hpEvent.payload.hpAfter ?? after.hp));
            recordBattleHpProjection({
              actorId: actionActorId,
              targetId: group.targetId,
              side: currentPlayers.some((participant) => participant.id === group.targetId) ? "player" : "enemy",
              eventType: hpEvent.type,
              eventIndex: hpEvent.index,
              round: hpEvent.round,
              source: typeof hpEvent.payload.source === "string" ? hpEvent.payload.source : null,
              canonicalHpBefore: before?.hp ?? null,
              canonicalDamage: hpEvent.type === "DAMAGE" ? Math.max(0, Number(hpEvent.payload.hpDamage ?? hpEvent.payload.amount ?? 0)) : 0,
              canonicalHeal: hpEvent.type === "HEAL" ? Math.max(0, Number(hpEvent.payload.effectiveAmount ?? hpEvent.payload.amount ?? 0)) : 0,
              replayRemainingHp,
              presentationProjectedHp: Math.max(0, Number(after.hp) || 0),
              stateBefore: before?.hp ?? null,
              isDead: after.isDead === true,
            });
          }
          playerPartyStatesRef.current = nextPlayers;
          enemyPartyStatesRef.current = nextEnemies;
          setPlayerPartyStates(nextPlayers);
          setEnemyPartyStates(nextEnemies);
          setBattleRound(actionEvent.round);
          setTargetLine(null);
          const firstDamage = outcomeUnit.targets.flatMap((group) => group.events.map((event) => ({ group, event }))).find(({ event }) => event.type === "DAMAGE");
          const firstHeal = outcomeUnit.targets.flatMap((group) => group.events.map((event) => ({ group, event }))).find(({ event }) => event.type === "HEAL");
          const firstShield = outcomeUnit.targets.flatMap((group) => group.events.map((event) => ({ group, event }))).find(({ event }) => event.type === "EFFECT" && event.payload.kind === "SHIELD");
          const audioOutcome = firstDamage ?? firstHeal ?? firstShield;
          if (audioOutcome) {
            const event = audioOutcome.event;
            const popupType = event.type === "DAMAGE" ? "dmg" : event.type === "HEAL" ? "heal" : "shield";
            const amount = event.type === "HEAL"
              ? Number(event.payload.effectiveAmount ?? event.payload.amount ?? 0)
              : Number(event.payload.amount ?? 0);
            setDamagePopup({ val: Math.max(0, amount), type: popupType, isCritical: event.payload.critical === true, x: 120, y: 40, charId: audioOutcome.group.targetId });
          }
          setActiveShakingCharId(firstDamage?.event.payload.hit === false ? null : firstDamage?.group.targetId ?? null);
          setPresentationPhase("IMPACT");
          setActionPresentation({ unit: outcomeUnit, beat: "IMPACT", tier: actionTier, skillName: actionSkillName });
          recordPresentationStage("impactAt", outcomeUnit.targets[0]?.targetId);
          recordPresentationStage("damageAt", outcomeUnit.targets[0]?.targetId);
          recordPresentationStage("hpSettledAt", outcomeUnit.targets[0]?.targetId);
          if (firstDamage) playCyberSe(firstDamage.event.payload.hit === false ? "click" : "hit");
          else if (firstHeal || firstShield) playCyberSe("click");

          const remainingBudget = Math.max(180, battlePresentationBudget(actionTier, battleSpeed, battleMode !== "RAID" || Boolean(battlePresentationContext?.raidRoomId)) - battlePresentationImpactAt(battleSpeed, actionTier, battleMode !== "RAID" || Boolean(battlePresentationContext?.raidRoomId)));
          presentationTimersRef.current.push(setTimeout(() => {
            setActionPresentation({ unit: outcomeUnit, beat: "RETURN", tier: actionTier, skillName: actionSkillName });
            setPresentationPhase("HP_TRANSITION");
          }, Math.round(remainingBudget * .55)));
          presentationTimersRef.current.push(setTimeout(() => {
            setPresentationPhase("ACTION_HOLD");
            recordPresentationStage("actionCompleteAt");
          }, Math.max(120, remainingBudget - 70)));

          const advanceReplayTo = (next: number) => {
            if (authoritativeReplayId && typeof window !== "undefined") window.localStorage.setItem(patrolReplayCursorKey(authoritativeReplayId), String(next));
            if (battleMode === "PATROL") setOfficialPatrolEventIndex(next);
            else if (battleMode === "PVP") setOfficialPvpEventIndex(next);
            else if (battleMode === "RAID") setOfficialRaidEventIndex(next);
            else if (battleMode === "GVG" || battleMode === "PVP_PRACTICE") setCanonicalAuxEventIndex(next);
          };
          const hpTargetIds = new Set(outcomeUnit.targets
            .filter((group) => group.events.some((event) => event.type === "DAMAGE" || event.type === "HEAL" || event.type === "DEFEAT"))
            .map((group) => group.targetId));
          const hpTargets = [...nextPlayers, ...nextEnemies].filter((participant) => hpTargetIds.has(participant.id));
          const gateGeneration = presentationGateGenerationRef.current;
          const finishAction = async () => {
            const gate = await waitForBattleHpParityGate(
              () => waitForRenderedBattleActionHpParity(hpTargets, {
                round: actionEvent.round,
                actorId: actionActorId,
                replayStartCursor: outcomeUnit.replayStartCursor,
              }),
              {
                boundary: "ACTION",
                replayId: authoritativeReplayId,
                round: actionEvent.round,
                actorId: actionActorId,
                replayCursor: outcomeUnit.replayStartCursor,
              },
              { isActive: () => presentationGateGenerationRef.current === gateGeneration },
            );
            if (gate.status === "cancelled") return;
            advanceReplayTo(outcomeUnit.nextReplayCursor);
          };
          presentationTimersRef.current.push(setTimeout(() => void finishAction(), remainingBudget));
          return;
        } else if (replayEvent.type === "DAMAGE") {
          setPresentationPhase("IMPACT");
          recordPresentationStage("impactAt", targetId);
          const amount = Math.max(0, Number(payload.amount ?? 0));
          const remainingHp = Math.max(0, Number(payload.remainingHp ?? payload.hpAfter ?? target?.hp ?? 0));
          const critical = payload.critical === true;
          const missed = payload.hit === false;
          const updateTarget = (participant: ParticipantState) => participant.id === targetId
            ? projectActiveEffects({ ...participant, hp: remainingHp, isDead: remainingHp <= 0 }, payload)
            : participant;
          const projectHpTransition = () => {
            const beforePlayers = playerPartyStatesRef.current;
            const beforeEnemies = enemyPartyStatesRef.current;
            const nextPlayers = beforePlayers.map(updateTarget);
            const nextEnemies = beforeEnemies.map(updateTarget);
            const beforeTarget = [...beforePlayers, ...beforeEnemies].find((participant) => participant.id === targetId);
            const afterTarget = [...nextPlayers, ...nextEnemies].find((participant) => participant.id === targetId);
            playerPartyStatesRef.current = nextPlayers;
            enemyPartyStatesRef.current = nextEnemies;
            setPlayerPartyStates(nextPlayers);
            setEnemyPartyStates(nextEnemies);
            if (typeof window !== "undefined") {
              recordBattleHpProjection({
                actorId,
                targetId,
                side: beforePlayers.some((participant) => participant.id === targetId) ? "player" : "enemy",
                eventType: "DAMAGE",
                eventIndex: authoritativeEventIndex,
                round: replayEvent.round,
                source: typeof payload.source === "string" ? payload.source : null,
                canonicalHpBefore: beforeTarget?.hp ?? null,
                canonicalDamage: Math.max(0, Number(payload.hpDamage ?? payload.amount ?? 0)),
                canonicalHeal: 0,
                replayRemainingHp: remainingHp,
                presentationProjectedHp: afterTarget?.hp ?? remainingHp,
                stateBefore: beforeTarget?.hp ?? null,
                isDead: afterTarget?.isDead === true,
              });
            }
          };
          // DAMAGE is the authoritative HP boundary. Project it immediately
          // when that replay event is consumed; presentation timers may be
          // cleared by the following ACTION and must never own gameplay state.
          projectHpTransition();
          setTargetLine(actorId && targetId ? { fromId: actorId, toId: targetId } : null);
          setActiveShakingCharId(missed ? null : targetId);
          setDamagePopup({ val: amount, type: "dmg", isCritical: critical, x: 120, y: 40, charId: targetId });
          presentationTimersRef.current.push(setTimeout(() => {
            setPresentationPhase("DAMAGE");
            recordPresentationStage("damageAt", targetId);
          }, followsSkill ? 180 : 100 / battleSpeed));
          presentationTimersRef.current.push(setTimeout(() => {
            setPresentationPhase("HP_TRANSITION");
            recordPresentationStage("hpSettledAt", targetId);
          }, followsSkill ? 480 : 450 / battleSpeed));
          presentationTimersRef.current.push(setTimeout(() => {
            setPresentationPhase("ACTION_HOLD");
            recordPresentationStage("actionCompleteAt");
          }, followsSkill ? 850 : 900 / battleSpeed));
          playCyberSe(missed ? "click" : "hit");
          setBattleLog((previous) => [...previous, missed
            ? `${actor?.name ?? actorId}の攻撃は外れた。`
            : `${target?.name ?? targetId}に ${amount.toLocaleString()}${critical ? " 【CRITICAL!】" : ""} ダメージ。`]);
        } else if (replayEvent.type === "HEAL") {
          setPresentationPhase("IMPACT");
          recordPresentationStage("impactAt", targetId);
          const amount = Math.max(0, Number(payload.effectiveAmount ?? payload.amount ?? 0));
          const remainingHp = Math.max(0, Number(payload.remainingHp ?? payload.hpAfter ?? target?.hp ?? 0));
          const updateTarget = (participant: ParticipantState) => participant.id === targetId
            ? { ...participant, hp: remainingHp, isDead: false }
            : participant;
          const projectHpTransition = () => {
            const beforePlayers = playerPartyStatesRef.current;
            const beforeEnemies = enemyPartyStatesRef.current;
            const nextPlayers = beforePlayers.map(updateTarget);
            const nextEnemies = beforeEnemies.map(updateTarget);
            const beforeTarget = [...beforePlayers, ...beforeEnemies].find((participant) => participant.id === targetId);
            const afterTarget = [...nextPlayers, ...nextEnemies].find((participant) => participant.id === targetId);
            playerPartyStatesRef.current = nextPlayers;
            enemyPartyStatesRef.current = nextEnemies;
            setPlayerPartyStates(nextPlayers);
            setEnemyPartyStates(nextEnemies);
            recordBattleHpProjection({
              actorId,
              targetId,
              side: beforePlayers.some((participant) => participant.id === targetId) ? "player" : "enemy",
              eventType: "HEAL",
              eventIndex: authoritativeEventIndex,
              round: replayEvent.round,
              source: typeof payload.source === "string" ? payload.source : null,
              canonicalHpBefore: beforeTarget?.hp ?? null,
              canonicalDamage: 0,
              canonicalHeal: amount,
              replayRemainingHp: remainingHp,
              presentationProjectedHp: afterTarget?.hp ?? remainingHp,
              stateBefore: beforeTarget?.hp ?? null,
              isDead: afterTarget?.isDead === true,
            });
          };
          projectHpTransition();
          setTargetLine(actorId && targetId ? { fromId: actorId, toId: targetId } : null);
          setDamagePopup({ val: amount, type: "heal", x: 120, y: 40, charId: targetId });
          presentationTimersRef.current.push(setTimeout(() => {
            setPresentationPhase("DAMAGE");
            recordPresentationStage("damageAt", targetId);
          }, followsSkill ? 180 : 100 / battleSpeed));
          presentationTimersRef.current.push(setTimeout(() => {
            setPresentationPhase("HP_TRANSITION");
            recordPresentationStage("hpSettledAt", targetId);
          }, followsSkill ? 480 : 450 / battleSpeed));
          presentationTimersRef.current.push(setTimeout(() => {
            setPresentationPhase("ACTION_HOLD");
            recordPresentationStage("actionCompleteAt");
          }, followsSkill ? 850 : 900 / battleSpeed));
          playCyberSe("click");
          setBattleLog((previous) => [...previous, `${target?.name ?? targetId}のHPが ${amount.toLocaleString()} 回復。`]);
        } else if (replayEvent.type === "STATUS") {
          setPresentationPhase("IMPACT");
          recordPresentationStage("impactAt", targetId);
          setTargetLine(actorId && targetId ? { fromId: actorId, toId: targetId } : null);
          const status = String(payload.status ?? "STATUS");
          const updateTarget = (participant: ParticipantState) => participant.id === targetId ? projectActiveEffects(participant, payload) : participant;
          setPlayerPartyStates((previous) => { const next = previous.map(updateTarget); playerPartyStatesRef.current = next; return next; });
          setEnemyPartyStates((previous) => { const next = previous.map(updateTarget); enemyPartyStatesRef.current = next; return next; });
          presentationTimersRef.current.push(setTimeout(() => {
            setPresentationPhase("DAMAGE");
            recordPresentationStage("damageAt", targetId);
          }, followsSkill ? 180 : 100 / battleSpeed));
          presentationTimersRef.current.push(setTimeout(() => {
            setPresentationPhase("HP_TRANSITION");
            recordPresentationStage("hpSettledAt", targetId);
          }, followsSkill ? 480 : 450 / battleSpeed));
          presentationTimersRef.current.push(setTimeout(() => {
            setPresentationPhase("ACTION_HOLD");
            recordPresentationStage("actionCompleteAt");
          }, followsSkill ? 850 : 900 / battleSpeed));
          setBattleLog((previous) => [...previous, `${target?.name ?? targetId}に ${status} が付与された。`]);
        } else if (replayEvent.type === "EFFECT") {
          const kind = String(payload.kind ?? "EFFECT");
          const updateTarget = (participant: ParticipantState) => participant.id === targetId ? projectActiveEffects(participant, payload) : participant;
          setPlayerPartyStates((previous) => { const next = previous.map(updateTarget); playerPartyStatesRef.current = next; return next; });
          setEnemyPartyStates((previous) => { const next = previous.map(updateTarget); enemyPartyStatesRef.current = next; return next; });
          if (kind !== "ACTIVE_EFFECT_SYNC") {
            setPresentationPhase("IMPACT");
            recordPresentationStage("impactAt", targetId);
            setTargetLine(actorId && targetId ? { fromId: actorId, toId: targetId } : null);
          }
          if (kind === "SHIELD") {
            setDamagePopup({ val: Math.max(0, Number(payload.amount || 0)), type: "shield", x: 120, y: 40, charId: targetId });
          }
          if (kind !== "ACTIVE_EFFECT_SYNC") {
            presentationTimersRef.current.push(setTimeout(() => {
              setPresentationPhase("DAMAGE");
              recordPresentationStage("damageAt", targetId);
            }, followsSkill ? 180 : 100 / battleSpeed));
            presentationTimersRef.current.push(setTimeout(() => {
              setPresentationPhase("HP_TRANSITION");
              recordPresentationStage("hpSettledAt", targetId);
            }, followsSkill ? 480 : 450 / battleSpeed));
            presentationTimersRef.current.push(setTimeout(() => {
              setPresentationPhase("ACTION_HOLD");
              recordPresentationStage("actionCompleteAt");
            }, followsSkill ? 850 : 900 / battleSpeed));
          }
        } else if (replayEvent.type === "DEFEAT") {
          const updateTarget = (participant: ParticipantState) => participant.id === targetId
            ? { ...participant, hp: 0, isDead: true }
            : participant;
          const nextPlayers = playerPartyStatesRef.current.map(updateTarget);
          const nextEnemies = enemyPartyStatesRef.current.map(updateTarget);
          playerPartyStatesRef.current = nextPlayers;
          enemyPartyStatesRef.current = nextEnemies;
          setPlayerPartyStates(nextPlayers);
          setEnemyPartyStates(nextEnemies);
          setBattleLog((previous) => [...previous, `${target?.name ?? targetId}は戦闘不能。`]);
        } else if (replayEvent.type === "RESULT") {
          // RESULT may follow the final grouped impact before React's HP width
          // transition has visually settled. Read canonical replay HP, then
          // keep the field mounted until existing state, DOM and bar agree.
          const canonicalPlayers = reconcileBattleHpFromReplay(
            playerPartyStatesRef.current,
            authoritativeEvents,
            authoritativeEventIndex,
          );
          const canonicalEnemies = reconcileBattleHpFromReplay(
            enemyPartyStatesRef.current,
            authoritativeEvents,
            authoritativeEventIndex,
          );
          // RESULT owns the canonical terminal projection. Commit it before
          // waiting for CSS HP transitions, then keep polling this same RESULT
          // event until the already-resolved replay is visibly settled. The
          // former one-shot `return` had no state/index change to retrigger this
          // effect, leaving Journey battles mounted forever after the last KO.
          playerPartyStatesRef.current = canonicalPlayers;
          enemyPartyStatesRef.current = canonicalEnemies;
          setPlayerPartyStates(canonicalPlayers);
          setEnemyPartyStates(canonicalEnemies);
          const gateGeneration = presentationGateGenerationRef.current;
          const finishCanonicalResult = async () => {
            const gate = await waitForBattleHpParityGate(
              () => waitForRenderedBattleHpParity([...canonicalPlayers, ...canonicalEnemies]),
              {
                boundary: "RESULT",
                replayId: authoritativeReplayId,
                round: replayEvent.round,
                replayCursor: authoritativeEventIndex,
              },
              { isActive: () => presentationGateGenerationRef.current === gateGeneration },
            );
            if (gate.status === "cancelled") return;
            clearPresentationTimers();
            setActionPresentation(null);
            setActiveSkillCutIn(null);
            setTargetLine(null);
            setActiveShakingCharId(null);
            setDamagePopup(null);
            setPresentationPhase("IDLE");
            setAuthoritativeTimeline([]);
            const winner = payload.winner === "PLAYER" ? "VICTORY" : "DEFEAT";
            void endBattleSession(winner);
          };
          void finishCanonicalResult();
          return;
        }

        // Keep actor/target/impact context mounted until the next authoritative
        // ACTION. ACTION + DAMAGE/STATUS/DEFEAT is one visual unit.
        const advanceReplay = (previous: number) => {
          const next = previous + 1;
          if (authoritativeReplayId && typeof window !== "undefined") {
            window.localStorage.setItem(patrolReplayCursorKey(authoritativeReplayId), String(next));
          }
          return next;
        };
        if (battleMode === "PATROL") setOfficialPatrolEventIndex(advanceReplay);
        else if (battleMode === "PVP") setOfficialPvpEventIndex(advanceReplay);
        else if (battleMode === "RAID") setOfficialRaidEventIndex(advanceReplay);
        else if (battleMode === "GVG" || battleMode === "PVP_PRACTICE") setCanonicalAuxEventIndex(advanceReplay);
      }, replayDelay);

      return () => clearTimeout(timer);
    }

    const activeNode = timeline[timelineIndex];
    if (!activeNode) return;

    const timer = setTimeout(() => {
      if (activeNode.isEnemy) {
        executeEnemyTurn(activeNode.id, timelineIndex);
      } else {
        executeAutoPlayerTurn(activeNode.id, timelineIndex);
      }
    }, 1500 / battleSpeed);

    return () => clearTimeout(timer);
  }, [battleState, battleMode, timelineIndex, isAutoPaused, battleSpeed, officialPatrolEvents, officialPatrolEventIndex, officialPatrolReplayId, officialPvpEvents, officialPvpEventIndex, officialPvpReplayId, officialRaidEvents, officialRaidEventIndex, officialRaidReplayId, canonicalAuxEvents, canonicalAuxEventIndex, canonicalAuxReplayId]);

  const endBattleSession = async (result: "VICTORY" | "DEFEAT") => {
    if (!session || battleEndingInFlightRef.current) return;
    battleEndingInFlightRef.current = true;
    const modeTemp = battleMode;
    const opponentNameTemp = battleOpponentName;
    const gvgAreaTemp = gvgTargetBaseId;
    const gvgAttackIdTemp = officialGvgAttackId;
    const gvgReplayIdTemp = officialGvgReplayId;
    const gvgWinnerTemp = officialGvgWinner;
    const hasOfficialGvgResult = modeTemp === "GVG" && gvgAttackIdTemp && gvgReplayIdTemp
      && (gvgWinnerTemp === "PLAYER" || gvgWinnerTemp === "ENEMY");
    // React state may still belong to the render that started replay playback.
    // Keep the authoritative result in refs so the RESULT event cannot race the
    // state commit and accidentally turn a server victory into a client defeat.
    const patrolWinnerTemp = officialPatrolWinnerRef.current ?? officialPatrolWinner;
    const patrolReplayIdTemp = officialPatrolReplayIdRef.current ?? officialPatrolReplayId;
    const hasOfficialPatrolResult = modeTemp === "PATROL" && patrolReplayIdTemp
      && (patrolWinnerTemp === "PLAYER" || patrolWinnerTemp === "ENEMY");
    const pvpWinnerTemp = officialPvpWinner;
    const pvpReplayIdTemp = officialPvpReplayId;
    const pvpResultTemp = officialPvpResult;
    const hasOfficialPvpResult = modeTemp === "PVP" && officialPvpReplayId
      && (pvpWinnerTemp === "PLAYER" || pvpWinnerTemp === "ENEMY");
    const raidWinnerTemp = officialRaidWinner;
    const raidReplayIdTemp = officialRaidReplayId;
    const raidResultTemp = officialRaidResult;
    const replayEventsTemp = modeTemp === "PATROL" ? officialPatrolEvents
      : modeTemp === "PVP" ? officialPvpEvents
      : modeTemp === "RAID" ? officialRaidEvents
      : modeTemp === "GVG" || modeTemp === "PVP_PRACTICE" ? canonicalAuxEvents
      : [];
    setBattleResultReplayEvents(replayEventsTemp);
    const hasOfficialRaidResult = modeTemp === "RAID" && officialRaidReplayId
      && officialRaidResult
      && (raidWinnerTemp === "PLAYER" || raidWinnerTemp === "ENEMY");
    const finalResult = hasOfficialGvgResult
      ? (gvgWinnerTemp === "PLAYER" ? "VICTORY" : "DEFEAT")
      : hasOfficialPatrolResult
        ? (patrolWinnerTemp === "PLAYER" ? "VICTORY" : "DEFEAT")
        : hasOfficialPvpResult
          ? (pvpWinnerTemp === "PLAYER" ? "VICTORY" : "DEFEAT")
          : hasOfficialRaidResult
            ? (raidWinnerTemp === "PLAYER" ? "VICTORY" : "DEFEAT")
            : result;
    setBattleOutcome(finalResult);
    setBattleState("ENDING");
    setOfficialGvgAttackId(null);
    setOfficialGvgReplayId(null);
    setOfficialGvgWinner(null);
    setOfficialPatrolReplayId(null);
    setOfficialPatrolWinner(null);
    setOfficialPatrolEvents([]);
    setOfficialPatrolEventIndex(0);
    setOfficialPvpReplayId(null);
    setOfficialPvpWinner(null);
    setOfficialPvpEvents([]);
    setOfficialPvpEventIndex(0);
    setOfficialPvpResult(null);
    setCanonicalAuxReplayId(null);
    setCanonicalAuxEvents([]);
    setCanonicalAuxEventIndex(0);
    setOfficialRaidReplayId(null);
    setOfficialRaidWinner(null);
    setOfficialRaidEvents([]);
    setOfficialRaidEventIndex(0);
    setOfficialRaidResult(null);
    if (patrolReplayIdTemp && typeof window !== "undefined") {
      window.localStorage.removeItem(patrolReplayCursorKey(patrolReplayIdTemp));
    }
    if (pvpReplayIdTemp && typeof window !== "undefined") {
      window.localStorage.removeItem(patrolReplayCursorKey(pvpReplayIdTemp));
    }
    if (raidReplayIdTemp && typeof window !== "undefined") {
      window.localStorage.removeItem(patrolReplayCursorKey(raidReplayIdTemp));
    }
    setGvgTargetBaseId(null);
    const isWin = finalResult === "VICTORY";
    if (modeTemp === "PATROL" && isWin && activePatrolEncounterIdRef.current) setSettledPatrolEncounterId(activePatrolEncounterIdRef.current);

    // Keep the battle surface mounted through the final-hit hold. Result-side
    // synchronization may continue behind the outcome presentation, but the
    // tutorial encounter entry points must not become available again.
    await new Promise((resolve) => window.setTimeout(resolve, Math.max(680, 760 / battleSpeed)));
    setBattleState("OUTCOME");
    await new Promise((resolve) => window.setTimeout(resolve, Math.max(900, 980 / battleSpeed)));

    const releaseBattlePresentation = () => {
      roomPresentationUserRef.current = null;
      setBattleState(null);
      setBattleMode(null);
      setBattleOutcome(null);
      setBattleSessionId(null);
      battleEndingInFlightRef.current = false;
    };

    if (modeTemp === "PVP_PRACTICE") {
      setBattleModeResultDetail({
        resultLabel: "NPC模擬戦結果",
        stats: [
          { label: "MODE", value: "PRACTICE" },
          { label: "BP", value: "消費なし" },
          { label: "RANK", value: "変動なし" },
        ],
        reward: "報酬なし",
        note: "模擬戦は戦績・ランキング・報酬へ反映されません。",
        continueLabel: "バトルへ戻る",
        destination: "pvp",
      });
      setBattleState("RESULT");
      return;
    }

    if (battleSessionId) {
      await supabase.from("battle_sessions").update({ status: finalResult }).eq("id", battleSessionId);
    }

    const { data: tutorialSession } = await supabase
      .from("story_sessions")
      .select("*")
      .eq("user_id", session.user.id)
      .single();

    if (modeTemp !== "PATROL" && tutorialSession && tutorialSession.stage_id === "stage_tutorial_01" && tutorialSession.status === "BATTLE") {
      if (isWin) {
        await supabase.from("story_sessions").update({ status: "OUTRO_TALK", current_node_id: 0 }).eq("user_id", session.user.id);
      } else {
        await supabase.from("story_sessions").update({ status: "INTRO_TALK", current_node_id: 0 }).eq("user_id", session.user.id);
      }
      await syncBootstrapData(session.user.id);
      releaseBattlePresentation();
      return;
    }

    if (modeTemp === "PATROL") {
      // Patrol resolution is committed by resolve-battle. The browser only
      // plays the animation and reflects the already-authoritative result.
      // Keep this component as the sole result owner until bootstrap has
      // observed the resolved patrol; otherwise the tutorial prompt can mount
      // again with a stale unresolved encounter and issue a duplicate start.
      await syncBootstrapData(session.user.id);
      setBattleState("RESULT");
      return;
    } else if (modeTemp === "PVP") {
      if (!hasOfficialPvpResult || !pvpResultTemp) {
        releaseBattlePresentation();
        setErrorMessage("バトルのサーバー確定結果を確認できませんでした。");
        return;
      }
      const pointsDiff = Number(pvpResultTemp.rankDelta ?? 0);
      const rewardCash = Number(pvpResultTemp.rewards?.cash ?? 0);
      const oldRating = Number(pvpResultTemp.oldRating ?? pvpRate);
      const newRating = Number(pvpResultTemp.newRankPoints ?? pvpRate);
      setPvpRate?.(newRating);
      setPvpPoints(Number(pvpResultTemp.remainingPvpPoints ?? pvpPoints));
      postNpcYajiMessage(session, username, "GLOBAL", currentBaseId, "PVP_WIN");
      await syncBootstrapData(session.user.id);
      const { data: firstPvpMilestone } = await supabase.from("user_funnel_milestones")
        .select("occurrence_count").eq("user_id", session.user.id).eq("milestone", "first_pvp").maybeSingle();
      const isFirstOfficialPvp = Number(firstPvpMilestone?.occurrence_count || 0) === 1;
      setBattleModeResultDetail({
        stats: [
          { label: "RATE", value: `${oldRating.toLocaleString()} → ${newRating.toLocaleString()}` },
          { label: "RANK CHANGE", value: `${pointsDiff >= 0 ? "+" : ""}${pointsDiff} pt` },
          { label: "BP", value: `${Number(pvpResultTemp.remainingPvpPoints ?? 0)}/5` },
        ],
        reward: `CASH +${rewardCash.toLocaleString()}`,
        note: isFirstOfficialPvp ? "初戦の順位を確認して、次のレイドへ進もう。" : "バトルへ戻って次の対戦相手を選べます。",
        continueLabel: isFirstOfficialPvp ? "ランキングを確認" : "バトルへ戻る",
        destination: isFirstOfficialPvp ? "ranking" : "pvp",
      });
      setBattleState("RESULT");
      return;
    } else if (modeTemp === "RAID") {
      if (hasOfficialRaidResult && raidResultTemp) {
        await syncBootstrapData(session.user.id);
        setBattleModeResultDetail({
          raidReceipt: projectRaidResultReceipt(raidResultTemp),
          stats: [
            ...(raidResultTemp.roomId ? [
              { label: "今回の個人ダメージ", value: Number(raidResultTemp.rawDamage || 0).toLocaleString() },
              { label: "共有HPへの反映", value: Number(raidResultTemp.appliedDamage || 0).toLocaleString() },
            ] : [{ label: "今回のダメージ", value: Number(raidResultTemp.appliedDamage || 0).toLocaleString() }]),
            { label: "累計貢献ダメージ", value: Number(raidResultTemp.personalContribution || 0).toLocaleString() },
            { label: "ボス残りHP", value: Number(raidResultTemp.remainingBossHp || 0).toLocaleString() },
          ],
          reward: raidResultTemp.roomId ? "討伐・救援報酬はレイドの「報酬」で確認できます。条件達成時はプレゼントBOXへ届きます。" : raidResultTemp.rewardProjectionUnavailable
            ? "報酬はサーバーで確定済み"
            : Array.isArray(raidResultTemp.grantedRewards) && raidResultTemp.grantedRewards.length > 0
              ? "獲得報酬"
              : "今回の新規報酬はありません",
          rewards: Array.isArray(raidResultTemp.grantedRewards)
            ? raidResultTemp.grantedRewards.map((entry: any) => ({
                id: String(entry.itemId || ""),
                name: String(entry.itemId) === "CASH" ? "キャッシュ" : canonicalItemName(String(entry.itemId || "")),
                quantity: Number(entry.quantity || 0),
              })).filter((entry: any) => entry.id && entry.quantity > 0)
            : [],
          note: raidResultTemp.roomId ? (raidResultTemp.lateFinalization ? "開催終了後の確定です。個人貢献のみ記録しました。" : undefined) : userGuildMember ? undefined : "ギルドに加入すると、ギルドランキングに参加できます。",
          continueLabel: "レイドへ戻る",
          destination: "raid",
        });
        setBattleState("RESULT");
        return;
      }
      releaseBattlePresentation();
      setErrorMessage("Raidのサーバー確定結果を確認できませんでした。再度Raidを開始してください。");
      return;
    } else if (modeTemp === "GVG") {
      releaseBattlePresentation();
      const guildIdFilter = userGuildMember?.guild_id || "";
      if (gvgAttackIdTemp && gvgReplayIdTemp) {
        try {
          const { data, error } = await supabase.rpc("resolve_gvg_attack", {
            p_attack_id: gvgAttackIdTemp,
            p_battle_replay_session_id: gvgReplayIdTemp,
            // migration 00068 ignores these client values and reads the server replay result.
            p_is_victory: false,
            p_raw_damage: 0,
          });
          if (error) throw error;
          if (setConfirmDialogConfig) {
            setConfirmDialogConfig({
              isOpen: true,
              title: "公式GvG結果",
              message: `サーバー確定結果: ${gvgWinnerTemp === "PLAYER" ? "勝利" : "敗北"}\n確定ダメージ ${Number(data?.raw_damage ?? 0).toLocaleString()}\n共通HP反映 ${Number(data?.applied_damage ?? 0).toLocaleString()}`,
              onConfirm: () => setConfirmDialogConfig(null),
              onCancel: () => setConfirmDialogConfig(null),
            });
          }
        } catch (error: any) {
          console.warn("Failed to resolve official GvG result:", error.message);
          setErrorMessage("公式GvG結果を反映できませんでした。");
        }
      // Legacy client-side GvG scoring is retired. Official attacks always
      // obtain an attack ID and are resolved through the server replay path.
      } else if (!gvgAttackIdTemp && guildIdFilter && gvgAreaTemp) {
        setErrorMessage("Official GvG attacks must be started again before their result can be resolved.");
      } else if (false) { /*
        try {
          const isPractice = gvgAreaTemp === guildIdFilter;

          if (isPractice) {
            // 防衛演習
            if (isWin) {
              // 演習勝利: 自ギルドポイントに +100
              const existRec = gvgBaseControls.find(g => g.base_id === "neon_tower" && g.guild_id === guildIdFilter);
              const nextPoints = (existRec?.daily_points || 0) + 100;
              await supabase.from("guild_base_controls").upsert({ base_id: "neon_tower", guild_id: guildIdFilter, daily_points: nextPoints });

              // ギルド進行マッチングポイント（gvg_matches）がある場合も +100 加算
              const { data: dayRec } = await supabase.from("gvg_season_status").select("current_day").eq("id", 1).maybeSingle();
              const currentDay = dayRec?.current_day || 1;
              const isFinalDay = currentDay === 7;

              const { data: matchRecs } = await supabase
                .from("gvg_matches")
                .select("*")
                .eq("status", "ONGOING")
                .eq("is_finals", isFinalDay);
              
              let myMatch: any = null;
              if (matchRecs) {
                myMatch = matchRecs?.find((m: any) => m.guild_a_id === guildIdFilter || m.guild_b_id === guildIdFilter);
              }

              if (myMatch) {
                const isGuildA = myMatch!.guild_a_id === guildIdFilter;
                const nextGuildPts = isGuildA ? (myMatch.guild_a_points || 0) + 100 : (myMatch.guild_b_points || 0) + 100;
                await supabase
                  .from("gvg_matches")
                  .update(isGuildA ? { guild_a_points: nextGuildPts } : { guild_b_points: nextGuildPts })
                  .eq("id", myMatch.id);
              }

              await addGuildXpAndContributionByAction("GVG");
              if (setConfirmDialogConfig) {
                setConfirmDialogConfig!({
                  isOpen: true,
                  title: "防衛演習結果",
                  message: "防衛演習 勝利！ 自組織に100ポイント付与。",
                  onConfirm: () => setConfirmDialogConfig!(null),
                  onCancel: () => setConfirmDialogConfig!(null)
                });
              }
            } else {
              if (setConfirmDialogConfig) {
                setConfirmDialogConfig!({
                  isOpen: true,
                  title: "防衛演習結果",
                  message: "防衛演習 敗北... (ポイント変動なし)",
                  onConfirm: () => setConfirmDialogConfig!(null),
                  onCancel: () => setConfirmDialogConfig!(null)
                });
              }
            }
          } else {
            // 本番侵攻
            const res = await supabase.rpc("process_gvg_battle_result_v2", {
              p_user_id: session.user.id,
              p_guild_id: guildIdFilter,
              p_base_id: gvgAreaTemp,
              p_is_practice: false,
              p_is_win: isWin
            });
            if (res.error) throw res.error;
            if (res.data?.error) throw new Error(res.data.error);

            if (isWin) {
              await addGuildXpAndContributionByAction("GVG");
              postNpcYajiMessage(session, username, "BASE", gvgAreaTemp!, "GVG_WIN");
              if (setConfirmDialogConfig) {
                setConfirmDialogConfig!({
                  isOpen: true,
                  title: "GvG結果",
                  message: "攻撃成功！ ギルドGvGポイント +250。個人GvGポイント +250。",
                  onConfirm: () => setConfirmDialogConfig!(null),
                  onCancel: () => setConfirmDialogConfig!(null)
                });
              }
            } else {
              if (setConfirmDialogConfig) {
                setConfirmDialogConfig!({
                  isOpen: true,
                  title: "GvG結果",
                  message: "攻撃失敗… ギルドGvGポイント -100。個人GvGポイント -100。相手ギルド防衛ポイント +100。",
                  onConfirm: () => setConfirmDialogConfig!(null),
                  onCancel: () => setConfirmDialogConfig!(null)
                });
              }
            }
          }
        } catch (err: any) {
          console.warn("Failed to update GvG match score:", err.message);
        }
      */
      }
    }
    await syncBootstrapData(session.user.id);
  };

  const completeBattleResult = async () => {
    if (battleState !== "RESULT") return;
    const resultUserId = session?.user?.id;
    const attempt = roomAttemptRef.current;
    if (resultUserId && roomPresentationUserRef.current === resultUserId && attempt) {
      // The authoritative Room request also supports deployments without the
      // retired battle_sessions table. Acknowledge only after Result was shown.
      try {
        const ack = await supabase.rpc("acknowledge_raid_room_battle_recovery_v1", { p_request_id: attempt.requestId() });
        if (roomUserRef.current !== resultUserId) return;
        if (ack.error || ack.data?.status !== "acknowledged" || ack.data.requestId !== attempt.requestId()) throw new Error("出撃結果の確認記録を保存できませんでした。");
        attempt.clear();
        roomAttemptRef.current = null;
      } catch (error) {
        if (roomUserRef.current === resultUserId) setErrorMessage("結果の確認記録を保存できませんでした。同じ結果からもう一度戻ってください。");
        return;
      }
    }
    roomPresentationUserRef.current = null;
    const destination = battleModeResultDetail?.destination;
    const returnRoomId = battlePresentationContext?.raidRoomId;
    setBattleState(null);
    setBattleMode(null);
    setBattleOutcome(null);
    setBattleSessionId(null);
    officialPatrolReplayIdRef.current = null;
    officialPatrolWinnerRef.current = null;
    battleEndingInFlightRef.current = false;
    setTutorialBattleActive(false);
    setBattleResultReplayEvents([]);
    setBattlePresentationContext(null);
    setBattleSkipPending(false);
    setIsAutoPaused(false);
    setBattleModeResultDetail(null);
    if (destination === "raid") requestRaidTopRefresh?.(returnRoomId);
    if (destination) navigateTab?.(destination);
  };

  const resumeBattleSession = (activeBattleSession: any, localCharIds: string[]) => {
    if (roomPresentationUserRef.current || roomRecoveryRef.current) return;
    const pState = activeBattleSession.player_state as any;
    const eState = activeBattleSession.enemy_state as any;

    if (pState && eState) {
      setTutorialBattleActive(activeBattleSession.battle_type === "PATROL" && tutorialStep === "TUTORIAL_BATTLE");
      setBattleSessionId(activeBattleSession.id);
      setBattleMode(activeBattleSession.battle_type as any);
      setBattleOpponentName(activeBattleSession.target_id);
      setBattlePresentationContext(pState.battlePresentationContext || {
        mode: activeBattleSession.battle_type as BattleMode,
        opponentLabel: activeBattleSession.target_id,
        opponentLeaderCharacterId: eState.enemyStates?.[0]?.characterId,
        opponentLeaderName: eState.enemyStates?.[0]?.name,
      });
      setGvgTargetBaseId(pState.gvgAreaId || null);
      setOfficialGvgAttackId(pState.officialGvgAttackId || null);
      setOfficialGvgReplayId(pState.officialGvgReplayId || null);
      setOfficialGvgWinner(pState.officialGvgWinner === "PLAYER" ? "PLAYER" : pState.officialGvgWinner === "ENEMY" ? "ENEMY" : null);
      setCanonicalAuxReplayId(pState.canonicalAuxReplayId || null);
      setCanonicalAuxEvents(serverBattleEvents(pState.canonicalAuxEvents));
      setCanonicalAuxEventIndex(savedPatrolReplayCursor(pState.canonicalAuxReplayId, pState.canonicalAuxEventIndex));
      setOfficialPatrolReplayId(pState.officialPatrolReplayId || null);
      setOfficialPatrolWinner(pState.officialPatrolWinner === "PLAYER" ? "PLAYER" : pState.officialPatrolWinner === "ENEMY" ? "ENEMY" : null);
      officialPatrolReplayIdRef.current = pState.officialPatrolReplayId || null;
      officialPatrolWinnerRef.current = pState.officialPatrolWinner === "PLAYER" ? "PLAYER" : pState.officialPatrolWinner === "ENEMY" ? "ENEMY" : null;
      setOfficialPatrolEvents(serverBattleEvents(pState.officialPatrolEvents));
      setOfficialPatrolEventIndex(savedPatrolReplayCursor(pState.officialPatrolReplayId, pState.officialPatrolEventIndex));
      setOfficialPvpReplayId(pState.officialPvpReplayId || null);
      setOfficialPvpWinner(pState.officialPvpWinner === "PLAYER" ? "PLAYER" : pState.officialPvpWinner === "ENEMY" ? "ENEMY" : null);
      setOfficialPvpEvents(serverBattleEvents(pState.officialPvpEvents));
      setOfficialPvpEventIndex(savedPatrolReplayCursor(pState.officialPvpReplayId, pState.officialPvpEventIndex));
      setOfficialPvpResult(pState.officialPvpResult || null);
      setOfficialRaidReplayId(pState.officialRaidReplayId || null);
      setOfficialRaidWinner(pState.officialRaidWinner === "PLAYER" ? "PLAYER" : pState.officialRaidWinner === "ENEMY" ? "ENEMY" : null);
      setOfficialRaidEvents(serverBattleEvents(pState.officialRaidEvents));
      setOfficialRaidEventIndex(savedPatrolReplayCursor(pState.officialRaidReplayId, pState.officialRaidEventIndex));
      setOfficialRaidResult(pState.officialRaidResult || null);

      setPlayerPartyStates(pState.playerStates || []);
      setEnemyPartyStates(eState.enemyStates || []);
      setAp(0);
      setMaxAp(0);
      setTactic(pState.tactic || "ATTACK_PRIORITY");
      setBattleLog(pState.log || ["戦闘セッションを安全に復元しました。"]);

      // タイムラインの再ソート
      const timelineQueue = [
        ...(pState.playerStates || []).map((p: any) => ({ id: p.id, name: p.name, isEnemy: false, spd: p.stats.spd })),
        ...(eState.enemyStates || []).map((e: any) => ({ id: e.id, name: e.name, isEnemy: true, spd: e.stats.spd }))
      ];
      timelineQueue.sort((a: any, b: any) => b.spd - a.spd);

      setTimeline(timelineQueue);
      setTimelineIndex(pState.timelineIndex || 0);
      setBattleRound(1);

      setBattleState("PLAYING");
    }
  };

  return {
    battleSessionId, setBattleSessionId,
    battleMode, setBattleMode,
    hasRaidControlBonus, setHasRaidControlBonus,
    battleOpponentName, setBattleOpponentName,
    battleState, setBattleState,
    battleOutcome,
    tutorialBattleActive,
    battleEncounterLocked: battleState !== null || battleLoading,
    settledPatrolEncounterId,
    battleLog, setBattleLog,
    ap, setAp,
    maxAp, setMaxAp,
    tactic, setTactic,
    battleSpeed, setBattleSpeed,
    isAutoPaused, setIsAutoPaused,
    playerPartyStates, setPlayerPartyStates,
    enemyPartyStates, setEnemyPartyStates,
    timeline, setTimeline,
    timelineIndex, setTimelineIndex,
    battleRound, setBattleRound,
    activeSkillCutIn,
    targetLine,
    activeShakingCharId,
    damagePopup, setDamagePopup,
    presentationPhase,
    actionPresentation,
    authoritativeTimeline,
    battleResultReplayEvents,
    battlePresentationContext,
    battleModeResultDetail,
    battleSkipPending,
    gvgTargetBaseId, setGvgTargetBaseId,
    battleLoading, setBattleLoading,
    startCardBattle,
    prepareRaidRoomBattle,
    resumePendingRaidRoomBattle,
    confirmPreparedPvpBattle,
    cancelPreparedPvpBattle,
    confirmPreparedRaidBattle,
    cancelPreparedRaidBattle,
    launchBattlePlaying,
    skipBattlePresentation,
    handleEndTurn,
    endBattleSession,
    completeBattleResult,
    resumeBattleSession,
    resumeActiveBattleSession
  };
}

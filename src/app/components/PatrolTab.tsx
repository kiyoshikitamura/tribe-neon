"use client";

import React from "react";
import { useGame } from "../context/GameContext";
import { CHARACTERS_MASTER } from "@/utils/game_constants";
import { CANONICAL_SKILL_VIEW } from "@/utils/skills_master_data";
import { canonicalItemName } from "@/domain/gameplay/canonical/items";
import { getCharacterBaseStats } from "@/utils/stats_calculator";
import OutlawCard from "./ui/OutlawCard";
import OutlawButton from "./ui/OutlawButton";
import SubTabNav from "./ui/SubTabNav";
import SectionHeader from "./ui/SectionHeader";
import HubPage from "./ui/HubPage";
import TutorialNavigator from "./TutorialNavigator";
import CharacterPresentation from "./character/CharacterPresentation";
import { getCharacterLocationBackground } from "@/utils/characterVisualAssets";
import { supabase } from "@/utils/supabase";
import { useScreenReadiness } from "../hooks/useScreenReadiness";
import { SCREEN_ASSET_MANIFESTS } from "../lib/screenManifests";
import "./PatrolTab.css";
import { traceTutorialJourney } from "@/utils/tutorialJourneyTrace";
import QuestPresentationV2 from "./quest/QuestPresentationV2";
import CanonicalItemIcon from "./ui/CanonicalItemIcon";

function QuestRewardIcon({ itemId, quantity }: { itemId: string; quantity: number }) {
  return <span className="tutorial-wire-reward-item">
    {itemId === "PLAYER_XP" ? <b className="tutorial-wire-reward-xp">XP</b> : <CanonicalItemIcon itemId={itemId} alt="" className="tutorial-wire-reward-icon" />}
    <small>{itemId === "PLAYER_XP" ? "PLAYER XP" : canonicalItemName(itemId)}</small>
    <strong>× {Number(quantity).toLocaleString()}</strong>
  </span>;
}

export default function PatrolTab() {
  const {
    activePatrols,
    selectedTown,
    setSelectedTown,
    selectedCourse,
    setSelectedCourse,
    selectedPatrolMember,
    selectedMembers,
    togglePatrolMemberSelection,
    userCharactersDbList,
    handleStartPatrol,
    dispatchLoading,
    handleInstantComplete,
    transitionTutorialQuestToBattle,
    handleClaimRewards,
    dailyCashSkips,
    dailyPaidSkips,
    dailyCashSkipsResetDate,
    playCyberSe,
    patrolCourses,
    patrolNpcs,
    startCardBattle,
    battleState,
    tutorialBattleActive,
    battleEncounterLocked,
    settledPatrolEncounterId,
    lastPatrolRewards,
    setLastPatrolRewards,
    showPatrolRewardModal,
    setShowPatrolRewardModal,
    setGlobalInteractionBlocking,
    onboardingState,
    setOnboardingState,
    setActiveTab
  } = useGame();
  const tutorialStep = onboardingState?.tutorial_step;
  const isTutorialQuestStep = ["DISPATCH", "FREE_INSTANT", "TUTORIAL_BATTLE"].includes(tutorialStep || "");
  const tutorialActiveListRef = React.useRef<HTMLDivElement>(null);
  const questActionRef = React.useRef(false);
  const battleStartRef = React.useRef(false);
  const rewardTransitionRef = React.useRef(false);
  const autoRewardClaimRef = React.useRef<string | null>(null);
  const questCompletionObservedRef = React.useRef<string | null>(null);
  const [rewardTransitionWorking, setRewardTransitionWorking] = React.useState(false);
  const [battleStartingId, setBattleStartingId] = React.useState<string | null>(null);
  const [tutorialDispatchPresentation, setTutorialDispatchPresentation] = React.useState<"STARTED" | "PROGRESS" | "SPEEDUP">("STARTED");
  const [tutorialEncounterPresentation, setTutorialEncounterPresentation] = React.useState<"RETURN" | "ENCOUNTER">("RETURN");
  const [tutorialEncounterReady, setTutorialEncounterReady] = React.useState(false);
  const [authoritativeTutorialEncounter, setAuthoritativeTutorialEncounter] = React.useState<{
    patrolId: string;
    npc: any;
  } | null>(null);
  const tutorialEncounterPatrol = activePatrols.find((patrol: any) =>
    patrol.has_battle_event
    && !patrol.battle_resolved
    && patrol.id !== settledPatrolEncounterId
  );
  const tutorialEncounterPatrolId = tutorialEncounterPatrol?.id ?? null;
  const tutorialEncounterPatrolStatus = tutorialEncounterPatrol?.status ?? null;
  const tutorialEncounterQuestId = tutorialEncounterPatrol?.courseId ?? null;

  // コースが未選択のときに初期選択を設定
  React.useEffect(() => {
    if (patrolCourses.length > 0 && (!selectedCourse || selectedCourse === "e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1")) {
      const firstCourse = patrolCourses.find((c: any) => c.town_id === selectedTown && c.is_unlocked !== false);
      if (firstCourse) {
        setSelectedCourse(firstCourse.id);
      }
    }
  }, [patrolCourses, selectedTown, selectedCourse, setSelectedCourse]);

  // The first quest uses the canonical tutorial formation leader. Never fall
  // back to the initialization starter or whichever owned row happens to be
  // returned first by the database.
  React.useEffect(() => {
    if (tutorialStep !== "DISPATCH") return;
    const tutorialCourse = patrolCourses.find((course: any) => course.town_id === selectedTown) || patrolCourses[0];
    if (tutorialCourse && selectedCourse !== tutorialCourse.id) setSelectedCourse(tutorialCourse.id);
    const tutorialLeader = selectedMembers[0];
    if (tutorialLeader && selectedPatrolMember !== tutorialLeader) {
      togglePatrolMemberSelection(tutorialLeader);
    }
  }, [patrolCourses, selectedCourse, selectedMembers, selectedPatrolMember, selectedTown, setSelectedCourse, togglePatrolMemberSelection, tutorialStep]);

  React.useEffect(() => {
    if (tutorialStep === "FREE_INSTANT") {
      tutorialActiveListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTutorialDispatchPresentation("STARTED");
      const timer = window.setTimeout(() => setTutorialDispatchPresentation("PROGRESS"), 650);
      return () => window.clearTimeout(timer);
    }
  }, [tutorialStep]);

  React.useEffect(() => {
    if (tutorialStep === "TUTORIAL_BATTLE" && battleState === null) {
      setTutorialEncounterReady(false);
      setTutorialEncounterPresentation("RETURN");
    }
  }, [battleState, tutorialStep]);

  React.useEffect(() => {
    if (tutorialStep !== "FREE_INSTANT") return;
    const naturallyCompletedPatrol = activePatrols.find((patrol: any) =>
      patrol.status === "CLAIMABLE"
      && patrol.has_battle_event
      && !patrol.battle_resolved
    );
    if (!naturallyCompletedPatrol) return;
    void transitionTutorialQuestToBattle(naturallyCompletedPatrol.id);
  }, [activePatrols, transitionTutorialQuestToBattle, tutorialStep]);

  React.useEffect(() => {
    if (tutorialStep !== "TUTORIAL_BATTLE" || !tutorialEncounterPatrolId) {
      return;
    }

    let active = true;
    const patrolId = tutorialEncounterPatrolId;
    void supabase.rpc("get_patrol_battle_enemy", { p_patrol_id: patrolId }).then(({ data, error }) => {
      if (!active) return;
      if (error || !data?.id) {
        setAuthoritativeTutorialEncounter(null);
        traceTutorialJourney("encounter_authorization_rejected", {
          tutorialStepBefore: tutorialStep,
          nextExpectedTutorialStep: "TUTORIAL_BATTLE",
          patrolId,
          patrolStatus: tutorialEncounterPatrolStatus,
          rejectionReason: error?.message || "authoritative encounter is unavailable",
        });
        return;
      }
      setAuthoritativeTutorialEncounter({ patrolId, npc: data });
      traceTutorialJourney("encounter_authorized", {
        tutorialStepBefore: tutorialStep,
        tutorialStepAfter: tutorialStep,
        nextExpectedTutorialStep: "TUTORIAL_BATTLE",
        questId: tutorialEncounterQuestId,
        patrolId,
        patrolStatus: tutorialEncounterPatrolStatus,
        encounterId: data.id,
        encounterState: "READY",
        battleEligibility: true,
      });
    });

    return () => {
      active = false;
    };
  }, [tutorialEncounterPatrolId, tutorialEncounterPatrolStatus, tutorialEncounterQuestId, tutorialStep]);

  React.useEffect(() => {
    if (tutorialEncounterPresentation !== "ENCOUNTER") return;
    const timer = window.setTimeout(() => setTutorialEncounterReady(true), 780);
    return () => window.clearTimeout(timer);
  }, [tutorialEncounterPresentation]);

  React.useEffect(() => {
    if (tutorialStep !== "TUTORIAL_BATTLE") return;
    const completedPatrol = activePatrols.find((patrol: any) => patrol.status === "CLAIMABLE" && patrol.has_battle_event && !patrol.battle_resolved);
    if (!completedPatrol || questCompletionObservedRef.current === completedPatrol.id) return;
    questCompletionObservedRef.current = completedPatrol.id;
    const dispatchedUserCharacterId = userCharactersDbList.find(
      (ownedCharacter: any) => ownedCharacter.character_id === completedPatrol.characterId
    )?.id ?? null;
    const encounter = patrolNpcs.find((npc: any) => npc.quest_id === completedPatrol.courseId);
    traceTutorialJourney("quest_completion_observed", {
      tutorialStepBefore: "FREE_INSTANT",
      tutorialStepAfter: tutorialStep,
      nextExpectedTutorialStep: "TUTORIAL_BATTLE",
      questId: completedPatrol.courseId,
      patrolId: completedPatrol.id,
      patrolStatus: completedPatrol.status,
      dispatchedCharacterId: completedPatrol.characterId,
      dispatchedUserCharacterId,
      encounterId: encounter?.id ?? null,
      encounterState: encounter ? "READY" : "MISSING",
      battleEligibility: Boolean(encounter),
      rejectionReason: encounter ? null : "patrol NPC master is unavailable",
    });
  }, [activePatrols, patrolNpcs, tutorialStep, userCharactersDbList]);

  const activeCourse = patrolCourses.find((c: any) => c.id === selectedCourse);
  const guaranteedRewardItems = (items: any[] = []) => items.filter((item) => Number(item.probability_bp ?? 10000) >= 10000);
  const formatRewardItems = (items: any[] = []) => items
    .map((item) => `${canonicalItemName(String(item.item_id || ""))} ×${item.quantity}${Number(item.probability_bp) < 10000 ? ` (${Number(item.probability_bp) / 100}%)` : ""}`)
    .join(" / ");
  const townTabs = [
    { id: "shinjuku", label: "新宿" },
    { id: "shibuya", label: "渋谷" },
    { id: "ikebukuro", label: "池袋" },
    { id: "roppongi", label: "六本木" },
    { id: "akihabara", label: "秋葉原" },
    { id: "kawasaki", label: "川崎" },
    { id: "yokohama", label: "横浜" }
  ];
  const selectedTownLabel = townTabs.find((town) => town.id === selectedTown)?.label || "街";
  const enemyName = (characterId: string) => CHARACTERS_MASTER.find((character) => character.id === characterId)?.jpName || "未確認の敵";
  const skillName = (skillId: string) => CANONICAL_SKILL_VIEW.find((skill) => skill.id === skillId)?.name || "未確認のスキル";
  const attributeName = (attribute: string) => ({ JUSTICE: "正義", EVIL: "悪", ORDER: "秩序", CHAOS: "混沌" }[attribute] || "未設定");
  const tacticName = (tactic: string) => ({ ATTACK_PRIORITY: "攻撃優先", DEFENSE_PRIORITY: "防御優先", BALANCED: "バランス" }[tactic] || "標準");

  const handleStart = async () => {
    if (questActionRef.current) return;
    questActionRef.current = true;
    setGlobalInteractionBlocking(true);
    try {
      await handleStartPatrol();
    } finally {
      questActionRef.current = false;
      setGlobalInteractionBlocking(false);
    }
  };

  const handleInstant = async (currency: "CASH" | "DIAMOND" | "FREE_TUTORIAL" | "FREE_PREOPEN", pId: string) => {
    if (questActionRef.current) return;
    questActionRef.current = true;
    setGlobalInteractionBlocking(true);
    try {
      await handleInstantComplete(currency, pId);
    } finally {
      questActionRef.current = false;
      setGlobalInteractionBlocking(false);
    }
  };

  const handleTutorialInstant = async (pId: string) => {
    if (questActionRef.current) return;
    questActionRef.current = true;
    setGlobalInteractionBlocking(true);
    setTutorialDispatchPresentation("SPEEDUP");
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 560));
      const completed = await handleInstantComplete("FREE_TUTORIAL", pId);
      if (!completed) {
        setTutorialDispatchPresentation("PROGRESS");
        traceTutorialJourney("speed_up_ui_recovered", { patrolId: pId, rejectionReason: "completion returned false" });
      }
    } finally {
      questActionRef.current = false;
      setGlobalInteractionBlocking(false);
    }
  };

  const handleClaim = React.useCallback(async (pId: string, options?: { battleOwnsResult?: boolean }) => {
    if (questActionRef.current) return false;
    questActionRef.current = true;
    setGlobalInteractionBlocking(true);
    try {
      return await handleClaimRewards(pId, {
        isTutorialReward: tutorialStep === "TUTORIAL_BATTLE" || tutorialBattleActive,
        suppressResultModal: options?.battleOwnsResult === true,
      });
    } finally {
      questActionRef.current = false;
      setGlobalInteractionBlocking(false);
    }
  }, [handleClaimRewards, setGlobalInteractionBlocking, tutorialBattleActive, tutorialStep]);

  const handleBattleStart = async (patrol: any, battleNpc: any) => {
    if (!battleNpc || battleStartRef.current || battleEncounterLocked || patrol.id === settledPatrolEncounterId) return;
    battleStartRef.current = true;
    // Rewards belong to the completed encounter that produced them. Clear the
    // old projection before another battle can mount its result surface.
    setLastPatrolRewards(null);
    setShowPatrolRewardModal(false);
    setBattleStartingId(patrol.id);
    setGlobalInteractionBlocking(true);
    try {
      const dispatchedUserCharacterId = userCharactersDbList.find(
        (ownedCharacter: any) => ownedCharacter.character_id === patrol.characterId
      )?.id ?? null;
      traceTutorialJourney("battle_cta_request", {
        tutorialStepBefore: tutorialStep || null,
        nextExpectedTutorialStep: "TUTORIAL_BATTLE",
        questId: patrol.courseId,
        patrolId: patrol.id,
        patrolStatus: patrol.status,
        dispatchedCharacterId: patrol.characterId,
        dispatchedUserCharacterId,
        encounterId: battleNpc.id,
        encounterState: patrol.battle_resolved ? "RESOLVED" : "READY",
        battleEligibility: Boolean(battleNpc && patrol.has_battle_event && !patrol.battle_resolved),
      });
      await startCardBattle(
        "PATROL", battleNpc.npc_name || "敵NPC", battleNpc.id,
        undefined, undefined, undefined, undefined, undefined, undefined,
        battleNpc, patrol.id,
        { encounterLabel: patrol.courseName || battleNpc.npc_name || "クエスト", opponentLabel: battleNpc.npc_name || "敵NPC", backgroundPath: getCharacterLocationBackground(selectedTown) }
      );
    } finally {
      battleStartRef.current = false;
      setBattleStartingId(null);
      setGlobalInteractionBlocking(false);
    }
  };

  // 背景画像の取得
  const bgImage = `/bg/bg_street_${selectedTown}.jpg`;
  const characterImage = (src?: string) => {
    if (!src) return null;
    return src.startsWith("/characters/") ? src : `/characters/${src.replace(/^\//, "")}`;
  };

  const closeRewardResult = async () => {
    if (tutorialStep !== "TUTORIAL_BATTLE") {
      setShowPatrolRewardModal(false);
      setLastPatrolRewards(null);
      return;
    }
    if (rewardTransitionRef.current) return;
    rewardTransitionRef.current = true;
    setRewardTransitionWorking(true);
    try {
      const { error } = await supabase.rpc("advance_tutorial_progress", {
        p_expected_step: "TUTORIAL_BATTLE",
        p_next_step: "RULE_GUIDE",
      });
      if (error) return;
      setShowPatrolRewardModal(false);
      setLastPatrolRewards(null);
      setOnboardingState((current: any) => current ? { ...current, tutorial_step: "RULE_GUIDE" } : current);
    } finally {
      rewardTransitionRef.current = false;
      setRewardTransitionWorking(false);
    }
  };

  React.useEffect(() => {
    if (!lastPatrolRewards?.isTutorialReward || tutorialStep === "TUTORIAL_BATTLE" || tutorialBattleActive) return;
    setShowPatrolRewardModal(false);
    setLastPatrolRewards(null);
  }, [lastPatrolRewards, setLastPatrolRewards, setShowPatrolRewardModal, tutorialBattleActive, tutorialStep]);

  // The battle result is the single result surface for every victorious quest.
  // Resolution already committed battle_resolved before replay starts, so do
  // not wait on the eventually-refreshed activePatrols projection here.
  React.useEffect(() => {
    if (battleState !== "RESULT" || showPatrolRewardModal || lastPatrolRewards) return;
    if (!settledPatrolEncounterId || autoRewardClaimRef.current === settledPatrolEncounterId) return;
    autoRewardClaimRef.current = settledPatrolEncounterId;
    void handleClaim(settledPatrolEncounterId, { battleOwnsResult: true }).then((claimed) => {
      if (!claimed) autoRewardClaimRef.current = null;
    });
  }, [battleState, handleClaim, lastPatrolRewards, settledPatrolEncounterId, showPatrolRewardModal]);

  const canRenderRewardResult = showPatrolRewardModal
    && lastPatrolRewards
    && battleState === null
    && (!lastPatrolRewards.isTutorialReward || tutorialStep === "TUTORIAL_BATTLE" || tutorialBattleActive);
  const readiness = useScreenReadiness({
    assets: [...SCREEN_ASSET_MANIFESTS.quest, { src: bgImage, required: false }],
  });
  const tutorialStageIndex = tutorialStep === "DISPATCH" ? 1 : tutorialStep === "FREE_INSTANT" ? 2 : 4;
  const formatClock = (seconds: unknown) => {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(totalSeconds / 60);
    return `${minutes.toString().padStart(2, "0")}:${(totalSeconds % 60).toString().padStart(2, "0")}`;
  };

  if (isTutorialQuestStep) {
    const tutorialLeader = selectedMembers[0] || selectedPatrolMember;
    const tutorialPatrol = activePatrols.find((patrol: any) =>
      patrol.characterId === tutorialLeader && patrol.status !== "COMPLETED"
    ) || activePatrols.find((patrol: any) => patrol.has_battle_event && !patrol.battle_resolved);
    const tutorialCourse = activeCourse || patrolCourses.find((course: any) => course.id === tutorialPatrol?.courseId) || patrolCourses[0];
    const tutorialCharacter = CHARACTERS_MASTER.find((character: any) => character.id === (tutorialPatrol?.characterId || selectedPatrolMember));
    const tutorialOwnedCharacter = userCharactersDbList.find((character: any) => character.character_id === tutorialCharacter?.id);
    const encounterProjection = authoritativeTutorialEncounter;
    const tutorialNpc = encounterProjection && encounterProjection.patrolId === tutorialPatrol?.id
      ? encounterProjection.npc
      : null;
    const tutorialEncounterProjectionReady = Boolean(
      tutorialPatrol
      && tutorialNpc
      && tutorialPatrol.has_battle_event
      && !tutorialPatrol.battle_resolved
    );
    const remaining = Math.max(0, Number(tutorialPatrol?.secondsLeft || 0));
    const total = Math.max(1, Number(tutorialPatrol?.secondsTotal || tutorialCourse?.duration_seconds || 1));
    const progress = Math.max(4, Math.min(100, ((total - remaining) / total) * 100));
    const isReturn = tutorialStep === "TUTORIAL_BATTLE" && tutorialEncounterPresentation === "RETURN";
    const acceptanceState = tutorialStep === "DISPATCH"
      ? "Q1"
      : tutorialStep === "FREE_INSTANT"
        ? tutorialDispatchPresentation === "STARTED" ? "Q2" : tutorialDispatchPresentation === "SPEEDUP" ? "Q4" : "Q3"
        : isReturn ? "Q5" : "Q6";

    return (
      <HubPage className="patrol-container tutorial-quest-shell" eyebrow="クエスト" title="クエスト" description="新宿・初級" status={readiness.status} onRetry={readiness.retry}>
        <section className={`tutorial-quest-wire state-${acceptanceState.toLowerCase()}`} data-acceptance-state={acceptanceState} style={{ backgroundImage: `linear-gradient(180deg,rgba(2,3,12,.16),rgba(2,2,10,.92)),url(${bgImage})` }}>
          {acceptanceState === "Q1" && <>
            <header className="tutorial-wire-heading"><span>新宿</span><strong>初級</strong><small>所要時間 {formatClock(tutorialCourse?.duration_seconds)}</small></header>
            <div className="tutorial-wire-rewards" aria-label="確定報酬">
              {Number(tutorialCourse?.reward_xp || 0) > 0 && <QuestRewardIcon itemId="PLAYER_XP" quantity={Number(tutorialCourse.reward_xp)} />}
              {guaranteedRewardItems(tutorialCourse?.reward_items).map((item: any) => <QuestRewardIcon key={item.item_id} itemId={String(item.item_id)} quantity={Number(item.quantity || 0)} />)}
            </div>
            <div className="tutorial-wire-member" data-character-id={tutorialCharacter?.id} data-user-character-id={tutorialOwnedCharacter?.id}>
              <CharacterPresentation src={characterImage(tutorialCharacter?.img) || undefined} alt={tutorialCharacter?.jpName || "派遣メンバー"} variant="quest" rarity={tutorialCharacter?.rarity} attribute={tutorialCharacter?.alignment} backgroundSrc={getCharacterLocationBackground(tutorialCharacter?.homeTown)} frameKind="character" rarityBadge attributeBadge />
              <div><small>派遣メンバー</small><b>{tutorialCharacter?.jpName || "メンバー"}</b><span>{tutorialCharacter?.rarity || "SSR"}</span></div>
            </div>
            <OutlawButton onClick={handleStart} disabled={dispatchLoading || !selectedCourse || !selectedPatrolMember} fullWidth variant="primary">{dispatchLoading ? "派遣準備中…" : "新宿へ派遣する"}</OutlawButton>
          </>}

          {(acceptanceState === "Q2" || acceptanceState === "Q3") && <>
            <header className="tutorial-wire-progress-title"><span>新宿へ派遣中</span><small>NEW SHINJUKU DISTRICT</small></header>
            <div className="tutorial-wire-progress-character" data-character-id={tutorialCharacter?.id} data-user-character-id={tutorialOwnedCharacter?.id}><CharacterPresentation src={characterImage(tutorialCharacter?.img) || undefined} alt={tutorialCharacter?.jpName || "派遣メンバー"} variant="quest" rarity={tutorialCharacter?.rarity} attribute={tutorialCharacter?.alignment} backgroundSrc={getCharacterLocationBackground(tutorialCharacter?.homeTown)} frameKind="character" rarityBadge attributeBadge /></div>
            <strong className="tutorial-wire-course">新宿・初級</strong>
            <div className="tutorial-wire-time">残り時間 <b>{formatClock(remaining)}</b></div>
            <div className="tutorial-wire-progress"><i style={{ width: `${progress}%` }} /></div>
            <OutlawButton onClick={() => tutorialPatrol && void handleTutorialInstant(tutorialPatrol.id)} disabled={dispatchLoading || !tutorialPatrol} fullWidth variant="primary">すぐに時短する <small>無料（残り1回）</small></OutlawButton>
          </>}

          {acceptanceState === "Q4" && <div className="tutorial-wire-speedup" role="status"><h2>新宿へ派遣中</h2><div className="tutorial-wire-speed-icon">»</div><strong>時短中…</strong><div className="tutorial-wire-progress"><i /></div></div>}

          {acceptanceState === "Q5" && <>
            <header className="tutorial-wire-complete"><h2>クエスト完了</h2><small>QUEST COMPLETE</small></header>
            <div className="tutorial-wire-return-character" data-character-id={tutorialCharacter?.id} data-user-character-id={tutorialOwnedCharacter?.id}><CharacterPresentation src={characterImage(tutorialCharacter?.img) || undefined} alt={tutorialCharacter?.jpName || "帰還メンバー"} variant="quest" rarity={tutorialCharacter?.rarity} attribute={tutorialCharacter?.alignment} backgroundSrc={getCharacterLocationBackground(tutorialCharacter?.homeTown)} frameKind="character" rarityBadge attributeBadge /></div>
            <strong className="tutorial-wire-course">新宿・初級</strong>
            <div className="tutorial-wire-rewards is-return" aria-label="確定報酬">
              {Number(tutorialCourse?.reward_xp || 0) > 0 && <QuestRewardIcon itemId="PLAYER_XP" quantity={Number(tutorialCourse.reward_xp)} />}
              {guaranteedRewardItems(tutorialCourse?.reward_items).map((item: any) => <QuestRewardIcon key={item.item_id} itemId={String(item.item_id)} quantity={Number(item.quantity || 0)} />)}
            </div>
            <OutlawButton onClick={() => {
              if (!tutorialEncounterProjectionReady) return;
              traceTutorialJourney("quest_return_confirmed", {
                tutorialStepBefore: tutorialStep,
                tutorialStepAfter: tutorialStep,
                nextExpectedTutorialStep: "TUTORIAL_BATTLE",
                questId: tutorialPatrol?.courseId,
                patrolId: tutorialPatrol?.id,
                patrolStatus: tutorialPatrol?.status,
                dispatchedCharacterId: tutorialPatrol?.characterId,
                dispatchedUserCharacterId: tutorialOwnedCharacter?.id ?? null,
                encounterId: tutorialNpc?.id || null,
                encounterState: tutorialNpc ? "READY" : "MISSING",
                battleEligibility: Boolean(tutorialPatrol && tutorialNpc && tutorialPatrol.has_battle_event && !tutorialPatrol.battle_resolved),
                rejectionReason: tutorialNpc ? null : "patrol NPC master is unavailable",
              });
              setTutorialEncounterReady(false);
              setTutorialEncounterPresentation("ENCOUNTER");
            }} disabled={!tutorialEncounterProjectionReady} aria-busy={!tutorialEncounterProjectionReady} fullWidth variant="primary">
              {tutorialEncounterProjectionReady ? "次へ" : "遭遇情報を確認中…"}
            </OutlawButton>
            {!tutorialEncounterProjectionReady && <small className="tutorial-wire-sync" role="status">クエスト結果とバトル情報を同期しています。</small>}
          </>}

          {acceptanceState === "Q6" && <div className={`tutorial-wire-encounter ${tutorialEncounterReady ? "is-ready" : ""}`} data-encounter-ready={tutorialEncounterReady ? "true" : "false"} data-encounter-projection={tutorialEncounterProjectionReady ? "ready" : "loading"}>
            <div className="tutorial-wire-glitch" aria-hidden="true">⚔</div><h2>バトル発生</h2><small>BATTLE ENCOUNTER</small>
            <OutlawButton onClick={() => tutorialPatrol && void handleBattleStart(tutorialPatrol, tutorialNpc)} disabled={!tutorialEncounterReady || !tutorialEncounterProjectionReady || battleStartingId === tutorialPatrol?.id || battleEncounterLocked} fullWidth variant="primary">{battleStartingId ? "バトル準備中…" : "バトルへ"}</OutlawButton>
          </div>}
        </section>
      </HubPage>
    );
  }

  return <QuestPresentationV2 />;

  /* Legacy normal Quest presentation is intentionally unreachable. */
  return (
    <HubPage
      className="patrol-container"
      eyebrow="クエスト"
      title="クエスト"
      description="仲間を街へ派遣し、育成素材と報酬を獲得します。"
      status={readiness.status}
      onRetry={readiness.retry}
    >
      <div className="patrol-content">
        {isTutorialQuestStep ? (
          <section className="tutorial-quest-city" style={{ backgroundImage: `linear-gradient(180deg,rgba(1,5,10,.12),rgba(1,5,10,.92)),url(${bgImage})` }}>
            <div><span>QUEST / SHINJUKU</span><h2>新宿</h2><p>初級クエスト</p></div>
          </section>
        ) : (
          <section className="quest-canonical-context" style={{ backgroundImage: `linear-gradient(90deg,rgba(2,5,12,.86),rgba(2,5,12,.28)),url(${bgImage})` }}>
            <div><span>クエスト選択</span><strong>{selectedTownLabel}</strong></div>
            <p>派遣中 <b>{activePatrols.length}</b> / 5</p>
          </section>
        )}

        {isTutorialQuestStep && (
          <div className="quest-stage-track" aria-label="チュートリアルクエスト進行">
            {["選択", "派遣", "時短", "帰還", "バトル"].map((label, index) => (
              <div key={label} className={index < tutorialStageIndex ? "is-complete" : index === tutorialStageIndex ? "is-current" : ""}>
                <span>{index + 1}</span><b>{label}</b>
              </div>
            ))}
          </div>
        )}

        {tutorialStep === "DISPATCH" && (
          <div className="tutorial-quest-guidance">
            <TutorialNavigator message={<>
              次はクエストね。まずはこの子を新宿に行かせてみよ。<br />
              クエストに出すと、時間が経つと帰ってくるよ。経験値やアイテムも手に入るから、少しずつ進めてこ。
            </>} />
          </div>
        )}
        
        {!isTutorialQuestStep && <div className="patrol-town-tabs-wrapper mb-3">
          <SubTabNav 
            tabs={townTabs} 
            activeTabId={selectedTown} 
            onSelect={(tabId) => {
              if (isTutorialQuestStep) return;
              setSelectedTown(tabId);
              const firstCourse = patrolCourses.find((c: any) => c.town_id === tabId && c.is_unlocked !== false);
              if (firstCourse) setSelectedCourse(firstCourse.id);
              else setSelectedCourse("");
              playCyberSe("click");
            }} 
          />
        </div>}

        {/* コース選択 */}
        {!isTutorialQuestStep && <div className="patrol-courses-grid mb-3">
          <div className="patrol-town-clear-progress" aria-label="街のクエストクリア進捗">
            クリア {patrolCourses.filter((course: any) => course.town_id === selectedTown && course.is_first_cleared).length} / 3
          </div>
          {patrolCourses.filter((c: any) => c.town_id === selectedTown).map((c: any) => (
            <div 
              key={c.id} 
              className={`patrol-course-item ${selectedCourse === c.id ? "active" : ""} ${c.is_unlocked === false ? "locked" : ""}`}
              onClick={() => { if (!isTutorialQuestStep && c.is_unlocked !== false) { setSelectedCourse(c.id); playCyberSe("click"); } else if (c.is_unlocked === false) playCyberSe("error"); }}
            >
              <div className="course-name">{c.name}</div>
              <div className={`course-badge badge-${String(c.level_type || "").toLowerCase()}`}>
                {c.level_type === "EASY" ? "初級" : c.level_type === "NORMAL" ? "中級" : c.level_type === "HARD" ? "上級" : c.level_type}
              </div>
              {c.is_unlocked === false && <div className="course-lock">未開放 — 同じ街の前難易度を初回クリア</div>}
              {c.is_first_cleared && <div className="course-clear">クリア済</div>}
            </div>
          ))}
        </div>}

        {/* 出撃メンバー選択 */}
        {activeCourse && (
          <OutlawCard className={`mb-4 ${tutorialStep === "DISPATCH" ? "tutorial-primary-target" : ""}`}>
            <section className="quest-canonical-brief" aria-label="クエスト詳細">
              <header><div><span>{selectedTownLabel}</span><strong>{activeCourse.name}</strong></div><b>{activeCourse.level_type === "EASY" ? "初級" : activeCourse.level_type === "NORMAL" ? "中級" : "上級"}</b></header>
              <div className="quest-canonical-metrics"><span><small>所要時間</small><strong>{activeCourse.duration_seconds >= 60 ? `${activeCourse.duration_seconds / 60}分` : `${activeCourse.duration_seconds}秒`}</strong></span><span><small>スタミナ</small><strong>{activeCourse.cost_vitality}</strong></span><span><small>推奨総合力</small><strong>{Number(activeCourse.recommended_power || 0).toLocaleString()}</strong></span></div>
              <div className="quest-canonical-enemy"><small>出現する敵</small><strong>{(activeCourse.enemy_members || []).map((member: any) => enemyName(member.characterId)).join(" / ") || "敵情報を確認中"}</strong><p><span>属性 {(activeCourse.enemy_attributes || []).map(attributeName).join(" / ") || "—"}</span><span>代表スキル {(activeCourse.enemy_members || []).flatMap((member: any) => member.skillLoadout || []).slice(0, 3).map(skillName).join(" / ") || "—"}</span></p></div>
              <div className="quest-canonical-rewards"><span><small>キャッシュ</small><strong>+{Number(activeCourse.reward_cash || 0).toLocaleString()}</strong></span><span><small>プレイヤーEXP</small><strong>+{Number(activeCourse.reward_xp || 0).toLocaleString()}</strong></span><span><small>獲得可能</small><strong>{formatRewardItems(activeCourse.reward_items) || "なし"}</strong></span></div>
              {!activeCourse.is_first_cleared && <p className="quest-first-clear">初回クリア：プレイヤーEXP +{Number(activeCourse.first_clear_user_exp || 0).toLocaleString()} / {formatRewardItems(activeCourse.first_clear_items) || "追加報酬なし"}</p>}
            </section>
            <div className="quest-v0-section-label">派遣する仲間 <b>1名</b></div>
            <div className="patrol-char-grid mb-3">
              {CHARACTERS_MASTER.filter((character: any) => !isTutorialQuestStep || character.id === selectedPatrolMember).map((c: any) => {
                const isUnlocked = userCharactersDbList.some((uc: any) => uc.character_id === c.id);
                const isHome = c.homeTown === selectedTown;
                const isSelected = selectedPatrolMember === c.id;
                
                const isAlreadyDeployed = activePatrols.some((p: any) => p.characterId === c.id && p.status !== "COMPLETED");

                const baseLuk = getCharacterBaseStats(c.id, 1, 0).luk;
                
                return (
                  <div 
                    key={c.id} 
                    className={`patrol-char-item ${!isUnlocked ? "locked" : ""} ${isSelected ? "selected" : ""} ${isAlreadyDeployed ? "deployed" : ""}`} 
                    onClick={() => {
                      if (isTutorialQuestStep) return;
                      if (isUnlocked && !isAlreadyDeployed) {
                        togglePatrolMemberSelection(c.id);
                      } else if (isAlreadyDeployed) {
                        playCyberSe("error");
                      }
                    }}
                  >
                    <div className="patrol-char-portrait">
                      <CharacterPresentation
                        src={characterImage(c.img)!}
                        alt={c.jpName}
                        variant="thumbnail"
                        name={c.jpName}
                        rarity={c.rarity || "N"}
                        attribute={c.alignment}
                        backgroundSrc={getCharacterLocationBackground(c.homeTown)}
                        frameKind="character"
                        rarityBadge
                        attributeBadge
                      />
                    </div>
                    {isHome && <div className="char-bonus-badge">地元一致(LUK{baseLuk})</div>}
                    {isAlreadyDeployed && <div className="char-deployed-badge">出撃中</div>}
                  </div>
                );
              })}
            </div>
            <OutlawButton 
              onClick={handleStart}
              disabled={dispatchLoading || (isTutorialQuestStep && tutorialStep !== "DISPATCH") || !selectedCourse || !selectedPatrolMember || activePatrols.length >= 5 || activeCourse.is_unlocked === false}
              fullWidth
              variant="primary"
            >
              {dispatchLoading ? "派遣準備中..." : `${selectedTownLabel}へ派遣する`}
            </OutlawButton>
          </OutlawCard>
        )}

        <div ref={tutorialActiveListRef}>
          <SectionHeader title={isTutorialQuestStep ? "クエスト進行" : "進行中クエスト一覧"} className="mt-4" />
        </div>

        {tutorialStep === "FREE_INSTANT" && (
          <div className="tutorial-quest-guidance">
            <TutorialNavigator message={<>
              本当なら、あとは帰ってくるまで待つんだけど――<br />
              今回はすぐ結果を見てみよ。時短を使えば、待たずにクエストを終わらせられるよ。
            </>} />
          </div>
        )}

        {tutorialStep === "TUTORIAL_BATTLE" && activePatrols.some((patrol: any) => !patrol.battle_resolved) && (
          <div className="tutorial-quest-guidance is-return">
            <TutorialNavigator message={<>あ、バトルになったみたい。<br />さっき編成したメンバーでやってみよ。<br />バトルは自動で進むよ。今のメンバーの強さ、見てみよ。</>} />
          </div>
        )}

        {tutorialStep === "TUTORIAL_BATTLE" && activePatrols.some((patrol: any) => patrol.battle_resolved) && !showPatrolRewardModal && (
          <OutlawCard className="mb-3 border-cyan-glow">
            <TutorialNavigator message={<>勝ったね。いい感じ。<br />もっと強くなれば、今よりずっと楽に勝てるようになるよ。</>} />
          </OutlawCard>
        )}

        <div className="active-patrols-list flex-col-gap-3 pb-4">
          {activePatrols.length === 0 ? (
            <div className="text-center font-size-7 text-color-gray p-4">現在進行中のクエストはありません。</div>
          ) : (
            activePatrols.map((p: any) => {
              const pCourse = patrolCourses.find((c: any) => c.id === p.courseId);
              const pChar = CHARACTERS_MASTER.find((c: any) => c.id === p.characterId);
              const battleNpc = patrolNpcs.find((npc: any) => npc.quest_id === p.courseId);
              // The mandatory tutorial action must remain available even if
              // the short quest timer reaches zero while the guide is read.
              const isTutorialInstant = tutorialStep === "FREE_INSTANT" && !p.battle_resolved;
              const isTutorialReward = tutorialStep === "TUTORIAL_BATTLE" && p.battle_resolved;
              const isComplete = p.secondsLeft <= 0 && !isTutorialInstant;
              const hasUnresolvedBattle = p.has_battle_event && !p.battle_resolved && Boolean(battleNpc);
              const diamondSkipCost = 30;
              const todayJst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
              const cashSkipsToday = dailyCashSkipsResetDate === todayJst ? Number(dailyCashSkips || 0) : 0;
              const remainingFreeSkips = Math.max(5 - cashSkipsToday, 0);
              const remainingPaidSkips = Math.max(10 - Number(dailyPaidSkips || 0), 0);

              return (
                <OutlawCard key={p.id} className={`active-patrol-card ${isTutorialInstant || isTutorialReward ? "tutorial-primary-target" : ""}`}>
                  <div className="patrol-card-header flex-between mb-2">
                    <div className="font-size-8 font-bold text-shadow-neon">{pCourse?.name || '不明なクエスト'}</div>
                    <div className="font-size-7 text-color-gray">{pChar?.jpName || '不明なキャラ'} 派遣中</div>
                  </div>
                  
                  {isComplete ? (
                    <div className="patrol-card-complete flex-col-gap-2">
                      <div className="progress-bar-container full">
                        <div className="progress-bar-fill" style={{ width: '100%' }} />
                        <span className="progress-text">帰還完了</span>
                      </div>
                      
                      {hasUnresolvedBattle ? (
                        <div className="battle-alert p-2 border-red mt-2">
                          <div className="text-color-red font-bold font-size-8 mb-1">⚠️ 敵襲発生！</div>
                          <div className="font-size-7 mb-2">エリア内でNPCとの戦闘が発生しました。</div>
                          <OutlawButton 
                            onClick={() => handleBattleStart(p, battleNpc)}
                            variant="primary"
                            disabled={dispatchLoading || battleStartingId === p.id || battleEncounterLocked || p.id === settledPatrolEncounterId}
                            fullWidth
                          >
                            {battleStartingId === p.id ? "バトルへ移動中..." : "戦闘開始"}
                          </OutlawButton>
                        </div>
                      ) : (
                        <OutlawButton 
                          onClick={() => handleClaim(p.id)}
                          variant="primary"
                          disabled={dispatchLoading}
                          fullWidth
                        >
                          {dispatchLoading ? "報酬確認中..." : p.battle_resolved && p.battle_result === "VICTORY" ? "勝利報酬を獲得" : "報酬獲得"}
                        </OutlawButton>
                      )}
                    </div>
                  ) : (
                    <div className="patrol-card-ongoing flex-col-gap-2">
                      <div className="progress-bar-container">
                        <div 
                          className="progress-bar-fill" 
                          style={{ width: `${((p.secondsTotal - p.secondsLeft) / p.secondsTotal) * 100}%` }} 
                        />
                        <span className="progress-text">残り {p.secondsLeft}秒</span>
                      </div>
                      <div className="flex-row-gap-2 mt-1">
                        {isTutorialInstant ? (
                          <OutlawButton onClick={() => handleInstant("FREE_TUTORIAL", p.id)} disabled={dispatchLoading} variant="primary" fullWidth>
                            {dispatchLoading ? "時短処理中..." : "すぐに時短する（今回無料）"}
                          </OutlawButton>
                        ) : (
                          <>
                            <OutlawButton
                              onClick={() => handleInstant("FREE_PREOPEN", p.id)}
                              disabled={dispatchLoading || remainingFreeSkips === 0}
                              fullWidth
                            >
                              {`無料時短（残り${remainingFreeSkips}回）`}
                            </OutlawButton>
                            <OutlawButton onClick={() => handleInstant("DIAMOND", p.id)} disabled={dispatchLoading || remainingPaidSkips === 0} variant="primary" fullWidth>
                              DIA時短 ({diamondSkipCost} / 残り{remainingPaidSkips}回)
                            </OutlawButton>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </OutlawCard>
              );
            })
          )}
        </div>
      </div>

      {/* 見回り完了報酬モーダルポップアップ */}
      {canRenderRewardResult && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <OutlawCard className={["patrol-reward-modal", "patrol-result-v0", "scroll-container", tutorialStep === "TUTORIAL_BATTLE" || lastPatrolRewards.battleVictory ? "is-victory" : ""].join(" ")}>
            <header className="patrol-result-heading">
              <span>クエスト結果</span>
              <h3>{tutorialStep === "TUTORIAL_BATTLE" ? "クエスト完了" : lastPatrolRewards.battleVictory ? "勝利" : "帰還完了"}</h3>
              <p>{lastPatrolRewards.courseName}</p>
            </header>

            <div className="reward-section patrol-result-rewards flex-col-gap-2">
              <div className="patrol-result-primary-reward"><span>獲得報酬</span></div>
              
              {lastPatrolRewards.matchBonusApplied && Number(lastPatrolRewards.matchBonusCash || 0) > 0 && (
                <div className="flex-between font-size-7 pl-2">
                  <span className="text-color-yellow">└ 地元一致ボーナス:</span>
                  <span className="text-color-yellow">+{lastPatrolRewards.matchBonusCash} CASH</span>
                </div>
              )}

              {lastPatrolRewards.levelBonusPercent > 0 && Number(lastPatrolRewards.levelBonusCash || 0) > 0 && (
                <div className="flex-between font-size-7 pl-2">
                  <span className="text-color-cyan">└ Lvボーナス ({lastPatrolRewards.levelBonusPercent}%):</span>
                  <span className="text-color-cyan">+{lastPatrolRewards.levelBonusCash} CASH</span>
                </div>
              )}

              <div className="tutorial-wire-rewards patrol-result-item-rewards" aria-label="獲得アイテム">
                {Number(lastPatrolRewards.totalXp || 0) > 0 && <QuestRewardIcon itemId="PLAYER_XP" quantity={Number(lastPatrolRewards.totalXp)} />}
                {lastPatrolRewards.dropItemName && Number(lastPatrolRewards.dropItemQty || 0) > 0 && <QuestRewardIcon itemId={String(lastPatrolRewards.dropItemName)} quantity={Number(lastPatrolRewards.dropItemQty)} />}
              </div>

              {lastPatrolRewards.gearDropped && (
                <div className="flex-between mt-1 p-2" style={{ background: 'rgba(255, 0, 255, 0.1)', border: '1px solid rgba(255, 0, 255, 0.3)' }}>
                  <span className="text-color-magenta">🔥 追加ドロップ装備:</span>
                  <span className="text-color-magenta font-bold">初期武器 x1</span>
                </div>
              )}

              {lastPatrolRewards.hasBattle && (
                <div className="battle-result-section border-top pt-2 mt-2">
                  <div className={`font-size-8 font-bold mb-1 ${lastPatrolRewards.battleVictory ? 'text-color-green' : 'text-color-red'}`}>
                    NPC遭遇バトル: {lastPatrolRewards.battleVictory ? '勝利' : '敗北'}
                  </div>
                  {lastPatrolRewards.battleVictory && (Number(lastPatrolRewards.battleCashBonus || 0) > 0 || Number(lastPatrolRewards.battleXpBonus || 0) > 0 || Boolean(lastPatrolRewards.battleRewardItemName)) && (
                    <div className="pl-2 flex-col-gap-1 font-size-7 text-color-green">
                      {Number(lastPatrolRewards.battleCashBonus || 0) > 0 && <div className="flex-between"><span>追加キャッシュ:</span><span>+{lastPatrolRewards.battleCashBonus} CASH</span></div>}
                      {Number(lastPatrolRewards.battleXpBonus || 0) > 0 && <div className="flex-between"><span>追加経験値:</span><span>+{lastPatrolRewards.battleXpBonus} XP</span></div>}
                      {lastPatrolRewards.battleRewardItemName && (
                        <div className="flex-between"><span>追加アイテム:</span><span>{lastPatrolRewards.battleRewardItemName} x{lastPatrolRewards.battleRewardItemQty}</span></div>
                      )}
                    </div>
                  )}
                  {!lastPatrolRewards.battleVictory && (
                    <div className="font-size-7 text-color-gray pl-2 mt-1">
                      <div>敗北したため、追加報酬はありません。</div>
                      {activeCourse?.level_type === "HARD" && <div className="flex-row-gap-2 mt-2 quest-hard-recovery-actions">
                        <OutlawButton onClick={() => setActiveTab("character")} variant="secondary">キャラクター育成</OutlawButton>
                        <OutlawButton onClick={() => setActiveTab("character")} variant="secondary">スキル</OutlawButton>
                        <OutlawButton onClick={() => setActiveTab("character")} variant="secondary">編成</OutlawButton>
                        <OutlawButton onClick={() => void closeRewardResult()} variant="primary">再挑戦</OutlawButton>
                      </div>}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-top pt-3 mt-3 flex-col-gap-2">
              {lastPatrolRewards.levelUpMessage && (
                <div className="patrol-result-growth">
                  <span>成長</span><strong>{lastPatrolRewards.levelUpMessage}</strong>
                </div>
              )}
            </div>

            {tutorialStep === "TUTORIAL_BATTLE" && (
              <TutorialNavigator message={<>これで基本は大丈夫。<br />でも、この街でできることはまだまだあるよ。最後に、それだけ見てこ。</>} />
            )}

            <OutlawButton 
              onClick={() => void closeRewardResult()}
              className="mt-4"
              fullWidth
              variant={tutorialStep === "TUTORIAL_BATTLE" ? "primary" : "secondary"}
              isLoading={rewardTransitionWorking}
              loadingLabel="結果を更新中..."
            >
              {tutorialStep === "TUTORIAL_BATTLE" ? "次へ" : "閉じる"}
            </OutlawButton>
          </OutlawCard>
        </div>
      )}
    </HubPage>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase";
import { beginActionPerformance } from "@/utils/actionPerformance";
import { traceTutorialJourney } from "@/utils/tutorialJourneyTrace";

export function usePatrol(
  session: any,
  vitality: number,
  setVitality: React.Dispatch<React.SetStateAction<number>>,
  getUserCharactersDbList: () => any[],
  currentBaseId: string,
  setErrorMessage: (msg: string | null) => void,
  playCyberSe: (type: string) => void,
  syncBootstrapData: (userId: string) => Promise<void>,
  setUserLevel: React.Dispatch<React.SetStateAction<number>>,
  setUserXp: React.Dispatch<React.SetStateAction<number>>,
  addGuildXpAndContributionByAction: (actionType: string, sourceId?: string) => Promise<void>,
  setTutorialStep: (step: string) => void,
  invalidatePatrolBootstrap: () => void
) {
  const [selectedCourse, setSelectedCourse] = useState<string>("e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1");
  const [questSelectionRequest, setQuestSelectionRequest] = useState<{ courseId: string; revision: number } | null>(null);
  useEffect(() => { setQuestSelectionRequest(null); }, [session?.user?.id]);
  const requestQuestSelection = (courseId: string | null) => setQuestSelectionRequest(previous => courseId ? ({ courseId, revision: (previous?.revision || 0) + 1 }) : null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [selectedPatrolMember, setSelectedPatrolMember] = useState<string | null>(null);
  const [dailyCashSkips, setDailyCashSkips] = useState<number>(0);
  const [dailyPaidSkips, setDailyPaidSkips] = useState<number>(0);
  const [dailyCashSkipsResetDate, setDailyCashSkipsResetDate] = useState<string | null>(null);
  const [activePatrols, setActivePatrols] = useState<Array<{
    id: string;
    courseId: string;
    characterId: string;
    secondsTotal: number;
    secondsLeft: number;
    status: "ONGOING" | "CLAIMABLE" | "COMPLETED";
    has_battle_event?: boolean;
    battle_resolved?: boolean;
    battle_result?: "VICTORY" | "DEFEAT" | null;
    rewards_accrued?: any;
    encounterSnapshot?: any;
    started_at?: string;
    expires_at?: string;
  }>>([]);
  const [patrolLogs, setPatrolLogs] = useState<Array<{ time: string; text: string }>>([]);
  // Production Quest rows are server masters; do not render the retired local
  // stamina/reward fallback while bootstrap is still loading.
  const [patrolCourses, setPatrolCourses] = useState<any[]>([]);
  const [patrolNpcs, setPatrolNpcs] = useState<any[]>([]);
  const [hasActivePatrolBattle, setHasActivePatrolBattle] = useState<boolean>(false);
  const [lastPatrolRewards, setLastPatrolRewards] = useState<any | null>(null);
  const [showPatrolRewardModal, setShowPatrolRewardModal] = useState<boolean>(false);
  const [dispatchLoading, setDispatchLoading] = useState<boolean>(false);
  const mutationInFlightRef = useRef(false);
  const tutorialCompletionOwnerRef = useRef<{
    patrolId: string;
    status: "IN_FLIGHT" | "SUCCESS" | "FAILED";
    promise: Promise<boolean> | null;
  } | null>(null);

  const beginMutation = () => {
    if (mutationInFlightRef.current) return false;
    mutationInFlightRef.current = true;
    setDispatchLoading(true);
    return true;
  };

  const endMutation = () => {
    mutationInFlightRef.current = false;
    setDispatchLoading(false);
  };

  const fetchPatrolEncounterSnapshot = async (patrolId: string) => {
    const { data, error } = await supabase
      .from("user_patrols")
      .select("encounter_snapshot")
      .eq("id", patrolId)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) {
      console.warn("Quest encounter projection refresh failed:", error.message);
      return null;
    }
    return data?.encounter_snapshot ?? null;
  };

  const recoverCommittedTutorialDispatch = async (courseId: string, characterId: string, ownedCharacterId: string | null) => {
    const { data: resumedStep, error: resumeError } = await supabase.rpc("advance_tutorial_progress", {
      p_expected_step: "DISPATCH",
      p_next_step: "FREE_INSTANT"
    });
    if (resumeError || resumedStep !== "FREE_INSTANT") return false;
    invalidatePatrolBootstrap();
    setTutorialStep("FREE_INSTANT");
    traceTutorialJourney("dispatch_recovered", {
      userId: session.user.id,
      tutorialStepBefore: "DISPATCH",
      tutorialStepAfter: "FREE_INSTANT",
      questId: courseId,
      dispatchedCharacterId: characterId,
      dispatchedUserCharacterId: ownedCharacterId,
    });
    void syncBootstrapData(session.user.id).catch((bootstrapError) => {
      console.warn("Tutorial dispatch recovery refresh failed:", bootstrapError);
    });
    return true;
  };

  const handleStartPatrol = async () => {
    if (!session || !selectedCourse) return false;
    const course = patrolCourses.find(c => c.id === selectedCourse);
    if (!course) return false;

    if (vitality < course.cost_vitality) {
      setErrorMessage("スタミナが不足しています。");
      return false;
    }
    if (!selectedPatrolMember) {
      setErrorMessage("派遣するメンバーを選択してください。");
      return false;
    }

    if (activePatrols.length >= 5) {
      setErrorMessage("出撃枠が上限（5枠）に達しています。");
      return false;
    }

    const selectedOwnedCharacterId = getUserCharactersDbList().find(
      (ownedCharacter) => ownedCharacter.character_id === selectedPatrolMember
    )?.id ?? null;
    if (activePatrols.some(p => p.characterId === selectedPatrolMember && p.status !== "COMPLETED")) {
      if (!beginMutation()) return false;
      try {
        if (await recoverCommittedTutorialDispatch(course.id, selectedPatrolMember, selectedOwnedCharacterId)) return true;
        setErrorMessage("このキャラクターはすでに出撃中です。");
        return false;
      } finally {
        endMutation();
      }
    }

    if (!beginMutation()) return false;
    const actionPerformance = beginActionPerformance("quest_start");
    playCyberSe("QUEST_START");
    try {
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + course.duration_seconds * 1000);

      actionPerformance.mark("request_start");
      traceTutorialJourney("dispatch_request", {
        userId: session.user.id,
        tutorialStepBefore: "DISPATCH",
        questId: course.id,
        dispatchedCharacterId: selectedPatrolMember,
        dispatchedUserCharacterId: selectedOwnedCharacterId,
      });
      const res = await supabase.rpc("start_patrol", {
        p_course_id: course.id,
        p_character_id: selectedPatrolMember,
      });

      if (res.error) {
        const duplicateDispatch = res.error.code === "23505"
          || /already dispatched|already.*dispatch|出撃中/i.test(res.error.message || "");
        if (duplicateDispatch) {
          // start_patrol and the legacy tutorial-step transition are separate
          // authoritative calls. If the patrol commit won a previous request
          // but the client was interrupted before advancing the step, resume
          // that patrol instead of issuing another start or trapping the user.
          if (await recoverCommittedTutorialDispatch(course.id, selectedPatrolMember, selectedOwnedCharacterId)) {
            actionPerformance.mark("response");
            actionPerformance.mark("state_update");
            actionPerformance.markVisualReady();
            return true;
          }
        }
        throw res.error;
      }
      if (res.data?.error) throw new Error(res.data.error);
      actionPerformance.mark("response");

      // The server creates the per-dispatch Canonical enemy party in the
      // user_patrols insert trigger. Read that owner projection narrowly so a
      // subsequent speed-up does not wait for the broad application bootstrap.
      const encounterSnapshot = await fetchPatrolEncounterSnapshot(res.data.patrol_id);

      const remainingVitality = Number(res.data?.remaining_vitality);
      if (Number.isFinite(remainingVitality)) setVitality(remainingVitality);
      else setVitality(prev => prev - course.cost_vitality);

      const newPatrol = {
        id: res.data.patrol_id,
        courseId: course.id,
        characterId: selectedPatrolMember,
        secondsTotal: Number(res.data.duration_seconds ?? course.duration_seconds),
        secondsLeft: Number(res.data.duration_seconds ?? course.duration_seconds),
        status: "ONGOING" as const,
        has_battle_event: res.data.has_battle,
        battle_resolved: false,
        battle_result: null,
        encounterSnapshot,
        started_at: startedAt.toISOString(),
        expires_at: expiresAt.toISOString()
      };

      invalidatePatrolBootstrap();
      setActivePatrols(prev => [...prev, newPatrol]);
      setSelectedPatrolMember(null);
      let nextTutorialStep = res.data?.tutorial_step;
      if (!nextTutorialStep) {
        const { data: advancedStep, error: advanceError } = await supabase.rpc("advance_tutorial_progress", {
          p_expected_step: "DISPATCH",
          p_next_step: "FREE_INSTANT"
        });
        if (!advanceError) nextTutorialStep = advancedStep;
      }
      if (nextTutorialStep === "FREE_INSTANT") setTutorialStep(nextTutorialStep);
      traceTutorialJourney("dispatch_committed", {
        userId: session.user.id,
        tutorialStepBefore: "DISPATCH",
        tutorialStepAfter: nextTutorialStep || null,
        nextExpectedTutorialStep: "FREE_INSTANT",
        questId: course.id,
        patrolId: res.data.patrol_id,
        patrolStatus: "ONGOING",
        dispatchedCharacterId: selectedPatrolMember,
        dispatchedUserCharacterId: selectedOwnedCharacterId,
        battleEligibility: Boolean(res.data.has_battle),
      });
      actionPerformance.mark("state_update");
      actionPerformance.markVisualReady();
      return true;
    } catch (err: any) {
      traceTutorialJourney("dispatch_rejected", { reason: err?.message || String(err) });
      console.warn(err.message);
      setErrorMessage(`クエストを開始できませんでした。${err.message ? `（${err.message}）` : ""}`);
      return false;
    } finally {
      endMutation();
    }
  };

  const transitionTutorialQuestToBattle = async (
    patrolId: string,
    authoritativeStep?: string | null,
    encounterSnapshot?: unknown,
  ) => {
    if (!session) return false;
    const existingOwner = tutorialCompletionOwnerRef.current;
    if (existingOwner?.patrolId === patrolId) {
      if (existingOwner.status === "SUCCESS") return true;
      if (existingOwner.status === "IN_FLIGHT" && existingOwner.promise) {
        return existingOwner.promise;
      }
    }
    const owner: NonNullable<typeof tutorialCompletionOwnerRef.current> = {
      patrolId,
      status: "IN_FLIGHT",
      promise: null,
    };
    tutorialCompletionOwnerRef.current = owner;
    owner.promise = (async () => {
      try {
        let nextTutorialStep = authoritativeStep;
        if (nextTutorialStep !== "TUTORIAL_BATTLE") {
          const { data: advancedStep, error: advanceError } = await supabase.rpc("advance_tutorial_progress", {
            p_expected_step: "FREE_INSTANT",
            p_next_step: "TUTORIAL_BATTLE"
          });
          if (advanceError) throw advanceError;
          nextTutorialStep = advancedStep;
        }
        if (nextTutorialStep !== "TUTORIAL_BATTLE") {
          throw new Error(`Unexpected tutorial quest completion state: ${String(nextTutorialStep)}`);
        }
        // The instant-completion RPC has already committed both the patrol and
        // tutorial step. Project that authoritative result immediately; a
        // broad bootstrap refresh must not keep the speed-up CTA locked.
        invalidatePatrolBootstrap();
        setActivePatrols((current) => current.map((entry) => entry.id === patrolId
          ? { ...entry, encounterSnapshot, status: "CLAIMABLE", secondsLeft: 0, expires_at: new Date().toISOString() }
          : entry));
        setTutorialStep("TUTORIAL_BATTLE");
        owner.status = "SUCCESS";
        void syncBootstrapData(session.user.id).catch((bootstrapError) => {
          console.warn("Tutorial quest completion refresh failed:", bootstrapError);
        });
        return true;
      } catch (error: any) {
        owner.status = "FAILED";
        console.warn("Tutorial quest completion transition failed:", error);
        setErrorMessage("クエスト完了情報を同期できませんでした。もう一度お試しください。");
        return false;
      }
    })();
    return owner.promise;
  };

  const handleInstantComplete = async (currency: "CASH" | "DIAMOND" | "FREE_TUTORIAL" | "FREE_PREOPEN", patrolId: string) => {
    const targetPatrol = activePatrols.find(p => p.id === patrolId);
    if (!session || !targetPatrol) return false;
    if (!beginMutation()) return false;
    const dispatchedUserCharacterId = getUserCharactersDbList().find(
      (ownedCharacter) => ownedCharacter.character_id === targetPatrol.characterId
    )?.id ?? null;
    playCyberSe("QUEST_INSTANT");

    try {
      traceTutorialJourney("speed_up_request", {
        userId: session.user.id,
        tutorialStepBefore: currency === "FREE_TUTORIAL" ? "FREE_INSTANT" : null,
        questId: targetPatrol.courseId,
        patrolId,
        patrolStatus: targetPatrol.status,
        dispatchedCharacterId: targetPatrol.characterId,
        dispatchedUserCharacterId,
      });
      const { data, error } = await supabase.rpc("complete_patrol_instantly", {
            p_user_id: session.user.id,
            p_patrol_id: patrolId,
            p_use_currency: currency
          });

      if (error) {
        traceTutorialJourney("speed_up_rejected", {
          patrolId,
          reason: error.message || "unknown error",
        });
        const detail = String(error.message || "");
        const normalizedDetail = detail.toLowerCase();
        setErrorMessage(
          detail.includes("schema cache") || detail.includes("Could not find the function")
            ? "時短機能のサーバー設定が未反映です。運営へお問い合わせください。"
            : normalizedDetail.includes("daily cash instant completion limit reached")
              ? "本日のCASH時短は3回使用済みです。ダイヤ時短は引き続き利用できます。"
              : normalizedDetail.includes("cash insufficient")
                ? "CASHが不足しています。"
                : normalizedDetail.includes("diamond insufficient")
                  ? "ダイヤが不足しています。"
                  : detail
        );
        return false;
      }

      if (data && data.status === "success") {
        if (Number.isFinite(Number(data.free_skips_remaining))) setDailyCashSkips(5 - Number(data.free_skips_remaining));
        if (Number.isFinite(Number(data.paid_skips_remaining))) setDailyPaidSkips(10 - Number(data.paid_skips_remaining));
        let nextTutorialStep = data.tutorial_step;
        const encounterSnapshot = targetPatrol.encounterSnapshot
          ?? await fetchPatrolEncounterSnapshot(patrolId);
        if (currency === "FREE_TUTORIAL") {
          const transitioned = await transitionTutorialQuestToBattle(
            patrolId,
            nextTutorialStep,
            encounterSnapshot,
          );
          if (!transitioned) return false;
          nextTutorialStep = "TUTORIAL_BATTLE";
        } else {
          invalidatePatrolBootstrap();
          setActivePatrols((current) => current.map((entry) => entry.id === patrolId
            ? { ...entry, encounterSnapshot, status: "CLAIMABLE", secondsLeft: 0, expires_at: new Date().toISOString() }
            : entry));
          void syncBootstrapData(session.user.id).catch((bootstrapError) => {
            console.warn("Patrol bootstrap refresh failed:", bootstrapError);
          });
        }
        traceTutorialJourney("speed_up_committed", {
          userId: session.user.id,
          tutorialStepBefore: currency === "FREE_TUTORIAL" ? "FREE_INSTANT" : null,
          tutorialStepAfter: nextTutorialStep || null,
          nextExpectedTutorialStep: currency === "FREE_TUTORIAL" ? "TUTORIAL_BATTLE" : null,
          questId: targetPatrol.courseId,
          patrolId,
          patrolStatus: "CLAIMABLE",
          dispatchedCharacterId: targetPatrol.characterId,
          dispatchedUserCharacterId,
          speedUpRpcResult: data,
        });
        return true;
      }
    } catch (err: any) {
      console.warn(err.message);
    } finally {
      endMutation();
    }
    return false;
  };

  const handleClaimRewards = async (patrolId: string, options?: { isTutorialReward?: boolean; suppressResultModal?: boolean }) => {
    const targetPatrol = activePatrols.find(p => p.id === patrolId);
    if (!session || !targetPatrol) return false;

    if (!beginMutation()) return false;
    playCyberSe("gacha");
    try {
      const res = await supabase.rpc("claim_patrol_rewards", { p_patrol_id: patrolId });

      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      const awardedItems = Array.isArray(res.data?.items) ? res.data.items : [];
      const nextLevel = Number(res.data?.level);
      const nextXp = Number(res.data?.current_xp);
      const leveledUp = res.data?.leveled_up === true;

      // The reward RPC has already committed these values. Reflect them in the
      // HUD before opening the result modal instead of waiting for the much
      // broader bootstrap refresh to finish.
      if (Number.isFinite(nextLevel) && nextLevel >= 1) setUserLevel(nextLevel);
      if (Number.isFinite(nextXp) && nextXp >= 0) setUserXp(nextXp);

      const rewardSummary = {
        patrolId,
        courseId: targetPatrol.courseId,
        awardedItems,
        isTutorialReward: options?.isTutorialReward === true,
        courseName: res.data?.course_name || "クエスト",
        baseCash: Number(res.data?.cash || 0),
        baseXp: Number(res.data?.xp || 0),
        levelBonusPercent: 0,
        levelBonusCash: 0,
        matchBonusApplied: res.data?.match_bonus_applied === true || res.data?.hometown_bonus_applied === true,
        matchBonusCash: Number(res.data?.match_bonus_cash || res.data?.hometown_bonus_cash || 0),
        dropItemName: awardedItems[0]?.item_id || "",
        dropItemQty: Number(awardedItems[0]?.quantity || 0),
        gearDropped: false,
        hasBattle: Boolean(targetPatrol.has_battle_event),
        battleVictory: targetPatrol.battle_result === "VICTORY",
        battleCashBonus: 0,
        battleXpBonus: 0,
        battleRewardItemName: "",
        battleRewardItemQty: 0,
        totalCash: Number(res.data?.cash || 0),
        totalXp: Number(res.data?.xp || 0),
        levelUpMessage: leveledUp ? `\n★プレイヤーレベルが Lv.${nextLevel} にアップしました！` : ""
      };

      setLastPatrolRewards(rewardSummary);
      if (!options?.suppressResultModal) setShowPatrolRewardModal(true);

      // The claim is authoritative at this point. Remove the completed quest
      // from the local projection before the battle result releases its screen;
      // otherwise the Quest tab can briefly render the same patrol as
      // CLAIMABLE and expose a second "報酬獲得" action until bootstrap catches
      // up. Non-battle claims still keep their reward modal above the list.
      invalidatePatrolBootstrap();
      setActivePatrols((current) => current.filter((entry) => entry.id !== patrolId));
      setHasActivePatrolBattle((current) => targetPatrol.has_battle_event ? false : current);

      void Promise.allSettled([
        syncBootstrapData(session.user.id),
        addGuildXpAndContributionByAction("QUEST", patrolId),
      ]).then((results) => {
        results.forEach((result) => {
          if (result.status === "rejected") console.warn("Patrol post-claim refresh failed:", result.reason);
        });
      });
      return true;
    } catch (err: any) {
      traceTutorialJourney("speed_up_exception", { patrolId, reason: err?.message || String(err) });
      console.warn(err.message);
      const detail = String(err?.message || "");
      setErrorMessage(
        detail.includes("schema cache") || detail.includes("Could not find the function")
          ? "報酬受取機能のサーバー設定が未反映です。運営へお問い合わせください。"
          : `報酬を獲得できませんでした。${detail ? `（${detail}）` : ""}`
      );
      return false;
    } finally {
      endMutation();
    }
  };

  return {
    selectedCourse, setSelectedCourse,
    selectedMembers, setSelectedMembers,
    selectedPatrolMember, setSelectedPatrolMember,
    dailyCashSkips, setDailyCashSkips, dailyPaidSkips, setDailyPaidSkips,
    dailyCashSkipsResetDate, setDailyCashSkipsResetDate,
    questSelectionRequest, requestQuestSelection,
    activePatrols, setActivePatrols,
    patrolLogs, setPatrolLogs,
    patrolCourses, setPatrolCourses,
    patrolNpcs, setPatrolNpcs,
    hasActivePatrolBattle, setHasActivePatrolBattle,
    lastPatrolRewards, setLastPatrolRewards,
    showPatrolRewardModal, setShowPatrolRewardModal,
    dispatchLoading, setDispatchLoading,
    handleStartPatrol,
    handleInstantComplete,
    transitionTutorialQuestToBattle,
    handleClaimRewards
  };
}

"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGame } from "@/app/context/GameContext";
import { CHARACTERS_MASTER } from "@/utils/game_constants";
import { CANONICAL_QUEST_ENEMY_POOLS } from "@/domain/gameplay/canonical/quests";
import { questAreaRewardItemIds } from "@/domain/gameplay/canonical/questAreaIdentity";
import { canonicalItemName } from "@/domain/gameplay/canonical/items";
import { getCharacterLocationBackground, isCharacterHometown } from "@/utils/characterVisualAssets";
import CharacterPresentation from "../character/CharacterPresentation";
import HubPage from "../ui/HubPage";
import OutlawButton from "../ui/OutlawButton";
import CanonicalDialog from "../ui/CanonicalDialog";
import CanonicalItemIcon from "../ui/CanonicalItemIcon";
import { questProgressState, sortQuestProgress, initialQuestCourseId, questCoursesForTown } from "@/domain/questPresentationState";
import { getJstDateString } from "@/utils/jst_date";
import "./QuestPresentationV2.css";
import QuestTownStory from "./QuestTownStory";

const TOWNS = [
  ["shinjuku", "新宿"], ["shibuya", "渋谷"], ["ikebukuro", "池袋"], ["roppongi", "六本木"], ["akihabara", "秋葉原"], ["kawasaki", "川崎"], ["yokohama", "横浜"],
] as const;

function difficulty(value: string) {
  return value === "EASY" ? "初級" : value === "NORMAL" ? "中級" : value === "HARD" ? "上級" : value;
}

function clock(seconds: unknown) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

function RewardIcon({ itemId, label, quantity }: { itemId: string; label: string; quantity: number }) {
  return <span className="quest-v2-reward-item" aria-label={`${label} × ${Number(quantity || 0).toLocaleString()}`} title={label}>{itemId === "CASH" ? <img src="/ui/icon_cash.png" alt="" /> : itemId === "PLAYER_XP" ? <b>XP</b> : <CanonicalItemIcon itemId={itemId} alt="" />}<strong>× {Number(quantity || 0).toLocaleString()}</strong></span>;
}

export default function QuestPresentationV2() {
  const game = useGame() as any;
  const contentRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const userRef = useRef(game.session?.user?.id);
  useLayoutEffect(() => { userRef.current = game.session?.user?.id; }, [game.session?.user?.id]);
  const battleRef = useRef(false);
  const [battleStartingId, setBattleStartingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"DISPATCH" | "SHORTEN" | "CLAIM" | null>(null);
  const [showSelection, setShowSelection] = useState(true);
  const [selectionStep, setSelectionStep] = useState<"DESTINATION" | "REVIEW" | "CHARACTER">("DESTINATION");
  const [selectedPatrolId, setSelectedPatrolId] = useState<string | null>(null);
  const activePatrols = sortQuestProgress<any>(game.activePatrols || []);
  const occupiedPatrols = activePatrols.filter((patrol: any) => !((patrol.progressionKind || patrol.progression_kind) === "FIRST_CLEAR" && Number(patrol.secondsLeft) <= 0));
  const occupiedCount = occupiedPatrols.length;
  const clearedCount = (game.patrolCourses || []).filter((course: any) => course.is_first_cleared).length;
  const visibleSlots = Math.min(5, Math.max(1 + clearedCount, occupiedCount));
  const hasExplorableCourse = (game.patrolCourses || []).some((course: any) => course.is_unlocked !== false &&
    (course.is_first_cleared || !activePatrols.some((patrol: any) => patrol.courseId === course.id)));
  const selectedPatrol = activePatrols.find((patrol: any) => patrol.id === selectedPatrolId) || null;
  const selectionVisible = showSelection;
  const activeCourse = (game.patrolCourses || []).find((course: any) => course.id === game.selectedCourse);
  const activeCoursePatrol = activePatrols.find((patrol: any) => patrol.courseId === activeCourse?.id);
  const enemyCandidates = CANONICAL_QUEST_ENEMY_POOLS.entries.filter((entry) => entry.areaId === String(activeCourse?.town_id || "").toUpperCase() && entry.difficulty === activeCourse?.level_type).map((entry) => CHARACTERS_MASTER.find((master) => master.id === entry.characterId)).filter(Boolean);
  const townName = TOWNS.find(([id]) => id === game.selectedTown)?.[1] || "街";
  const bgImage = `/bg/bg_street_${game.selectedTown}.jpg`;
  const detailCourse = (game.patrolCourses || []).find((course: any) => course.id === selectedPatrol?.courseId);
  const selectedTownHasUpperClear = (game.patrolCourses || []).some((course: any) => course.town_id === game.selectedTown && course.level_type === "HARD" && course.is_first_cleared);
  const stateBgImage = `/bg/bg_street_${detailCourse?.town_id || game.selectedTown}.jpg`;
  const guaranteedRewards = (items: any[] = []) => items.filter((item) => Number(item.probability_bp ?? 10000) >= 10000);

  useEffect(() => {
    if (!game.showPatrolRewardModal && selectedPatrolId && !activePatrols.some((patrol: any) => patrol.id === selectedPatrolId)) {
      setSelectedPatrolId(null);
      setSelectionStep("DESTINATION");
      setShowSelection(true);
    }
  }, [activePatrols, selectedPatrolId, game.showPatrolRewardModal]);

  useEffect(() => { contentRef.current?.scrollIntoView({ block: "start" }); }, [showSelection, selectionStep, selectedPatrolId]);
  useEffect(() => { setShowSelection(true); setSelectedPatrolId(null); setSelectionStep("DESTINATION"); }, [game.session?.user?.id]);

  const [today, setToday] = useState(() => getJstDateString());
  useEffect(() => {
    const refresh = () => {
      setToday(getJstDateString());
      if (game.session?.user?.id) void game.syncBootstrapData(game.session.user.id);
    };
    // GameContext already refreshes bootstrap on visibility resume.
    const resume = () => { if (document.visibilityState === "visible") setToday(getJstDateString()); };
    const now = Date.now();
    const nextDay = (Math.floor((now + 9 * 3600000) / 86400000) + 1) * 86400000 - 9 * 3600000;
    const timer = window.setTimeout(refresh, nextDay - now + 50);
    document.addEventListener("visibilitychange", resume);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", resume); };
  }, [today, game.session?.user?.id]);
  const skipsReady = game.questSkipsAuthorityReady === true;
  const freeRemaining = skipsReady ? Math.max(0, 5 - (game.dailyCashSkipsResetDate === today ? Number(game.dailyCashSkips) : 0)) : null;
  const paidRemaining = skipsReady ? Math.max(0, 10 - (game.dailyCashSkipsResetDate === today ? Number(game.dailyPaidSkips) : 0)) : null;
  const shorten = async (currency: "FREE_PREOPEN" | "DIAMOND", patrolId: string) => {
    setPendingAction("SHORTEN");
    return await guarded(async () => {
      const success = await game.handleInstantComplete(currency, patrolId);
      if (!success && mountedRef.current && game.session?.user?.id === userRef.current) await game.syncBootstrapData(game.session.user.id);
      return success;
    });
  };
  const confirmPaidShorten = (patrolId: string) => {
    const owner = game.session?.user?.id;
    game.setConfirmDialogConfig({
    isOpen: true, title: "ダイア時短", message: "30ダイアを消費して、このクエストの探索時間を完了します。未クリアならボス戦へ、クリア済みなら報酬受取へ進めます。",
    confirmText: "30ダイアで時短", cancelText: "戻る",
    onCancel: () => game.setConfirmDialogConfig(null),
    onConfirm: async () => { if (!mountedRef.current || !owner || userRef.current !== owner) return; const success = await shorten("DIAMOND", patrolId); if (!success) throw new Error("時短を完了できませんでした"); if (mountedRef.current && userRef.current === owner) game.setConfirmDialogConfig(null); },
  });
  };
  const closeResult = () => { game.setShowPatrolRewardModal(false); game.setLastPatrolRewards(null); startSelection(); };

  useEffect(() => {
    const request = game.questSelectionRequest;
    if (!request) return;
    const course = (game.patrolCourses || []).find((entry: any) => entry.id === request.courseId);
    if (!course) return;
    game.setSelectedTown(course.town_id);
    game.setSelectedCourse(course.id);
    game.setSelectedPatrolMember(null);
    setSelectionStep("REVIEW");
    setShowSelection(true);
    game.requestQuestSelection(null);
  }, [game.questSelectionRequest]);

  // Default only when entering selection or changing town. Do not reset a user's higher difficulty on refresh.
  useEffect(() => {
    if (!showSelection || selectionStep !== "REVIEW" || game.selectedCourse) return;
    const courseId = initialQuestCourseId(game.patrolCourses || [], game.selectedTown);
    if (courseId) game.setSelectedCourse(courseId);
  }, [showSelection, selectionStep, game.selectedCourse, game.selectedTown, game.patrolCourses]);

  const returnToList = () => { setShowSelection(false); setSelectedPatrolId(null); };
  const startSelection = () => { game.setSelectedCourse(""); game.setSelectedPatrolMember(null); setSelectedPatrolId(null); setSelectionStep("DESTINATION"); setShowSelection(true); };

  const openPatrol = (patrolId: string) => {
    setSelectedPatrolId(patrolId);
    setShowSelection(false);
    game.playCyberSe("click");
  };

  const guarded = async (operation: () => Promise<any>) => {
    if (actionRef.current) return;
    actionRef.current = true;
    game.setGlobalInteractionBlocking(true);
    try { return await operation(); }
    finally { actionRef.current = false; setPendingAction(null); game.setGlobalInteractionBlocking(false); }
  };

  const startBattle = async (patrol: any, npc: any) => {
    const retryable = (patrol.progressionKind || patrol.progression_kind) === "FIRST_CLEAR" && patrol.battle_result === "DEFEAT";
    if (!npc || battleRef.current || game.battleEncounterLocked || (!retryable && patrol.id === game.settledPatrolEncounterId)) return;
    game.setLastPatrolRewards(null);
    game.setShowPatrolRewardModal(false);
    battleRef.current = true;
    setBattleStartingId(patrol.id);
    game.setGlobalInteractionBlocking(true);
    try {
      const battleCourse = (game.patrolCourses || []).find((course: any) => course.id === patrol.courseId);
      const battleBackgroundPath = getCharacterLocationBackground(battleCourse?.town_id || game.selectedTown);
      await game.startCardBattle(
        "PATROL", npc.npc_name || "敵NPC", npc.id,
        undefined, undefined, undefined, undefined, undefined, undefined,
        npc, patrol.id,
        { encounterLabel: patrol.courseName || npc.npc_name || "クエスト", opponentLabel: npc.npc_name || "敵NPC", backgroundPath: battleBackgroundPath }
      );
    } finally {
      battleRef.current = false;
      setBattleStartingId(null);
      game.setGlobalInteractionBlocking(false);
    }
  };

  return <HubPage className="patrol-container quest-v2-shell" title="クエスト" hideVisualHeader>
    <QuestTownStory townId={selectionVisible && ((selectionStep !== "DESTINATION" && activeCourse?.is_unlocked !== false) || selectedTownHasUpperClear) ? game.selectedTown : null} phase={selectedTownHasUpperClear ? "CLEAR" : "START"} />
    <div ref={contentRef} className="quest-v2-content" style={{ "--quest-state-background": `url(${stateBgImage})` } as React.CSSProperties}>
      {(selectionVisible || selectedPatrol) && <button className="quest-v2-back" onClick={returnToList}>探索一覧へ</button>}
      {!selectionVisible && !selectedPatrol && <section className="quest-v2-overview" aria-label="探索状況">
        <header className="quest-v2-page-hero"><img src="/promotion/mypage_banner_quest.webp" alt="クエスト" /><p>街を攻略し、次のステージへ。</p></header><div className="quest-v2-overview-heading"><span>探索枠 {occupiedCount} / {visibleSlots}</span><span>クリア {clearedCount} / 21</span></div><p className="quest-v2-slot-note">初回クリアごとに表示枠が1つ増えます（最大5枠）。</p>
        {activePatrols.map((patrol: any) => {
          const course = (game.patrolCourses || []).find((entry: any) => entry.id === patrol.courseId);
          const character = CHARACTERS_MASTER.find((entry: any) => entry.id === patrol.characterId);
          const state = questProgressState(patrol);
          const label = { REWARD: "受取可能", BATTLE: "ボス挑戦可能", WAITING: "探索中", UNKNOWN: "確認中" }[state];
          return <button className="quest-v2-dispatch-card" data-state={state} key={patrol.id} onClick={() => openPatrol(patrol.id)}>
            {character && <CharacterPresentation src={character.img?.startsWith("/characters/") ? character.img : `/characters/${String(character.img || "").replace(/^\//, "")}`} alt={character.jpName} variant="thumbnail" rarity={character.rarity} backgroundSrc={getCharacterLocationBackground(character.homeTown)} frameKind="character" metadata={false} />}
            <span className="quest-v2-dispatch-description"><strong>{character?.jpName || "キャラクター"}</strong><span>{course?.name || "クエスト"} / {difficulty(course?.level_type || "")}</span><b>{label}{state === "WAITING" ? `・残り ${clock(patrol.secondsLeft)}` : ""}</b>{isCharacterHometown(character?.homeTown, course?.town_id) && <em className="quest-v2-bonus">地元一致</em>}</span>
            <span className="quest-v2-dispatch-open">{state === "REWARD" ? "報酬へ" : state === "BATTLE" ? "バトルへ" : "確認"}</span>
          </button>;
        })}
        {Array.from({ length: Math.max(0, visibleSlots - activePatrols.length) }, (_, index) => <button className="quest-v2-empty-slot" key={index} disabled={!hasExplorableCourse} onClick={startSelection}><span className="quest-v2-slot-number">{String(activePatrols.length + index + 1).padStart(2, "0")}</span><strong>未探索<small>{hasExplorableCourse ? "探索先を選ぶ" : "ステージ突破で次の探索先が開放"}</small></strong><span className="quest-v2-slot-plus" aria-hidden="true">＋</span></button>)}
      </section>}
      {selectionVisible && <>
      {selectionStep === "DESTINATION" ? <section className="quest-v2-town-list" aria-label="街を選ぶ">{TOWNS.map(([id, label]) => <button key={id} disabled={!questCoursesForTown(game.patrolCourses || [], id).some((course: any) => course.is_unlocked !== false)} onClick={() => { game.setSelectedTown(id); game.setSelectedCourse(initialQuestCourseId(game.patrolCourses || [], id)); game.setSelectedPatrolMember(null); setSelectionStep("REVIEW"); game.playCyberSe("click"); }}><img src={`/bg/bg_street_${id}.jpg`} alt="" /><span className="quest-v2-town-copy"><strong>{label}</strong>{!questCoursesForTown(game.patrolCourses || [], id).some((course: any) => course.is_unlocked !== false) && <small>前の街の上級クリアで開放</small>}<span className="quest-v2-town-rewards" aria-label="主な報酬">{questAreaRewardItemIds(game.patrolCourses || [], id).map(itemId => <span key={itemId} className={itemId === "NORMAL_GACHA_TICKET_RANDOM" ? "quest-v2-town-reward is-random" : "quest-v2-town-reward"} role="img" aria-label={canonicalItemName(itemId)} title={canonicalItemName(itemId)}>{(itemId === "NORMAL_GACHA_TICKET_RANDOM" ? ["NORMAL_GACHA_TICKET_CHARACTER", "NORMAL_GACHA_TICKET_SKILL", "NORMAL_GACHA_TICKET_EQUIPMENT"] : [itemId]).map(iconId => <CanonicalItemIcon key={iconId} itemId={iconId} alt="" />)}</span>)}</span></span><span className="quest-v2-town-arrow" aria-hidden="true">›</span></button>)}</section> : <>
        <section className="quest-v2-identity" style={{ backgroundImage: `url(${bgImage})` }}><div><strong>{townName}</strong><small>空き枠 {Math.max(0, visibleSlots - occupiedCount)}</small></div></section>
        {selectionStep === "REVIEW" && <>
          <button className="quest-v2-back" onClick={() => setSelectionStep("DESTINATION")}>街を選び直す</button>
          <section className="quest-v2-courses" aria-label="級を選ぶ">{questCoursesForTown(game.patrolCourses || [], game.selectedTown).map((course: any) => <button key={course.id} className={`${game.selectedCourse === course.id ? "active" : ""} ${course.is_unlocked === false ? "locked" : ""}`} aria-pressed={game.selectedCourse === course.id} disabled={course.is_unlocked === false} onClick={() => { game.setSelectedCourse(course.id); game.playCyberSe("click"); }}><strong>{difficulty(course.level_type)}</strong>{(course.is_unlocked === false || course.is_first_cleared || course.boss_ready) && <small>{course.is_unlocked === false ? (course.level_type === "HARD" ? "中級をクリアで解放" : course.level_type === "NORMAL" ? "初級をクリアで解放" : "前の街の上級クリアで解放") : course.is_first_cleared ? "クリア済・周回可能" : course.boss_ready ? "ボス挑戦可能" : ""}</small>}</button>)}</section>
        </>}
      </>}

      {activeCourse && selectionStep !== "DESTINATION" && <section className="quest-v2-brief">
        <header><strong>{activeCourse.name} / {difficulty(activeCourse.level_type)}</strong>{selectionStep === "CHARACTER" && <button className="quest-v2-back" onClick={() => setSelectionStep("REVIEW")}>戻る</button>}</header>
        {selectionStep === "REVIEW" && <>

        <section className={`quest-v2-enemy-preview${activeCoursePatrol || activeCourse.is_first_cleared ? " is-cleared" : ""}`} aria-label="出現エネミー"><h3 className="quest-v2-section-title">出現エネミー{(activeCoursePatrol || activeCourse.is_first_cleared) && <span className="quest-v2-cleared-label">{activeCoursePatrol ? (Number(activeCoursePatrol.secondsLeft) > 0 ? "探索中" : questProgressState(activeCoursePatrol) === "BATTLE" ? "ボス挑戦可能" : "探索完了") : "クリア済"}</span>}</h3><div>{enemyCandidates.map((master: any) => <article key={master.id}><CharacterPresentation src={master.img?.startsWith("/characters/") ? master.img : `/characters/${String(master.img || "").replace(/^\//, "")}`} alt={master.jpName} variant="thumbnail" rarity={master.rarity} backgroundSrc={getCharacterLocationBackground(master.homeTown)} frameKind="character" metadata={false} /><strong>{master.jpName}</strong></article>)}</div>{enemyCandidates.length === 0 && <p role="status">出現情報を確認中</p>}</section>
        <h3 className="quest-v2-section-title">報酬</h3>
        <div className="quest-v2-metrics"><span><small>所要時間</small><strong>{clock(activeCourse.duration_seconds)}</strong></span><span><small>エナジー</small><strong>{activeCourse.cost_vitality}</strong></span>{Number(activeCourse.recommended_level) > 0 && <span><small>推奨レベル</small><strong>Lv {activeCourse.recommended_level}</strong></span>}</div>
        <div className="quest-v2-rewards" aria-label="確定報酬">{Number(activeCourse.reward_xp || 0) > 0 && <RewardIcon itemId="PLAYER_XP" label="プレイヤー経験値" quantity={Number(activeCourse.reward_xp)} />}{Number(activeCourse.reward_cash || 0) > 0 && <RewardIcon itemId="CASH" label="CASH" quantity={Number(activeCourse.reward_cash)} />}{guaranteedRewards(activeCourse.reward_items).map((item: any) => <RewardIcon key={item.item_id} itemId={String(item.item_id || "")} label={canonicalItemName(String(item.item_id || ""))} quantity={Number(item.quantity || 0)} />)}</div>
        {(activeCourse.reward_items || []).some((item: any) => Number(item.probability_bp) > 0 && Number(item.probability_bp) < 10000) && <details className="quest-v2-drops"><summary>獲得可能なアイテム</summary><div className="quest-v2-rewards">{(activeCourse.reward_items || []).filter((item: any) => Number(item.probability_bp) > 0 && Number(item.probability_bp) < 10000).map((item: any) => <RewardIcon key={item.item_id} itemId={String(item.item_id)} label={canonicalItemName(String(item.item_id))} quantity={Number(item.quantity || 0)} />)}</div></details>}
        {!activeCourse.is_first_cleared && (Number(activeCourse.first_clear_cash_reward) > 0 || Number(activeCourse.first_clear_user_exp) > 0 || (activeCourse.first_clear_items || []).some((item: any) => Number(item.quantity) > 0)) && <section className="quest-v2-first-clear"><strong>初回クリア報酬</strong><div className="quest-v2-rewards">{Number(activeCourse.first_clear_cash_reward) > 0 && <RewardIcon itemId="CASH" label="CASH" quantity={Number(activeCourse.first_clear_cash_reward)} />}{Number(activeCourse.first_clear_user_exp) > 0 && <RewardIcon itemId="PLAYER_XP" label="プレイヤー経験値" quantity={Number(activeCourse.first_clear_user_exp)} />}{(activeCourse.first_clear_items || []).map((item: any) => <RewardIcon key={item.item_id} itemId={String(item.item_id || "")} label={canonicalItemName(String(item.item_id || ""))} quantity={Number(item.quantity || 0)} />)}</div></section>}
        {activeCoursePatrol && !activeCourse.is_first_cleared ? <OutlawButton variant="primary" fullWidth onClick={() => openPatrol(activeCoursePatrol.id)}>進行状況を確認</OutlawButton> : activeCourse.boss_ready && activeCourse.boss_patrol_id ? <OutlawButton variant="primary" fullWidth onClick={() => openPatrol(activeCourse.boss_patrol_id)}>ボスに再挑戦</OutlawButton> : <OutlawButton variant="primary" fullWidth disabled={occupiedCount >= 5 || activeCourse.is_unlocked === false || (!activeCourse.is_first_cleared && activePatrols.some((patrol: any) => patrol.courseId === activeCourse.id))} onClick={() => setSelectionStep("CHARACTER")}>キャラクターを選ぶ</OutlawButton>}</>}
        {selectionStep === "CHARACTER" && <><h3 className="quest-v2-section-title">探索キャラクター</h3>
        <p className="quest-v2-hometown-note">地元一致：CASH +10% / ドロップ率 +2%ポイント</p>
        <div className="quest-v2-character-grid">{(game.userCharactersDbList || []).map((record: any) => { const master = CHARACTERS_MASTER.find((entry: any) => entry.id === record.character_id); if (!master) return null; const patrol = occupiedPatrols.find((entry: any) => entry.characterId === record.character_id); const deployed = Boolean(patrol); return <button key={record.id} className={`${game.selectedPatrolMember === record.character_id && !deployed ? "selected" : ""} ${deployed ? "deployed" : ""}`} aria-label={deployed ? `${master.jpName} 探索中のクエストを確認` : `${master.jpName} Lv.${Number(record.level || 1)}`} onClick={() => deployed ? openPatrol(patrol.id) : game.togglePatrolMemberSelection(record.character_id)}><span className="quest-v2-character-visual"><CharacterPresentation src={master.img?.startsWith("/characters/") ? master.img : `/characters/${String(master.img || "").replace(/^\//, "")}`} alt={master.jpName} variant="thumbnail" rarity={master.rarity} backgroundSrc={getCharacterLocationBackground(master.homeTown)} frameKind="character" rarityBadge attribute={master.alignment} attributeBadge metadata={false} />{deployed && <b>探索中</b>}</span><strong>{master.jpName}</strong><span>{deployed ? "進行状況を確認" : `Lv.${Number(record.level || 1)}`}</span>{isCharacterHometown(master.homeTown, activeCourse.town_id) && <em>地元一致</em>}</button>; })}</div>
        {(occupiedCount >= 5 || Number(game.vitality) < Number(activeCourse.cost_vitality)) && <p className="quest-v2-dispatch-reason" role="status">{occupiedCount >= 5 ? "探索枠がいっぱいです" : "エナジーが不足しています"}</p>}
        <OutlawButton variant="primary" fullWidth disabled={game.dispatchLoading || activeCourse.is_unlocked === false || !game.selectedCourse || !game.selectedPatrolMember || occupiedCount >= 5 || occupiedPatrols.some((p: any) => p.characterId === game.selectedPatrolMember) || Number(game.vitality) < Number(activeCourse.cost_vitality)} isLoading={game.dispatchLoading || pendingAction === "DISPATCH"} loadingLabel="探索準備中…" onClick={() => { setPendingAction("DISPATCH"); void guarded(async () => { const owner = userRef.current; const patrolId = await game.handleStartPatrol(); if (typeof patrolId === "string" && mountedRef.current && userRef.current === owner) { setSelectedPatrolId(patrolId); setShowSelection(false); } }); }}>{townName}を探索する</OutlawButton></>}
      </section>}</>}

      {!selectionVisible && selectedPatrol && <div className="quest-v2-progress-list">{[selectedPatrol].map((patrol: any) => {
        const course = (game.patrolCourses || []).find((entry: any) => entry.id === patrol.courseId);
        const patrolTownName = TOWNS.find(([id]) => id === course?.town_id)?.[1] || townName;
        const character = CHARACTERS_MASTER.find((entry: any) => entry.id === patrol.characterId);
        const canonicalEnemyMembers = Array.isArray(patrol.encounterSnapshot?.members)
          ? patrol.encounterSnapshot.members
          : [];
        // The enemy party is generated for this exact dispatch and stored on
        // user_patrols. Static Quest progression and the retired patrol_npcs
        // master are not encounter authority.
        const npc = canonicalEnemyMembers.length > 0 ? {
          id: patrol.id,
          quest_id: patrol.courseId,
          npc_name: course?.name || "クエスト",
          npc_level: Number(course?.recommended_level || canonicalEnemyMembers[0]?.level || 1),
          members: canonicalEnemyMembers,
        } : null;
        const battleEnemies = canonicalEnemyMembers.map((member: any) => ({
          member,
          master: CHARACTERS_MASTER.find((entry: any) => entry.id === member.characterId),
        })).filter((entry: any) => entry.master);
        const progressState = questProgressState(patrol);
        const complete = progressState === "REWARD";
        const battleRequired = progressState === "BATTLE";
        const unresolvedBattle = battleRequired && npc;
        const progress = Math.max(4, Math.min(100, ((Number(patrol.secondsTotal || 1) - Number(patrol.secondsLeft || 0)) / Number(patrol.secondsTotal || 1)) * 100));
        if (pendingAction === "SHORTEN") return <section className="tutorial-quest-wire quest-v2-state-surface" data-quest-state="SHORTEN_PENDING" key={patrol.id}><div className="tutorial-wire-speedup" role="status"><h2>{patrolTownName}を探索中</h2><div className="tutorial-wire-speed-icon">»</div><strong>時短中…</strong><div className="tutorial-wire-progress"><i /></div></div></section>;
        if (battleRequired) return <section className="tutorial-quest-wire quest-v2-state-surface quest-v2-battle-ready" data-quest-state="BATTLE_READY" key={patrol.id}>
          <div className={`tutorial-wire-encounter ${unresolvedBattle ? "is-ready" : ""}`}>
            <div className="tutorial-wire-glitch" aria-hidden="true">VS</div>
            <header className="quest-v2-battle-ready-identity"><small>{patrolTownName} / {difficulty(course?.level_type || "")}</small><h2>ボスに挑戦</h2><strong>{course?.name || "クエスト"}</strong></header>
            <div className="quest-v2-battle-enemies" aria-label="対戦相手">{battleEnemies.map(({ member, master }: any, index: number) => <article key={`${member.characterId}-${index}`}><CharacterPresentation src={master.img?.startsWith("/characters/") ? master.img : `/characters/${String(master.img || "").replace(/^\//, "")}`} alt={master.jpName} variant="thumbnail" rarity={master.rarity} backgroundSrc={getCharacterLocationBackground(master.homeTown)} frameKind="character" metadata={false} /><span><strong>{master.jpName}</strong><small>Lv {Number(member.level || npc?.npc_level || 1)}</small></span></article>)}</div>
            <p>敗北しても、追加AP・待ち時間なしで再挑戦できます。</p>
            <OutlawButton variant="primary" fullWidth disabled={!unresolvedBattle || battleStartingId === patrol.id || game.battleEncounterLocked} isLoading={battleStartingId === patrol.id} loadingLabel="バトル準備中…" onClick={() => void startBattle(patrol, npc)}>{unresolvedBattle ? "バトルへ" : "遭遇情報を同期中…"}</OutlawButton>
            <OutlawButton className="quest-v2-selection-return" fullWidth onClick={startSelection}>街一覧へ</OutlawButton>
          </div>
        </section>;
        if (complete) return <section className="tutorial-quest-wire quest-v2-state-surface" data-quest-state="RESULT_READY" key={patrol.id}><header className="tutorial-wire-complete"><h2>クエスト完了</h2><small>QUEST COMPLETE</small></header>{character && <div className="tutorial-wire-return-character"><CharacterPresentation src={character.img?.startsWith("/characters/") ? character.img : `/characters/${String(character.img || "").replace(/^\//, "")}`} alt={character.jpName} variant="quest" rarity={character.rarity} backgroundSrc={getCharacterLocationBackground(character.homeTown)} frameKind="character" metadata={false} /></div>}<strong className="tutorial-wire-course">{course?.name || "クエスト"}</strong><OutlawButton variant="primary" fullWidth isLoading={pendingAction === "CLAIM"} onClick={() => { setPendingAction("CLAIM"); void guarded(() => game.handleClaimRewards(patrol.id)); }}>報酬を受け取る</OutlawButton><OutlawButton className="quest-v2-selection-return" fullWidth onClick={startSelection}>街一覧へ</OutlawButton></section>;
        if (progressState === "UNKNOWN") return <section key={patrol.id} role="status">探索状況を確認中…</section>;
        return <section className="tutorial-quest-wire quest-v2-state-surface" data-quest-state="PROGRESS" key={patrol.id}><header className="tutorial-wire-progress-title"><span>{patrolTownName}を探索中</span><small>{difficulty(course?.level_type || "")}</small></header>{character && <div className="tutorial-wire-progress-character"><CharacterPresentation src={character.img?.startsWith("/characters/") ? character.img : `/characters/${String(character.img || "").replace(/^\//, "")}`} alt={character.jpName} variant="quest" rarity={character.rarity} backgroundSrc={getCharacterLocationBackground(character.homeTown)} frameKind="character" metadata={false} /></div>}<strong className="tutorial-wire-course">{course?.name || "クエスト"}</strong>{isCharacterHometown(character?.homeTown, course?.town_id) && <p className="quest-v2-hometown-note">{patrol.hometownBonusSnapshot?.matched ? <>地元ボーナス発生中<br />CASH +{Number(patrol.hometownBonusSnapshot.cash).toLocaleString()} / ドロップ率 +{Number(patrol.hometownBonusSnapshot.drop_bonus_bp) / 100}ポイント</> : "地元一致"}</p>}{Number.isFinite(patrol.baseCashSnapshot) && <p className="quest-v2-expected-cash">獲得予定CASH：{(Number(patrol.baseCashSnapshot) + Number(patrol.hometownBonusSnapshot?.cash || 0)).toLocaleString()}</p>}<div className="tutorial-wire-time">残り時間 <b>{clock(patrol.secondsLeft)}</b></div><div className="tutorial-wire-progress"><i style={{ width: `${progress}%` }} /></div><div className="quest-v2-speed-actions"><OutlawButton disabled={game.dispatchLoading || !skipsReady || freeRemaining === 0} onClick={() => void shorten("FREE_PREOPEN", patrol.id)}>無料時短 {freeRemaining === null ? "残数確認中" : `${freeRemaining}/5`}</OutlawButton><OutlawButton variant="primary" disabled={game.dispatchLoading || !skipsReady || paidRemaining === 0} onClick={() => confirmPaidShorten(patrol.id)}>30ダイア / 回 {paidRemaining === null ? "残数確認中" : `${paidRemaining}/10`}</OutlawButton></div><OutlawButton className="quest-v2-selection-return" fullWidth onClick={startSelection}>街一覧へ</OutlawButton></section>;
      })}</div>}
    </div>

    {game.showPatrolRewardModal && game.lastPatrolRewards && game.battleState === null && <CanonicalDialog title="クエスト結果" onClose={closeResult} actions={[{ label: "閉じる", semantic: "secondary", onClick: closeResult }]}><div className="quest-v2-result"><span>{game.lastPatrolRewards.battleVictory ? "勝利" : "帰還完了"}</span><strong>{game.lastPatrolRewards.courseName}</strong><p>CASH・プレイヤー経験値は反映済みです。</p>{game.lastPatrolRewards.matchBonusApplied && <p className="quest-v2-hometown-note">CASH合計に地元ボーナス +{Number(game.lastPatrolRewards.matchBonusCash).toLocaleString()} を含みます</p>}<div className="quest-v2-rewards">{Number(game.lastPatrolRewards.totalCash || 0) > 0 && <RewardIcon itemId="CASH" label="CASH" quantity={Number(game.lastPatrolRewards.totalCash)} />}{Number(game.lastPatrolRewards.totalXp || 0) > 0 && <RewardIcon itemId="PLAYER_XP" label="プレイヤー経験値" quantity={Number(game.lastPatrolRewards.totalXp)} />}{(game.lastPatrolRewards.awardedItems || []).map((item: any, index: number) => <RewardIcon key={`${item.item_id}-${index}`} itemId={String(item.item_id)} label={canonicalItemName(String(item.item_id))} quantity={Number(item.quantity)} />)}</div>{(game.lastPatrolRewards.awardedItems || []).length > 0 && <p>アイテムを獲得しました。My Bagで確認できます。</p>}{game.lastPatrolRewards.levelUpMessage && <p>{game.lastPatrolRewards.levelUpMessage}</p>}</div></CanonicalDialog>}
  </HubPage>;
}

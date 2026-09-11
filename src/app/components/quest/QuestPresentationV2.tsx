"use client";

import React, { useEffect, useRef, useState } from "react";
import { useGame } from "@/app/context/GameContext";
import { CHARACTERS_MASTER } from "@/utils/game_constants";
import { canonicalItemName } from "@/domain/gameplay/canonical/items";
import { getCharacterLocationBackground } from "@/utils/characterVisualAssets";
import CharacterPresentation from "../character/CharacterPresentation";
import HubPage from "../ui/HubPage";
import OutlawButton from "../ui/OutlawButton";
import CanonicalDialog from "../ui/CanonicalDialog";
import CanonicalItemIcon from "../ui/CanonicalItemIcon";
import { questProgressState, sortQuestProgress } from "@/domain/questPresentationState";
import { getJstDateString } from "@/utils/jst_date";
import "./QuestPresentationV2.css";

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
  return <span className="quest-v2-reward-item">{itemId === "CASH" ? <img src="/ui/icon_cash.png" alt="" /> : itemId === "PLAYER_XP" ? <b>XP</b> : <CanonicalItemIcon itemId={itemId} alt="" />}<small>{label}</small><strong>× {Number(quantity || 0).toLocaleString()}</strong></span>;
}

export default function QuestPresentationV2() {
  const game = useGame() as any;
  const actionRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const userRef = useRef(game.session?.user?.id);
  userRef.current = game.session?.user?.id;
  const battleRef = useRef(false);
  const [battleStartingId, setBattleStartingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"DISPATCH" | "SHORTEN" | "CLAIM" | null>(null);
  const [showSelection, setShowSelection] = useState((game.activePatrols || []).length === 0);
  const [selectedPatrolId, setSelectedPatrolId] = useState<string | null>((game.activePatrols || [])[0]?.id || null);
  const activePatrols = sortQuestProgress<any>(game.activePatrols || []);
  const selectedPatrol = activePatrols.find((patrol: any) => patrol.id === selectedPatrolId) || activePatrols[0] || null;
  const selectionVisible = showSelection || activePatrols.length === 0;
  const activeCourse = (game.patrolCourses || []).find((course: any) => course.id === game.selectedCourse);
  const townName = TOWNS.find(([id]) => id === game.selectedTown)?.[1] || "街";
  const bgImage = `/bg/bg_street_${game.selectedTown}.jpg`;
  const guaranteedRewards = (items: any[] = []) => items.filter((item) => Number(item.probability_bp ?? 10000) >= 10000);

  useEffect(() => {
    if (activePatrols.length > 0 && !activePatrols.some((patrol: any) => patrol.id === selectedPatrolId)) {
      setSelectedPatrolId(activePatrols[0].id);
    }
  }, [activePatrols, selectedPatrolId]);

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
    await guarded(async () => {
      const success = await game.handleInstantComplete(currency, patrolId);
      if (!success && mountedRef.current && game.session?.user?.id === userRef.current) await game.syncBootstrapData(game.session.user.id);
      return success;
    });
  };
  const confirmPaidShorten = (patrolId: string) => {
    const owner = game.session?.user?.id;
    game.setConfirmDialogConfig({
    isOpen: true, title: "DIA時短", message: "30 DIAを消費して、このクエストの待機時間を完了します。バトルと報酬受取は別途必要です。",
    confirmText: "30 DIAで時短", cancelText: "戻る",
    onCancel: () => game.setConfirmDialogConfig(null),
    onConfirm: async () => { game.setConfirmDialogConfig(null); if (!mountedRef.current || !owner || userRef.current !== owner) return; await shorten("DIAMOND", patrolId); },
  });
  };
  const closeResult = () => { game.setShowPatrolRewardModal(false); game.setLastPatrolRewards(null); };
  const repeatCourse = () => {
    const course = (game.patrolCourses || []).find((entry: any) => entry.id === game.lastPatrolRewards?.courseId);
    if (!course) { closeResult(); return; }
    game.setSelectedTown(course.town_id); game.setSelectedCourse(course.id);
    game.setSelectedPatrolMember(null);
    setShowSelection(true);
    closeResult();
  };

  useEffect(() => {
    const request = game.questSelectionRequest;
    if (!request) return;
    const course = (game.patrolCourses || []).find((entry: any) => entry.id === request.courseId);
    if (!course) return;
    game.setSelectedTown(course.town_id);
    game.setSelectedCourse(course.id);
    game.setSelectedPatrolMember(null);
    setShowSelection(true);
    game.requestQuestSelection(null);
  }, [game.questSelectionRequest]);

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
    if (!npc || battleRef.current || game.battleEncounterLocked || patrol.id === game.settledPatrolEncounterId) return;
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
    <div className="quest-v2-content" style={{ "--quest-state-background": `url(${bgImage})` } as React.CSSProperties}>
      {activePatrols.length > 0 && <nav className="quest-v2-dispatch-list" aria-label="派遣状況">
        <strong>派遣状況 {activePatrols.length} / 5</strong>
        {activePatrols.map((patrol: any) => {
          const course = (game.patrolCourses || []).find((entry: any) => entry.id === patrol.courseId);
          const state = questProgressState(patrol);
          const label = { REWARD: "受取可能", BATTLE: "戦闘待ち", WAITING: "派遣中", UNKNOWN: "確認中" }[state];
          return <button key={patrol.id} aria-pressed={!selectionVisible && selectedPatrol?.id === patrol.id} onClick={() => openPatrol(patrol.id)}><span>{course?.name || "クエスト"}</span><strong>{label}{state === "WAITING" ? ` ${clock(patrol.secondsLeft)}` : ""}</strong>{course && <small>CASH {Number(course.reward_cash || 0).toLocaleString()}</small>}</button>;
        })}
      </nav>}
      {selectionVisible && <><section className="quest-v2-identity" style={{ backgroundImage: `url(${bgImage})` }}>
        <div><span>クエスト選択</span><strong>{townName}</strong><small>派遣中 {activePatrols.length}</small></div>
      </section>

      <nav className="quest-v2-town-tabs" aria-label="街選択">{TOWNS.map(([id, label]) => <button key={id} className={game.selectedTown === id ? "active" : ""} onClick={() => { game.setSelectedTown(id); const first = (game.patrolCourses || []).find((course: any) => course.town_id === id && course.is_unlocked !== false); game.setSelectedCourse(first?.id || ""); game.playCyberSe("click"); }}>{label}</button>)}</nav>

      <section className="quest-v2-courses" aria-label="クエスト選択">{(game.patrolCourses || []).filter((course: any) => course.town_id === game.selectedTown).map((course: any) => <button key={course.id} className={`${game.selectedCourse === course.id ? "active" : ""} ${course.is_unlocked === false ? "locked" : ""}`} disabled={course.is_unlocked === false} onClick={() => { game.setSelectedCourse(course.id); game.playCyberSe("click"); }}><strong>{difficulty(course.level_type)}</strong><small>CASH {Number(course.reward_cash || 0).toLocaleString()}</small><small>{clock(course.duration_seconds)} / Energy {course.cost_vitality}</small><small>{course.is_unlocked === false ? "前の難度をクリアで解放" : course.is_first_cleared ? "クリア済" : ""}</small></button>)}</section>

      {activeCourse && <section className="quest-v2-brief">
        <header><div><span>{townName}</span><strong>{activeCourse.name}</strong></div><b>{difficulty(activeCourse.level_type)}</b></header>
        <div className="quest-v2-metrics"><span><small>所要時間</small><strong>{clock(activeCourse.duration_seconds)}</strong></span><span><small>Energy</small><strong>{activeCourse.cost_vitality}</strong></span>{Number(activeCourse.recommended_level) > 0 && <span><small>推奨レベル</small><strong>Lv {activeCourse.recommended_level}</strong></span>}</div>
        <p className="quest-v2-flow-note">派遣 → 待機・時短 → バトル → 報酬受取</p>
        <div className="quest-v2-rewards" aria-label="確定報酬">{Number(activeCourse.reward_xp || 0) > 0 && <RewardIcon itemId="PLAYER_XP" label="PLAYER XP" quantity={Number(activeCourse.reward_xp)} />}{Number(activeCourse.reward_cash || 0) > 0 && <RewardIcon itemId="CASH" label="CASH" quantity={Number(activeCourse.reward_cash)} />}{guaranteedRewards(activeCourse.reward_items).map((item: any) => <RewardIcon key={item.item_id} itemId={String(item.item_id || "")} label={canonicalItemName(String(item.item_id || ""))} quantity={Number(item.quantity || 0)} />)}</div>
        {!activeCourse.is_first_cleared && (Number(activeCourse.first_clear_user_exp) > 0 || (activeCourse.first_clear_items || []).some((item: any) => Number(item.quantity) > 0)) && <section className="quest-v2-first-clear"><strong>初回クリア報酬</strong><div className="quest-v2-rewards">{Number(activeCourse.first_clear_user_exp) > 0 && <RewardIcon itemId="PLAYER_XP" label="PLAYER XP" quantity={Number(activeCourse.first_clear_user_exp)} />}{(activeCourse.first_clear_items || []).map((item: any) => <RewardIcon key={item.item_id} itemId={String(item.item_id || "")} label={canonicalItemName(String(item.item_id || ""))} quantity={Number(item.quantity || 0)} />)}</div></section>}
        <h3 className="quest-v2-section-title">派遣する仲間 <span>1名</span></h3>
        <div className="quest-v2-character-grid">{(game.userCharactersDbList || []).map((record: any) => { const master = CHARACTERS_MASTER.find((entry: any) => entry.id === record.character_id); if (!master) return null; const patrol = activePatrols.find((entry: any) => entry.characterId === record.character_id); const deployed = Boolean(patrol); return <button key={record.id} className={`${game.selectedPatrolMember === record.character_id && !deployed ? "selected" : ""} ${deployed ? "deployed" : ""}`} aria-label={deployed ? `${master.jpName} 派遣中のクエストを確認` : `${master.jpName} Lv.${Number(record.level || 1)}`} onClick={() => deployed ? openPatrol(patrol.id) : game.togglePatrolMemberSelection(record.character_id)}><span className="quest-v2-character-visual"><CharacterPresentation src={master.img?.startsWith("/characters/") ? master.img : `/characters/${String(master.img || "").replace(/^\//, "")}`} alt={master.jpName} variant="thumbnail" rarity={master.rarity} backgroundSrc={getCharacterLocationBackground(master.homeTown)} frameKind="character" metadata={false} />{deployed && <b>派遣中</b>}</span><strong>{master.jpName}</strong><span>{deployed ? "進行状況を確認" : `Lv.${Number(record.level || 1)}`}</span></button>; })}</div>
        <OutlawButton variant="primary" fullWidth disabled={game.dispatchLoading || !game.selectedCourse || !game.selectedPatrolMember || activePatrols.length >= 5 || activePatrols.some((p: any) => p.characterId === game.selectedPatrolMember) || Number(game.vitality) < Number(activeCourse.cost_vitality)} isLoading={game.dispatchLoading || pendingAction === "DISPATCH"} loadingLabel="派遣準備中…" onClick={() => { setPendingAction("DISPATCH"); setSelectedPatrolId(null); setShowSelection(false); void guarded(() => game.handleStartPatrol()); }}>{townName}へ派遣する</OutlawButton>
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
        if (pendingAction === "SHORTEN") return <section className="tutorial-quest-wire quest-v2-state-surface" data-quest-state="SHORTEN_PENDING" key={patrol.id}><div className="tutorial-wire-speedup" role="status"><h2>{patrolTownName}へ派遣中</h2><div className="tutorial-wire-speed-icon">»</div><strong>時短中…</strong><div className="tutorial-wire-progress"><i /></div></div></section>;
        if (battleRequired) return <section className="tutorial-quest-wire quest-v2-state-surface quest-v2-battle-ready" data-quest-state="BATTLE_READY" key={patrol.id}>
          <div className={`tutorial-wire-encounter ${unresolvedBattle ? "is-ready" : ""}`}>
            <div className="tutorial-wire-glitch" aria-hidden="true">⚔</div>
            <header className="quest-v2-battle-ready-identity"><small>{patrolTownName} / {difficulty(course?.level_type || "")}</small><h2>バトル発生</h2><strong>{course?.name || "クエスト"}</strong></header>
            <div className="quest-v2-battle-enemies" aria-label="対戦相手">{battleEnemies.map(({ member, master }: any, index: number) => <article key={`${member.characterId}-${index}`}><CharacterPresentation src={master.img?.startsWith("/characters/") ? master.img : `/characters/${String(master.img || "").replace(/^\//, "")}`} alt={master.jpName} variant="thumbnail" rarity={master.rarity} backgroundSrc={getCharacterLocationBackground(master.homeTown)} frameKind="character" metadata={false} /><span><strong>{master.jpName}</strong><small>Lv {Number(member.level || npc?.npc_level || 1)}</small></span></article>)}</div>
            <OutlawButton variant="primary" fullWidth disabled={!unresolvedBattle || battleStartingId === patrol.id || game.battleEncounterLocked} isLoading={battleStartingId === patrol.id} loadingLabel="バトル準備中…" onClick={() => void startBattle(patrol, npc)}>{unresolvedBattle ? "バトルへ" : "遭遇情報を同期中…"}</OutlawButton>
            <OutlawButton className="quest-v2-selection-return" fullWidth onClick={() => setShowSelection(true)}>別のクエストへ派遣</OutlawButton>
          </div>
        </section>;
        if (complete) return <section className="tutorial-quest-wire quest-v2-state-surface" data-quest-state="RESULT_READY" key={patrol.id}><header className="tutorial-wire-complete"><h2>クエスト完了</h2><small>QUEST COMPLETE</small></header>{character && <div className="tutorial-wire-return-character"><CharacterPresentation src={character.img?.startsWith("/characters/") ? character.img : `/characters/${String(character.img || "").replace(/^\//, "")}`} alt={character.jpName} variant="quest" rarity={character.rarity} backgroundSrc={getCharacterLocationBackground(character.homeTown)} frameKind="character" metadata={false} /></div>}<strong className="tutorial-wire-course">{course?.name || "クエスト"}</strong><OutlawButton variant="primary" fullWidth isLoading={pendingAction === "CLAIM"} onClick={() => { setPendingAction("CLAIM"); void guarded(() => game.handleClaimRewards(patrol.id)); }}>報酬を受け取る</OutlawButton><OutlawButton className="quest-v2-selection-return" fullWidth onClick={() => setShowSelection(true)}>別のクエストへ派遣</OutlawButton></section>;
        if (progressState === "UNKNOWN") return <section key={patrol.id} role="status">派遣状況を確認中…</section>;
        return <section className="tutorial-quest-wire quest-v2-state-surface" data-quest-state="PROGRESS" key={patrol.id}><header className="tutorial-wire-progress-title"><span>{patrolTownName}へ派遣中</span><small>{difficulty(course?.level_type || "")}</small></header>{character && <div className="tutorial-wire-progress-character"><CharacterPresentation src={character.img?.startsWith("/characters/") ? character.img : `/characters/${String(character.img || "").replace(/^\//, "")}`} alt={character.jpName} variant="quest" rarity={character.rarity} backgroundSrc={getCharacterLocationBackground(character.homeTown)} frameKind="character" metadata={false} /></div>}<strong className="tutorial-wire-course">{course?.name || "クエスト"}</strong><div className="tutorial-wire-time">残り時間 <b>{clock(patrol.secondsLeft)}</b></div><div className="tutorial-wire-progress"><i style={{ width: `${progress}%` }} /></div><div className="quest-v2-speed-actions"><OutlawButton disabled={game.dispatchLoading || freeRemaining === 0} onClick={() => void shorten("FREE_PREOPEN", patrol.id)}>無料時短 {freeRemaining === null ? "残数確認中" : `残り${freeRemaining}回`}</OutlawButton><OutlawButton variant="primary" disabled={game.dispatchLoading || paidRemaining === 0} onClick={() => confirmPaidShorten(patrol.id)}>30 DIA / 回 {paidRemaining === null ? "残数確認中" : `残り${paidRemaining}回`}</OutlawButton></div><OutlawButton className="quest-v2-selection-return" fullWidth onClick={() => setShowSelection(true)}>別のクエストへ派遣</OutlawButton></section>;
      })}</div>}
    </div>

    {game.showPatrolRewardModal && game.lastPatrolRewards && game.battleState === null && <CanonicalDialog title="クエスト結果" onClose={closeResult} actions={[...((game.patrolCourses || []).some((course: any) => course.id === game.lastPatrolRewards.courseId) ? [{ label: "同じクエストへ", semantic: "primary" as const, onClick: repeatCourse }] : []), { label: "閉じる", semantic: "secondary", onClick: closeResult }]}><div className="quest-v2-result"><span>{game.lastPatrolRewards.battleVictory ? "勝利" : "帰還完了"}</span><strong>{game.lastPatrolRewards.courseName}</strong><p>CASH・PLAYER XPは反映済みです。</p><div className="quest-v2-rewards">{Number(game.lastPatrolRewards.totalCash || 0) > 0 && <RewardIcon itemId="CASH" label="CASH" quantity={Number(game.lastPatrolRewards.totalCash)} />}{Number(game.lastPatrolRewards.totalXp || 0) > 0 && <RewardIcon itemId="PLAYER_XP" label="PLAYER XP" quantity={Number(game.lastPatrolRewards.totalXp)} />}{(game.lastPatrolRewards.awardedItems || []).map((item: any, index: number) => <RewardIcon key={`${item.item_id}-${index}`} itemId={String(item.item_id)} label={canonicalItemName(String(item.item_id))} quantity={Number(item.quantity)} />)}</div>{(game.lastPatrolRewards.awardedItems || []).length > 0 && <p>アイテムはプレゼントへ届きました。受取期限はプレゼントで確認してください。</p>}{game.lastPatrolRewards.levelUpMessage && <p>{game.lastPatrolRewards.levelUpMessage}</p>}</div></CanonicalDialog>}
  </HubPage>;
}

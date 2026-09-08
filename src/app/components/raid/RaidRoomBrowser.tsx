"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { RAID_DIFFICULTIES, type RaidDifficultyId, type RaidObserved, type RaidPlayerSummary, type RaidRoomDto } from "../../../domain/raidRoom";
import { getRaidDifficultyLabel, getRaidEligibilityPresentation, getRaidParticipationRequirement, getRaidRecommendedPowerLabel } from "../../../domain/raidRoomPresentation";
import { getRaidRoomLifecyclePresentation } from "../../../domain/raidRoomLifecyclePresentation";
import type { RaidBattleReference, RaidRoomController, RaidRoomBriefing } from "../../../domain/raidRoomClient";
import OutlawButton from "../ui/OutlawButton";
import OutlawCard from "../ui/OutlawCard";
import CanonicalDialog from "../ui/CanonicalDialog";
import RaidTop from "./RaidTop";
import RaidRoomDetail from './RaidRoomDetail';
import RaidRoomDialogs from './RaidRoomDialogs';
import RaidEnemyRoster from './RaidEnemyRoster';
import { createPortal } from 'react-dom';
import { useRaidRoomDisplay } from './useRaidRoomDisplay';
import { withRaidLeader } from '../../../domain/raidRoomDisplayClient';
import type { RaidRoomDisplay } from '../../../domain/raidRoomDisplay';
import type { RaidTopData } from "../../../domain/raidTop";
import "./RaidRoomBrowser.css";

export interface RaidRoomBrowserProps {
  controller: RaidRoomController;
  renderRewards?: (roomId: string, close: () => void, display?: RaidRoomDisplay) => React.ReactNode;
  loadDisplay?: (roomId: string) => Promise<RaidRoomDisplay>;
  currentUserId?: string;
  onOpenProfile?: (userId: string) => Promise<void>;
  profileOpen?: boolean;
  renderRescue?: (room: RaidRoomDto, disabled: boolean) => React.ReactNode;
  onBriefingReady?: (briefing: RaidRoomBriefing) => void | Promise<void>;
  onBattleReady: (reference: RaidBattleReference) => void | Promise<void>;
  setInteractionBlocking: (blocking: boolean) => void;
  resolveRewardName?: (itemId: string) => string | null | undefined;
  topData?: RaidTopData;
  onTopRefresh?: () => void;
  listRefreshRevision?: number;
}

const count = (value: RaidObserved<number>) => value.status === "available" ? value.value.toLocaleString("ja-JP") : "未確認";

function Player({ player }: { player: RaidPlayerSummary }) {
  return <span className="raid-room-player">
    {player.leaderIconUrl.status === "available" && player.leaderIconUrl.value
      ? <img src={player.leaderIconUrl.value} alt="" width={32} height={32} />
      : <span className="raid-room-avatar-placeholder" aria-hidden="true" />}
    <span>{player.name}</span>
  </span>;
}

function RoomSummary({ room, now }: { room: RaidRoomDto; now: number | null }) {
  const lifecycle = getRaidRoomLifecyclePresentation(room, now);
  const hp = room.hp.status === "available" ? room.hp.value : null;
  return <>
    <div className="raid-room-row"><strong>{getRaidDifficultyLabel(room.difficultyId)}</strong><span>{lifecycle.stateLabel}</span></div>
    <div className="raid-room-owner">主催者 {room.owner.status === "available" ? <Player player={room.owner.value} /> : "未確認"}</div>
    <div>参加者 {count(room.participantCount)} / 20人</div>
    <div>レイドHP {hp ? `${hp.current.toLocaleString("ja-JP")} / ${hp.max.toLocaleString("ja-JP")}` : "未確認"}</div>
    {hp && hp.max > 0 && <progress className="raid-room-hp" aria-label="レイドHP" value={Math.max(0, hp.current)} max={hp.max} />}
    <div className="raid-room-muted">{lifecycle.remainingLabel}</div>
    <div className="raid-room-muted">期限 {room.expiresAt.status === "available" && Number.isFinite(Date.parse(room.expiresAt.value))
      ? new Date(room.expiresAt.value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " JST" : "未確認"}</div>
  </>;
}

function Spinner() { return <div className="raid-room-wait" role="status" aria-label="通信中"><span className="spinner" aria-hidden="true" /></div>; }

export default function RaidRoomBrowser({ controller, onBattleReady, onBriefingReady, setInteractionBlocking, resolveRewardName, renderRescue, renderRewards, topData, onTopRefresh, listRefreshRevision, loadDisplay, currentUserId, onOpenProfile, profileOpen }: RaidRoomBrowserProps) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  // SSRとhydration初回は同じ未取得値。マウント後にだけ端末時計を参照する。
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const updateClock = () => setNow(Date.now());
    updateClock();
    const interval = setInterval(updateClock, 1000);
    document.addEventListener("visibilitychange", updateClock);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", updateClock); };
  }, []);
  const [difficulty, setDifficulty] = useState<RaidDifficultyId>("beginner");
  const [createOpen, setCreateOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [topVariantId, setTopVariantId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState("");
  const [dialog, setDialog] = useState<"participants" | "rewards" | null>(null);
  const [enemyOpen, setEnemyOpen] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [battleReference, setBattleReference] = useState<RaidBattleReference | null>(null);
  const busy = snapshot.registering || snapshot.creating || snapshot.bossChoices.status === "loading" || snapshot.joining || transitioning || [snapshot.rooms, snapshot.room, snapshot.participants, snapshot.rewards, snapshot.briefing].some((entry) => entry.status === "loading");
  // 全体一覧は明示的に探す時だけ取得。トップや敵の確認だけでは全ページを走査しない。
  const listingVisible = !snapshot.selectedRoomId && (!topData || browseOpen) && !createOpen;
  useEffect(() => { if (listingVisible) void controller.loadRooms(); }, [controller, listingVisible, listRefreshRevision]);
  useEffect(() => { setInteractionBlocking(busy); return () => setInteractionBlocking(false); }, [busy, setInteractionBlocking]);
  useEffect(() => { setDialog(null); setEnemyOpen(false); setTransitionError(null); setBattleReference(null); }, [snapshot.selectedRoomId]);

  const room = snapshot.room.status === "success" ? snapshot.room.data : null;
  const display = useRaidRoomDisplay(snapshot.selectedRoomId, room, currentUserId, loadDisplay);
  const displayParticipants = { ...snapshot.participants, data: snapshot.participants.data?.map(entry => ({ ...entry, player: withRaidLeader(entry.player, display.data) })) ?? null };
  const briefing = snapshot.briefing.status === 'success' ? snapshot.briefing.data : null;
  const eligibility = getRaidEligibilityPresentation(room?.serverEligibility);
  const lifecycle = room ? getRaidRoomLifecyclePresentation(room, now) : null;
  const joinLabel = lifecycle?.joinBlockLabel ?? eligibility.label;
  const openBattle = async (reference: RaidBattleReference) => {
    setTransitionError(null);
    setTransitioning(true);
    try { await onBattleReady(reference); setBattleReference(null); }
    catch { setTransitionError("バトル画面を開けませんでした。時間をおいて再度お試しください。"); }
    finally { setTransitioning(false); }
  };
  const join = async () => {
    // 再描画直前やバックグラウンド復帰直後の期限通過も、要求送信前に抑止する。
    if (!room || getRaidRoomLifecyclePresentation(room, Date.now()).blockJoin) {
      setNow(Date.now());
      return;
    }
    setTransitionError(null);
    const reference = await controller.join();
    if (!reference) return;
    setBattleReference(reference);
    await openBattle(reference);
  };

  const showTop = !!topData && !browseOpen && !snapshot.selectedRoomId;
  const returnToTop = async () => {
    setBrowseOpen(false); setCreateOpen(false); setTopVariantId(null);
    await controller.selectRoom(null);
    onTopRefresh?.();
  };
  return <section className={showTop ? "raid-room-browser raid-room-browser--top" : snapshot.selectedRoomId ? "raid-room-browser raid-room-browser--detail" : "raid-room-browser"} aria-label="レイド">
    {showTop && topData ? <RaidTop data={topData} disabled={busy}
      onOpenRoom={(roomId, rescueId) => { void controller.selectRoom(roomId, rescueId); }}
      onChooseEnemy={(enemy) => {
        if (!topData.canCreate || busy) return;
        setVariantId(enemy.variantId); setTopVariantId(enemy.variantId);
        controller.resetCreateRequest(); setBrowseOpen(true); setCreateOpen(true);
        void controller.loadBossChoices();
      }}
      onBrowse={() => { setCreateOpen(false); setTopVariantId(null); setBrowseOpen(true); }}
      onRefresh={() => onTopRefresh?.()} /> : <>
    {!snapshot.selectedRoomId && <p className="raid-room-muted">開始から24時間、または撃破で終了します。</p>}
    {!snapshot.selectedRoomId ? <>
      {topData && <OutlawButton loadingLabel="" disabled={busy} onClick={() => void returnToTop()}>トップへ</OutlawButton>}
      <div className="raid-room-tabs" role="tablist" aria-label="難易度">
        {RAID_DIFFICULTIES.map((entry) => <OutlawButton loadingLabel="" key={entry.id} aria-label={entry.label} role="tab" aria-selected={difficulty === entry.id} disabled={busy} variant={difficulty === entry.id ? "primary" : "secondary"} onClick={() => { if (difficulty !== entry.id) { setDifficulty(entry.id); controller.resetCreateRequest(); } }}>{entry.label}</OutlawButton>)}
      </div>
      <p className="raid-room-requirement">{getRaidParticipationRequirement(difficulty)}</p>
      <p className="raid-room-muted">{getRaidRecommendedPowerLabel(difficulty)}</p>
      {!createOpen && <OutlawButton loadingLabel="" disabled={busy} aria-label="更新" onClick={() => controller.loadRooms()}>更新</OutlawButton>}
      {!createOpen && snapshot.canCreate && <OutlawButton loadingLabel="" disabled={busy} aria-label="挑む" onClick={async () => { setTopVariantId(null); setCreateOpen(true); await controller.loadBossChoices(); }}>挑む</OutlawButton>}
      {createOpen && <OutlawCard>
        <p>敵と難易度を確認してください。戦闘時のRP消費は別です。</p>
        {snapshot.bossChoices.status === "loading" && <Spinner />}
        {snapshot.bossChoices.status === "error" && <><p role="alert">ボス候補を取得できませんでした。</p><OutlawButton loadingLabel="" disabled={busy} aria-label="ボス候補を再取得" onClick={() => controller.loadBossChoices()}>再取得</OutlawButton></>}
        {snapshot.bossChoices.status === "success" && <label className="raid-room-boss-choice">ボス
          <select aria-label="ボス" disabled={busy} value={variantId} onChange={event => { setVariantId(event.target.value); controller.resetCreateRequest(); }}>
            <option value="">選択してください</option>
            {snapshot.bossChoices.data?.filter(boss => !topVariantId || boss.raidVariantId === topVariantId).map(boss => <option key={boss.raidVariantId} value={boss.raidVariantId}>{boss.name}</option>)}
          </select>
        </label>}
        {snapshot.bossChoices.status === "success" && snapshot.bossChoices.data?.length === 0 && <p>挑戦できる敵はありません。</p>}
        <OutlawButton loadingLabel="" aria-label="この敵に挑む" isLoading={snapshot.creating} disabled={busy || !snapshot.bossChoices.data?.some(boss => boss.raidVariantId === variantId)} onClick={async () => {
          const created = await controller.createRoom(difficulty, variantId);
          if (created) setCreateOpen(false);
        }}>この敵に挑む</OutlawButton>
        <OutlawButton loadingLabel="" aria-label="選択を閉じる" disabled={busy} onClick={() => { setCreateOpen(false); setTopVariantId(null); }}>閉じる</OutlawButton>
        {snapshot.createError && <p role="alert">{snapshot.createError.replaceAll('Room', 'レイド')}</p>}
      </OutlawCard>}
      {!createOpen && <>
      {(snapshot.rooms.status === "loading") && <Spinner />}
      {snapshot.rooms.status === "idle" && <p>レイド情報は未取得です。</p>}
      {snapshot.rooms.status === "error" && <p role="alert">レイド一覧を取得できませんでした。更新して再度お試しください。</p>}
      {snapshot.rooms.status === "success" && <div className="raid-room-list">
        {snapshot.rooms.data?.filter((entry) => entry.difficultyId === difficulty).map((entry) => <OutlawCard key={entry.roomId}>
          <RoomSummary room={entry} now={now} />
          <OutlawButton loadingLabel="" fullWidth disabled={busy} aria-label="レイドを開く" onClick={() => controller.selectRoom(entry.roomId)}>レイドを開く</OutlawButton>
        </OutlawCard>)}
        {!snapshot.rooms.data?.some((entry) => entry.difficultyId === difficulty) && <p>この難易度のレイドはありません。</p>}
      </div>}
      </>}
    </> : <>
      <div className="raid-room-row">
        <OutlawButton loadingLabel="" disabled={snapshot.joining || snapshot.registering || transitioning} aria-label={topData ? "トップへ" : "一覧へ"} onClick={async () => { if (topData) await returnToTop(); else await controller.selectRoom(null); }}>{topData ? "トップへ" : "一覧へ"}</OutlawButton>
        <OutlawButton loadingLabel="" disabled={busy} aria-label="更新" onClick={() => controller.refreshRoom()}>更新</OutlawButton>
      </div>
      {snapshot.room.status === "loading" && <Spinner />}
      {snapshot.room.status === "idle" && <p>レイド情報は未取得です。</p>}
      {snapshot.room.status === "error" && <p role="alert">レイドを取得できませんでした。更新して再度お試しください。</p>}
      {room && <RaidRoomDetail room={room} briefing={snapshot.briefing} display={display} participants={displayParticipants}
        currentUserId={currentUserId} now={now} busy={busy}
        onParticipants={() => setDialog('participants')} onRewards={() => setDialog('rewards')} onEnemyInfo={() => setEnemyOpen(true)}
        rescue={renderRescue?.(room, busy || !!lifecycle?.blockJoin)}
        action={<>
          {snapshot.canRegister ? <>
          {snapshot.briefing.status === "loading" && <Spinner />}
          {snapshot.briefing.status === "error" && <p role="alert">参加条件を取得できませんでした。レイドを更新してください。</p>}

          {briefing?.membershipStatus === "joined" ? <>
            <p>参加済み</p>
            <p className="raid-room-muted">出撃時に編成を確認します。</p>
            {!briefing.battleStartEnabled || !onBriefingReady
              ? <p>現在は出撃できません。</p>
              : <OutlawButton loadingLabel="" fullWidth disabled={busy || !!lifecycle?.blockJoin} aria-label="出撃準備" onClick={async () => {
                setTransitioning(true); setTransitionError(null);
                try { await onBriefingReady(briefing); }
                catch { setTransitionError("出撃準備を開けませんでした。もう一度お試しください。"); }
                finally { setTransitioning(false); }
              }}>出撃準備</OutlawButton>}
          </> : <OutlawButton loadingLabel="" fullWidth variant="primary" aria-label="参加する" isLoading={snapshot.registering}
            disabled={busy || !briefing || briefing.joinEligibility.status !== "passed" || !!lifecycle?.blockJoin}
            onClick={() => { if (room && !getRaidRoomLifecyclePresentation(room, Date.now()).blockJoin) void controller.registerParticipation(); }}>参加する</OutlawButton>}
          {briefing?.membershipStatus === "not_joined" && briefing.joinEligibility.status !== "passed" && <p>参加条件を満たしているか確認してください。</p>}
        </> : <OutlawButton loadingLabel="" fullWidth variant="primary" disabled={busy || battleReference !== null || !lifecycle || lifecycle.blockJoin || !eligibility.canJoin} isLoading={snapshot.joining || transitioning} aria-label={joinLabel} onClick={join}>{joinLabel}</OutlawButton>}
        </>} />}
      {snapshot.registrationError && <p role="alert">{snapshot.registrationError.replaceAll('Room', 'レイド')}</p>}
      {snapshot.joinError && <p role="alert">参加できませんでした。レイドを更新して再度お試しください。</p>}
      {transitionError && <><p role="alert">{transitionError}</p>{battleReference && <OutlawButton loadingLabel="" disabled={busy} aria-label="バトル画面を開く" onClick={() => openBattle(battleReference)}>バトル画面を開く</OutlawButton>}</>}
    </>}
    </>}
    <RaidRoomDialogs kind={dialog} roomId={snapshot.selectedRoomId} currentUserId={currentUserId}
      ownerUserId={room?.owner.status === 'available' ? room.owner.value.userId : undefined}
      participants={displayParticipants} rewards={snapshot.rewards} onClose={() => setDialog(null)} onRefresh={() => void controller.refreshRoom()}
      onOpenProfile={onOpenProfile} profileOpen={profileOpen} resolveRewardName={resolveRewardName}
      renderRewards={renderRewards ? (id, close) => renderRewards(id, close, display.data ?? undefined) : undefined} />
    {enemyOpen && room && typeof document !== 'undefined' && createPortal(<div className="raid-room-dialogs">
      <CanonicalDialog title="敵情報" onClose={() => setEnemyOpen(false)} actions={[{ label: '閉じる', onClick: () => setEnemyOpen(false) }]}>
        {briefing?.raidVariantId ? <RaidEnemyRoster bossMasterId={briefing.raidVariantId} /> : <p>敵情報を取得できませんでした。戦況を更新してください。</p>}
      </CanonicalDialog>
    </div>, document.body)}
  </section>;
}

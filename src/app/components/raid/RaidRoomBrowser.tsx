"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { RAID_DIFFICULTIES, type RaidDifficultyId, type RaidObserved, type RaidPlayerSummary, type RaidRoomDto } from "../../../domain/raidRoom";
import { getRaidDifficultyLabel, getRaidEligibilityPresentation, getRaidParticipationRequirement, getRaidRecommendedPowerLabel } from "../../../domain/raidRoomPresentation";
import { getRaidRoomLifecyclePresentation } from "../../../domain/raidRoomLifecyclePresentation";
import type { RaidBattleReference, RaidRoomController } from "../../../domain/raidRoomClient";
import OutlawButton from "../ui/OutlawButton";
import OutlawCard from "../ui/OutlawCard";
import CanonicalDialog from "../ui/CanonicalDialog";
import "./RaidRoomBrowser.css";

export interface RaidRoomBrowserProps {
  controller: RaidRoomController;
  onBattleReady: (reference: RaidBattleReference) => void | Promise<void>;
  setInteractionBlocking: (blocking: boolean) => void;
  resolveRewardName?: (itemId: string) => string | null | undefined;
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

export default function RaidRoomBrowser({ controller, onBattleReady, setInteractionBlocking, resolveRewardName }: RaidRoomBrowserProps) {
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
  const [variantId, setVariantId] = useState("");
  const [dialog, setDialog] = useState<"participants" | "rewards" | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [battleReference, setBattleReference] = useState<RaidBattleReference | null>(null);
  const busy = snapshot.creating || snapshot.bossChoices.status === "loading" || snapshot.joining || transitioning || [snapshot.rooms, snapshot.room, snapshot.participants, snapshot.rewards].some((entry) => entry.status === "loading");
  useEffect(() => { void controller.loadRooms(); }, [controller]);
  useEffect(() => { setInteractionBlocking(busy); return () => setInteractionBlocking(false); }, [busy, setInteractionBlocking]);
  useEffect(() => { setDialog(null); setTransitionError(null); setBattleReference(null); }, [snapshot.selectedRoomId]);

  const room = snapshot.room.status === "success" ? snapshot.room.data : null;
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

  return <section className="raid-room-browser" aria-label="レイドRoom">
    <p className="raid-room-muted">開始から24時間、または撃破で終了します。</p>
    {!snapshot.selectedRoomId ? <>
      <div className="raid-room-tabs" role="tablist" aria-label="難易度">
        {RAID_DIFFICULTIES.map((entry) => <OutlawButton loadingLabel="" key={entry.id} aria-label={entry.label} role="tab" aria-selected={difficulty === entry.id} disabled={busy} variant={difficulty === entry.id ? "primary" : "secondary"} onClick={() => { if (difficulty !== entry.id) { setDifficulty(entry.id); controller.resetCreateRequest(); } }}>{entry.label}</OutlawButton>)}
      </div>
      <p className="raid-room-requirement">{getRaidParticipationRequirement(difficulty)}</p>
      <p className="raid-room-muted">{getRaidRecommendedPowerLabel(difficulty)}</p>
      <OutlawButton loadingLabel="" disabled={busy} aria-label="更新" onClick={() => controller.loadRooms()}>更新</OutlawButton>
      {snapshot.canCreate && <OutlawButton loadingLabel="" disabled={busy} aria-label="レイドを作成" onClick={async () => { setCreateOpen(true); await controller.loadBossChoices(); }}>レイドを作成</OutlawButton>}
      {createOpen && <OutlawCard>
        <p>作成の追加消費はありません。戦闘時のRP消費は別です。</p>
        {snapshot.bossChoices.status === "loading" && <Spinner />}
        {snapshot.bossChoices.status === "error" && <><p role="alert">ボス候補を取得できませんでした。</p><OutlawButton loadingLabel="" disabled={busy} aria-label="ボス候補を再取得" onClick={() => controller.loadBossChoices()}>再取得</OutlawButton></>}
        {snapshot.bossChoices.status === "success" && <label className="raid-room-boss-choice">ボス
          <select aria-label="ボス" disabled={busy} value={variantId} onChange={event => { setVariantId(event.target.value); controller.resetCreateRequest(); }}>
            <option value="">選択してください</option>
            {snapshot.bossChoices.data?.map(boss => <option key={boss.raidVariantId} value={boss.raidVariantId}>{boss.name}</option>)}
          </select>
        </label>}
        {snapshot.bossChoices.status === "success" && snapshot.bossChoices.data?.length === 0 && <p>作成できるボスはありません。</p>}
        <OutlawButton loadingLabel="" aria-label="作成する" isLoading={snapshot.creating} disabled={busy || !snapshot.bossChoices.data?.some(boss => boss.raidVariantId === variantId)} onClick={async () => {
          const created = await controller.createRoom(difficulty, variantId);
          if (created) setCreateOpen(false);
        }}>作成する</OutlawButton>
        <OutlawButton loadingLabel="" aria-label="作成を閉じる" disabled={busy} onClick={() => setCreateOpen(false)}>閉じる</OutlawButton>
        {snapshot.createError && <p role="alert">{snapshot.createError}</p>}
      </OutlawCard>}
      {(snapshot.rooms.status === "loading") && <Spinner />}
      {snapshot.rooms.status === "idle" && <p>Room情報は未取得です。</p>}
      {snapshot.rooms.status === "error" && <p role="alert">Room一覧を取得できませんでした。更新して再度お試しください。</p>}
      {snapshot.rooms.status === "success" && <div className="raid-room-list">
        {snapshot.rooms.data?.filter((entry) => entry.difficultyId === difficulty).map((entry) => <OutlawCard key={entry.roomId}>
          <RoomSummary room={entry} now={now} />
          <OutlawButton loadingLabel="" fullWidth disabled={busy} aria-label="Roomを開く" onClick={() => controller.selectRoom(entry.roomId)}>Roomを開く</OutlawButton>
        </OutlawCard>)}
        {!snapshot.rooms.data?.some((entry) => entry.difficultyId === difficulty) && <p>この難易度のRoomはありません。</p>}
      </div>}
    </> : <>
      <div className="raid-room-row">
        <OutlawButton loadingLabel="" disabled={snapshot.joining || transitioning} aria-label="一覧へ" onClick={async () => { await controller.selectRoom(null); await controller.loadRooms(); }}>一覧へ</OutlawButton>
        <OutlawButton loadingLabel="" disabled={busy} aria-label="更新" onClick={() => controller.refreshRoom()}>更新</OutlawButton>
      </div>
      {snapshot.room.status === "loading" && <Spinner />}
      {snapshot.room.status === "idle" && <p>Room情報は未取得です。</p>}
      {snapshot.room.status === "error" && <p role="alert">Roomを取得できませんでした。更新して再度お試しください。</p>}
      {room && <OutlawCard>
        <RoomSummary room={room} now={now} />
        <p className="raid-room-requirement">{getRaidParticipationRequirement(room.difficultyId)}</p>
        <p className="raid-room-muted">{getRaidRecommendedPowerLabel(room.difficultyId)}</p>
        <div className="raid-room-row">
          <OutlawButton loadingLabel="" aria-label="参加者一覧" onClick={() => setDialog("participants")}>参加者一覧</OutlawButton>
          <OutlawButton loadingLabel="" aria-label="報酬" onClick={() => setDialog("rewards")}>報酬</OutlawButton>
        </div>
        <OutlawButton loadingLabel="" fullWidth variant="primary" disabled={busy || battleReference !== null || !lifecycle || lifecycle.blockJoin || !eligibility.canJoin} isLoading={snapshot.joining || transitioning} aria-label={joinLabel} onClick={join}>{joinLabel}</OutlawButton>
      </OutlawCard>}
      {snapshot.joinError && <p role="alert">参加できませんでした。Roomを更新して再度お試しください。</p>}
      {transitionError && <><p role="alert">{transitionError}</p>{battleReference && <OutlawButton loadingLabel="" disabled={busy} aria-label="バトル画面を開く" onClick={() => openBattle(battleReference)}>バトル画面を開く</OutlawButton>}</>}
    </>}
    {dialog && snapshot.selectedRoomId && <CanonicalDialog title={dialog === "participants" ? "参加者一覧" : "報酬"} onClose={() => setDialog(null)} actions={[{ label: "閉じる", onClick: () => setDialog(null) }]}>
      {dialog === "participants" ? <>
        {snapshot.participants.status === "loading" && <Spinner />}
        {snapshot.participants.status === "idle" && <p>参加者情報は未取得です。</p>}
        {snapshot.participants.status === "error" && <p role="alert">参加者を取得できませんでした。Roomを更新してください。</p>}
        {snapshot.participants.status === "success" && <ul className="raid-room-entries">
          {snapshot.participants.data?.map((entry) => <li key={entry.player.userId}>
            <Player player={entry.player} />
            <div className="raid-room-muted">現在の所属ギルド：{entry.currentGuild.status === "unknown" ? "未確認" : entry.currentGuild.value?.name ?? "未所属"}</div>
            <div>{count(entry.finalizedBattles)}戦 / 貢献ダメージ {count(entry.appliedDamage)}</div>
          </li>)}
          {snapshot.participants.data?.length === 0 && <li>参加者はいません。</li>}
        </ul>}
      </> : <>
        {snapshot.rewards.status === "loading" && <Spinner />}
        {snapshot.rewards.status === "idle" && <p>報酬情報は未取得です。</p>}
        {snapshot.rewards.status === "error" && <p role="alert">報酬を取得できませんでした。Roomを更新してください。</p>}
        {snapshot.rewards.status === "success" && <ul className="raid-room-entries">
          {snapshot.rewards.data?.map((entry, index) => <li key={`${entry.itemId}-${index}`}>
            <strong>{resolveRewardName?.(entry.itemId) ?? "報酬情報を確認できません"} × {entry.quantity.toLocaleString("ja-JP")}</strong>
            <div className="raid-room-muted">{entry.deliveryState.status === "unknown" ? "配布状況未確認" : entry.deliveryState.value === "delivered" ? "配布済み" : "配布待ち"}</div>
          </li>)}
          {snapshot.rewards.data?.length === 0 && <li>表示できる報酬はありません。</li>}
        </ul>}
      </>}
    </CanonicalDialog>}
  </section>;
}

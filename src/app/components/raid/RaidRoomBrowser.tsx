"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { RAID_DIFFICULTIES, type RaidDifficultyId, type RaidObserved, type RaidPlayerSummary, type RaidRoomDto } from "../../../domain/raidRoom";
import { getRaidDifficultyLabel, getRaidEligibilityPresentation, getRaidParticipationRequirement, getRaidRecommendedPowerLabel } from "../../../domain/raidRoomPresentation";
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
const stateLabel = (room: RaidRoomDto) => room.state.status === "unknown" ? "状態未確認" : ({ active: "開催中", cleared: "討伐済み", expired: "終了" }[room.state.value]);

function Player({ player }: { player: RaidPlayerSummary }) {
  return <span className="raid-room-player">
    {player.leaderIconUrl.status === "available" && player.leaderIconUrl.value
      ? <img src={player.leaderIconUrl.value} alt="" width={32} height={32} />
      : <span className="raid-room-avatar-placeholder" aria-hidden="true" />}
    <span>{player.name}</span>
  </span>;
}

function RoomSummary({ room }: { room: RaidRoomDto }) {
  const hp = room.hp.status === "available" ? room.hp.value : null;
  return <>
    <div className="raid-room-row"><strong>{getRaidDifficultyLabel(room.difficultyId)}</strong><span>{stateLabel(room)}</span></div>
    <div className="raid-room-owner">主催者 {room.owner.status === "available" ? <Player player={room.owner.value} /> : "未確認"}</div>
    <div>参加者 {count(room.participantCount)} / 20人</div>
    <div>レイドHP {hp ? `${hp.current.toLocaleString("ja-JP")} / ${hp.max.toLocaleString("ja-JP")}` : "未確認"}</div>
    {hp && hp.max > 0 && <progress className="raid-room-hp" aria-label="レイドHP" value={Math.max(0, hp.current)} max={hp.max} />}
    <div className="raid-room-muted">終了 {room.expiresAt.status === "available" && Number.isFinite(Date.parse(room.expiresAt.value))
      ? new Date(room.expiresAt.value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " JST" : "未確認"}</div>
  </>;
}

function Spinner() { return <div className="raid-room-wait" role="status" aria-label="通信中"><span className="spinner" aria-hidden="true" /></div>; }

export default function RaidRoomBrowser({ controller, onBattleReady, setInteractionBlocking, resolveRewardName }: RaidRoomBrowserProps) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [difficulty, setDifficulty] = useState<RaidDifficultyId>("beginner");
  const [dialog, setDialog] = useState<"participants" | "rewards" | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [battleReference, setBattleReference] = useState<RaidBattleReference | null>(null);
  const busy = snapshot.joining || transitioning || [snapshot.rooms, snapshot.room, snapshot.participants, snapshot.rewards].some((entry) => entry.status === "loading");
  useEffect(() => { void controller.loadRooms(); }, [controller]);
  useEffect(() => { setInteractionBlocking(busy); return () => setInteractionBlocking(false); }, [busy, setInteractionBlocking]);
  useEffect(() => { setDialog(null); setTransitionError(null); setBattleReference(null); }, [snapshot.selectedRoomId]);

  const room = snapshot.room.status === "success" ? snapshot.room.data : null;
  const eligibility = getRaidEligibilityPresentation(room?.serverEligibility);
  const active = room?.state.status === "available" && room.state.value === "active";
  const openBattle = async (reference: RaidBattleReference) => {
    setTransitionError(null);
    setTransitioning(true);
    try { await onBattleReady(reference); setBattleReference(null); }
    catch { setTransitionError("バトル画面を開けませんでした。時間をおいて再度お試しください。"); }
    finally { setTransitioning(false); }
  };
  const join = async () => {
    setTransitionError(null);
    const reference = await controller.join();
    if (!reference) return;
    setBattleReference(reference);
    await openBattle(reference);
  };

  return <section className="raid-room-browser" aria-label="レイドRoom">
    {!snapshot.selectedRoomId ? <>
      <div className="raid-room-tabs" role="tablist" aria-label="難易度">
        {RAID_DIFFICULTIES.map((entry) => <OutlawButton key={entry.id} role="tab" aria-selected={difficulty === entry.id} disabled={busy} variant={difficulty === entry.id ? "primary" : "secondary"} onClick={() => setDifficulty(entry.id)}>{entry.label}</OutlawButton>)}
      </div>
      <p className="raid-room-requirement">{getRaidParticipationRequirement(difficulty)}</p>
      <p className="raid-room-muted">{getRaidRecommendedPowerLabel(difficulty)}</p>
      <OutlawButton disabled={busy} onClick={() => controller.loadRooms()}>更新</OutlawButton>
      {(snapshot.rooms.status === "loading") && <Spinner />}
      {snapshot.rooms.status === "idle" && <p>Room情報は未取得です。</p>}
      {snapshot.rooms.status === "error" && <p role="alert">Room一覧を取得できませんでした。更新して再度お試しください。</p>}
      {snapshot.rooms.status === "success" && <div className="raid-room-list">
        {snapshot.rooms.data?.filter((entry) => entry.difficultyId === difficulty).map((entry) => <OutlawCard key={entry.roomId}>
          <RoomSummary room={entry} />
          <OutlawButton fullWidth disabled={busy} onClick={() => controller.selectRoom(entry.roomId)}>Roomを開く</OutlawButton>
        </OutlawCard>)}
        {!snapshot.rooms.data?.some((entry) => entry.difficultyId === difficulty) && <p>この難易度のRoomはありません。</p>}
      </div>}
    </> : <>
      <div className="raid-room-row">
        <OutlawButton disabled={snapshot.joining || transitioning} onClick={() => controller.selectRoom(null)}>一覧へ</OutlawButton>
        <OutlawButton disabled={busy} onClick={() => controller.refreshRoom()}>更新</OutlawButton>
      </div>
      {snapshot.room.status === "loading" && <Spinner />}
      {snapshot.room.status === "idle" && <p>Room情報は未取得です。</p>}
      {snapshot.room.status === "error" && <p role="alert">Roomを取得できませんでした。更新して再度お試しください。</p>}
      {room && <OutlawCard>
        <RoomSummary room={room} />
        <p className="raid-room-requirement">{getRaidParticipationRequirement(room.difficultyId)}</p>
        <p className="raid-room-muted">{getRaidRecommendedPowerLabel(room.difficultyId)}</p>
        <div className="raid-room-row">
          <OutlawButton onClick={() => setDialog("participants")}>参加者一覧</OutlawButton>
          <OutlawButton onClick={() => setDialog("rewards")}>報酬</OutlawButton>
        </div>
        <OutlawButton fullWidth variant="primary" disabled={busy || battleReference !== null || !active || !eligibility.canJoin} isLoading={snapshot.joining || transitioning} onClick={join}>{!active ? (room.state.status === "unknown" ? "Roomの状態を確認できません" : "このRoomは終了しました") : eligibility.label}</OutlawButton>
      </OutlawCard>}
      {snapshot.joinError && <p role="alert">参加できませんでした。Roomを更新して再度お試しください。</p>}
      {transitionError && <><p role="alert">{transitionError}</p>{battleReference && <OutlawButton disabled={busy} onClick={() => openBattle(battleReference)}>バトル画面を開く</OutlawButton>}</>}
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

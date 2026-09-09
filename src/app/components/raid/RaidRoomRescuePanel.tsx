"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RaidRoomRescueClient, RaidRoomRescueStatus } from '../../../domain/raidRoomRescue';
import { clearRaidRoomRescuePending, readRaidRoomRescuePending, saveRaidRoomRescuePending } from '../../../domain/raidRoomRescuePending';
import OutlawButton from '../ui/OutlawButton';

type Props = { client: RaidRoomRescueClient; roomId: string; userId?: string; disabled?: boolean; setInteractionBlocking: (value: boolean) => void };
export default function RaidRoomRescuePanel(props: Props) {
  return <RescuePanel key={JSON.stringify([props.userId, props.roomId])} {...props} />;
}
function RescuePanel({ client, roomId, userId, disabled = false, setInteractionBlocking }: Props) {
  const [status, setStatus] = useState<RaidRoomRescueStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [sent, setSent] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const running = useRef(false);
  const ownsBlock = useRef(false);
  const alive = useRef(true);
  const blocking = useRef(setInteractionBlocking);
  useLayoutEffect(() => { blocking.current = setInteractionBlocking; }, [setInteractionBlocking]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const restore = () => {
    const saved = userId ? readRaidRoomRescuePending(userId, roomId) : null;
    pending.current = saved?.requestId ?? pending.current;
    if (alive.current) setPendingId(pending.current);
    return pending.current;
  };
  const refresh = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(false);
    try {
      restore();
      const result = await client.getStatus(roomId);
      if (alive.current) setStatus(result);
    } catch { if (alive.current) setError(true); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => { void refresh(); }, [client, roomId]);
  const request = async () => {
    if (running.current || !userId) return;
    running.current = true; setBusy(true); setError(false); setSent(false); ownsBlock.current = true; setInteractionBlocking(true);
    try {
      const existing = restore();
      if (!existing && (disabled || !status?.isOwner || !status.requestEnabled)) return;
      const requestId = existing ?? crypto.randomUUID();
      // 保存と読戻しの成功前には送信しない。失敗時も同じ識別子を保持する。
      pending.current = requestId; setPendingId(requestId);
      saveRaidRoomRescuePending(userId, roomId, requestId);
      const receipt = await client.request(roomId, requestId);
      if (!alive.current) return;
      clearRaidRoomRescuePending(userId, roomId, requestId);
      pending.current = null; setPendingId(null);
      setSent(true); setStatus(previous => previous ? { ...previous, ...receipt } : previous);
      const latest = await client.getStatus(roomId);
      if (alive.current) setStatus(latest);
    } catch { if (alive.current) setError(true); }
    finally {
      running.current = false;
      if (ownsBlock.current) { ownsBlock.current = false; blocking.current(false); }
      if (alive.current) setBusy(false);
    }
  };
  // Account/Room切替で旧要求が残っても新画面をblockし続けない。
  useEffect(() => () => {
    if (ownsBlock.current) { ownsBlock.current = false; blocking.current(false); }
  }, []);
  return <div aria-label="救援">
    {busy && <span className="spinner" role="status" aria-label="通信中" />}
    {status?.isOwner && <>
      <p>救援依頼：全体 {status.activityCount} / 3 ・ ギルド {status.guildCount} / 3</p>
      <p className="raid-room-muted">全体アクティビティと所属ギルドへ送信します。未所属の場合は全体のみです。</p>
      {!pendingId && <OutlawButton loadingLabel="" disabled={busy || disabled || !userId || !status.requestEnabled} aria-label="救援を依頼" onClick={request}>救援を依頼</OutlawButton>}
    </>}
    {pendingId && <>
      <p>送信結果が未確認の救援依頼があります。</p>
      <OutlawButton loadingLabel="" disabled={busy || !userId} aria-label="救援依頼の送信結果を確認" onClick={request}>救援依頼の送信結果を確認</OutlawButton>
    </>}
    {status?.viaRescue && <p>救援参加：{status.finalizedBattles.toLocaleString('ja-JP')}戦 ・ 貢献ダメージ {status.contributionDamage.toLocaleString('ja-JP')}</p>}
    {sent && <p role="status">救援依頼を送信しました。</p>}
    {error && <p role="alert">救援情報または保存情報を確認できませんでした。再度お試しください。</p>}
    <OutlawButton loadingLabel="" disabled={busy} aria-label="救援情報を更新" onClick={refresh}>救援情報を更新</OutlawButton>
  </div>;
}

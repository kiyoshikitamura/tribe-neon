"use client";
import React, { useEffect, useRef, useState } from 'react';
import type { RaidRoomRescueClient, RaidRoomRescueStatus } from '../../../domain/raidRoomRescue';
import OutlawButton from '../ui/OutlawButton';

export default function RaidRoomRescuePanel({ client, roomId, disabled = false, setInteractionBlocking }: {
  client: RaidRoomRescueClient; roomId: string; disabled?: boolean; setInteractionBlocking: (value: boolean) => void;
}) {
  const [status, setStatus] = useState<RaidRoomRescueStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [sent, setSent] = useState(false);
  const pending = useRef<string | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const refresh = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(false);
    try { const result = await client.getStatus(roomId); if (alive.current) setStatus(result); }
    catch { if (alive.current) setError(true); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => { void refresh(); }, [client, roomId]);
  const request = async () => {
    if (running.current || disabled || !status?.requestEnabled) return;
    running.current = true; setBusy(true); setError(false); setSent(false); setInteractionBlocking(true);
    try {
      pending.current ??= crypto.randomUUID();
      const receipt = await client.request(roomId, pending.current);
      pending.current = null;
      if (alive.current) { setSent(true); setStatus(previous => previous ? { ...previous, ...receipt } : previous); }
      const latest = await client.getStatus(roomId);
      if (alive.current) setStatus(latest);
    } catch { if (alive.current) setError(true); }
    finally { running.current = false; setInteractionBlocking(false); if (alive.current) setBusy(false); }
  };
  return <div aria-label="救援">
    {busy && <span className="spinner" role="status" aria-label="通信中" />}
    {status?.isOwner && <>
      <p>救援依頼：全体 {status.activityCount} / 3 ・ ギルド {status.guildCount} / 3</p>
      <p className="raid-room-muted">全体アクティビティと所属ギルドへ送信します。未所属の場合は全体のみです。</p>
      <OutlawButton loadingLabel="" disabled={busy || disabled || !status.requestEnabled} aria-label="救援を依頼" onClick={request}>救援を依頼</OutlawButton>
    </>}
    {status?.viaRescue && <p>救援参加：{status.finalizedBattles.toLocaleString('ja-JP')}戦 ・ 貢献ダメージ {status.contributionDamage.toLocaleString('ja-JP')}</p>}
    {sent && <p role="status">救援依頼を送信しました。</p>}
    {error && <p role="alert">救援情報を確認できませんでした。再度お試しください。</p>}
    <OutlawButton loadingLabel="" disabled={busy} aria-label="救援情報を更新" onClick={refresh}>救援情報を更新</OutlawButton>
  </div>;
}

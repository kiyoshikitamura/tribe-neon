"use client";
import React, { useEffect, useRef, useState } from 'react';
import type { RaidRoomRescueReward, RaidRoomRescueRewardClient } from '../../../domain/raidRoomRescueReward';
import type { RaidRewardPlan } from '../../../domain/raidRoomDisplay';
import { RaidRewardPlanItems, RaidIssuedRewardItems } from './RaidRewardItems';
import OutlawButton from '../ui/OutlawButton';

const labels: Record<RaidRoomRescueReward['status'], string> = {
  not_eligible: '救援報酬の条件をまだ満たしていません。',
  unconfigured: '救援報酬は準備中です。',
  pending: '救援成功。報酬の送付待ちです。',
  issued: '救援報酬をプレゼントBOXへ送りました。',
};

export default function RaidRoomRescueRewardPanel({ client, roomId, onOpenPresents, plan }: {
  client: RaidRoomRescueRewardClient; roomId: string; onOpenPresents?: () => void | Promise<void>; plan?: RaidRewardPlan;
}) {
  const [reward, setReward] = useState<RaidRoomRescueReward | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(false);
  const openingRef = useRef(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setBusy(true); setError(false); setReward(null);
    void client.getReward(roomId).then(value => { if (current) setReward(value); })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [client, roomId, revision]);
  const openPresents = async () => {
    if (!onOpenPresents || openingRef.current) return;
    openingRef.current = true; setOpening(true); setOpenError(false);
    try { await onOpenPresents(); }
    catch { setOpenError(true); }
    finally { openingRef.current = false; setOpening(false); }
  };
  return <div aria-label="救援報酬">
    <RaidRewardPlanItems plan={plan} />
    {(busy || opening) && <span className="spinner" role="status" aria-label="通信中" />}
    {openError && <p role="alert">プレゼントBOXを取得できませんでした。もう一度お試しください。</p>}
    {error && <p role="alert">救援報酬を取得できませんでした。再度お試しください。</p>}
    {reward && <>
      <p role="status">{labels[reward.status]}</p>
      {reward.rescueGate.minimumBattles !== null && reward.rescueGate.minimumContributionDamage !== null && <p>救援で参加し、{reward.rescueGate.minimumBattles.toLocaleString('ja-JP')}戦・貢献ダメージ{reward.rescueGate.minimumContributionDamage.toLocaleString('ja-JP')}以上とボス撃破で成功です。</p>}
      <p className="raid-room-muted">成功報酬は1人につきレイドごとに1回。送付から30日以内にプレゼントBOXで受け取れます。</p>
      <RaidIssuedRewardItems items={reward.items} />
      {reward.status === 'issued' && onOpenPresents && <OutlawButton loadingLabel="" disabled={opening} onClick={openPresents}>プレゼントBOXへ</OutlawButton>}
    </>}
    <OutlawButton loadingLabel="" disabled={busy || opening} onClick={() => setRevision(value => value + 1)}>報酬情報を更新</OutlawButton>
  </div>;
}

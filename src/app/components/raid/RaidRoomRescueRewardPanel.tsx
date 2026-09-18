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
  issued: '救援報酬を獲得しました。',
};

export default function RaidRoomRescueRewardPanel({ client, roomId, onOpenPresents, onDirectReward, plan }: {
  client: RaidRoomRescueRewardClient; roomId: string; onOpenPresents?: () => void | Promise<void>; onDirectReward?: () => Promise<void>; plan?: RaidRewardPlan;
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
    void client.getReward(roomId).then(async value => {
      if (!current) return;
      setReward(value);
      if (value.items.some(item => item.delivery === 'DIRECT')) await onDirectReward?.();
    })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [client, roomId, revision, onDirectReward]);
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
      <p role="status">{reward.status === 'issued' && reward.items.some(item => item.delivery !== 'DIRECT') ? '以前の報酬はプレゼントBOXで確認できます。' : labels[reward.status]}</p>
      {reward.progress && reward.rescueGate.minimumBattles !== null && reward.rescueGate.minimumContributionDamage !== null && <div className="raid-reward-progress" aria-label="救援成功条件">
        <p><strong>{reward.progress.viaRescue ? '✓' : '—'} 救援参加</strong><span>{reward.progress.viaRescue ? '参加済み' : '救援参加が必要'}</span></p>
        <p><strong>{reward.progress.finalizedBattles >= reward.rescueGate.minimumBattles ? '✓' : '—'} 参戦回数</strong><span>{reward.progress.finalizedBattles.toLocaleString('ja-JP')} / {reward.rescueGate.minimumBattles.toLocaleString('ja-JP')}戦</span></p>
        <p><strong>{reward.progress.contributionDamage >= reward.rescueGate.minimumContributionDamage ? '✓' : '—'} 貢献ダメージ</strong><span>{reward.progress.contributionDamage.toLocaleString('ja-JP')} / {reward.rescueGate.minimumContributionDamage.toLocaleString('ja-JP')}</span></p>
        <p><strong>{reward.rescueGate.status === 'succeeded' || reward.status === 'issued' ? '✓' : '—'} ボス撃破</strong><span>{reward.rescueGate.status === 'succeeded' || reward.status === 'issued' ? '達成' : '撃破待ち'}</span></p>
        <p><strong>報酬付与</strong><span>{reward.status === 'issued' ? '獲得済み' : reward.status === 'pending' ? '付与待ち' : '未獲得'}</span></p>
      </div>}
      <p className="raid-room-muted">救援成功報酬は1人につきレイドごとに1回です。</p>
      <RaidIssuedRewardItems items={reward.items} />
      {reward.status === 'issued' && reward.items.some(item => item.delivery !== 'DIRECT') && onOpenPresents && <OutlawButton loadingLabel="" disabled={opening} onClick={openPresents}>プレゼントBOXへ</OutlawButton>}
    </>}
    <OutlawButton loadingLabel="" disabled={busy || opening} onClick={() => setRevision(value => value + 1)}>報酬情報を更新</OutlawButton>
  </div>;
}

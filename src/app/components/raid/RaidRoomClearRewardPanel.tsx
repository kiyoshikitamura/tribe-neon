"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RaidRoomClearReward, RaidRoomClearRewardClient } from '../../../domain/raidRoomClearReward';
import type { RaidRewardPlan } from '../../../domain/raidRoomDisplay';
import { RaidRewardPlanItems, RaidIssuedRewardItems } from './RaidRewardItems';
import OutlawButton from '../ui/OutlawButton';

export default function RaidRoomClearRewardPanel({ client, roomId, userId, onOpenPresents, onDirectReward, plan }: {
  client: RaidRoomClearRewardClient; roomId: string; userId?: string; onOpenPresents?: () => void | Promise<void>; onDirectReward?: () => Promise<void>; plan?: RaidRewardPlan;
}) {
  const [reward, setReward] = useState<RaidRoomClearReward | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState(false);
  const openingRef = useRef(false);
  const identity = `${userId ?? ""}:${roomId}`;
  const identityRef = useRef(identity);
  useLayoutEffect(() => { identityRef.current = identity; }, [identity]);
  const [rewardIdentity, setRewardIdentity] = useState(identity);
  useEffect(() => {
    let current = true;
    setBusy(true); setError(false); setReward(null); setRewardIdentity(identity); setOpenError(false); setOpening(false); openingRef.current = false;
    void client.getReward(roomId).then(async value => {
      if (!current) return;
      setReward(value);
      if (value.items.some(item => item.delivery === 'DIRECT') || value.dailyBonus?.items.length) await onDirectReward?.();
    })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [client, roomId, userId, onDirectReward]);
  const openPresents = async () => {
    if (!onOpenPresents || openingRef.current) return;
    const openedIdentity = identity;
    openingRef.current = true; setOpening(true); setOpenError(false);
    try { await onOpenPresents(); }
    catch { if (identityRef.current === openedIdentity) setOpenError(true); }
    finally { if (identityRef.current === openedIdentity) { openingRef.current = false; setOpening(false); } }
  };
  return <div aria-label="討伐報酬">
    <RaidRewardPlanItems plan={plan} />
    {(busy || opening) && <span className="spinner" role="status" aria-label="通信中" />}
    {openError && <p role="alert">プレゼントBOXを取得できませんでした。もう一度お試しください。</p>}
    {error && <p role="alert">討伐報酬を取得できませんでした。再度お試しください。</p>}
    {reward && rewardIdentity === identity && <>
      <div className="raid-reward-progress" aria-label="討伐報酬条件">
        {reward.clearGate.minimumContributionDamage !== null && <p><strong>{reward.clearGate.contributionDamage >= reward.clearGate.minimumContributionDamage ? '✓' : '—'} 貢献ダメージ</strong><span>{reward.clearGate.contributionDamage.toLocaleString('ja-JP')} / {reward.clearGate.minimumContributionDamage.toLocaleString('ja-JP')}</span></p>}
        <p><strong>{reward.clearGate.cleared ? '✓' : '—'} ボス撃破</strong><span>{reward.clearGate.cleared ? '達成' : '撃破待ち'}</span></p>
        <p><strong>報酬付与</strong><span>{reward.status === 'issued' ? '獲得済み' : reward.status === 'pending' ? '付与待ち' : '未獲得'}</span></p>
      </div>
      <RaidIssuedRewardItems items={reward.items} />
      {reward.dailyBonus && <section aria-label="1日1回撃破ボーナス">
        <h4>1日1回撃破ボーナス</h4>
        {reward.dailyBonus.won ? <><p>獲得しました。</p><RaidIssuedRewardItems items={reward.dailyBonus.items.map(item => ({ ...item, delivery: 'DIRECT' as const, presentId: null, presentStatus: null, claimedAt: reward.dailyBonus!.issuedAt, expiresAt: null }))} /></> : <p>本日の抽選は終了しました。チケットの当選はありませんでした。</p>}
      </section>}
      {reward.status === 'issued' && reward.items.some(item => item.delivery !== 'DIRECT') && onOpenPresents && <OutlawButton loadingLabel="" disabled={opening} onClick={openPresents}>プレゼントBOXへ</OutlawButton>}
    </>}
  </div>;
}

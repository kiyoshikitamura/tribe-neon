"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RaidRoomClearReward, RaidRoomClearRewardClient } from '../../../domain/raidRoomClearReward';
import type { RaidRewardPlan } from '../../../domain/raidRoomDisplay';
import { RaidRewardPlanItems, RaidIssuedRewardItems } from './RaidRewardItems';
import OutlawButton from '../ui/OutlawButton';

const labels: Record<RaidRoomClearReward['status'], string> = {
  not_eligible: '討伐報酬の条件をまだ満たしていません。',
  unconfigured: '討伐報酬は準備中です。',
  pending: '討伐報酬の送付待ちです。',
  issued: '討伐報酬をプレゼントBOXへ送りました。',
};

export default function RaidRoomClearRewardPanel({ client, roomId, userId, onOpenPresents, plan }: {
  client: RaidRoomClearRewardClient; roomId: string; userId?: string; onOpenPresents?: () => void | Promise<void>; plan?: RaidRewardPlan;
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
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setBusy(true); setError(false); setReward(null); setRewardIdentity(identity); setOpenError(false); setOpening(false); openingRef.current = false;
    void client.getReward(roomId).then(value => { if (current) setReward(value); })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [client, roomId, userId, revision]);
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
      <p role="status">{labels[reward.status]}</p>
      {reward.clearGate.minimumContributionDamage !== null && <p>開催中の累積貢献ダメージが{reward.clearGate.minimumContributionDamage.toLocaleString('ja-JP')}を超え、ボスを撃破すると対象です。</p>}
      <p>対象の貢献ダメージ：{reward.clearGate.contributionDamage.toLocaleString('ja-JP')}</p>
      <p className="raid-room-muted">レイド終了後に確定した戦闘は討伐報酬の貢献に含みません。</p>
      <p className="raid-room-muted">討伐報酬は1人につきレイドごとに1回。送付から30日以内にプレゼントBOXで受け取れます。</p>
      <RaidIssuedRewardItems items={reward.items} />
      {reward.status === 'issued' && onOpenPresents && <OutlawButton loadingLabel="" disabled={opening} onClick={openPresents}>プレゼントBOXへ</OutlawButton>}
    </>}
    <OutlawButton loadingLabel="" disabled={busy || opening} onClick={() => setRevision(value => value + 1)}>報酬情報を更新</OutlawButton>
  </div>;
}

"use client";
import React, { useEffect, useRef, useState } from 'react';
import type { RaidRoomRescueReward, RaidRoomRescueRewardClient } from '../../../domain/raidRoomRescueReward';
import { ITEMS_MASTER_DATA } from '../../../utils/items_master_data';
import OutlawButton from '../ui/OutlawButton';

const labels: Record<RaidRoomRescueReward['status'], string> = {
  not_eligible: '救援報酬の条件をまだ満たしていません。',
  unconfigured: '救援報酬は準備中です。',
  pending: '救援成功。報酬の送付待ちです。',
  issued: '救援報酬をプレゼントBOXへ送りました。',
};
const formatDate = (value: string) => new Date(value).toLocaleString('ja-JP');
export default function RaidRoomRescueRewardPanel({ client, roomId, onOpenPresents }: {
  client: RaidRoomRescueRewardClient; roomId: string; onOpenPresents?: () => void | Promise<void>;
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
    {(busy || opening) && <span className="spinner" role="status" aria-label="通信中" />}
    {openError && <p role="alert">プレゼントBOXを取得できませんでした。もう一度お試しください。</p>}
    {error && <p role="alert">救援報酬を取得できませんでした。再度お試しください。</p>}
    {reward && <>
      <p role="status">{labels[reward.status]}</p>
      {reward.rescueGate.minimumBattles !== null && reward.rescueGate.minimumContributionDamage !== null && <p>救援で参加し、{reward.rescueGate.minimumBattles.toLocaleString('ja-JP')}戦・貢献ダメージ{reward.rescueGate.minimumContributionDamage.toLocaleString('ja-JP')}以上とボス撃破で成功です。</p>}
      <p className="raid-room-muted">成功報酬は1人につきRoomごとに1回。送付から30日以内にプレゼントBOXで受け取れます。</p>
      {reward.items.length > 0 && <ul className="raid-room-entries">{reward.items.map(item => <li key={item.presentId}>
        <strong>{item.itemId === 'CASH' ? 'キャッシュ' : item.itemId === 'DIAMOND' ? 'ダイヤ' : ITEMS_MASTER_DATA.find(master => master.id === item.itemId)?.name ?? '報酬'} × {item.quantity.toLocaleString('ja-JP')}</strong>
        <div>{item.presentStatus === 'CLAIMED' ? '受取済み' : item.presentStatus === 'UNCLAIMED' ? (item.expiresAt && Date.parse(item.expiresAt) <= Date.now() ? '期限切れ' : '未受取') : item.presentStatus === 'EXPIRED' ? '期限切れ' : '受取状況を確認できません'}</div>
        {item.expiresAt && <div className="raid-room-muted">受取期限：{formatDate(item.expiresAt)}</div>}
      </li>)}</ul>}
      {reward.status === 'issued' && onOpenPresents && <OutlawButton loadingLabel="" disabled={opening} onClick={openPresents}>プレゼントBOXへ</OutlawButton>}
    </>}
    <OutlawButton loadingLabel="" disabled={busy || opening} onClick={() => setRevision(value => value + 1)}>報酬情報を更新</OutlawButton>
  </div>;
}

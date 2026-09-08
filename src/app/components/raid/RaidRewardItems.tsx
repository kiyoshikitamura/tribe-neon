'use client';
import React, { useEffect, useState } from 'react';
import type { RaidRewardPlan } from '../../../domain/raidRoomDisplay';
import type { RaidRoomClearReward } from '../../../domain/raidRoomClearReward';
import { ITEMS_MASTER_DATA } from '../../../utils/items_master_data';
import CanonicalItemIcon from '../ui/CanonicalItemIcon';
import './RaidRewardItems.css';

function Item({ itemId, quantity }: { itemId: string; quantity: number }) {
  const name = itemId === 'CASH' ? 'キャッシュ' : itemId === 'DIAMOND' ? 'ダイヤ' : ITEMS_MASTER_DATA.find(item => item.id === itemId)?.name ?? '報酬';
  return <div className="raid-reward-items__item">{itemId === 'CASH' || itemId === 'DIAMOND'
    ? <img className="raid-reward-items__icon" src={itemId === 'CASH' ? '/ui/icon_cash.png' : '/ui/icon_dia.png'} alt="" />
    : <CanonicalItemIcon className="raid-reward-items__icon" itemId={itemId} alt="" fallback={null} />}
    <strong>{name} × {quantity.toLocaleString('ja-JP')}</strong></div>;
}
export function RaidRewardPlanItems({ plan }: { plan?: RaidRewardPlan }) {
  return <section className="raid-reward-items" aria-label="報酬の予定内容"><h4>条件達成時の報酬</h4>
    {!plan ? <p>予定内容は未取得です。</p> : plan.status === 'unconfigured' ? <p>報酬内容は準備中です。</p> : <>
      <p className="raid-reward-items__note">条件達成後、プレゼントBOXへ送られます。</p>
      <ul>{plan.items.map((item, index) => <li key={`${item.itemId}:${index}`}><Item {...item} /></li>)}</ul>
    </>}
  </section>;
}
export function RaidIssuedRewardItems({ items }: { items: RaidRoomClearReward['items'] }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  if (!items.length) return null;
  return <section className="raid-reward-items" aria-label="発行済みの報酬"><h4>プレゼントBOXへ送付済み</h4><ul>{items.map(item => <li key={item.presentId}>
    <Item {...item} />
    <p>{item.presentStatus === 'CLAIMED' ? '受取済み' : item.presentStatus === 'UNCLAIMED' ? (item.expiresAt && Date.parse(item.expiresAt) <= now ? '期限切れ' : '未受取') : item.presentStatus === 'EXPIRED' ? '期限切れ' : '受取状況を確認できません'}</p>
    {item.expiresAt && <p className="raid-reward-items__note">受取期限：{new Date(item.expiresAt).toLocaleString('ja-JP')}</p>}
  </li>)}</ul></section>;
}

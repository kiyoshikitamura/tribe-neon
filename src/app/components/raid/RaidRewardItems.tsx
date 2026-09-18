'use client';
import React, { useEffect, useState } from 'react';
import type { RaidRewardPlan } from '../../../domain/raidRoomDisplay';
import type { RaidRoomClearReward } from '../../../domain/raidRoomClearReward';
import { canonicalItemName } from '../../../domain/gameplay/canonical/items';
import CanonicalItemIcon from '../ui/CanonicalItemIcon';
import './RaidRewardItems.css';

const RANDOM_TICKETS: Readonly<Record<string, readonly string[]>> = {
  NORMAL_GACHA_TICKET_RANDOM: ['NORMAL_GACHA_TICKET_CHARACTER', 'NORMAL_GACHA_TICKET_SKILL', 'NORMAL_GACHA_TICKET_EQUIPMENT'],
  SPECIAL_TICKET_RANDOM: ['SPECIAL_TICKET_CHARACTER', 'SPECIAL_TICKET_SKILL', 'SPECIAL_TICKET_EQUIPMENT'],
  SPECIAL_TICKET_SKILL_OR_EQUIPMENT: ['SPECIAL_TICKET_SKILL', 'SPECIAL_TICKET_EQUIPMENT'],
};

/** Compact reward presentation; random pools show one grouped icon, never three grants. */
export function RaidRewardItem({ itemId, quantity }: { itemId: string; quantity: number }) {
  const name = canonicalItemName(itemId);
  const randomTickets = RANDOM_TICKETS[itemId];
  const label = `${name} ×${quantity.toLocaleString('ja-JP')}`;
  return <span className="raid-reward-items__item" role="img" aria-label={label} title={label}>
    {randomTickets ? <span className="raid-reward-items__random" aria-hidden="true">
      {randomTickets.map(id => <CanonicalItemIcon key={id} itemId={id} className="raid-reward-items__icon" />)}
      <small>?</small>
    </span> : itemId === 'CASH' || itemId === 'DIAMOND'
      ? <img className="raid-reward-items__icon" src={itemId === 'CASH' ? '/ui/icon_cash.png' : '/ui/icon_dia.png'} alt="" />
      : <CanonicalItemIcon className="raid-reward-items__icon" itemId={itemId} />}
    <strong aria-hidden="true">×{quantity.toLocaleString('ja-JP')}</strong>
  </span>;
}
export function RaidRewardPlanItems({ plan }: { plan?: RaidRewardPlan }) {
  return <section className="raid-reward-items" aria-label="報酬の予定内容"><h4>条件達成時の報酬</h4>
    {!plan ? <p>予定内容は未取得です。</p> : plan.status === 'unconfigured' ? <p>報酬内容は準備中です。</p> : <>
      <ul className="raid-reward-items__plan">{plan.items.map((item, index) => <li key={`${item.itemId}:${index}`}><RaidRewardItem {...item} /></li>)}</ul>
    </>}
  </section>;
}
export function RaidIssuedRewardItems({ items }: { items: RaidRoomClearReward['items'] }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  if (!items.length) return null;
  return <section className="raid-reward-items" aria-label="発行済みの報酬"><h4>獲得報酬</h4><ul>{items.map(item => <li key={item.presentId ?? item.itemId}>
    <RaidRewardItem {...item} />
    <p>{item.delivery === 'DIRECT' ? '獲得しました' : item.presentStatus === 'CLAIMED' ? '受取済み' : item.presentStatus === 'UNCLAIMED' ? (item.expiresAt && Date.parse(item.expiresAt) <= now ? '期限切れ' : '未受取') : item.presentStatus === 'EXPIRED' ? '期限切れ' : '受取状況を確認できません'}</p>
    {item.expiresAt && <p className="raid-reward-items__note">受取期限：{new Date(item.expiresAt).toLocaleString('ja-JP')}</p>}
  </li>)}</ul></section>;
}

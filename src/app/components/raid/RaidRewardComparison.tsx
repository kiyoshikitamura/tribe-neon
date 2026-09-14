'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { ITEMS_MASTER_DATA } from '@/utils/items_master_data';
import { RAID_DIFFICULTIES, type RaidDifficultyId } from '@/domain/raidRoom';
import { parseRaidRewardPolicies, type RaidRewardPolicy } from '@/domain/raidStrategy';
import { useGame } from '../../context/GameContext';
import './RaidStrategySummary.css';

function itemLabel(item: { itemId: string; quantity: number }) {
  const name = ITEMS_MASTER_DATA.find(row => row.id === item.itemId)?.name ?? '報酬アイテム';
  return `${name} ×${item.quantity}`;
}
export default function RaidRewardComparison({ selected }: { selected?: RaidDifficultyId }) {
  const { session } = useGame();
  const userId = session?.user?.id;
  const [state, setState] = useState<{ userId: string; policies: RaidRewardPolicy[] } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void Promise.resolve(supabase.rpc('get_raid_reward_policy_v2')).then(({ data, error }) => {
      if (error || !active) return;
      const policies = parseRaidRewardPolicies(data);
      if (active) setState({ userId, policies });
    }).catch(() => { /* Existing authoritative reward plan remains visible on older deployments. */ });
    return () => { active = false; };
  }, [userId]);
  if (!state || !userId || state.userId !== userId) return null;
  const policies = state.policies;
  return <section className="raid-reward-comparison" aria-label="難易度別の撃破報酬">
    <h3>難易度別の撃破報酬</h3>
    <div className="raid-reward-comparison__grid">{RAID_DIFFICULTIES.map(difficulty => {
      const policy = policies.find(row => row.difficulty === difficulty.id)!;
      return <article className="raid-reward-comparison__tier" data-selected={selected === difficulty.id} key={difficulty.id}>
        <h4>{difficulty.label}</h4>
        {difficulty.id === 'expert' && <p>推奨総合力 260,000以上</p>}
        {!policy.enabled && <p className="raid-reward-comparison__status">新報酬：付与条件調整中</p>}
        {policy.enabled && policy.eligibility && <p>{policy.eligibility.minimumContributionBp > 0 ? `撃破前に参加し、最大HPの${policy.eligibility.minimumContributionBp / 100}%以上の累積貢献で獲得` : '撃破前に1戦以上参加すると獲得'}</p>}
        <p>撃破ごと：{policy.instanceItems.map(itemLabel).join(' / ')}</p>
        <p className="raid-reward-comparison__daily">1日1回：{policy.daily.items.map(itemLabel).join(' / ')}{policy.daily.chanceBp < 10000 ? `（${policy.daily.chanceBp / 100}%）` : ' 確定'}</p>
      </article>;
    })}</div>
    <p>同じ難易度の1日1回ボーナスは、同日に複数撃破しても追加されません。撃破ごとの報酬は、対象レイドの参加・貢献条件を満たすと獲得できます。</p>
  </section>;
}

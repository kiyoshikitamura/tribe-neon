'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { RaidRewardItem } from './RaidRewardItems';
import { RAID_DIFFICULTIES, type RaidDifficultyId } from '@/domain/raidRoom';
import { parseRaidRewardPolicies, type RaidRewardPolicy } from '@/domain/raidStrategy';
import { useGame } from '../../context/GameContext';
import './RaidStrategySummary.css';

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
        {policy.enabled && policy.eligibility && <p>{policy.eligibility.minimumContributionBp > 0 ? `最大HPの${policy.eligibility.minimumContributionBp / 100}%以上の累積貢献で獲得` : '1戦以上参加で獲得'}</p>}
        <div className="raid-reward-comparison__rewards"><span>撃破</span>{policy.instanceItems.map(item => <RaidRewardItem key={item.itemId} {...item} />)}</div>
        <div className="raid-reward-comparison__rewards raid-reward-comparison__daily"><span>{policy.daily.chanceBp / 100}%で</span>{policy.daily.items.map(item => <RaidRewardItem key={item.itemId} {...item} />)}</div>
      </article>;
    })}</div>
    <p>追加報酬の抽選は各難易度1日1回。? のチケットはいずれか1種です。</p>
  </section>;
}

'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { RaidRewardItem } from './RaidRewardItems';
import { RAID_DIFFICULTIES, type RaidDifficultyId } from '@/domain/raidRoom';
import { parseRaidRewardPolicies, type RaidRewardPolicy } from '@/domain/raidStrategy';
import { useGame } from '../../context/GameContext';
import SubTabNav from '../ui/SubTabNav';
import './RaidStrategySummary.css';

export default function RaidRewardComparison({ selected }: { selected?: RaidDifficultyId }) {
  const { session } = useGame();
  const userId = session?.user?.id;
  const [state, setState] = useState<{ userId: string; policies: RaidRewardPolicy[] } | null>(null);
  const [active, setActive] = useState<RaidDifficultyId>(selected ?? 'beginner');
  useEffect(() => { if (selected) setActive(selected); }, [selected]);
  useEffect(() => {
    if (!userId) return;
    let current = true;
    void Promise.resolve(supabase.rpc('get_raid_reward_policy_v2')).then(({ data, error }) => {
      if (error || !current) return;
      const policies = parseRaidRewardPolicies(data);
      if (active) setState({ userId, policies });
    }).catch(() => {});
    return () => { current = false; };
  }, [userId]);
  if (!state || !userId || state.userId !== userId) return <p>報酬情報を取得中です。</p>;
  const policy = state.policies.find(row => row.difficulty === active);
  if (!policy) return <p>報酬情報を確認できません。</p>;
  return <section className="raid-reward-comparison" aria-label="難易度別のレイド報酬">
    <SubTabNav tabs={RAID_DIFFICULTIES.map(entry => ({ id: entry.id, label: entry.label }))} activeTabId={active} onSelect={id => setActive(id as RaidDifficultyId)} />
    <article className="raid-reward-comparison__tier" data-selected="true">
      <h4>{RAID_DIFFICULTIES.find(entry => entry.id === active)?.label}</h4>
      {!policy.enabled ? <p className="raid-reward-comparison__status">報酬条件は現在調整中です。</p> : <>
        <div className="raid-reward-comparison__rewards"><span>討伐報酬</span>{policy.instanceItems.map(item => <RaidRewardItem key={item.itemId} {...item} />)}</div>
        <p>{policy.eligibility?.minimumContributionBp ? `獲得条件：最大HPの${policy.eligibility.minimumContributionBp / 100}%以上の累積貢献＋ボス撃破` : '獲得条件：1戦以上参加＋ボス撃破'}</p>
        <div className="raid-reward-comparison__rewards raid-reward-comparison__daily"><span>追加報酬：抽選 {policy.daily.chanceBp / 100}%</span>{policy.daily.items.map(item => <RaidRewardItem key={item.itemId} {...item} />)}</div>
        <p>追加報酬は各難易度1日1回。対象アイテムから抽選でいずれか1種を獲得します。</p>
      </>}
    </article>
  </section>;
}

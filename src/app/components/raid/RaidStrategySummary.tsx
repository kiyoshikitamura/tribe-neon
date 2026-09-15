import { useEffect, useState } from 'react';
import { getRaidAreaStrategy, parseRaidRewardPolicies } from '@/domain/raidStrategy';
import { supabase } from '@/utils/supabase';
import './RaidStrategySummary.css';

export default function RaidStrategySummary({ areaId }: { areaId: string }) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void supabase.rpc('get_raid_reward_policy_v2').then(({ data, error }) => {
      if (cancelled || error) return;
      try { setActive(parseRaidRewardPolicies(data).every(policy => policy.strategyVersion === '2026-09-14')); }
      catch { setActive(false); }
    });
    return () => { cancelled = true; };
  }, []);
  const strategy = getRaidAreaStrategy(areaId, active);
  if (!strategy) return null;
  return <div className="raid-strategy-summary">
    <strong>{strategy.identity}</strong>
    <span>{strategy.description}</span>
  </div>;
}

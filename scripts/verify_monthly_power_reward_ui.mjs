import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMonthlyPowerRewardView } from '../src/domain/ranking/monthlyPowerRewardPresentation.ts';
import { parsePendingRankingRewardNotification, aggregateRankingRewardReceipts } from '../src/domain/ranking/rankingRewardNotification.ts';
const master = JSON.parse(readFileSync('src/domain/gameplay/canonical/data/season_power_rewards_20260914.json','utf8'));
for (const category of ['POWER','GUILD_POWER']) {
  const ranks = category === 'POWER' ? [1,2,3,4,10,11,30,31,100,101] : [1,2,3,4,10,11,20,21];
  for (const rank of ranks) {
    const tier = master[category].find(t => rank >= t.rank_min && rank <= t.rank_max);
    const parsed = parseMonthlyPowerRewardView({ season:null, tiers:master[category], current_rank:rank, planned_items:tier?.items ?? [], eligibility:{status:'NOT_APPLICABLE',eligible:true}, cosmetics_status:'UNRESOLVED_MASTER_BINDINGS',finalized:false });
    assert.equal(parsed.current_rank,rank);
    assert.equal(parsed.planned_items.length > 0,rank <= (category==='POWER'?100:20));
  }
}
assert.throws(()=>parseMonthlyPowerRewardView({tiers:[]}));
const base = {period_kind:'SEASON',period_key:'season-1',ranking_category:'GUILD_POWER',rank_position:1,quantity:2,granted_at:'2026-09-30T15:00:00Z'};
const parsed = parsePendingRankingRewardNotification({notification_ids:['receipt-1'],grants:[
  {...base,item_id:'SPECIAL_TICKET_CHARACTER',reward_kind:'ITEM'},
  {...base,item_id:'SKILL_MANUAL'},
  {...base,item_id:'guild_preopen_2026_rank_1',quantity:1},
]});
assert.deepEqual(parsed.grants.map(g=>g.rewardKind),['ITEM','ITEM','COSMETIC']);
assert.equal(aggregateRankingRewardReceipts(parsed.grants).length,3);
console.log('Monthly POWER/GUILD_POWER reward UI contract PASS (all tier edges; item/cosmetic notification regression)');

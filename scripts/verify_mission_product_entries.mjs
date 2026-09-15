import assert from 'node:assert/strict';
import source from '../src/domain/gameplay/canonical/data/missions_20260910.json' with { type: 'json' };
import { syncCanonicalMissions } from '../src/domain/gameplay/canonical/mission_runtime.ts';
const master = source.missions.map(m => ({ id:m.id,category:m.category,trigger_type:m.triggerType,target_value:m.targetValue,prerequisite_mission_id:m.prerequisiteMissionId,is_enabled:m.isEnabled,reward_item_id:m.rewardItemId,reward_quantity:m.rewardQuantity }));
const fresh = syncCanonicalMissions(master, [], 'fresh').rows;
for (const id of ['MIS_N_P001','MIS_N_P004','MIS_N_P006','MIS_N_P008','MIS_N_P010']) {
  const row=fresh.find(r=>r.mission_id===id);
  assert(row, `${id} should be available without another content completion`);
  assert.equal(row.current_progress,0,'unlock must not fabricate progress');
  assert.equal(row.status,'PROGRESS','unlock must not grant rewards');
}
for (const id of ['MIS_N_P005','MIS_N_P007','MIS_N_P009']) assert(!fresh.some(r=>r.mission_id===id),'within-content dependency preserved');
const claimed={id:'owned',user_id:'returning',mission_id:'MIS_N_P008',current_progress:1,status:'CLAIMED',cycle_date:null};
const returning=syncCanonicalMissions(master,[claimed],'returning').rows;
assert.equal(returning.find(r=>r.id==='owned').status,'CLAIMED');
assert(returning.some(r=>r.mission_id==='MIS_N_P009'),'claimed entry unlocks own next step');
console.log('Mission content entries: PASS (fresh independent entries, within-content gates, existing claims preserved)');

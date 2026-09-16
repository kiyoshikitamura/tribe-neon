import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'src/domain/gameplay/canonical/data/quest_progression_20260916.json'), 'utf8'));
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
if (data.stages.length !== 21 || new Set(data.stages.map(s => s.questId)).size !== 21) throw Error('21ステージが必要です');
const columns = {
 progression_vitality_cost: 'integer check(progression_vitality_cost>0)',
 progression_duration_sec: 'integer check(progression_duration_sec>0)',
 progression_user_exp: 'integer check(progression_user_exp>=0)',
 progression_cash_reward: 'integer check(progression_cash_reward>=0)',
 progression_reward_pool_id: 'text',
 progression_first_clear_user_exp: 'integer check(progression_first_clear_user_exp>=0)',
 progression_first_clear_cash_reward: 'integer check(progression_first_clear_cash_reward>=0)',
 progression_first_clear_reward_pool_id: 'text',
 progression_boss_stat_multiplier_bp: 'integer check(progression_boss_stat_multiplier_bp>0)',
 progression_boss_stats: 'jsonb',
 progression_normal_reward_timing: "text check(progression_normal_reward_timing in ('EXPLORATION_COMPLETE','BOSS_VICTORY'))",
 progression_first_clear_reward_timing: "text check(progression_first_clear_reward_timing in ('BOSS_VICTORY'))",
 progression_is_provisional: 'boolean',
};
let sql = '-- 仮Master。JSONを変更して本スクリプトで再生成。既存LEGACY列は変更しない。\nbegin;\n';
sql += 'alter table public.canonical_quest_master\n' + Object.entries(columns).map(([name,type])=>' add column if not exists '+name+' '+type).join(',\n') + ';\n';
sql += `do $$ begin if (select count(*) from public.canonical_quest_master where version=${quote(data.version)} and quest_id in (${data.stages.map(s=>quote(s.questId)).join(',')}))<>21 then raise exception 'Quest master requires all 21 existing stages'; end if; end $$;\n`;
for(const s of data.stages) {
 for (const key of ['ap','durationSec','userExp','cash','firstClearUserExp','firstClearCash','bossStatMultiplierBp']) if(!Number.isSafeInteger(s[key]) || s[key]<0) throw Error('不正な数値: '+key);
 const normal='QP_NORMAL_'+s.questId, first='QP_FIRST_'+s.questId;
 const values=[s.ap,s.durationSec,s.userExp,s.cash,quote(normal),s.firstClearUserExp,s.firstClearCash,quote(first),s.bossStatMultiplierBp,quote(JSON.stringify(s.bossStats))+'::jsonb',quote(data.normalRewardTiming),quote(data.firstClearRewardTiming),data.isProvisional];
 sql += 'update public.canonical_quest_master set '+Object.keys(columns).map((c,i)=>c+'='+values[i]).join(',')+' where version='+quote(data.version)+' and quest_id='+quote(s.questId)+';\n';
 for(const [pool,rewards] of [[normal,s.normalRewards],[first,s.firstClearRewards]]) {
  sql += 'delete from public.canonical_quest_reward_pool_items where version='+quote(data.version)+' and reward_pool_id='+quote(pool)+';\n';
  for(const [i,r] of rewards.entries()) {
   if(!Number.isSafeInteger(r.quantity)||r.quantity<1||!Number.isSafeInteger(r.probabilityBp)||r.probabilityBp<0||r.probabilityBp>10000) throw Error('不正な報酬');
   sql += 'insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('+[quote(data.version),quote(pool),i+1,quote(r.itemId),r.quantity,r.probabilityBp].join(',')+');\n';
  }
 }
}
sql += fs.readFileSync(path.join(root,'scripts/quest_progression_first_reward.sql'),'utf8');
sql += '\ncommit;\n';
const target=process.argv[2] || 'supabase/migrations/20260916150008_quest_progression_placeholder_master.sql';
fs.writeFileSync(path.resolve(root,target),sql);
console.log('Generated '+target);

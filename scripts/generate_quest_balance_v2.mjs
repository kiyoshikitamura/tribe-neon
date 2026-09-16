import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(fs.readFileSync(path.join(root,'docs/product/quest-balance-20260917/source-extracted.json'),'utf8'));
const towns=['shinjuku','shibuya','ikebukuro','roppongi','akihabara','kawasaki','yokohama'];
const aliases={'Normal Character':'NORMAL_GACHA_TICKET_CHARACTER','Normal Skill':'NORMAL_GACHA_TICKET_SKILL','Normal Equipment':'NORMAL_GACHA_TICKET_EQUIPMENT','SP Character':'SPECIAL_TICKET_CHARACTER','SP Skill':'SPECIAL_TICKET_SKILL','SP Equipment':'SPECIAL_TICKET_EQUIPMENT'};
const parseReward=text=>{const m=text.match(/^(.+?) x(\d+)$/);if(!m)throw Error(`Invalid reward ${text}`);return {itemId:aliases[m[1]]||m[1],quantity:Number(m[2]),probabilityBp:10000};};
const stages=source.stage21.map(row=>{
 const order=row['#'],townId=towns[Math.floor((order-1)/3)],grade=(order-1)%3+1;
 const normalRewards=[parseReward(row['Char EXP']),parseReward(row['Equip EXP'])];
 for(const [column,itemId] of [['Skill Manual %','SKILL_MANUAL'],['LB Part %','EQUIP_LB_PART'],['Normal Ticket %','NORMAL_GACHA_TICKET_RANDOM']]){
  const probabilityBp=Math.round(row[column]*10000);
  if(probabilityBp>0)normalRewards.push({itemId,quantity:1,probabilityBp});
 }
 return {questId:`q_${townId}_${grade}`,stageOrder:order,townId,ap:row.AP,durationSec:row.Min*60,userExp:row['Player EXP'],cash:row.CASH,firstClearCash:0,firstClearUserExp:0,normalRewards,firstClearRewards:row['First Boss Reward'].split(' + ').map(parseReward)};
});
if(stages.length!==21||new Set(stages.map(s=>s.questId)).size!==21)throw Error('21 unique stages required');
const totals={};for(const s of stages)for(const r of s.firstClearRewards)totals[r.itemId]=(totals[r.itemId]||0)+r.quantity;
for(const [id,n] of Object.entries({NORMAL_GACHA_TICKET_CHARACTER:7,NORMAL_GACHA_TICKET_SKILL:7,NORMAL_GACHA_TICKET_EQUIPMENT:7,SPECIAL_TICKET_CHARACTER:15,SPECIAL_TICKET_SKILL:15,SPECIAL_TICKET_EQUIPMENT:15,SKILL_MANUAL:38,EQUIP_LB_PART:38}))if(totals[id]!==n)throw Error(`Incorrect first-clear total ${id}`);
const data={version:'2026-08-30',revision:'QUEST_BALANCE_V2_20260917',dropStatus:'PREVIEW_CANDIDATE',normalRewardTiming:'EXPLORATION_COMPLETE',firstClearRewardTiming:'BOSS_VICTORY',stages};
fs.writeFileSync(path.join(root,'src/domain/gameplay/canonical/data/quest_balance_v2_20260917.json'),JSON.stringify(data,null,2)+'\n');
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
let sql='-- Approved 21-stage v2. First-clear items only; ordinary CASH/XP are paid at exploration completion.\nbegin;\n';
sql+=`do $$ begin if (select count(*) from public.canonical_quest_master where version='2026-08-30' and quest_id in (${stages.map(s=>quote(s.questId)).join(',')}))<>21 then raise exception '21 stages required';end if;end $$;\n`;
for(const s of stages){
 const normal='QP_V2_NORMAL_'+s.questId,first='QP_V2_FIRST_'+s.questId;
 sql+=`update public.canonical_quest_master set progression_vitality_cost=${s.ap},progression_duration_sec=${s.durationSec},progression_user_exp=${s.userExp},progression_cash_reward=${s.cash},progression_reward_pool_id=${quote(normal)},progression_first_clear_user_exp=0,progression_first_clear_cash_reward=0,progression_first_clear_reward_pool_id=${quote(first)},progression_normal_reward_timing='EXPLORATION_COMPLETE',progression_first_clear_reward_timing='BOSS_VICTORY',progression_is_provisional=true where version='2026-08-30' and quest_id=${quote(s.questId)};\n`;
 for(const [pool,rewards] of [[normal,s.normalRewards],[first,s.firstClearRewards]]){
  sql+=`delete from public.canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id=${quote(pool)};\n`;
  for(const [i,r] of rewards.entries())sql+=`insert into public.canonical_quest_reward_pool_items(version,reward_pool_id,roll_index,item_id,quantity,probability_bp) values('2026-08-30',${quote(pool)},${i+1},${quote(r.itemId)},${r.quantity},${r.probabilityBp});\n`;
 }
}
// Preserve existing receipt/history. Recalculate only the unpaid hometown CASH
// snapshot because ordinary base rewards read the current progression master.
sql+=`update public.user_patrols p set hometown_bonus_snapshot=p.hometown_bonus_snapshot||jsonb_build_object('cash',floor(q.progression_cash_reward::numeric*coalesce((p.hometown_bonus_snapshot->>'cash_bonus_rate')::numeric,0))::bigint,'progression_base_cash',q.progression_cash_reward) from public.canonical_quest_master q where q.version='2026-08-30' and q.quest_id=coalesce(p.course_id,p.quest_id) and p.progression_kind in('FIRST_CLEAR','REPEAT') and p.status in('ONGOING','CLAIMABLE') and p.exploration_reward_receipt is null;\ncommit;\n`;
const target=process.argv[2];if(!target)throw Error('Pass the CLI-generated migration filename');
if(!fs.existsSync(path.resolve(root,target)))throw Error('Generate the migration with supabase migration new first');
fs.writeFileSync(path.resolve(root,target),sql);
console.log(JSON.stringify({stages:stages.length,firstClearTotals:totals,migration:target}));

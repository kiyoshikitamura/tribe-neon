import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {PGlite}=createRequire(resolve(process.env.RAID_TEST_RUNTIME??root,'package.json'))('@electric-sql/pglite');
const db=new PGlite();const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value;
const source=n=>readFileSync(resolve(root,'supabase/migrations',readdirSync(resolve(root,'supabase/migrations')).find(x=>x.includes(n))),'utf8');
async function isolated(fn){await db.exec('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(1)]);await fn();}finally{await db.exec('rollback');}}
async function rejects(fn){await db.exec('savepoint e');try{await assert.rejects(fn);}finally{await db.exec('rollback to e;release e');}}
async function snapshot(){const out={};for(const t of ['presents','raid_damage_logs','raid_bosses','ranking_seasons','ranking_season_reward_grants','ranking_daily_reward_awards','raid_production_reward_grants','raid_reward_grants'])out[t]=await value(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]') value from ${t} x`);return out;}
before(async()=>{
 await db.exec(readFileSync(new URL('raid-ranking-retirement-fixture.sql',import.meta.url),'utf8'));
 for(const n of ['00229_','00233_','00234_'])for(const m of source(n).matchAll(/create table if not exists public\.[\s\S]*?\n\);/gi))await db.exec(m[0]);
 const p=source('00135_');for(const name of ['grant_present_payload','claim_present'])await db.exec(p.match(new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name+'\\([\\s\\S]*?\\$\\$;'))[0]);
 await db.exec(source('00261_'));
 await db.exec("create trigger capture after update of finalization_status on battle_replay_sessions for each row execute function capture_daily_ranking_participation();insert into canonical_daily_ranking_reward_master select '2026-09-03',t,1,100,item,1,true from unnest(array['POWER','GUILD_POWER','PVP','RAID_PERSONAL']) t cross join unnest(array['CHAR_EXP_M','EQUIP_EXP_M']) item;");
 console.log('Engine',await value('select version() value'));
});after(()=>db.close());
test('順位参照はRETIRED、未認証は拒否',()=>isolated(async()=>{
 for(const [q,a]of [['select get_raid_rankings($1::uuid,100,0) value',[uid(9)]],['select get_raid_season_rankings(100,0) value',[]]]){const r=await value(q,a);assert.equal(r.status,'RETIRED');assert.deepEqual(r.individual,[]);assert.deepEqual(r.guild,[]);assert.equal(r.selfRank,null);}
 await db.exec("select set_config('request.jwt.claim.sub','',true)");await rejects(()=>value('select get_raid_season_rankings(100,0) value'));
}));
test('Raid Season停止と既存履歴保持、PvP有効Season参照を保持',()=>isolated(async()=>{
 await db.exec("insert into ranking_seasons(ranking_type,starts_at,ends_at,status) select t,now()-interval '1 day',now()+interval '1 day','ACTIVE' from unnest(array['RAID','PVP']) t");const before=await snapshot();
 assert.equal(await value("select advance_ranking_season('RAID') value"),null);assert.equal(await value('select finalize_raid_season_rewards($1) value',[uid(9)]),0);assert.deepEqual(await snapshot(),before);
 const active=await value('select get_active_ranking_seasons() value');assert.deepEqual(active.map(x=>x.ranking_type),['PVP']);assert(await value("select advance_ranking_season('PVP') value"));
}));
test('PvP期限境界の既存3処理を維持しRaid境界を変更しない',()=>isolated(async()=>{
 await db.exec("insert into ranking_seasons(ranking_type,starts_at,ends_at,status) values('PVP',now()-interval '2 months',now()-interval '1 month','ACTIVE'),('RAID',now()-interval '2 months',now()-interval '1 month','ACTIVE')");
 await value("select advance_ranking_season('PVP') value");assert.deepEqual((await db.query('select name from boundary_calls')).rows.map(x=>x.name),['assert','finalize','reconcile']);assert.equal(await value("select status value from ranking_seasons where ranking_type='RAID'"),'ACTIVE');
 await value('select converge_ranking_lifecycle_safety() value');assert.equal(await value("select status value from ranking_seasons where ranking_type='RAID'"),'ACTIVE');
}));
test('Raid日次・Season・旧順位付与の直接入口も副作用なし',()=>isolated(async()=>{
 await db.exec("insert into raid_rewards_master(id,reward_type,item_id,quantity) values(1,'RANK_PERSONAL','CASH',7),(2,'RANK_GUILD','CASH',7)");const before=await snapshot();
 for(const t of ['RAID_PERSONAL','RAID_GUILD'])assert.equal(await value('select grant_canonical_ranking_season_reward($1,$2,$3,$3,1) value',[uid(9),t,uid(1)]),0);
 assert.equal(await value("select grant_canonical_daily_ranking_reward(current_date-1,'RAID_PERSONAL',$1,$1,1,100) value",[uid(1)]),0);
 for(const t of ['PERSONAL_RANK','GUILD_RANK'])assert.equal(await value('select grant_canonical_raid_reward($1,$2,$3,\'1\') value',[uid(9),uid(1),t]),0);
 for(const id of [1,2])assert.equal(await value("select grant_raid_reward($1,$2,$3,'other') value",[uid(9),uid(1),id]),false);
 assert.deepEqual(await snapshot(),before);
}));
test('共有日次確定は3カテゴリだけ新規付与、Raid既存snapshotも付与しない、再送重複なし',()=>isolated(async()=>{
 await db.query("insert into ranking_daily_activity_snapshots values(current_date-2,$1,200000,$2,now(),now());",[uid(1),uid(101)]);
 await db.query("insert into ranking_daily_participation values(current_date-2,'PVP',$1,1,now(),now()),(current_date-2,'RAID_PERSONAL',$1,1,now(),now())",[uid(1)]);
 await db.query("insert into ranking_daily_entity_snapshots(ranking_day_key,ranking_type,ranked_entity_id,score,rank_position) values(current_date-2,'RAID_PERSONAL',$1,100,1)",[uid(1)]);
 await db.query("insert into ranking_daily_recipient_snapshots values(current_date-2,'RAID_PERSONAL',$1,$1,1,100)",[uid(1)]);
 const r=await value('select finalize_daily_ranking_rewards(current_date-2) value');assert.equal(r.RAID_PERSONAL,0);assert.equal(r.POWER,1);assert.equal(r.GUILD_POWER,1);assert.equal(r.PVP,1);
 assert.equal(await value('select count(*)::int value from ranking_daily_reward_item_grants'),6);assert.equal(await value("select count(*)::int value from ranking_daily_reward_awards where ranking_type='RAID_PERSONAL'"),0);
 assert.equal((await value('select finalize_daily_ranking_rewards(current_date-2) value')).status,'ALREADY_FINALIZED');assert.equal(await value('select count(*)::int value from ranking_daily_reward_item_grants'),6);
}));
test('Raid確定参加集計停止、PvP確定集計と再送防止維持',()=>isolated(async()=>{
 await db.query("insert into battle_replay_sessions(requester_user_id,battle_mode,finalization_status,finalized_at) select $1,t,'PENDING',now() from unnest(array['RAID','PVP']) t",[uid(1)]);
 await db.exec("update battle_replay_sessions set finalization_status='FINALIZED';update battle_replay_sessions set finalization_status='FINALIZED'");
 const r=(await db.query('select ranking_type,finalized_count from ranking_daily_participation')).rows;assert.deepEqual(r,[{ranking_type:'PVP',finalized_count:1}]);
}));
test('発行済みRaid Present受取・重複拒否維持、PvP Season新規報酬維持',()=>isolated(async()=>{
 const pid=await value("insert into presents(user_id,item_id,quantity,message,status,expire_at) values($1,'CASH',11,'レイド個人ランキング報酬','UNCLAIMED',now()+interval '30 days') returning id value",[uid(1)]);
 await value('select claim_present($1) value',[pid]);assert.equal(Number(await value('select cash value from users where id=$1',[uid(1)])),11);await rejects(()=>value('select claim_present($1) value',[pid]));
 const sid=await value("insert into ranking_seasons(ranking_type,starts_at,ends_at,status) values('PVP',now()-interval '1 month',now(),'CLOSED') returning id value");
 assert.equal(await value("select grant_canonical_ranking_season_reward($1,'PVP',$2,$2,1) value",[sid,uid(1)]),1);assert.equal(await value("select grant_canonical_ranking_season_reward($1,'PVP',$2,$2,1) value",[sid,uid(1)]),0);
}));
test('本人貢献は旧日次合算・Room単位、他人を混ぜず順位なし、旧reset非破壊',()=>isolated(async()=>{
 for(const n of [10,11,12])await db.query('insert into raid_bosses values($1,$2,1000)',[uid(n),n===12?'ROOM:X':'2026-09-08']);await db.query('insert into raid_rooms values($1,$2)',[uid(20),uid(12)]);
 for(const [boss,user,d]of [[10,1,10],[11,1,20],[12,1,30],[10,2,900]])await db.query('insert into raid_damage_logs(raid_boss_instance_id,user_id,raw_damage) values($1,$2,$3)',[uid(boss),uid(user),d]);
 assert.deepEqual(await value('select get_my_raid_contribution_v1($1) value',[uid(10)]),{contribution:30});assert.deepEqual(await value('select get_my_raid_contribution_v1($1) value',[uid(12)]),{contribution:30});
 await db.exec(`select set_config('request.jwt.claims','{"app_metadata":{"role":"admin"}}',true)`);const before=await snapshot();await value('select raid_season_reset() value');assert.deepEqual(await snapshot(),before);
}));

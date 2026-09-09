import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {memberSnapshot,parties} from '../raid-launch-balance-simulate.mjs';
const runtime=process.env.RAID_TEST_RUNTIME;if(!runtime)throw Error('RAID_TEST_RUNTIME must point to local PGlite package directory');
const {PGlite}=createRequire(resolve(runtime,'package.json'))('@electric-sql/pglite');
const db=new PGlite(),dir='docs/development/raid-launch-balance',data='src/domain/gameplay/canonical/data/';
const read=p=>fs.readFileSync(p,'utf8'),json=p=>JSON.parse(read(p));
const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
const uid='00000000-0000-0000-0000-000000000001';
const out={status:'RUNNING',engine:'PGlite in-memory only',scope:'Actual Room creation/start SQL with synthetic owned player snapshot. No external connection; does not validate player growth or Auth HTTP.',checks:[],snapshots:[]};
try{
 for(const f of ['read-projection','lifecycle','creation','legacy-isolation','entry','finalization','recovery','rescue','rescue-rewards'])await db.exec(read('tests/db/raid-room-'+f+'-fixture.sql'));
 await db.exec(read('supabase/migrations/20260813000144_official_battle_replay_contract.sql').match(/create or replace function public\.validate_official_battle_result[\s\S]*?\$\$;/)[0]);
 for(const f of fs.readdirSync('supabase/migrations').filter(f=>/^202609080002(5[0-9]|60|62)_/.test(f)).sort())await db.exec(read('supabase/migrations/'+f));
 const variants=json(data+'raid_production_20260830.json').variants;
 for(const v of variants){await db.query('insert into raid_boss_master(id) values($1) on conflict do nothing',[v.raidVariantId]);await db.query('insert into canonical_raid_variants values($1,$2,$3,$4,true,$5,$6,$7,$8)',[v.raidVariantId,v.areaId,v.raidName,v.maxHp,v.atk,v.def,v.spd,JSON.stringify(v.memberCharacterIds)]);}
 for(const c of json(data+'characters_20260821.json').characters)await db.query('insert into canonical_character_master values($1,$2,$3,$4)',['2026-08-21',c.character_id,c.name,c.attribute]);
 for(const s of json(data+'skills_20260821.json').skills)await db.query('insert into canonical_skill_master values($1,$2,$3,$4,$5,$6,$7,$8,$9)',['2026-08-21',s.skill_id,s.exclusive_character_id,s.name,s.activation_type,s.cooldown,s.available_from_round,s.target,JSON.stringify(s.effects)]);
 await db.exec('create table canonical_equipment_master(version text,equipment_id text,display_name text,category text,base_stats jsonb,exclusive_character_id text,fixed_effects jsonb);');
 for(const e of json(data+'equipment_20260821.json').equipments)await db.query('insert into canonical_equipment_master values($1,$2,$3,$4,$5,$6,$7)',['2026-08-21',e.equipment_id,e.display_name,e.category,JSON.stringify(e.base_stats),e.exclusive_character_id,JSON.stringify(e.fixed_effects)]);
 await db.exec(read('supabase/migrations/20260908175140_raid_top_daily_authority.sql'));
 for(const kind of ['create','start','info'])await db.exec(read(dir+'/'+kind+'-before.sql').replace(/^create function/,'create or replace function'));
 const eqSource=read('supabase/migrations/20260821000172_equipment_level_curve_final.sql');
 for(const name of ['equipment_level_battle_scale','canonical_equipment_level_cap','canonical_equipment_flat_stat'])await db.exec(eqSource.match(new RegExp('create or replace function public\\.'+name+'\\([\\s\\S]*?\\$\\$;'))[0]);
 const gearDiscrepancies=[];const gearMasters=json(data+'equipment_20260821.json').equipments;
 const exactGear={};for(const m of [...parties.flatMap(p=>p.members),...json('config/raid-room/launch-balance.json').profiles.flatMap(p=>p.members)])for(const e of m.equipment){const key=e.equipmentId+'/'+e.level+'/'+e.plus;if(exactGear[key])continue;const master=gearMasters.find(x=>x.equipment_id===e.equipmentId);exactGear[key]={};for(const k of ['hp','atk','def','spd','luk'])exactGear[key][k]=await value('select public.canonical_equipment_flat_stat($1,$2,$3) value',[master.base_stats[k]??0,e.level,e.plus]);}
 fs.writeFileSync(dir+'/validation-exact-equipment.json',JSON.stringify({authority:'Current SQL canonical_equipment_flat_stat executed in local PGlite',values:exactGear},null,2)+'\n');
 for(const party of parties)for(const [i,m] of party.members.entries()){
  const expected={...m.baseStats};for(const e of m.equipment){const master=gearMasters.find(x=>x.equipment_id===e.equipmentId);for(const k of ['hp','atk','def','spd','luk'])expected[k]+=await value('select public.canonical_equipment_flat_stat($1,$2,$3) value',[master.base_stats[k]??0,e.level,e.plus]);}
  const actual=memberSnapshot(m,i,'PLAYER').stats;if(JSON.stringify(actual)!==JSON.stringify(expected))gearDiscrepancies.push({party:party.label,characterId:m.characterId,expected,actual});
 }
 fs.writeFileSync(dir+'/validation-player-equipment.json',JSON.stringify({status:gearDiscrepancies.length?'FAIL':'PASS',characters:20,gearDiscrepancies},null,2)+'\n');
 assert.equal(gearDiscrepancies.length,0,'SQL player equipment stat discrepancies; see validation-player-equipment.json');
 const functions=async()=> (await db.query("select proname,pg_get_function_identity_arguments(oid) args,md5(pg_get_functiondef(oid)) hash,proacl from pg_proc where pronamespace='public'::regnamespace and prokind='f' order by 1,2")).rows;
 const frozenTables=['canonical_raid_variants','canonical_skill_master','canonical_character_master','canonical_equipment_master','canonical_quest_enemy_pool_entries','raid_room_difficulty_rules','raid_room_rescue_reward_rules','raid_room_rescue_reward_items','raid_room_clear_reward_rules','raid_room_clear_reward_items'];
 const tables=async()=>Object.fromEntries(await Promise.all(frozenTables.map(async t=>[t,await value(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') value from ${t} t`)])));
 const beforeFunctions=await functions(),beforeTables=await tables();
 const infoBefore=read(dir+'/info-before.sql').split(' select jsonb_build_object(\'status\'')[1];assert(infoBefore);assert.equal(read(dir+'/info-after.sql').split(' select jsonb_build_object(\'status\'')[1],infoBefore,'Info reward projection changed');
 await db.exec(read('config/raid-room/launch-balance.sql'));
 const afterFunctions=await functions();for(const f of beforeFunctions.filter(f=>!['create_raid_room_v1','start_raid_room_battle_v1'].includes(f.proname)))assert.deepEqual(afterFunctions.find(g=>g.proname===f.proname&&g.args===f.args),f);
 assert.deepEqual(await tables(),beforeTables);out.checks.push('Non-target functions including Replay finalization, power/reward rules and common master rows unchanged');
 const profiles=json('config/raid-room/launch-balance.json').profiles;
 assert.equal(await value('select count(*)::int value from raid_room_combat_profiles'),28);
 for(const p of profiles){
  await db.exec('begin');try{
   await db.exec('update raid_room_creation_settings set enabled=true;update raid_room_battle_settings set enabled=true;');
   const other=variants.find(v=>v.raidVariantId!==p.raidVariantId);
   await db.query("insert into private.raid_daily_targets(date_jst,first_variant_id,second_variant_id,first_area_id,second_area_id) values((clock_timestamp() at time zone 'Asia/Tokyo')::date,$1,$2,$3,$4)",[p.raidVariantId,other.raidVariantId,p.areaId,other.areaId]);
   await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);await db.exec('set local role authenticated');
   const room=await value('select create_raid_room_v1($1,$2,$3) value',[p.difficultyId,p.raidVariantId,randomUUID()]);
   await db.exec('reset role');
   const fixed=await value('select enemy_snapshot value from raid_room_combat_snapshots where room_id=$1',[room.roomId]);
   await db.query("update raid_room_combat_profiles set profile=jsonb_set(profile,'{members,0,baseStats,atk}','999999999'::jsonb) where raid_variant_id=$1 and difficulty_id=$2",[p.raidVariantId,p.difficultyId]);
   await db.exec('set local role authenticated');
   const battle=await value("select start_raid_room_battle_v1($1,array['fixture-player'],'BALANCED',$2) value",[room.roomId,randomUUID()]);
   await db.exec('reset role');
   const replay=(await db.query('select * from battle_replay_sessions where id=$1',[battle.replay_session_id])).rows[0];
   const boss=(await db.query('select b.* from raid_bosses b join raid_rooms r on r.raid_boss_instance_id=b.id where r.id=$1',[room.roomId])).rows[0];
   assert.equal(Number(boss.max_hp),p.maxHp);assert.equal(replay.enemy_snapshot.length,5);assert.equal(replay.resolution_authority,'RAID_SERVER');
   assert.deepEqual(replay.enemy_snapshot,fixed,'Existing Room must retain creation-time enemy snapshot after config update');
   for(const [i,m] of p.members.entries()){const u=replay.enemy_snapshot[i];assert.equal(u.characterId,m.characterId);assert.equal(u.skills.length,m.skills.length);assert.equal(u.equipment.length,m.equipment.length);assert(u.stats.hp>0);assert.deepEqual(u.stats,memberSnapshot({...m,baseStats:{...m.baseStats,hp:Math.ceil(p.maxHp/5)}},i).stats,p.areaId+'/'+p.difficultyId+'/'+m.characterId+' SQL vs simulation stats');}
   out.snapshots.push({areaId:p.areaId,difficultyId:p.difficultyId,maxHp:Number(boss.max_hp),enemySnapshot:replay.enemy_snapshot,officialContext:replay.official_context});
  }finally{await db.exec('rollback');}
 }
 out.checks.push('All 28 actual create/start RPCs snapshot expected HP/Characters/equipment/skills','All 140 enemy stats exactly match simulation inputs','Existing Room snapshots immune to later candidate profile edits','Enemy-info reward projection unchanged','All 20 player equipment stats match current SQL');out.status='PASS';
}catch(e){out.status='FAIL';out.error={message:e.message,code:e.code,stack:e.stack};process.exitCode=1;}finally{await db.close();fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/validation-pg.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,checks:out.checks,snapshots:out.snapshots.length,error:out.error}));}

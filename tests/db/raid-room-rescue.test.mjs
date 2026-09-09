import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {PGlite}=createRequire(resolve(process.env.RAID_TEST_RUNTIME??root,'package.json'))('@electric-sql/pglite');
const db=new PGlite();
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
async function create(difficulty='beginner'){
 const r=await value("select create_raid_room_v1($1,'BOSS_A',$2) as value",[difficulty,randomUUID()]);
 // 実APIの別transactionを模す。外側rollback内ではnow()が生成clock_timestampより前なので時刻を補正。
 await admin();await db.query("update raid_bosses set spawned_at=now()-interval '1 second',expires_at=now()+interval '24 hours'-interval '1 second' where id=(select raid_boss_instance_id from raid_rooms where id=$1)",[r.roomId]);await asUser();return r;
}
const join=id=>value('select register_raid_room_v1($1) as value',[id]);
const brief=id=>value('select get_raid_room_briefing_v1($1) as value',[id]);
const start=(id,request=randomUUID(),ids=['fixture-player'],tactic='BALANCED')=>value('select start_raid_room_battle_v1($1,$2::text[],$3,$4) as value',[id,ids,tactic,request]);
async function asUser(n=1){await db.query("select set_config('request.jwt.claim.sub',$1,true)",[n===null?'':uid(n)]);await db.exec('set local role authenticated');}
async function admin(){await db.exec('reset role');}
async function isolated(fn){await db.exec('begin');try{await db.exec('update raid_room_creation_settings set enabled=true');await asUser();await fn();}finally{await db.exec('rollback');}}
async function rejected(fn,code){await db.exec('savepoint expected_error');try{await assert.rejects(fn,e=>!code||e.code===code);}finally{await db.exec('rollback to savepoint expected_error; release savepoint expected_error');}}
async function enabled(){await admin();await db.exec('update raid_room_battle_settings set enabled=true');await asUser();}
async function snapshot(){await admin();const out={};for(const t of ['users','raid_bosses','raid_rooms','raid_room_members','battle_replay_sessions','battle_replay_events','raid_damage_logs','raid_instance_user_progress','presents','isolation_calls','raid_room_battle_start_requests'])out[t]=await value(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as value from ${t} t`);await asUser();return out;}
async function setPower(power,n=2){await admin();await db.query('update creation_fixture_power set power=$1 where user_id=$2',[power,uid(n)]);await asUser(n);}
async function setSnapshot(power,n=1){await admin();await db.query('update entry_fixture_snapshots set payload=$1 where user_id=$2',[JSON.stringify([{id:'fixture-player',stats:{hp:power,atk:0,def:0}}]),uid(n)]);await asUser(n);}
before(async()=>{
 for(const f of ['raid-room-read-projection-fixture.sql','raid-room-lifecycle-fixture.sql','raid-room-creation-fixture.sql','raid-room-legacy-isolation-fixture.sql','raid-room-entry-fixture.sql','raid-room-finalization-fixture.sql'])await db.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('raid-room-recovery-fixture.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('raid-room-rescue-fixture.sql',import.meta.url),'utf8'));
 const dir=resolve(root,'supabase/migrations');
 const validation=readFileSync(resolve(dir,'20260813000144_official_battle_replay_contract.sql'),'utf8').match(/create or replace function public\.validate_official_battle_result[\s\S]*?\$\$;/)[0];
 await db.exec(validation);
 for(const f of readdirSync(dir).filter(f=>/^2026090800025[0-9]_/.test(f)).sort())await db.exec(readFileSync(resolve(dir,f),'utf8'));
 await db.exec(`create trigger canonical_daily_activity_finalized after update of finalization_status on public.battle_replay_sessions for each row execute function public.on_canonical_daily_activity_finalized(); create trigger canonical_guild_official_battle_exp_trigger after update of finalization_status on public.battle_replay_sessions for each row execute function public.on_canonical_guild_official_battle_exp(); create trigger ranking_daily_participation_capture after update of finalization_status on public.battle_replay_sessions for each row execute function public.capture_daily_ranking_participation();`);
 console.log('SQL engine:',await value('select version() as value'));
});
after(()=>db.close());

const result=(raw=100)=>({winner:'ENEMY',rounds:1,enemyRawDamage:100,playerRawDamage:raw,events:[{index:0,round:1,type:'DAMAGE',payload:{damage:raw}}]});
async function service(){await admin();await db.exec('set local role service_role');}
const finalize=(id,raw=100)=>value('select finalize_raid_room_battle_v1($1,$2::jsonb) as value',[id,JSON.stringify(result(raw))]);
const route=id=>value('select get_raid_battle_route_v1($1) as value',[id]);
const ownResult=id=>value('select get_raid_room_battle_result_v1($1) as value',[id]);
async function prepared(){const r=await create();await enabled();const s=await start(r.roomId);await service();return {...r,...s};}
async function state(){await admin();const out={};for(const t of ['raid_bosses','raid_instance_user_progress','raid_damage_logs','battle_replay_sessions','battle_replay_events','presents','canonical_daily_activity_claims','ranking_daily_participation','isolation_calls'])out[t]=await value(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') as value from ${t} t`);await service();return out;}
async function changeBoss(roomId,assignment){await admin();await db.query(`update raid_bosses set ${assignment} where id=(select raid_boss_instance_id from raid_rooms where id=$1)`,[roomId]);if(assignment.includes('expires_at='))await db.query("update battle_replay_sessions set official_context=jsonb_set(official_context,'{startedAt}',to_jsonb((clock_timestamp()-interval '2 seconds')::text)) where source_reference_id=(select raid_boss_instance_id from raid_rooms where id=$1)",[roomId]);await service();}
const receipt=id=>value('select get_raid_room_battle_start_receipt_v1($1) as value',[id]);
const batch=(limit=100)=>value('select finalize_expired_raid_rooms_v1($1) as value',[limit]);
const rescueStatus=id=>value('select get_raid_room_rescue_status_v1($1) as value',[id]);
const request=(id,req=randomUUID())=>value('select request_raid_room_rescue_v1($1,$2) as value',[id,req]);
const link=id=>value('select get_raid_room_rescue_v1($1) as value',[id]);
const rescueJoin=id=>value('select join_raid_room_rescue_v1($1) as value',[id]);
async function rescueEnabled(){await admin();await db.exec('update raid_room_rescue_settings set enabled=true');await asUser();}
async function guild(n=1,g=1){await admin();await db.query('delete from guild_members where user_id=$1',[uid(n)]);if(g)await db.query('insert into guild_members(user_id,guild_id) values($1,$2)',[uid(n),uid(100+g)]);await asUser(n);}
test('両公開先へ投稿し各3回まで、4回目は副作用なし',()=>isolated(async()=>{const r=await create();await rescueEnabled();await guild();for(let i=1;i<=3;i++){const x=await request(r.roomId);assert.deepEqual(x.publications.map(p=>p.channel).sort(),['ACTIVITY','GUILD']);assert.equal(x.activityCount,i);assert.equal(x.guildCount,i);}await rejected(()=>request(r.roomId),'22023');await admin();assert.equal(await value('select count(*)::int as value from social_activity_feed'),3);assert.equal(await value('select count(*)::int as value from board_posts'),3);}));
test('同request再送は投稿と回数を増やさず保存応答を返す',()=>isolated(async()=>{const r=await create(),req=randomUUID();await rescueEnabled();await guild();const a=await request(r.roomId,req);assert.deepEqual(await request(r.roomId,req),a);assert.equal((await rescueStatus(r.roomId)).activityCount,1);await admin();assert.equal(await value('select count(*)::int as value from board_posts'),1);}));
test('未所属はActivityのみ、後の加入では残るGuild枠を利用',()=>isolated(async()=>{const r=await create();await rescueEnabled();for(let i=0;i<3;i++)assert.deepEqual((await request(r.roomId)).publications.map(p=>p.channel),['ACTIVITY']);await guild();const x=await request(r.roomId);assert.deepEqual(x.publications.map(p=>p.channel),['GUILD']);assert.equal(x.activityCount,3);assert.equal(x.guildCount,1);}));
test('移籍してもGuild公開回数をリセットせず当時所属へ投稿',()=>isolated(async()=>{const r=await create();await rescueEnabled();await guild();await request(r.roomId);await guild(1,2);const x=await request(r.roomId);assert.equal(x.guildCount,2);assert.equal(x.publications.find(p=>p.channel==='GUILD').guildId,uid(102));await request(r.roomId);await guild(1,1);await rejected(()=>request(r.roomId),'22023');}));
test('作成者以外/匿名/運用falseは依頼不可',()=>isolated(async()=>{const r=await create();await rejected(()=>request(r.roomId),'42501');await rescueEnabled();await asUser(2);await rejected(()=>request(r.roomId),'42501');await asUser(null);await rejected(()=>request(r.roomId));await admin();await db.exec('set local role anon');await rejected(()=>request(r.roomId),'42501');}));
test('期限終了後の新規依頼を拒否する',()=>isolated(async()=>{const r=await create();await rescueEnabled();await changeBoss(r.roomId,"expires_at=clock_timestamp()-interval '1 second'");await asUser();await rejected(()=>request(r.roomId),'22023');}));
test('救援リンク初参加のみ帰属し再参加で変更しない',()=>isolated(async()=>{const r=await create();await rescueEnabled();const x=await request(r.roomId),id=x.publications[0].rescueId;await asUser(2);assert.equal((await link(id)).roomId,r.roomId);assert.equal((await rescueJoin(id)).viaRescue,true);assert.equal((await rescueJoin(id)).viaRescue,true);assert.equal((await rescueStatus(r.roomId)).viaRescue,true);await asUser();assert.equal((await rescueJoin(id)).viaRescue,false);}));
test('通常参加済みユーザーを救援へ昇格しない',()=>isolated(async()=>{const r=await create();await rescueEnabled();const x=await request(r.roomId);await asUser(2);await join(r.roomId);assert.equal((await rescueJoin(x.publications[0].rescueId)).viaRescue,false);assert.equal((await rescueStatus(r.roomId)).viaRescue,false);}));
test('Guildリンクは現所属を確認し非所属者の参照/参加を拒否',()=>isolated(async()=>{const r=await create();await rescueEnabled();await guild();const x=await request(r.roomId),id=x.publications.find(p=>p.channel==='GUILD').rescueId;await asUser(2);await rejected(()=>link(id),'42501');await rejected(()=>rescueJoin(id),'42501');await guild(2,1);assert.equal((await rescueJoin(id)).viaRescue,true);}));
test('救援参加にも総合力条件と期限条件を適用する',()=>isolated(async()=>{const r=await create('intermediate');await rescueEnabled();const x=await request(r.roomId),id=x.publications[0].rescueId;await setPower(159999);await rejected(()=>rescueJoin(id),'42501');await setPower(160000);assert.equal((await rescueJoin(id)).viaRescue,true);await changeBoss(r.roomId,"expires_at=clock_timestamp()-interval '1 second'");await asUser(3);await rejected(()=>rescueJoin(id),'42501');}));
test('救援の確定戦数/Damageは実戦闘確定から集計、再確定で増えない',()=>isolated(async()=>{const r=await create();await rescueEnabled();const x=await request(r.roomId),id=x.publications[0].rescueId;await enabled();await asUser(2);await rescueJoin(id);assert.equal((await rescueStatus(r.roomId)).finalizedBattles,0);const s=await start(r.roomId);await service();await finalize(s.replay_session_id,123);await finalize(s.replay_session_id,123);await asUser(2);const stat=await rescueStatus(r.roomId);assert.equal(stat.finalizedBattles,1);assert.equal(stat.contributionDamage,123);await admin();assert.equal(await value('select count(*)::int as value from presents'),0);}));
test('救援ANDは未設定を成功とせず、設定後もCLEARが必要',()=>isolated(async()=>{const r=await create();await rescueEnabled();const x=await request(r.roomId);await enabled();await asUser(2);await rescueJoin(x.publications[0].rescueId);const s=await start(r.roomId);await service();await finalize(s.replay_session_id,123);await asUser(2);assert.equal((await rescueStatus(r.roomId)).rescueGate.status,'unknown');await admin();await db.exec("update raid_room_difficulty_rules set rescue_min_battles=1,rescue_min_contribution_damage=123 where difficulty='beginner'");await asUser(2);assert.equal((await rescueStatus(r.roomId)).rescueGate.status,'not_succeeded');await changeBoss(r.roomId,"status='CLEARED',current_hp=0,outcome='DEFEAT_SUCCESS',outcome_finalized_at=clock_timestamp()");await asUser(2);assert.equal((await rescueStatus(r.roomId)).rescueGate.status,'succeeded');await asUser();assert.equal((await rescueStatus(r.roomId)).rescueGate.status,'not_succeeded');}));

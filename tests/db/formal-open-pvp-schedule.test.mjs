import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
process.on('uncaughtException',e=>{console.error(e.message,e.code||'',e.where||'');process.exit(1);});
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_RUNTIME));const db=new PGlite();
await db.exec(`
create role anon;create role authenticated;create role service_role;
create table ranking_seasons(id uuid primary key default gen_random_uuid(),ranking_type text,starts_at timestamptz,ends_at timestamptz,status text,updated_at timestamptz,unique(ranking_type,starts_at));
create table calls(id serial,stage text,season_id uuid);
create function public.test_clock() returns timestamptz language sql as $$select current_setting('test.clock')::timestamptz$$;
select set_config('test.clock','2026-09-15 04:00:00+00',false);
create function assert_pvp_boundary_replay_continuity(uuid,timestamptz) returns void language plpgsql as $$begin insert into public.calls(stage,season_id) values('assert',$1);end$$;
create function finalize_pvp_season_rewards(uuid) returns void language plpgsql as $$begin
 if current_setting('test.fail',true)='on' then raise exception 'fixture delivery failure';end if;
 insert into public.calls(stage,season_id) values('snapshot_reward',$1);end$$;
create function reconcile_pvp_after_season_boundary(uuid,timestamptz) returns void language plpgsql as $$begin insert into public.calls(stage,season_id) values('reconcile',$1);end$$;
create function finalize_raid_season_rewards(uuid) returns void language sql as $$select$$;
insert into ranking_seasons(ranking_type,starts_at,ends_at,status) values
 ('PVP','2026-08-31 15:00:00+00','2026-09-30 15:00:00+00','ACTIVE'),
 ('POWER','2026-07-31 15:00:00+00','2026-08-31 15:00:00+00','ACTIVE'),
 ('RAID','2026-09-06 15:00:00+00','2026-09-13 15:00:00+00','ACTIVE');
`);
const source=fs.readFileSync('supabase/migrations/20260902000229_ranking_season_lifecycle_authority.sql','utf8');
const start=source.indexOf('create or replace function public.ranking_period_bounds(');await db.exec(source.slice(start,source.indexOf('\n$$;',start)+4));
const originalSource=fs.readFileSync('supabase/migrations/20260908000261_raid_ranking_retirement.sql','utf8');
const originalStart=originalSource.indexOf('create or replace function public.advance_ranking_season(');
await db.exec(originalSource.slice(originalStart,originalSource.indexOf('\n$$;',originalStart)+4));
await db.exec('revoke all on function public.advance_ranking_season(text,timestamptz) from public,anon,authenticated;grant execute on function public.advance_ranking_season(text,timestamptz) to service_role;');
// Clock is the only substituted authority; production function SQL and transaction logic execute unchanged.
const migration=fs.readFileSync('supabase/migrations/20260914112648_formal_open_pvp_scheduled_transition.sql','utf8').replaceAll('clock_timestamp()','public.test_clock()');await db.exec(migration);
const scalar=async q=>(await db.query(q)).rows[0].v;
await db.exec(`
create table monthly_power_season_runs(season_id uuid primary key references ranking_seasons);
create table ranking_guild_power_season_master(season_id uuid,event_key text);
create table ranking_guild_power_finalization_audits(season_id uuid);
insert into ranking_seasons(ranking_type,starts_at,ends_at,status) values('GUILD_POWER','2026-09-03','2099-12-30','ACTIVE');
insert into ranking_guild_power_season_master select id,'PREOPEN_GUILD_POWER_2026' from ranking_seasons where ranking_type='GUILD_POWER';
`);
const call="select start_formal_open_seasons_v1('2026-09-15 04:00:00+00') v";
const snapshot=()=>scalar("select jsonb_agg(to_jsonb(s) order by id) v from ranking_seasons s");
const initial=await snapshot();
await assert.rejects(db.query(call),/Prior POWER/);assert.deepEqual(await snapshot(),initial);
// Explicit test-only oldseason resolution. Candidate itself may never close these rows.
await db.exec("update ranking_seasons set status='CLOSED',ends_at='2026-09-15 04:00:00+00' where ranking_type in ('POWER','GUILD_POWER')");
await assert.rejects(db.query(call),/finalization audit required/);
await db.exec("insert into ranking_guild_power_finalization_audits select season_id from ranking_guild_power_season_master");
const before=await snapshot();
await assert.rejects(db.query("select start_formal_open_seasons_v1(null)"),/timestamp required/);
await assert.rejects(db.query("select start_formal_open_seasons_v1('2026-09-15 04:00:01+00')"),/timestamp required/);
await db.exec("select set_config('test.fail','on',false)");
await assert.rejects(db.query(call),/fixture delivery failure/);
assert.deepEqual(await snapshot(),before);
assert.equal(await scalar('select count(*)::int v from calls'),0);
assert.equal(await scalar('select count(*)::int v from monthly_power_season_runs'),0);
await db.exec("select set_config('test.fail','off',false)");
const result=await scalar(call);assert.equal(result.status,'STARTED');
assert.equal(Object.keys(result.season_ids).length,3);
assert.deepEqual(await scalar("select jsonb_agg(stage order by id) v from calls"),['assert','snapshot_reward','reconcile']);
assert.equal(await scalar("select count(*)::int v from ranking_seasons where status='ACTIVE' and starts_at='2026-09-15 04:00:00+00' and ends_at='2026-09-30 15:00:00+00'"),3);
assert.equal(await scalar('select count(*)::int v from monthly_power_season_runs'),2);
assert.equal((await scalar(call)).status,'ALREADY_STARTED');
assert.equal(await scalar('select count(*)::int v from calls'),3);
assert.equal(await scalar("select advance_ranking_season('PVP','2026-09-15 04:00:00+00') v"),result.season_ids.PVP);
assert.equal(await scalar("select status v from ranking_seasons where ranking_type='RAID'"),'ACTIVE');
assert.equal(await scalar("select has_function_privilege('authenticated','start_formal_open_seasons_v1(timestamptz)','EXECUTE') v"),false);
assert.equal(await scalar("select has_function_privilege('service_role','start_formal_open_seasons_v1(timestamptz)','EXECUTE') v"),true);
await db.close();console.log('PASS: all3 simultaneous start; required time; old POWER and preopen audit guards; atomic reward failure rollback; PvP call order; retry; unrelated RAID retained. Fixture test only, no live season transition.');

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
create function assert_pvp_boundary_replay_continuity(uuid,timestamptz) returns void language plpgsql as $$begin insert into calls(stage,season_id) values('assert',$1);end$$;
create function finalize_pvp_season_rewards(uuid) returns void language plpgsql as $$begin
 if current_setting('test.fail',true)='on' then raise exception 'fixture delivery failure';end if;
 insert into calls(stage,season_id) values('snapshot_reward',$1);end$$;
create function reconcile_pvp_after_season_boundary(uuid,timestamptz) returns void language plpgsql as $$begin insert into calls(stage,season_id) values('reconcile',$1);end$$;
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
const other=await scalar("select jsonb_agg(to_jsonb(s) order by ranking_type) v from ranking_seasons s where ranking_type<>'PVP'");
await db.exec("select set_config('test.fail','on',false)");
await assert.rejects(db.exec("select prepare_formal_open_pvp_season_v1('2026-09-15 03:00:00+00')"),/fixture delivery failure/);
assert.equal(await scalar("select count(*)::int v from ranking_seasons where ranking_type='PVP'"),1);
assert.equal(await scalar("select status v from ranking_seasons where ranking_type='PVP'"),'ACTIVE');
assert.equal(await scalar('select count(*)::int v from calls'),0);
await db.exec("select set_config('test.fail','off',false)");
const prepared=await scalar("select prepare_formal_open_pvp_season_v1('2026-09-15 03:00:00+00') v");assert.equal(prepared.status,'PREPARING');
assert.deepEqual(await scalar("select jsonb_agg(stage order by id) v from calls"),['assert','snapshot_reward','reconcile']);
assert.equal(await scalar("select count(*)::int v from ranking_seasons where ranking_type='PVP' and status='ACTIVE'"),0);
assert.equal(await scalar("select advance_ranking_season('PVP','2026-09-15 14:59:59+00') v"),null);
await db.exec("select prepare_formal_open_pvp_season_v1('2026-09-15 03:00:00+00')");
assert.equal(await scalar('select count(*)::int v from calls'),3,'repeat preparation does not repeat rewards/reset');
assert.equal(await scalar("select advance_ranking_season('PVP','2026-09-15 15:00:00+00') v"),prepared.scheduled_season_id);
assert.equal(await scalar("select status v from ranking_seasons where id='"+prepared.scheduled_season_id+"'"),'ACTIVE');
assert.equal(await scalar("select advance_ranking_season('PVP','2026-09-16 01:00:00+00') v"),prepared.scheduled_season_id);
await db.exec("select advance_ranking_season('PVP','2026-09-30 15:00:00+00')");
assert.equal(await scalar("select count(*)::int v from ranking_seasons where ranking_type='PVP' and status='CLOSED'"),2);
assert.equal(await scalar("select starts_at::text v from ranking_seasons where ranking_type='PVP' and status='ACTIVE'"),'2026-09-30 15:00:00+00');
assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(s) order by ranking_type) v from ranking_seasons s where ranking_type<>'PVP'"),other);
await db.exec("update ranking_seasons set status='CLOSED' where ranking_type='PVP' and status='ACTIVE'");
await assert.rejects(db.exec("select advance_ranking_season('PVP','2026-10-01 01:00:00+00')"),/cannot be reopened/);
assert.equal(await scalar("select count(*)::int v from ranking_seasons where ranking_type='PVP' and status='ACTIVE'"),0);
assert.equal(await scalar("select advance_ranking_season('RAID','2026-09-15 15:00:00+00') v"),null);
await db.close();console.log('PASS: scheduled PVP cutoff rollback/order, repeat no-op, interval no ACTIVE, exact JST start/end, no CLOSED resurrection, unrelated POWER/RAID retained. Clock and reward internals are fixtures.');

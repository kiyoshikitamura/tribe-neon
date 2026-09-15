#!/usr/bin/env python3
"""Preview-only, independent-session first-finalize race. See the companion MD."""
import argparse
import concurrent.futures
import json
import os
import sys
import time
import uuid
from urllib.parse import urlsplit, unquote

PREVIEW = 'sufvuqdnqohpfzkwxohq'
MARKER = 'QA_PVP_CONCURRENT_20260915'


def progress(stage, **details):
    print(json.dumps({'status': 'RUNNING', 'stage': stage, **details}, ensure_ascii=False), flush=True)


def close_competitors(conns, executor):
    # Release the owner's locks BEFORE waiting for the contender thread.
    # Query cancellation alone does not end an idle/in-error transaction.
    if conns:
        progress('OWNER_ROLLBACK')
        try:
            conns[0].execute('rollback')
        finally:
            conns[0].close()
    if len(conns) > 1:
        progress('CONTENDER_CANCEL')
        try:
            conns[1].cancel()
        except Exception:
            pass
    if executor:
        progress('CONTENDER_JOIN')
        executor.shutdown(wait=True, cancel_futures=True)
    if len(conns) > 1:
        conns[1].close()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def target_url():
    value = os.environ.get('PVP_PREVIEW_DATABASE_URL', '')
    require(bool(value), 'PVP_PREVIEW_DATABASE_URL is required; no database was changed')
    url = urlsplit(value)
    direct = url.hostname == f'db.{PREVIEW}.supabase.co'
    pooler = (url.hostname or '').endswith('.pooler.supabase.com') and unquote(url.username or '') == f'postgres.{PREVIEW}'
    require(url.scheme in ('postgres', 'postgresql') and (direct or pooler), 'Only the designated Preview database is allowed')
    require(not url.query and not url.fragment, 'Supply a URL without query parameters; TLS and session options are set by this test')
    require(url.port in (None, 5432), 'Use direct Postgres or the session pooler on port 5432')
    return value


def cleanup(conn, user, opponent, replay):
    """Delete only fixture-owned rows. Unknown remnants fail instead of broad deletion."""
    from psycopg import sql
    ids = [user, opponent]
    progress('CLEANUP_BEGIN')
    with conn.transaction():
        rows = conn.execute('select id,bio from public.users where id=any(%s::uuid[])', (ids,)).fetchall()
        require(all(row[1] == MARKER for row in rows), 'Cleanup refused: user marker mismatch')
        row = conn.execute('select requester_user_id,official_context->>\'qaConcurrent\' from public.battle_replay_sessions where id=%s', (replay,)).fetchone()
        require(row is None or (str(row[0]) == user and row[1] == MARKER), 'Cleanup refused: replay marker mismatch')
        for table, column in [('social_activity_feed','actor_user_id'), ('social_activity_projection_state','subject_user_id'), ('gameplay_reward_delivery_ledger','user_id'), ('pvp_defense_logs','attacker_id')]:
            conn.execute(sql.SQL('delete from public.{} where {}=any(%s::uuid[])').format(sql.Identifier(table),sql.Identifier(column)), (ids,))
        conn.execute('delete from public.users where id=any(%s::uuid[])', (ids,))
        # Check UUID references even in tables without FKs; do not delete unfamiliar rows.
        columns = conn.execute("select c.table_name,c.column_name from information_schema.columns c join information_schema.tables t using(table_catalog,table_schema,table_name) where c.table_schema='public' and c.udt_name='uuid' and t.table_type='BASE TABLE'").fetchall()
        remaining = []
        progress('CLEANUP_REFERENCE_SCAN', columns=len(columns))
        for index, (table, column) in enumerate(columns):
            if index % 25 == 0:
                progress('CLEANUP_REFERENCE_SCAN', checked=index, columns=len(columns))
            n = conn.execute(sql.SQL('select count(*) from public.{} where {}=any(%s::uuid[])').format(sql.Identifier(table),sql.Identifier(column)), (ids+[replay],)).fetchone()[0]
            if n:
                remaining.append(f'{table}.{column}:{n}')
        require(not remaining, 'Cleanup incomplete: '+','.join(remaining))
    progress('CLEANUP_COMPLETE')


def prepare(conn, user, opponent, replay):
    from psycopg.types.json import Jsonb
    with conn.transaction():
        # finalize calls advance_ranking_season; do not allow this QA to transition it.
        conn.execute("select pg_advisory_xact_lock(hashtextextended('ranking-season:PVP',0))")
        ok = conn.execute("select exists(select 1 from public.ranking_seasons where ranking_type='PVP' and status='ACTIVE' and starts_at<=clock_timestamp() and ends_at>clock_timestamp()+interval '5 minutes') and not exists(select 1 from public.ranking_seasons where ranking_type='PVP' and status='ACTIVE' and ends_at<=clock_timestamp())").fetchone()[0]
        require(ok, 'An active, non-expiring PvP season is required; do not change season for this test')
        payload = conn.execute("select finalization_result from public.battle_replay_sessions where battle_mode='PVP' and finalization_status='FINALIZED' and resolution_authority='PVP_SERVER' order by id limit 1").fetchone()
        require(payload is not None, 'A valid official result fixture is required')
        payload = payload[0] | {'winner':'PLAYER'}
        conn.execute('select public.validate_official_battle_result(%s)', (Jsonb(payload),))
        conn.execute('insert into public.users(id,username,bio,cash,pvp_points) values(%s,%s,%s,0,4),(%s,%s,%s,0,4)', (user,'QA競合',MARKER,opponent,'QA競合相手',MARKER))
        conn.execute("insert into public.battle_replay_sessions(id,requester_user_id,battle_mode,source_reference_id,status,tactic_id,random_seed,player_snapshot,enemy_snapshot,resolution_authority,finalization_status,official_context,enemy_tactic_id) select %s,%s,'PVP',%s,'PENDING',tactic_id,random_seed,player_snapshot,enemy_snapshot,'PVP_SERVER','PENDING',jsonb_build_object('playerRankPointsAtStart',1000,'opponentRankPointsAtStart',1000,'remainingPvpPoints',4,'qaConcurrent',%s::text),enemy_tactic_id from public.battle_replay_sessions where battle_mode='PVP' and finalization_status='FINALIZED' and resolution_authority='PVP_SERVER' order by id limit 1", (replay,user,opponent,MARKER))
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cleanup', nargs=3, metavar=('QA_USER','QA_OPPONENT','QA_REPLAY'))
    args = parser.parse_args()
    dsn = target_url()  # Fail before importing an optional driver if no approved connection.
    import psycopg
    from psycopg.types.json import Jsonb
    conns = []
    fixture = None
    executor = None
    evidence = {}
    try:
        for name in ('owner','contender','observer'):
            progress('CONNECT', connection=name)
            conns.append(psycopg.connect(dsn, autocommit=True, connect_timeout=10, sslmode='verify-full', application_name=f'{MARKER}_{name}', options='-c statement_timeout=20000 -c lock_timeout=15000'))
        a,b,observer = conns
        if args.cleanup:
            ids = [str(uuid.UUID(x)) for x in args.cleanup]
            cleanup(observer,*ids)
            print(json.dumps({'cleanup':'PASS','fixture':ids}),flush=True)
            return
        fixture = [str(uuid.uuid4()) for _ in range(3)]
        user,opponent,replay = fixture
        print(json.dumps({'fixture':fixture,'status':'STARTED'}),flush=True)
        payload = prepare(observer,*fixture)
        progress('FIXTURE_READY')
        a.execute('begin')
        b.execute('begin')
        for conn in (a,b):
            conn.execute("select set_config('request.jwt.claim.sub',%s,true),set_config('request.jwt.claims',%s,true)", (user,json.dumps({'sub':user,'role':'authenticated'})))
        pid_a = a.execute('select pg_backend_pid()').fetchone()[0]
        pid_b = b.execute('select pg_backend_pid()').fetchone()[0]
        require(pid_a != pid_b, 'Independent PostgreSQL backends are required')
        require(a.execute('select finalization_status from public.battle_replay_sessions where id=%s for update', (replay,)).fetchone()[0] == 'PENDING', 'Replay must start PENDING')
        a.execute("select pg_advisory_xact_lock(hashtextextended('ranking-season:PVP',0))")
        require(a.execute("select count(*) from public.ranking_seasons where ranking_type='PVP' and status='ACTIVE' and ends_at<=clock_timestamp()+interval '2 minutes'").fetchone()[0] == 0, 'Season is too close to expiry')
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        progress('CONTENDER_START', owner_pid=pid_a, contender_pid=pid_b)
        future = executor.submit(lambda: b.execute('select public.finalize_pvp_battle(%s,%s)', (replay,Jsonb(payload))).fetchone()[0])
        deadline = time.monotonic()+8
        while time.monotonic()<deadline:
            blockers, observed_at = observer.execute('select pg_blocking_pids(%s),clock_timestamp()', (pid_b,)).fetchone()
            if pid_a in blockers:
                evidence |= {'owner_pid':pid_a,'contender_pid':pid_b,'blocked_by_owner_at':observed_at.isoformat()}
                break
            require(not future.done(), 'Contender finished without an observed overlap')
            time.sleep(0.1)
        require('blocked_by_owner_at' in evidence, 'No database-observed concurrent lock wait; not PASS')
        progress('OVERLAP_OBSERVED', **evidence)
        progress('OWNER_FINALIZE')
        first = a.execute('select public.finalize_pvp_battle(%s,%s)', (replay,Jsonb(payload))).fetchone()[0]
        a.execute('commit')
        progress('OWNER_COMMITTED')
        second = future.result(timeout=20)
        b.execute('commit')
        progress('CONTENDER_COMMITTED')
        require(first == second, 'Concurrent callers received different receipts')
        row = observer.execute("select u.cash,u.pvp_points,coalesce((select sum(quantity) from public.user_items where user_id=u.id and item_id='RAID_POINT_TICKET'),0),(select count(*) from public.canonical_daily_activity_claims where user_id=u.id and source_ref=%s),(select daily_wins from public.pvp_ranks where user_id=u.id),(select season_wins from public.pvp_ranks where user_id=u.id),(select rank_points from public.pvp_ranks where user_id=u.id),(select count(*) from public.pvp_defense_logs where attacker_id=u.id) from public.users u where u.id=%s", (replay,user)).fetchone()
        require(row == (200,4,1,1,1,1,first['newRankPoints'],1), 'Reward / BP / claim / ranking / defense count mismatch')
        require(first['newRankPoints']==1000+first['rankDelta'], 'RATE was updated more than once')
        items = {x['itemId']:x['quantity'] for x in first['reward_items']}
        require(items == {'CASH':200,'RAID_POINT_TICKET':1} and first['rewards']['cash']==200, 'Receipt differs from assets')
        evidence |= {'same_receipt':True,'cash':row[0],'raid_ticket':row[2],'claims':row[3],'daily_wins':row[4],'season_wins':row[5],'defense_logs':row[7]}
    finally:
        close_competitors(conns[:2], executor)
        if fixture and len(conns)==3:
            cleanup(conns[2],*fixture)
            evidence['cleanup']='PASS'
        for conn in conns[2:]:
            conn.close()
    evidence['status']='PASS'
    print(json.dumps(evidence,ensure_ascii=False),flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never print libpq exceptions: they can include connection information.
        message = str(error) if isinstance(error,RuntimeError) else type(error).__name__
        print(json.dumps({'status':'NOT_PASS','reason':message}),file=sys.stderr,flush=True)
        sys.exit(1)

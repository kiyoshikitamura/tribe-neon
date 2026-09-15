import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Local PostgreSQL only: executes the actual migration, with reward integrations
// recording their inputs. Never reads connection credentials or contacts a DB.
const require = createRequire(process.env.DB_TEST_RUNTIME_DIR
  ? path.join(process.env.DB_TEST_RUNTIME_DIR, 'package.json') : import.meta.url);
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const uid = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
let sequence = 0;
const cases = [];

try {
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create table users(id uuid primary key, cash bigint not null);
    create table canonical_quest_master(version text, quest_id text, display_name text,
      difficulty text, user_exp int, reward_pool_id text, is_production_enabled boolean);
    create table user_patrols(id uuid primary key, user_id uuid, course_id text, quest_id text,
      status text, expires_at timestamptz, has_battle_event boolean, battle_resolved boolean,
      battle_result text, base_cash_snapshot bigint, hometown_bonus_snapshot jsonb,
      rewards_accrued jsonb);
    create table user_quest_first_clears(user_id uuid, quest_id text,
      primary key(user_id,quest_id));
    create table canonical_quest_reward_pool_items(version text, reward_pool_id text,
      roll_index int, probability_bp int, item_id text, quantity int);
    create table recorded_grants(user_id uuid, source text, source_key text, item_id text, quantity int,
      unique(user_id, source, source_key));
    create table recorded_xp(user_id uuid, amount int);
    create table recorded_missions(user_id uuid, event text, amount int);
    create function resolve_canonical_reward_item(text) returns text language sql as $$select $1$$;
    create function _grant_gameplay_reward_v1(uuid,text,text,text,int) returns void language sql as $$
      insert into recorded_grants values($1,$2,$3,$4,$5)
    $$;
    create function apply_user_xp(uuid,int) returns jsonb language plpgsql as $$
      begin
        insert into recorded_xp values($1,$2);
        return jsonb_build_object('level',2,'xp',$2,'leveled_up',false);
      end
    $$;
    create function evaluate_mission_progress(uuid,text,int) returns void language sql as $$
      insert into recorded_missions values($1,$2,$3)
    $$;
    insert into users values('${uid}',1000),('${other}',1000);
    insert into canonical_quest_master values
      ('2026-08-30','normal','Normal','NORMAL',20,'pool',true),
      ('2026-08-30','hard','Hard','HARD',30,'pool',true);
    insert into canonical_quest_reward_pool_items values
      ('2026-08-30','pool',1,10000,'TRAINING_DRINK',2),
      ('2026-08-30','pool',2,0,'NEVER_DROP',99);
  `);
  await db.exec(readFileSync(new URL(
    '../supabase/migrations/20260915090229_quest_victory_reward_authority.sql', import.meta.url), 'utf8'));

  const authenticate = (id) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  const createPatrol = async (difficulty, result, { resolved = true, battle = true,
    status = 'CLAIMABLE', future = false } = {}) => {
    const id = `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
    await db.query(`insert into user_patrols values($1,$2,$3,$3,$4,
      now() + ($5::int * interval '1 hour'),$6,$7,$8,100,
      '{"cash":10,"drop_bonus_bp":0,"matched":true}',null)`,
    [id, uid, difficulty, status, future ? 1 : -1, battle, resolved, result]);
    return id;
  };
  const claim = async (id) => (await db.query('select claim_patrol_rewards($1) result', [id])).rows[0].result;
  const patrol = async (id) => (await db.query('select * from user_patrols where id=$1', [id])).rows[0];
  const effects = async () => (await db.query(`select
    (select cash::int from users where id='${uid}') cash,
    (select count(*)::int from recorded_grants) grants,
    (select coalesce(sum(amount),0)::int from recorded_xp) xp,
    (select count(*)::int from user_quest_first_clears) clears,
    (select coalesce(sum(amount),0)::int from recorded_missions where event='PATROL_CLEAR') patrol_missions,
    (select coalesce(sum(amount),0)::int from recorded_missions where event='QUEST_HARD_COMPLETE_COUNT') hard_missions
  `)).rows[0];
  const rejectWithoutMutation = async (id, pattern) => {
    const beforeEffects = await effects();
    const beforePatrol = await patrol(id);
    await assert.rejects(() => claim(id), pattern);
    assert.deepEqual(await effects(), beforeEffects);
    assert.deepEqual(await patrol(id), beforePatrol);
  };

  const unauthorized = await createPatrol('normal', 'VICTORY');
  await rejectWithoutMutation(unauthorized, /authentication required/);
  await authenticate(other);
  await rejectWithoutMutation(unauthorized, /patrol not found/);
  await authenticate(uid);
  cases.push('unauthenticated and wrong owner: rejected without mutations');

  for (const difficulty of ['normal', 'hard']) {
    const defeated = await createPatrol(difficulty, 'DEFEAT');
    const before = await effects();
    const result = await claim(defeated);
    assert.equal(result.outcome, 'DEFEAT');
    assert.equal(result.cash, 0);
    assert.equal(result.xp, 0);
    assert.deepEqual(result.items, []);
    assert.equal(result.first_clear, false);
    assert.deepEqual(await effects(), before);
    const saved = await patrol(defeated);
    assert.equal(saved.status, 'COMPLETED');
    for (const key of ['outcome', 'cash', 'xp', 'items', 'first_clear']) {
      assert.deepEqual(saved.rewards_accrued[key], result[key]);
    }
    await rejectWithoutMutation(defeated, /already claimed/);
    cases.push(`${difficulty} defeat: zero rewards/first-clear/missions, slot completed, duplicate rejected`);

    // A defeat must not consume the future first victory or prevent its rewards.
    const won = await createPatrol(difficulty, 'VICTORY');
    const victory = await claim(won);
    assert.equal(victory.outcome, 'VICTORY');
    assert.equal(victory.first_clear, true);
    assert.equal(victory.cash, 110);
    const xp = difficulty === 'hard' ? 30 : 20;
    assert.equal(victory.xp, xp);
    assert.deepEqual(victory.items, [{ item_id: 'TRAINING_DRINK', quantity: 2 }]);
    assert.deepEqual(await effects(), {
      cash: before.cash + 110, grants: before.grants + 1, xp: before.xp + xp,
      clears: before.clears + 1, patrol_missions: before.patrol_missions + 1,
      hard_missions: before.hard_missions + (difficulty === 'hard' ? 1 : 0),
    });
    assert.equal((await patrol(won)).status, 'COMPLETED');
    await rejectWithoutMutation(won, /already claimed/);
    const repeat = await createPatrol(difficulty, 'VICTORY');
    assert.equal((await claim(repeat)).first_clear, false);
    cases.push(`${difficulty} victory after defeat: first-clear, CASH/items/XP, correct missions; repeat first-clear false`);
  }

  for (const result of [null, 'UNKNOWN']) {
    await rejectWithoutMutation(await createPatrol('hard', result), /outcome unavailable/);
  }
  await rejectWithoutMutation(await createPatrol('hard', 'VICTORY', { resolved: false }), /must be resolved/);
  await rejectWithoutMutation(await createPatrol('normal', 'VICTORY', { status: 'ONGOING', future: true }), /not complete/);
  cases.push('null/unknown outcome, unresolved battle, ongoing dispatch: rejected atomically');

  // Preserve historical non-battle patrol completion without granting HARD battle mission credit.
  const beforeLegacy = await effects();
  const legacy = await claim(await createPatrol('hard', null, { battle: false, resolved: false }));
  assert.equal(legacy.cash, 110);
  assert.equal((await effects()).hard_missions, beforeLegacy.hard_missions);
  cases.push('non-battle patrol compatibility: rewards preserved, HARD battle mission not credited');

  console.log(`PASS: actual claim_patrol_rewards SQL (${cases.length} scenarios)\n${cases.map(s => `- ${s}`).join('\n')}`);
  console.log('Scope: local PGlite with grant/XP/mission test doubles; no Preview/Production DB, network, or concurrency test.');
} finally {
  await db.close();
}

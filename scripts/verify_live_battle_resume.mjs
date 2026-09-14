import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/hooks/useBattle.ts', 'utf8');
const start = source.indexOf('  const resumeActiveBattleSession =');
const end = source.indexOf('\n  // バトルの初期設定', start);
const functionSource = source.slice(start, end);
const executable = ts.transpileModule(`${functionSource}\nglobalThis.resume = resumeActiveBattleSession;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

async function check({ raid = false, patrolId = null, replay = null, queryError = null } = {}) {
  const queried = [];
  const states = {};
  const warnings = [];
  const context = {
    session: { user: { id: 'self' } }, patrol: null, usingMockSupabase: false,
    tutorialStep: 'TUTORIAL_BATTLE', resumePendingRaidRoomBattle: async () => raid,
    console: { warn: (...args) => warnings.push(args) },
    serverBattleEvents: (events) => events,
    patrolSnapshotToParticipants: (snapshot) => snapshot,
    supabase: { from(table) {
      queried.push(table);
      assert.notEqual(table, 'battle_sessions', 'live resume must never access the retired table');
      const result = table === 'battle_replay_sessions'
        ? { data: replay ? [replay] : [], error: queryError }
        : { data: [], error: null };
      const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
      for (const method of ['select', 'eq', 'order', 'limit']) query[method] = () => query;
      return query;
    } },
  };
  for (const [, setter] of functionSource.matchAll(/\b(set[A-Z]\w*)\(/g)) context[setter] = (value) => { states[setter] = value; };
  for (const [, ref] of functionSource.matchAll(/\b(\w+Ref)\.current/g)) context[ref] = { current: null };
  vm.createContext(context);
  vm.runInContext(executable, context);
  const resumed = await context.resume(patrolId);
  return { resumed, queried, states, warnings };
}
assert.equal((await check()).resumed, false);
const raid = await check({ raid: true, patrolId: 'patrol' });
assert.equal(raid.resumed, true);
assert.equal(raid.queried.length, 0, 'Raid recovery takes priority over Quest');
const absent = await check({ patrolId: 'patrol' });
assert.equal(absent.resumed, false);
assert.deepEqual(absent.queried, ['battle_replay_sessions']);
const failed = await check({ patrolId: 'patrol', queryError: { message: 'permission denied' } });
assert.equal(failed.resumed, false);
assert.equal(failed.warnings.length, 1, 'real canonical read failures remain reported');
const participant = { id: 'character', name: 'Character', stats: { spd: 1 } };
const canonical = await check({ patrolId: 'patrol', replay: {
  id: 'replay', status: 'RESOLVED', result: { winner: 'PLAYER', events: [{ type: 'RESULT' }] },
  player_snapshot: [participant], enemy_snapshot: [{ ...participant, id: 'enemy' }],
} });
assert.equal(canonical.resumed, true);
assert.equal(canonical.states.setBattleState, 'PLAYING');
assert.equal(canonical.states.setTutorialBattleActive, true);
assert.equal(canonical.states.setOfficialPatrolReplayId, 'replay');
assert.equal(canonical.states.setOfficialPatrolEventIndex, 0, 'canonical replay restarts safely after reload');
assert.deepEqual(canonical.queried, ['battle_replay_sessions', 'battle_replay_events']);
console.log('Live battle resume: PASS (empty, Raid priority, missing Quest, read error, Tutorial canonical replay)');

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaidRoomController } from '../../src/domain/raidRoomClient.ts';
import { roomFixture, deferred } from './fixtures.ts';
const transport = (overrides = {}) => ({
  listRooms: async () => [roomFixture()], getRoom: async (id) => roomFixture(id),
  listParticipants: async () => [], getRewards: async () => [],
  joinRoom: async ({ roomId }) => ({ roomId, replayId: 'replay-a' }), ...overrides,
});
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('Room切替後の古い成功応答は新Roomと参加者を書き換えない', async () => {
  const old = deferred(), people = deferred();
  const c = createRaidRoomController(transport({ getRoom: (id) => id === 'old' ? old.promise : Promise.resolve(roomFixture(id)), listParticipants: (id) => id === 'old' ? people.promise : Promise.resolve([]) }));
  c.selectRoom('old'); c.selectRoom('new'); await settle();
  old.resolve(roomFixture('old')); people.resolve([{ player: { name: '古い参加者' } }]); await settle();
  assert.equal(c.getSnapshot().selectedRoomId, 'new');
  assert.equal(c.getSnapshot().room.data.roomId, 'new'); assert.deepEqual(c.getSnapshot().participants.data, []);
  c.dispose();
});

test('古い失敗応答も切替先の成功を壊さない', async () => {
  const old = deferred();
  const c = createRaidRoomController(transport({ getRoom: (id) => id === 'old' ? old.promise : Promise.resolve(roomFixture(id)) }));
  c.selectRoom('old'); c.selectRoom('new'); await settle(); old.reject(new Error('old failure')); await settle();
  assert.equal(c.getSnapshot().room.status, 'success'); assert.equal(c.getSnapshot().room.data.roomId, 'new'); c.dispose();
});

test('更新の順序逆転でも最新応答を保持する', async () => {
  const first = deferred(), second = deferred(); let count = 0;
  const c = createRaidRoomController(transport({ getRoom: () => ++count === 1 ? first.promise : second.promise }));
  c.selectRoom('room-a'); c.refreshRoom(); second.resolve(roomFixture('room-a', { participantCount: { status: 'available', value: 9 } })); await settle();
  first.resolve(roomFixture()); await settle(); assert.equal(c.getSnapshot().room.data.participantCount.value, 9); c.dispose();
});

test('取得中・未取得・参加不可を参加許可へ変換しない', async () => {
  let calls = 0;
  for (const serverEligibility of [{ status: 'unknown' }, { status: 'ineligible', evaluatedAt: '', reasons: ['unknown_server_reason'] }]) {
    const pending = deferred(); const c = createRaidRoomController(transport({ getRoom: () => pending.promise, joinRoom: async () => { calls++; return { roomId: 'room-a', replayId: 'replay-a' }; } }));
    assert.equal(await c.join(), null); c.selectRoom('room-a'); assert.equal(await c.join(), null);
    pending.resolve(roomFixture('room-a', { serverEligibility })); await settle(); assert.equal(await c.join(), null); c.dispose();
  }
  assert.equal(calls, 0);
});

test('参加連打は一要求・救援ID保持、失敗後再試行できる', async () => {
  const pending = deferred(); const requests = [];
  const c = createRaidRoomController(transport({ joinRoom: async (request) => { requests.push(request); if (requests.length === 1) return pending.promise; return { roomId: request.roomId, replayId: 'retry' }; } }));
  c.selectRoom('room-a', 'rescue-123'); await settle();
  const first = c.join(); assert.equal(c.getSnapshot().joining, true); assert.equal(await c.join(), null);
  assert.equal(requests.length, 1); pending.reject(new Error('offline')); assert.equal(await first, null);
  assert.equal(c.getSnapshot().joining, false); assert.ok(c.getSnapshot().joinError);
  assert.equal(await c.join(), null); assert.equal(requests.length, 1);
  c.refreshRoom(); await settle();
  assert.deepEqual(await c.join(), { roomId: 'room-a', replayId: 'retry' });
  assert.deepEqual(requests, [{ roomId: 'room-a', rescueId: 'rescue-123' }, { roomId: 'room-a', rescueId: 'rescue-123' }]); c.dispose();
});

test('一覧取得の失敗から再取得できる', async () => {
  let count = 0; const c = createRaidRoomController(transport({ listRooms: async () => { if (++count === 1) throw new Error('offline'); return [roomFixture()]; } }));
  await c.loadRooms(); await settle(); assert.equal(c.getSnapshot().rooms.status, 'error');
  await c.loadRooms(); await settle(); assert.equal(c.getSnapshot().rooms.status, 'success'); c.dispose();
});

test('取得失敗・dispose後に古い参加許可を利用しない', async () => {
  let count = 0, joins = 0;
  const c = createRaidRoomController(transport({ getRoom: async () => { if (++count > 1) throw new Error('offline'); return roomFixture(); }, joinRoom: async () => { joins++; return { roomId: 'room-a', replayId: 'replay-a' }; } }));
  c.selectRoom('room-a'); await settle(); c.refreshRoom(); await settle(); assert.equal(await c.join(), null);
  c.dispose(); assert.equal(await c.join(), null); assert.equal(joins, 0);
});

test('disposeは購読通知と進行中応答の反映を停止する', async () => {
  const pending = deferred(); const c = createRaidRoomController(transport({ getRoom: () => pending.promise })); let notified = 0;
  c.subscribe(() => notified++); c.selectRoom('room-a'); c.dispose(); const before = notified; const snapshot = c.getSnapshot();
  pending.resolve(roomFixture()); await settle(); assert.equal(notified, before); assert.equal(c.getSnapshot(), snapshot);
});

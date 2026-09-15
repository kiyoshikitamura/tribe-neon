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

const briefingFixture = (roomId, membershipStatus = 'not_joined') => ({
  roomId, raidBossInstanceId: 'instance-a', raidVariantId: 'boss-a', bossName: 'ボス', baseId: null,
  membershipStatus, joinEligibility: { status: 'passed', reason: 'passed', actualPower: 200000, minimumPower: 160000 }, battleStartEnabled: false,
});
test('参加登録は連打を抑止し詳細を更新、既存combinedjoinを呼ばない', async () => {
  const pending = deferred(); let calls = 0, joined = false, battleCalls = 0;
  const c = createRaidRoomController(transport({
    getBriefing: async id => briefingFixture(id, joined ? 'joined' : 'not_joined'),
    registerParticipation: async roomId => { calls++; await pending.promise; joined = true; return { roomId, membershipStatus: 'joined' }; },
    joinRoom: async () => { battleCalls++; throw new Error('not connected'); },
  }));
  await c.selectRoom('room-a');
  const first = c.registerParticipation();
  assert.equal(await c.registerParticipation(), null); assert.equal(await c.join(), null);
  pending.resolve(); assert.equal((await first).membershipStatus, 'joined');
  assert.equal(c.getSnapshot().briefing.data.membershipStatus, 'joined');
  assert.equal(calls, 1); assert.equal(battleCalls, 0); c.dispose();
});
test('参加失敗後は資格を破棄し再取得、古い登録応答で選択を戻さない', async () => {
  const pending = deferred(); let calls = 0;
  const c = createRaidRoomController(transport({
    getBriefing: async id => briefingFixture(id),
    registerParticipation: async roomId => { if (++calls === 1) throw new Error('offline'); await pending.promise; return { roomId, membershipStatus: 'already_joined' }; },
  }));
  await c.selectRoom('room-a'); assert.equal(await c.registerParticipation(), null);
  assert.equal(c.getSnapshot().briefing.status, 'idle'); assert.equal(await c.registerParticipation(), null);
  await c.refreshRoom(); const registration = c.registerParticipation(); await c.selectRoom('room-b');
  pending.resolve(); assert.equal(await registration, null);
  assert.equal(c.getSnapshot().briefing.data.roomId, 'room-b'); c.dispose();
});

test('救援帰属未接続では登録RPCへ救援IDを黙って捨てて送らない', async () => {
  let calls = 0;
  const c = createRaidRoomController(transport({ getBriefing: async id => briefingFixture(id),
    registerParticipation: async roomId => { calls++; return { roomId, membershipStatus: 'joined' }; } }));
  await c.selectRoom('room-a', 'rescue-a');
  assert.equal(await c.registerParticipation(), null); assert.equal(calls, 0);
  assert.match(c.getSnapshot().registrationError, /救援/); c.dispose();
});
test('作成した主催Roomもbriefingと参加者を取得する', async () => {
  const c = createRaidRoomController(transport({ listBossChoices: async () => [],
    createRoom: async request => roomFixture('created', { difficultyId: request.difficultyId }),
    getBriefing: async id => briefingFixture(id, 'joined'),
    registerParticipation: async roomId => ({ roomId, membershipStatus: 'already_joined' }) }));
  await c.createRoom('intermediate', 'boss-a');
  assert.equal(c.getSnapshot().briefing.data.roomId, 'created');
  assert.equal(c.getSnapshot().briefing.data.membershipStatus, 'joined');
  assert.equal(c.getSnapshot().participants.status, 'success'); c.dispose();
});
test('公開Room未参加では参加者APIを呼ばず、登録後にだけ取得する', async () => {
  let joined = false, calls = 0;
  const c = createRaidRoomController(transport({
    getBriefing: async id => briefingFixture(id, joined ? 'joined' : 'not_joined'),
    listParticipants: async () => { calls++; return []; },
    registerParticipation: async roomId => { joined = true; return { roomId, membershipStatus: 'joined' }; },
  }));
  await c.selectRoom('room-a'); assert.equal(calls, 0); assert.equal(c.getSnapshot().participants.status, 'idle');
  await c.registerParticipation(); assert.equal(calls, 1); c.dispose();
});
test('救援リンク選択からの参加は通常登録を使わず救援IDを保持',async()=>{
 const calls=[];const c=createRaidRoomController(transport({getBriefing:async id=>briefingFixture(id),registerParticipation:async(roomId)=>{calls.push({roomId,normal:true});return {roomId,membershipStatus:'joined'};},registerRescueParticipation:async(roomId,rescueId)=>{calls.push({roomId,rescueId});return {roomId,membershipStatus:'joined'};}}));
 try{await c.selectRoom('room-a','rescue-a');assert.equal((await c.registerParticipation()).membershipStatus,'joined');assert.deepEqual(calls,[{roomId:'room-a',rescueId:'rescue-a'}]);await c.selectRoom('room-b');await c.registerParticipation();assert.deepEqual(calls[1],{roomId:'room-b',normal:true});}finally{c.dispose();}
});

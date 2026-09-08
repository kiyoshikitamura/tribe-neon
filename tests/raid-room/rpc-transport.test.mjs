import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaidRoomRpcTransport } from '../../src/domain/raidRoomRpcTransport.ts';
import { roomFixture, participantFixture, rewardFixture } from './fixtures.ts';
const clientFor = (data) => ({ rpc: async () => ({ data, error: null }) });

test('list RPC は全ページを取り込み、呼出し名と offset を維持する', async () => {
  const calls = [];
  const transport = createRaidRoomRpcTransport({ rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: args.p_offset === 0 ? { rooms: [roomFixture('a')], nextOffset: 1 } : { rooms: [roomFixture('b')], nextOffset: null }, error: null };
  } });
  assert.deepEqual((await transport.listRooms()).map(r => r.roomId), ['a', 'b']);
  assert.equal(calls[0].name, 'list_raid_rooms_v1');
  assert.deepEqual(calls.map(c => c.args.p_offset), [0, 1]);
});

test('detail は RPC 応答を受理し serverEligibility unknown を保持する', async () => {
  const room = roomFixture('room-a', { serverEligibility: { status: 'unknown' } });
  const calls = [];
  const transport = createRaidRoomRpcTransport({ rpc: async (...args) => { calls.push(args); return { data: room, error: null }; } });
  assert.deepEqual(await transport.getRoom('room-a'), room);
  assert.equal(calls[0][0], 'get_raid_room_v1');
  assert.equal(calls[0][1].p_room_id, 'room-a');
});

test('参加者 RPC は raw/applied と現在所属/戦闘所属を別々に保持する', async () => {
  const transport = createRaidRoomRpcTransport(clientFor({ participants: [participantFixture], nextOffset: null }));
  const [p] = await transport.listParticipants('room-a');
  assert.equal(p.rawDamage.value, 16000); assert.equal(p.appliedDamage.value, 15000);
  assert.equal(p.currentGuild.value.guildId, 'guild-now'); assert.equal(p.battleGuildSnapshot.value.guildId, 'guild-then');
});

test('不正 DTO・別 Room 応答を拒否する', async () => {
  const invalid = [null, {}, roomFixture('other'), roomFixture('room-a', { difficultyId: 'normal' }),
    roomFixture('room-a', { hp: { status: 'available', value: { current: -1, max: 10 } } }),
    roomFixture('room-a', { createdAt: { status: 'available', value: 'invalid-date' } }),
    roomFixture('room-a', { serverEligibility: { status: 'eligible' } })];
  for (const data of invalid) await assert.rejects(createRaidRoomRpcTransport(clientFor(data)).getRoom('room-a'));
  await assert.rejects(createRaidRoomRpcTransport(clientFor({ participants: [{ ...participantFixture, roomId: 'other' }], nextOffset: null })).listParticipants('room-a'));
});

test('RPC error・不正ページ・循環ページを空成功に変換しない', async () => {
  await assert.rejects(createRaidRoomRpcTransport({ rpc: async () => ({ data: null, error: { message: 'permission denied' } }) }).listRooms());
  for (const data of [{ rooms: [] }, { rooms: [], nextOffset: -1 }, { rooms: [roomFixture()], nextOffset: 0 }]) {
    await assert.rejects(createRaidRoomRpcTransport(clientFor(data)).listRooms());
  }
});

test('参加・報酬の未接続は明示失敗し RPC を呼ばない', async () => {
  let calls = 0;
  const transport = createRaidRoomRpcTransport({ rpc: async () => { calls++; return { data: null, error: null }; } });
  await assert.rejects(transport.joinRoom({ roomId: 'room-a' }));
  await assert.rejects(transport.getRewards('room-a')); assert.equal(calls, 0);
});

test('注入された参加・報酬 authority を利用し rescueId と確定 Replay を保持する', async () => {
  const requests = [];
  const transport = createRaidRoomRpcTransport(clientFor(null), {
    joinRoom: async request => { requests.push(request); return { roomId: request.roomId, replayId: 'server-replay' }; },
    getRewards: async roomId => { assert.equal(roomId, 'room-a'); return [rewardFixture]; },
  });
  assert.deepEqual(await transport.joinRoom({ roomId: 'room-a', rescueId: 'rescue-a' }), { roomId: 'room-a', replayId: 'server-replay' });
  assert.equal(requests[0].rescueId, 'rescue-a'); assert.deepEqual(await transport.getRewards('room-a'), [rewardFixture]);
});

test('注入 authority の別 Room・空 Replay・負報酬を拒否する', async () => {
  for (const result of [{ roomId: 'other', replayId: 'r' }, { roomId: 'room-a', replayId: '' }]) {
    await assert.rejects(createRaidRoomRpcTransport(clientFor(null), { joinRoom: async () => result }).joinRoom({ roomId: 'room-a' }));
  }
  await assert.rejects(createRaidRoomRpcTransport(clientFor(null), { getRewards: async () => [{ ...rewardFixture, quantity: -1 }] }).getRewards('room-a'));
});

test('ineligible空reasonsを保持し、eligibleへ矛盾理由を混入した応答を拒否',async()=>{
  const eligibility={status:'ineligible',evaluatedAt:'2026-09-08T00:00:00Z',reasons:[]};
  assert.deepEqual((await createRaidRoomRpcTransport(clientFor(roomFixture('room-a',{serverEligibility:eligibility}))).getRoom('room-a')).serverEligibility,eligibility);
  await assert.rejects(createRaidRoomRpcTransport(clientFor(roomFixture('room-a',{serverEligibility:{status:'eligible',evaluatedAt:'2026-09-08T00:00:00Z',reasons:['denied']}}))).getRoom('room-a'));
});

test('生成は明示opt-in、契約キーを送り未接続参加を成功にしない', async () => {
  assert.equal(createRaidRoomRpcTransport(clientFor(null)).createRoom, undefined);
  const calls = [];
  const transport = createRaidRoomRpcTransport({ rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: name === 'list_raid_room_boss_choices_v1' ? { choices: [{ raidVariantId: 'boss-a', name: 'ボス' }] } : roomFixture(), error: null };
  } }, { enableCreation: true });
  assert.deepEqual(await transport.listBossChoices(), [{ raidVariantId: 'boss-a', name: 'ボス' }]);
  const request = { difficultyId: 'intermediate', raidVariantId: 'boss-a', requestId: 'request-a' };
  assert.equal((await transport.createRoom(request)).roomId, 'room-a');
  assert.deepEqual(calls[1], { name: 'create_raid_room_v1', args: { p_difficulty_id: 'intermediate', p_raid_variant_id: 'boss-a', p_request_id: 'request-a' } });
  await assert.rejects(transport.joinRoom({ roomId: 'room-a' }));
});

test('生成の停止エラー・不正DTO・候補重複は成功にしない', async () => {
  const disabled = createRaidRoomRpcTransport({ rpc: async () => ({ data: null, error: { code: '55000' } }) }, { enableCreation: true });
  await assert.rejects(disabled.createRoom({ difficultyId: 'beginner', raidVariantId: 'a', requestId: 'r' }));
  await assert.rejects(createRaidRoomRpcTransport(clientFor({}), { enableCreation: true }).createRoom({ difficultyId: 'beginner', raidVariantId: 'a', requestId: 'r' }));
  await assert.rejects(createRaidRoomRpcTransport(clientFor({ choices: [{ raidVariantId: 'a', name: 'A' }, { raidVariantId: 'a', name: 'B' }] }), { enableCreation: true }).listBossChoices());
});

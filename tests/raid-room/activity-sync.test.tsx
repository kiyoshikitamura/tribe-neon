import React from 'react';
import RaidRoomConnectedBrowser from '../../src/app/components/raid/RaidRoomConnectedBrowser';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, cleanup, renderHook, waitFor, render, fireEvent } from '@testing-library/react';
import { createRaidRoomActivityTracker } from '../../src/domain/raidRoomActivitySync';
import { useRaidRoomActivity } from '../../src/app/context/hooks/useRaidRoomActivity';
import type { RaidRoomTransport } from '../../src/domain/raidRoomClient';
import type { RaidRoomDto } from '../../src/domain/raidRoom';
import { deferred, roomFixture } from './fixtures';

afterEach(cleanup);
const now = Date.parse('2026-09-08T12:00:00Z');
const expiry = Date.parse('2026-09-09T00:00:00Z');
const active = roomFixture();
const ended = roomFixture('room-a', { state: { status: 'available', value: 'cleared' } });
function transport(overrides: Partial<RaidRoomTransport> = {}): RaidRoomTransport {
  return { listRooms: async () => [active], getRoom: async () => active,
    listParticipants: async () => [], getRewards: async () => [],
    joinRoom: async () => ({ roomId: 'room-a', replayId: 'replay-a' }), ...overrides };
}
test('一覧・作成・詳細の成功応答で通知を更新し、購読解除後は通知しない', async () => {
  const tracker = createRaidRoomActivityTracker(() => true, () => now);
  let notices = 0; const stop = tracker.subscribe(() => notices++);
  const observed = tracker.observeTransport(transport({ listRooms: async () => [], createRoom: async () => active, getRoom: async () => ended }));
  await observed.listRooms(); assert.equal(tracker.getSnapshot(), 0);
  const created = await observed.createRoom!({ difficultyId: 'intermediate', raidVariantId: 'boss', requestId: 'request' });
  assert.equal(created, active); assert.equal(tracker.getSnapshot(), expiry);
  await observed.getRoom('room-a'); assert.equal(tracker.getSnapshot(), 0); assert(notices >= 2);
  stop(); const before = notices; await tracker.observeTransport(transport()).listRooms(); assert.equal(notices, before);
});
test('再取得した空一覧は既存開催通知を解除する', async () => {
  const tracker = createRaidRoomActivityTracker(() => true, () => now);
  await tracker.observeTransport(transport()).listRooms();
  await tracker.observeTransport(transport({ listRooms: async () => [] })).listRooms();
  assert.equal(tracker.getSnapshot(), 0);
});
test('取得・作成失敗は直前の成功通知を保ち、元の失敗を呼出元へ返す', async () => {
  const tracker = createRaidRoomActivityTracker(() => true, () => now);
  await tracker.observeTransport(transport()).listRooms();
  const fail = async (): Promise<never> => { throw new Error('network'); };
  const observed = tracker.observeTransport(transport({ listRooms: fail, getRoom: fail, createRoom: fail }));
  for (const call of [() => observed.listRooms(), () => observed.getRoom('room-a'), () => observed.createRoom!({ difficultyId: 'beginner', raidVariantId: 'boss', requestId: 'r' })]) {
    await assert.rejects(call, /network/); assert.equal(tracker.getSnapshot(), expiry);
  }
});
test('後発の詳細終了が先着した後に古い一覧が届いても開催通知を復活させない', async () => {
  const tracker = createRaidRoomActivityTracker(() => true, () => now);
  const old = deferred<readonly RaidRoomDto[]>();
  const observed = tracker.observeTransport(transport({ listRooms: () => old.promise, getRoom: async () => ended }));
  const pending = observed.listRooms(); await observed.getRoom('room-a');
  old.resolve([active]); await pending; assert.equal(tracker.getSnapshot(), 0);
});
test('後発一覧で終了確認後に古い詳細が届いても開催通知を復活させない', async () => {
  const tracker = createRaidRoomActivityTracker(() => true, () => now);
  const old = deferred<RaidRoomDto>();
  const observed = tracker.observeTransport(transport({ getRoom: () => old.promise, listRooms: async () => [] }));
  const pending = observed.getRoom('room-a'); await observed.listRooms();
  old.resolve(active); await pending; assert.equal(tracker.getSnapshot(), 0);
});
test('期限境界・HP0・不明情報は通知対象外、他の開催Roomは維持する', async () => {
  const tracker = createRaidRoomActivityTracker(() => true, () => now);
  await tracker.observeTransport(transport({ listRooms: async () => [active,
    roomFixture('expiry', { expiresAt: { status: 'available', value: new Date(now).toISOString() } }),
    roomFixture('zero', { hp: { status: 'available', value: { current: 0, max: 100 } } }),
    roomFixture('unknown', { state: { status: 'unknown' } })] })).listRooms();
  assert.equal(tracker.getSnapshot(), expiry);
});
test('観測対象外の参加・報酬・戦闘導線はそのまま委譲する', async () => {
  const receipt = { roomId: 'room-a', replayId: 'r' }; let joins = 0;
  const observed = createRaidRoomActivityTracker().observeTransport(transport({ joinRoom: async request => { assert.equal(request.roomId, 'room-a'); joins++; return receipt; } }));
  assert.equal(await observed.joinRoom({ roomId: 'room-a' }), receipt); assert.equal(joins, 1);
  assert.deepEqual(await observed.getRewards('room-a'), []); assert.deepEqual(await observed.listParticipants('room-a'), []);
});
test('実hookはaccount切替で即座に通知を消し旧accountの遅延成功を破棄する', async () => {
  const view = renderHook(({ user }) => useRaidRoomActivity(user, true), { initialProps: { user: 'A' } });
  const later = roomFixture('room-a', { expiresAt: { status: 'available', value: new Date(Date.now() + 60000).toISOString() } });
  const old = deferred<RaidRoomDto>();
  const observed = view.result.current.tracker.observeTransport(transport({ listRooms: async () => [later], getRoom: () => old.promise }));
  await act(async () => { await observed.listRooms(); }); assert.equal(view.result.current.isActive, true);
  const pending = observed.getRoom('room-a'); view.rerender({ user: 'B' }); assert.equal(view.result.current.isActive, false);
  await act(async () => { old.resolve(later); await pending; }); assert.equal(view.result.current.isActive, false);
});
test('実hookは運用表示OFF・ログアウトで通知を解除する', async () => {
  const view = renderHook(({ user, enabled }) => useRaidRoomActivity(user, enabled), { initialProps: { user: 'A' as string | undefined, enabled: true } });
  const later = roomFixture('room-a', { expiresAt: { status: 'available', value: new Date(Date.now() + 60000).toISOString() } });
  await act(async () => { await view.result.current.tracker.observeTransport(transport({ listRooms: async () => [later] })).listRooms(); });
  assert.equal(view.result.current.isActive, true); view.rerender({ user: 'A', enabled: false }); assert.equal(view.result.current.isActive, false);
  view.rerender({ user: undefined, enabled: true }); assert.equal(view.result.current.isActive, false);
});
test('実hookは追加取得なしで最終開催Roomの期限到達時に通知を解除する', async () => {
  const view = renderHook(() => useRaidRoomActivity('A', true)); let reads = 0;
  const soon = roomFixture('room-a', { expiresAt: { status: 'available', value: new Date(Date.now() + 200).toISOString() } });
  await act(async () => { await view.result.current.tracker.observeTransport(transport({ listRooms: async () => { reads++; return [soon]; } })).listRooms(); });
  assert.equal(view.result.current.isActive, true);
  await waitFor(() => assert.equal(view.result.current.isActive, false)); assert.equal(reads, 1);
});

test('作成待ちの間に空一覧が確定しても作成成功で開催通知が有効になる', async () => {
  const tracker = createRaidRoomActivityTracker(() => true, () => now);
  const created = deferred<RaidRoomDto>();
  const observed = tracker.observeTransport(transport({ createRoom: () => created.promise, listRooms: async () => [] }));
  const pending = observed.createRoom!({ difficultyId: 'intermediate', raidVariantId: 'boss', requestId: 'r' });
  await observed.listRooms(); assert.equal(tracker.getSnapshot(), 0);
  created.resolve(active); await pending; assert.equal(tracker.getSnapshot(), expiry);
});
test('作成receiptより新しい同Roomの終了詳細を受信済みなら開催に戻さない', async () => {
  const tracker = createRaidRoomActivityTracker(() => true, () => now);
  const created = deferred<RaidRoomDto>();
  const observed = tracker.observeTransport(transport({ createRoom: () => created.promise, getRoom: async () => ended }));
  const pending = observed.createRoom!({ difficultyId: 'intermediate', raidVariantId: 'boss', requestId: 'r' });
  await observed.getRoom('room-a'); created.resolve(active); await pending;
  assert.equal(tracker.getSnapshot(), 0);
});

test('実ConnectedBrowserの初回一覧・更新・戦闘終了revisionが通知へ接続される', async () => {
  const tracker = createRaidRoomActivityTracker(() => true, () => now);
  let rooms: RaidRoomDto[] = [active]; const calls: string[] = [];
  const rpcClient = { rpc: async (name: string) => { calls.push(name); assert.equal(name, 'list_raid_rooms_v1'); return { data: { rooms, nextOffset: null }, error: null }; } };
  const props = { rpcClient, activityTracker: tracker, userId: 'A', onBattleReady() {}, setInteractionBlocking() {} };
  const view = render(<RaidRoomConnectedBrowser {...props} refreshRevision={0}/>);
  await waitFor(() => assert.equal(tracker.getSnapshot(), expiry));
  rooms = []; fireEvent.click(view.getByRole('button', { name: '更新' }));
  await waitFor(() => assert.equal(tracker.getSnapshot(), 0));
  rooms = [active]; view.rerender(<RaidRoomConnectedBrowser {...props} refreshRevision={1}/>);
  await waitFor(() => assert.equal(tracker.getSnapshot(), expiry));
  assert.equal(calls.length, 3);
});

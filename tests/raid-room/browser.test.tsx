/** JSDOM操作テスト。GameContextだけrunnerで差し替え、実共通UIを使用する。 */
import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { render, fireEvent, waitFor, cleanup, act, within } from '@testing-library/react';
import RaidRoomBrowser from '../../src/app/components/raid/RaidRoomBrowser';
import { createRaidRoomController, type RaidRoomTransport } from '../../src/domain/raidRoomClient';
import { roomFixture, participantFixture, rewardFixture, deferred } from './fixtures';

function harness(overrides: Partial<RaidRoomTransport> = {}, onBattle?: () => void | Promise<void>) {
  const room = roomFixture();
  const transport: RaidRoomTransport = {
    listRooms: async () => [room], getRoom: async () => room,
    listParticipants: async () => [participantFixture], getRewards: async () => [rewardFixture],
    joinRoom: async ({ roomId }) => ({ roomId, replayId: 'replay-a' }), ...overrides,
  };
  const controller = createRaidRoomController(transport);
  const blocking: boolean[] = []; const battles: unknown[] = [];
  const ui = render(<RaidRoomBrowser controller={controller} resolveRewardName={(id) => id === "TEST_ITEM" ? "検証報酬" : null} onBattleReady={async (value) => { battles.push(value); await onBattle?.(); }} setInteractionBlocking={(value) => { blocking.push(value); }} />);
  return { ui, controller, blocking, battles, close() { cleanup(); controller.dispose(); } };
}
async function openRoom(h: ReturnType<typeof harness>) {
  await waitFor(() => assert.equal(h.controller.getSnapshot().rooms.status, 'success'));
  fireEvent.click(h.ui.getByRole('tab', { name: '中級' }));
  fireEvent.click(await h.ui.findByRole('button', { name: 'Roomを開く' }));
  await waitFor(() => assert.equal(h.controller.getSnapshot().room.status, 'success'));
}

test('難度選択→Room→参加者と報酬ダイアログ→参加でReplay参照を引き渡す', async () => {
  const h = harness();
  try {
    await openRoom(h);
    assert.match(h.ui.container.textContent ?? '', /160,000/);
    fireEvent.click(h.ui.getByRole('button', { name: '参加者一覧' }));
    await h.ui.findByText('救援メンバー');
    fireEvent.click(h.ui.getAllByRole('button', { name: '閉じる' }).at(-1)!);
    fireEvent.click(h.ui.getByRole('button', { name: '報酬' }));
    const dialog = await h.ui.findByRole('dialog');
    assert.match(dialog.textContent ?? '', /検証報酬/);
    fireEvent.click(within(dialog).getAllByRole('button', { name: '閉じる' }).at(-1)!);
    fireEvent.click(h.ui.getByRole('button', { name: '参加する' }));
    await waitFor(() => assert.deepEqual(h.battles, [{ roomId: 'room-a', replayId: 'replay-a' }]));
    assert.ok(h.blocking.includes(true)); assert.equal(h.blocking.at(-1), false);
  } finally { h.close(); }
});

test('通信待ちは文字ラベルなし、二重タップしても参加要求は一度', async () => {
  const pending = deferred<{ roomId: string; replayId: string }>(); let calls = 0;
  const h = harness({ joinRoom: async () => { calls++; return pending.promise; } });
  try {
    await openRoom(h); const button = h.ui.getByRole('button', { name: '参加する' });
    fireEvent.click(button); fireEvent.click(button);
    assert.equal(calls, 1); assert.doesNotMatch(h.ui.container.textContent ?? '', /Now Loading|読み込み中/);
    await act(async () => pending.resolve({ roomId: 'room-a', replayId: 'replay-a' }));
    await waitFor(() => assert.equal(h.battles.length, 1));
    assert.equal(h.blocking.at(-1), false);
  } finally { h.close(); }
});

test('参加失敗から再試行でき、処理ブロックを解除する', async () => {
  let calls = 0;
  const h = harness({ joinRoom: async () => { if (++calls === 1) throw new Error('offline'); return { roomId: 'room-a', replayId: 'retry' }; } });
  try {
    await openRoom(h); fireEvent.click(h.ui.getByRole('button', { name: '参加する' }));
    await waitFor(() => { assert.ok(h.controller.getSnapshot().joinError); assert.equal(h.blocking.at(-1), false); });
    fireEvent.click(h.ui.getByRole('button', { name: '更新' }));
    await waitFor(() => assert.equal(h.controller.getSnapshot().room.status, 'success'));
    fireEvent.click(h.ui.getByRole('button', { name: '参加する' }));
    await waitFor(() => assert.equal(h.battles.length, 1)); assert.equal(calls, 2);
  } finally { h.close(); }
});

test('未取得の参加資格を推奨値で許可せず、更新してサーバー許可を反映する', async () => {
  let count = 0;
  const h = harness({ getRoom: async () => roomFixture('room-a', { serverEligibility: ++count === 1 ? { status: 'unknown' } : { status: 'eligible', evaluatedAt: '2026-09-08T00:00:00Z' } }) });
  try {
    await openRoom(h);
    assert.equal(h.ui.queryByRole('button', { name: '参加する' }), null);
    assert.equal(h.battles.length, 0);
    fireEvent.click(h.ui.getByRole('button', { name: '更新' }));
    await waitFor(() => assert.equal((h.ui.getByRole('button', { name: '参加する' }) as HTMLButtonElement).disabled, false));
  } finally { h.close(); }
});


test('画面遷移だけ失敗した場合は同じReplayを開き直し、参加を再送しない', async () => {
  let joins = 0, transitions = 0;
  const h = harness({ joinRoom: async () => { joins++; return { roomId: 'room-a', replayId: 'fixed-replay' }; } }, async () => { if (++transitions === 1) throw new Error('navigation failed'); });
  try {
    await openRoom(h); fireEvent.click(h.ui.getByRole('button', { name: '参加する' }));
    const retry = await h.ui.findByRole('button', { name: 'バトル画面を開く' });
    fireEvent.click(retry);
    await waitFor(() => assert.equal(transitions, 2));
    assert.equal(joins, 1); assert.deepEqual(h.battles[0], h.battles[1]);
    await waitFor(() => assert.equal(h.blocking.at(-1), false));
  } finally { h.close(); }
});

test('Room一覧の空と通信失敗を別表示し、失敗を空一覧に変換しない', async () => {
  let count = 0;
  const h = harness({ listRooms: async () => { if (++count > 1) throw new Error('offline'); return []; } });
  try {
    await h.ui.findByText('この難易度のRoomはありません。');
    assert.equal(h.ui.queryByRole('alert'), null);
    fireEvent.click(h.ui.getByRole('button', { name: '更新' }));
    const alert = await h.ui.findByRole('alert');
    assert.match(alert.textContent ?? '', /一覧を取得できません/);
    assert.equal(h.ui.queryByText('この難易度のRoomはありません。'), null);
  } finally { h.close(); }
});

test('終了Roomはサーバー資格がeligibleでも参加操作を出さない', async () => {
  let joins = 0;
  const h = harness({ getRoom: async () => roomFixture('room-a', { state: { status: 'available', value: 'expired' } }), joinRoom: async () => { joins++; return { roomId: 'room-a', replayId: 'invalid' }; } });
  try {
    await openRoom(h);
    const button = h.ui.getByRole('button', { name: 'このRoomは終了しました' });
    assert.equal((button as HTMLButtonElement).disabled, true);
    fireEvent.click(button); assert.equal(joins, 0);
  } finally { h.close(); }
});

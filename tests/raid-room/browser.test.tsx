/** JSDOM操作テスト。GameContextだけrunnerで差し替え、実共通UIを使用する。 */
import React from 'react';
import test, { beforeEach, afterEach } from 'node:test';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import assert from 'node:assert/strict';
import { render, fireEvent, waitFor, cleanup, act, within } from '@testing-library/react';
import OutlawButton from '../../src/app/components/ui/OutlawButton';
import RaidRoomBrowser from '../../src/app/components/raid/RaidRoomBrowser';
import { createRaidRoomController, type RaidRoomTransport } from '../../src/domain/raidRoomClient';
import { getRaidRoomLifecyclePresentation } from '../../src/domain/raidRoomLifecyclePresentation';
import { RaidRoomStoppedError } from '../../src/domain/raidRoomErrors';
import { roomFixture, participantFixture, rewardFixture, deferred } from './fixtures';

const fixtureNow = Date.parse('2026-09-08T00:00:00Z');
const originalNow = Date.now;
let clockNow = fixtureNow;
beforeEach(() => { clockNow = fixtureNow; Date.now = () => clockNow; window.localStorage.clear(); });
afterEach(() => { Date.now = originalNow; });

function harness(overrides: Partial<RaidRoomTransport> = {}, onBattle?: () => void | Promise<void>) {
  const room = roomFixture();
  const transport: RaidRoomTransport = {
    listRooms: async () => [room], getRoom: async () => room,
    listParticipants: async () => [participantFixture], getRewards: async () => [rewardFixture],
    joinRoom: async ({ roomId }) => ({ roomId, replayId: 'replay-a' }), ...overrides,
  };
  const controller = createRaidRoomController(transport);
  const blocking: boolean[] = []; const battles: unknown[] = [];
  const ui = render(<RaidRoomBrowser controller={controller} currentUserId="owner" resolveRewardName={(id) => id === "TEST_ITEM" ? "検証報酬" : null} onBattleReady={async (value) => { battles.push(value); await onBattle?.(); }} setInteractionBlocking={(value) => { blocking.push(value); }} />);
  return { ui, controller, blocking, battles, close() { cleanup(); controller.dispose(); } };
}
async function openRoom(h: ReturnType<typeof harness>) {
  await waitFor(() => assert.equal(h.controller.getSnapshot().rooms.status, 'success'));
  fireEvent.click(h.ui.getByRole('tab', { name: '中級' }));
  assert.match(h.ui.container.textContent ?? '', /160,000/);
  fireEvent.click(await h.ui.findByRole('button', { name: 'レイドを開く' }));
  await waitFor(() => assert.equal(h.controller.getSnapshot().room.status, 'success'));
}

test('難度選択→Room→参加者と報酬ダイアログ→参加でReplay参照を引き渡す', async () => {
  const h = harness();
  try {
    await openRoom(h);

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
    assert.equal(calls, 1); assert.doesNotMatch(h.ui.container.textContent ?? '', /Now Loading|読み込み中|処理中/);
    assertSpinnerOnly(button);
    assert.equal(h.ui.getByRole('button', { name: '参加する' }), button);
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
    await h.ui.findByText('この難易度のレイドはありません。');
    assert.equal(h.ui.queryByRole('alert'), null);
    fireEvent.click(h.ui.getByRole('button', { name: '更新' }));
    const alert = await h.ui.findByRole('alert');
    assert.match(alert.textContent ?? '', /一覧を取得できません/);
    assert.equal(h.ui.queryByText('この難易度のレイドはありません。'), null);
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

function assertSpinnerOnly(button: HTMLElement) {
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal((button as HTMLButtonElement).disabled, true);
  assert.equal(button.textContent, '');
  assert.ok(button.querySelector('.spinner[aria-hidden="true"]'));
}

test('同期の難度・参加者・報酬操作もspinnerのみで操作名を維持する', async () => {
  const h = harness();
  try {
    await waitFor(() => assert.equal(h.controller.getSnapshot().rooms.status, 'success'));
    const tab = h.ui.getByRole('tab', { name: '中級' });
    fireEvent.click(tab);
    assertSpinnerOnly(tab);
    assert.equal(h.ui.getByRole('tab', { name: '中級' }), tab);
    assert.match(h.ui.container.textContent ?? '', /160,000/);
  fireEvent.click(await h.ui.findByRole('button', { name: 'レイドを開く' }));
    await waitFor(() => assert.equal(h.controller.getSnapshot().room.status, 'success'));
    for (const name of ['参加者一覧', '報酬']) {
      const button = h.ui.getByRole('button', { name });
      fireEvent.click(button);
      assertSpinnerOnly(button);
      assert.equal(h.ui.getByRole('button', { name }), button);
      const dialog = h.ui.getByRole('dialog');
      fireEvent.click(within(dialog).getAllByRole('button', { name: '閉じる' }).at(-1)!);
    }
  } finally { h.close(); }
});

test('一覧更新待ちはspinnerのみで操作名を維持し連打を抑止する', async () => {
  const pending = deferred<ReturnType<typeof roomFixture>[]>(); let calls = 0;
  const h = harness({ listRooms: async () => ++calls === 1 ? [roomFixture()] : pending.promise });
  try {
    await waitFor(() => assert.equal(h.controller.getSnapshot().rooms.status, 'success'));
    const button = h.ui.getByRole('button', { name: '更新' });
    fireEvent.click(button); fireEvent.click(button);
    assert.equal(calls, 2);
    assertSpinnerOnly(button);
    assert.equal(h.ui.getByRole('button', { name: '更新' }), button);
    await act(async () => pending.resolve([roomFixture()]));
    await waitFor(() => assert.equal(button.getAttribute('aria-busy'), 'false'));
    assert.equal(button.textContent, '更新');
  } finally { h.close(); }
});

test('共通ボタンは未指定の既定ラベルと明示ラベルを維持し空文字だけspinnerにする', () => {
  const ui = render(<>
    <OutlawButton isLoading aria-label="既定">操作</OutlawButton>
    <OutlawButton isLoading loadingLabel="保存待ち" aria-label="明示">操作</OutlawButton>
    <OutlawButton isLoading loadingLabel="" aria-label="文字なし">操作</OutlawButton>
  </>);
  try {
    assert.equal(ui.getByRole('button', { name: '既定' }).textContent, '処理中…');
    assert.equal(ui.getByRole('button', { name: '明示' }).textContent, '保存待ち');
    assertSpinnerOnly(ui.getByRole('button', { name: '文字なし' }));
  } finally { cleanup(); }
});


test('期限直前・一致・直後と未取得時計を区別し、DTOの状態を書き換えない', () => {
  const room = roomFixture();
  const expiry = Date.parse('2026-09-09T00:00:00Z');
  assert.equal(getRaidRoomLifecyclePresentation(room, fixtureNow).remainingLabel, '残り 24時間0分');
  assert.equal(getRaidRoomLifecyclePresentation(room, expiry - 1).remainingLabel, '残り 1分');
  assert.equal(getRaidRoomLifecyclePresentation(room, expiry - 1).blockJoin, false);
  for (const now of [expiry, expiry + 1]) {
    const result = getRaidRoomLifecyclePresentation(room, now);
    assert.equal(result.blockJoin, true);
    assert.equal(result.stateLabel, '終了状態の確認が必要');
  }
  assert.equal(getRaidRoomLifecyclePresentation(room, null).blockJoin, true);
  assert.deepEqual(room.state, { status: 'available', value: 'active' });
});

test('古いactive DTOの期限通過後は更新を案内し、参加要求を送信しない', async () => {
  const h = harness({ getRoom: async () => roomFixture('room-a', { expiresAt: { status: 'available', value: new Date(fixtureNow).toISOString() } }) });
  try {
    await openRoom(h);
    const button = h.ui.getByRole('button', { name: 'Roomを更新してください' });
    assert.equal((button as HTMLButtonElement).disabled, true);
    assert.ok(h.ui.getByText('期限を過ぎました。更新してください。'));
    fireEvent.click(button);
    assert.equal(h.battles.length, 0);
    assert.deepEqual(h.controller.getSnapshot().room.data?.state, { status: 'available', value: 'active' });
  } finally { h.close(); }
});

test('時計更新前の期限通過でも参加クリック時に再確認し送信を抑止する', async () => {
  let joins = 0;
  const h = harness({ joinRoom: async () => { joins++; return { roomId: 'room-a', replayId: 'invalid' }; } });
  try {
    await openRoom(h);
    const button = h.ui.getByRole('button', { name: '参加する' });
    clockNow = Date.parse('2026-09-09T00:00:00Z');
    fireEvent.click(button);
    assert.equal(joins, 0);
    assert.equal((h.ui.getByRole('button', { name: 'Roomを更新してください' }) as HTMLButtonElement).disabled, true);
  } finally { h.close(); }
});

test('画面復帰時に残り時間を更新し期限切れを反映する', async () => {
  const h = harness();
  try {
    await openRoom(h);
    assert.ok(h.ui.getByText('残り 24時間0分'));
    clockNow += 3600000;
    act(() => { document.dispatchEvent(new window.Event('visibilitychange')); });
    assert.ok(h.ui.getByText('残り 23時間0分'));
    clockNow += 23 * 3600000;
    act(() => { document.dispatchEvent(new window.Event('visibilitychange')); });
    assert.equal((h.ui.getByRole('button', { name: 'Roomを更新してください' }) as HTMLButtonElement).disabled, true);
  } finally { h.close(); }
});

test('討伐済み・HP0・状態未知・無効期限を参加許可に変換しない', async () => {
  const cases = [
    { state: { status: 'available', value: 'cleared' }, label: 'このRoomは終了しました' },
    { hp: { status: 'available', value: { current: 0, max: 1000 } }, label: 'Roomを更新してください' },
    { state: { status: 'unknown' }, label: 'Roomの状態を確認できません' },
    { expiresAt: { status: 'unknown' }, label: 'Roomの期限を確認できません' },
    { expiresAt: { status: 'available', value: 'invalid' }, label: 'Roomの期限を確認できません' },
  ] as const;
  for (const { label, ...overrides } of cases) {
    let joins = 0;
    const h = harness({ getRoom: async () => roomFixture('room-a', overrides), joinRoom: async () => { joins++; return { roomId: 'room-a', replayId: 'invalid' }; } });
    try {
      await openRoom(h);
      const button = h.ui.getByRole('button', { name: label });
      assert.equal((button as HTMLButtonElement).disabled, true);
      fireEvent.click(button); assert.equal(joins, 0);
      if ('hp' in overrides) assert.equal(h.ui.queryByText('討伐済み'), null);
    } finally { h.close(); }
  }
});

test('SSRとhydration間で期限を跨いでも不一致なくマウント後に期限を反映する', async () => {
  const room = roomFixture();
  const controller = createRaidRoomController({
    listRooms: async () => [room], getRoom: async () => room,
    listParticipants: async () => [], getRewards: async () => [],
    joinRoom: async () => ({ roomId: 'room-a', replayId: 'unused' }),
  });
  await controller.selectRoom('room-a');
  const component = <RaidRoomBrowser controller={controller} onBattleReady={() => {}} setInteractionBlocking={() => {}} />;
  const html = renderToString(component);
  assert.match(html, /spinner/);
  clockNow = Date.parse('2026-09-09T00:00:01Z');
  assert.equal(renderToString(component), html);
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => { root = hydrateRoot(container, component, { onRecoverableError: (error) => errors.push(error) }); });
    assert.deepEqual(errors, []);
    await waitFor(() => assert.match(container.textContent ?? '', /期限を過ぎました/));
  } finally { act(() => root?.unmount()); container.remove(); controller.dispose(); }
});

test('作成の再送IDを保ち、連打抑止・成功Room表示・戦闘未開始を守る', async () => {
  const requests: any[] = [];
  const pending = deferred<any>();
  const created = roomFixture('created', { difficultyId: 'beginner', serverEligibility: { status: 'unknown' } });
  const h = harness({
    listRooms: async () => requests.length >= 2 ? [created] : [],
    listBossChoices: async () => [{ raidVariantId: 'boss-a', name: '確認ボス' }],
    createRoom: async request => { requests.push(request); if (requests.length === 1) throw new Error('network'); return pending.promise; },
  });
  try {
    await waitFor(() => assert.equal(h.controller.getSnapshot().rooms.status, 'success'));
    fireEvent.click(h.ui.getByRole('button', { name: '挑む' }));
    await waitFor(() => assert.equal(h.controller.getSnapshot().bossChoices.status, 'success'));
    fireEvent.change(h.ui.getByRole('combobox', { name: 'ボス' }), { target: { value: 'boss-a' } });
    fireEvent.click(h.ui.getByRole('button', { name: 'この敵に挑む' }));
    await h.ui.findByRole('alert');
    fireEvent.click(h.ui.getByRole('button', { name: 'この敵に挑む' }));
    fireEvent.click(h.ui.getByRole('button', { name: 'この敵に挑む' }));
    assert.equal(requests.length, 2);
    assert.equal(requests[0].requestId, requests[1].requestId);
    const button = h.ui.getByRole('button', { name: 'この敵に挑む' });
    assert.equal(button.textContent, '');
    assert.equal(button.hasAttribute('disabled'), true);
    await act(async () => pending.resolve(created));
    await waitFor(() => assert.equal(h.controller.getSnapshot().selectedRoomId, 'created'));
    assert.deepEqual(h.battles, []);
    assert.equal(h.controller.getSnapshot().room.data?.serverEligibility.status, 'unknown');
    fireEvent.click(h.ui.getByRole('button', { name: '一覧へ' }));
    await h.ui.findByRole('button', { name: 'レイドを開く' });
    assert.equal(h.controller.getSnapshot().rooms.data?.[0].roomId, 'created');
  } finally { h.close(); }
});

test('作成payload変更は新ID、候補なしは作成を抑止', async () => {
  const requests: any[] = [];
  const h = harness({
    listBossChoices: async () => [],
    createRoom: async request => { requests.push(request); throw new Error('disabled'); },
  });
  try {
    await waitFor(() => assert.equal(h.controller.getSnapshot().rooms.status, 'success'));
    fireEvent.click(h.ui.getByRole('button', { name: '挑む' }));
    await h.ui.findByText('挑戦できる敵はありません。');
    assert.equal(h.ui.getByRole('button', { name: 'この敵に挑む' }).hasAttribute('disabled'), true);
    await act(async () => { await h.controller.createRoom('beginner', 'a'); await h.controller.createRoom('intermediate', 'a'); });
    assert.notEqual(requests[0].requestId, requests[1].requestId);
    assert.equal(h.controller.getSnapshot().selectedRoomId, null);
  } finally { h.close(); }
});

test('作成待ち中に選択を変えた場合は古い作成応答で画面を戻さない', async () => {
  const pending = deferred<any>();
  const h = harness({ listBossChoices: async () => [], createRoom: async () => pending.promise });
  try {
    let creating: Promise<any>;
    await act(async () => { creating = h.controller.createRoom('beginner', 'a'); });
    await act(async () => { await h.controller.selectRoom('room-a'); });
    await act(async () => { pending.resolve(roomFixture('created', { difficultyId: 'beginner' })); await creating!; });
    assert.equal(h.controller.getSnapshot().selectedRoomId, 'room-a');
    assert.equal(h.controller.getSnapshot().creating, false);
    assert.deepEqual(h.battles, []);
  } finally { h.close(); }
});

test('公開参加は参加済み表示へ更新し、戦闘不可ならReplay遷移しない', async () => {
  let joined = false, calls = 0;
  const pending = deferred<void>();
  const h = harness({
    getBriefing: async roomId => ({ roomId, raidBossInstanceId: 'instance-a', raidVariantId: 'boss-a', bossName: '確認ボス', baseId: null,
      membershipStatus: joined ? 'joined' : 'not_joined',
      joinEligibility: { status: 'passed', reason: 'passed', actualPower: 200000, minimumPower: 160000 }, battleStartEnabled: false }),
    registerParticipation: async roomId => { calls++; await pending.promise; joined = true; return { roomId, membershipStatus: 'joined' }; },
  });
  try {
    await act(async () => { await h.controller.selectRoom('room-a'); });
    const button = await h.ui.findByRole('button', { name: '参加する' });
    fireEvent.click(button); fireEvent.click(button);
    assert.equal(calls, 1); assert.equal(button.textContent, '');
    await act(async () => pending.resolve());
    await h.ui.findByText('参加済み'); await h.ui.findByText('現在は出撃できません。');
    assert.deepEqual(h.battles, []);
    assert.equal(h.ui.queryByRole('button', { name: '出撃準備' }), null);
  } finally { h.close(); }
});

test('救援依頼の通信失敗後は同requestで再試行し、両公開先の回数を更新', async () => {
 const {default: Panel}=await import('../../src/app/components/raid/RaidRoomRescuePanel');
 const ids:string[]=[], blocking:boolean[]=[];let sent=false;
 const status={roomId:'room',isOwner:true,requestEnabled:true,activityCount:0,guildCount:0,maxPerChannel:3 as const,viaRescue:false,finalizedBattles:0,contributionDamage:0};
 const client={getStatus:async()=>({...status,activityCount:sent?1:0,guildCount:sent?1:0}),request:async(_room:string,id:string)=>{ids.push(id);if(ids.length===1)throw Error('network');sent=true;return {roomId:'room',requestId:id,activityCount:1,guildCount:1,maxPerChannel:3 as const,publications:[]};},getLink:async()=>({roomId:'room',rescueId:'rescue'}),join:async()=>({roomId:'room',membershipStatus:'joined' as const,viaRescue:true})};
 const ui=render(<Panel client={client} userId="rescue-user" roomId="room" setInteractionBlocking={x=>blocking.push(x)}/>);
 try {fireEvent.click(await ui.findByRole('button',{name:'救援を依頼'}));await ui.findByRole('alert');fireEvent.click(ui.getByRole('button',{name:'救援依頼の送信結果を確認'}));await ui.findByText('救援依頼を送信しました。');await waitFor(()=>assert.match(ui.container.textContent??'',/全体 1 \/ 3 ・ ギルド 1 \/ 3/));assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.deepEqual(blocking,[true,false,true,false]);}finally{cleanup();}
});

test('救援上限到達は依頼不可、救援参加者にはサーバー貢献を表示',async()=>{
 const {default: Panel}=await import('../../src/app/components/raid/RaidRoomRescuePanel');
 const status={roomId:'room',isOwner:true,requestEnabled:false,activityCount:3,guildCount:3,maxPerChannel:3 as const,viaRescue:true,finalizedBattles:2,contributionDamage:12345};
 const client={getStatus:async()=>status,request:async()=>{throw Error('unexpected request');},getLink:async()=>({roomId:'room',rescueId:'rescue'}),join:async()=>({roomId:'room',membershipStatus:'joined' as const,viaRescue:true})};
 const ui=render(<Panel client={client} userId="rescue-user" roomId="room" setInteractionBlocking={()=>{}}/>);try{assert.equal((await ui.findByRole('button',{name:'救援を依頼'}) as HTMLButtonElement).disabled,true);assert.match(ui.container.textContent??'',/救援参加：2戦 ・ 貢献ダメージ 12,345/);}finally{cleanup();}
});

test('救援報酬は取得失敗後に再試行し未設定を成功と表示しない',async()=>{
 const {default:Panel}=await import('../../src/app/components/raid/RaidRoomRescueRewardPanel');let calls=0;
 const client={getReward:async()=>{if(++calls===1)throw Error('network');return {roomId:'room',status:'unconfigured' as const,rescueGate:{status:'unknown' as const,minimumBattles:null,minimumContributionDamage:null},issuedAt:null,expiresAt:null,items:[]};}};
 const ui=render(<Panel client={client} roomId="room" onOpenPresents={()=>{throw Error('unexpected');}}/>);
 try{await ui.findByRole('alert');fireEvent.click(ui.getByRole('button',{name:'報酬情報を更新'}));await ui.findByText('救援報酬は準備中です。');assert.equal(ui.queryByRole('button',{name:'プレゼントBOXへ'}),null);assert.equal(ui.queryByText(/救援成功。/),null);}finally{cleanup();}
});

test('救援報酬の発行明細を表示しPresent取得失敗後の再試行で遷移',async()=>{
 const {default:Panel}=await import('../../src/app/components/raid/RaidRoomRescueRewardPanel');let opened=0;
 const client={getReward:async()=>({roomId:'room',status:'issued' as const,rescueGate:{status:'succeeded' as const,minimumBattles:1,minimumContributionDamage:100},issuedAt:'2026-09-08T00:00:00Z',expiresAt:'2026-10-08T00:00:00Z',items:[{itemId:'CASH',quantity:37,presentId:'present',presentStatus:'CLAIMED',claimedAt:'2026-09-08T00:01:00Z',expiresAt:'2026-10-08T00:00:00Z'}]})};
 const ui=render(<Panel client={client} roomId="room" onOpenPresents={async()=>{if(++opened===1)throw Error("network");}}/>);
 try{await ui.findByText('受取済み');assert.match(ui.container.textContent??'',/キャッシュ × 37/);fireEvent.click(ui.getByRole('button',{name:'プレゼントBOXへ'}));assert.equal(opened,1);await ui.findByRole('alert');fireEvent.click(ui.getByRole('button',{name:'プレゼントBOXへ'}));await waitFor(()=>assert.equal(opened,2));await waitFor(()=>assert.equal(ui.queryByRole('alert'),null));}finally{cleanup();}
});

function rescueHarnessClient(overrides: Partial<import('../../src/domain/raidRoomRescue').RaidRoomRescueClient> = {}) {
 const status={roomId:'room',isOwner:true,requestEnabled:true,activityCount:0,guildCount:0,maxPerChannel:3 as const,viaRescue:false,finalizedBattles:0,contributionDamage:0};
 return {getStatus:async()=>status,request:async(roomId:string,requestId:string)=>({roomId,requestId,activityCount:1,guildCount:1,maxPerChannel:3 as const,publications:[]}),getLink:async()=>({roomId:'room',rescueId:'rescue'}),join:async()=>({roomId:'room',membershipStatus:'joined' as const,viaRescue:true}),...overrides};
}
test('救援依頼は再mount後も同要求で確認し、成功後の依頼は新要求になる',async()=>{
 const {default:Panel}=await import('../../src/app/components/raid/RaidRoomRescuePanel');const ids:string[]=[];
 const client=rescueHarnessClient({request:async(roomId,requestId)=>{ids.push(requestId);if(ids.length===1)throw Error('response lost');return {roomId,requestId,activityCount:1,guildCount:1,maxPerChannel:3,publications:[]};}});
 let ui=render(<Panel client={client} userId="owner" roomId="room" setInteractionBlocking={()=>{}}/>);
 try {fireEvent.click(await ui.findByRole('button',{name:'救援を依頼'}));await ui.findByRole('alert');ui.unmount();ui=render(<Panel client={client} userId="owner" roomId="room" setInteractionBlocking={()=>{}}/>);fireEvent.click(await ui.findByRole('button',{name:'救援依頼の送信結果を確認'}));await ui.findByText('救援依頼を送信しました。');await waitFor(()=>assert.equal((ui.getByRole('button',{name:'救援を依頼'}) as HTMLButtonElement).disabled,false));fireEvent.click(ui.getByRole('button',{name:'救援を依頼'}));await waitFor(()=>assert.equal(ids.length,3));assert.equal(ids[0],ids[1]);assert.notEqual(ids[1],ids[2]);await ui.findByText('救援依頼を送信しました。');}finally{cleanup();}
});
test('上限到達・終了後でも保存済み救援要求は同じIDで結果確認できる',async()=>{
 const {default:Panel}=await import('../../src/app/components/raid/RaidRoomRescuePanel');const {saveRaidRoomRescuePending}=await import('../../src/domain/raidRoomRescuePending');const id='11111111-1111-4111-8111-111111111111';saveRaidRoomRescuePending('owner','room',id,window.localStorage);const calls:string[]=[];
 const client=rescueHarnessClient({getStatus:async()=>({roomId:'room',isOwner:true,requestEnabled:false,activityCount:3,guildCount:3,maxPerChannel:3,viaRescue:false,finalizedBattles:0,contributionDamage:0}),request:async(roomId,requestId)=>{calls.push(requestId);return {roomId,requestId,activityCount:3,guildCount:3,maxPerChannel:3,publications:[]};}});
 const ui=render(<Panel client={client} userId="owner" roomId="room" disabled setInteractionBlocking={()=>{}}/>);try{const retry=await ui.findByRole('button',{name:'救援依頼の送信結果を確認'});await waitFor(()=>assert.equal((retry as HTMLButtonElement).disabled,false));fireEvent.click(retry);await ui.findByText('救援依頼を送信しました。');assert.deepEqual(calls,[id]);await waitFor(()=>assert.equal((ui.getByRole('button',{name:'救援を依頼'}) as HTMLButtonElement).disabled,true));}finally{cleanup();}
});
test('救援要求の保存失敗時は送信RPCを呼ばない',async()=>{
 const {default:Panel}=await import('../../src/app/components/raid/RaidRoomRescuePanel');let calls=0;const client=rescueHarnessClient({request:async()=>{calls++;throw Error('must not send');}});const proto=Object.getPrototypeOf(window.localStorage);const setItem=proto.setItem;proto.setItem=()=>{throw Error('quota');};
 const ui=render(<Panel client={client} userId="owner" roomId="room" setInteractionBlocking={()=>{}}/>);try{fireEvent.click(await ui.findByRole('button',{name:'救援を依頼'}));await ui.findByRole('alert');assert.equal(calls,0);}finally{proto.setItem=setItem;cleanup();}
});
test('別userへ切替後に遅れた救援送信応答は混入しない',async()=>{
 const {default:Panel}=await import('../../src/app/components/raid/RaidRoomRescuePanel');const late=deferred<Awaited<ReturnType<import('../../src/domain/raidRoomRescue').RaidRoomRescueClient['request']>>>();let calls=0;
 const client=rescueHarnessClient({request:async()=>{calls++;return late.promise;}});
 const ui=render(<Panel client={client} userId="owner" roomId="room" setInteractionBlocking={()=>{}}/>);try{fireEvent.click(await ui.findByRole('button',{name:'救援を依頼'}));assert.equal(calls,1);ui.rerender(<Panel client={client} userId="other" roomId="room" setInteractionBlocking={()=>{}}/>);await ui.findByRole('button',{name:'救援を依頼'});await act(async()=>late.resolve({roomId:'room',requestId:'11111111-1111-4111-8111-111111111111',activityCount:3,guildCount:3,maxPerChannel:3,publications:[]}));assert.equal(ui.queryByText('救援依頼を送信しました。'),null);assert.match(ui.container.textContent??'',/全体 0 \/ 3 ・ ギルド 0 \/ 3/);}finally{cleanup();}
});

test('既知の作成停止は専用文言を画面へ表示する',async()=>{const h=harness({listBossChoices:async()=>[{raidVariantId:'a',name:'検証ボス'}],createRoom:async()=>{throw new RaidRoomStoppedError();}});try{await waitFor(()=>assert.equal(h.controller.getSnapshot().rooms.status,'success'));fireEvent.click(h.ui.getByRole('button',{name:'挑む'}));await act(async()=>{await h.controller.createRoom('beginner','a');});await h.ui.findByText('レイドの新規作成は現在停止中です。再開後にお試しください。');}finally{h.close();}});

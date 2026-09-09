import React from 'react';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, cleanup, renderHook, waitFor, act } from '@testing-library/react';
import OutlawButton from '../../src/app/components/ui/OutlawButton';
import { useRaidRoomDisplay } from '../../src/app/components/raid/useRaidRoomDisplay';
import { createDetailFixture } from '../../src/app/qa/raid-detail/detailFixture';
import type { RaidRoomDisplay } from '../../src/domain/raidRoomDisplay';
import TypewriterText from '../../src/app/components/tutorial/TypewriterText';

afterEach(cleanup);
test('統合: Setup文字送り完了はrender外で一度だけ親へ通知', async () => {
  const original = window.matchMedia;
  window.matchMedia = query => ({ matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } });
  let completions = 0;
  function Parent() {
    const [complete, setComplete] = React.useState(false);
    return <><TypewriterText text="AB" speedMs={1} onComplete={() => { completions++; setComplete(true); }} /><span>{complete ? '完了' : '待機'}</span></>;
  }
  try {
    const view = render(<Parent />);
    await view.findByText('完了');
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
    assert.equal(completions, 1);
    assert.equal(view.container.querySelector('.tutorial-typewriter > span')?.textContent, 'AB');
  } finally { window.matchMedia = original; }
});
test('統合: 認証ユーザー切替後の詳細表示を古い応答で上書きしない', async () => {
  const fixture = createDetailFixture('member', Date.now());
  const data = fixture.display.data!;
  const resolvers: Array<(value: RaidRoomDisplay) => void> = [];
  const loader = () => new Promise<RaidRoomDisplay>(resolve => resolvers.push(resolve));
  const hook = renderHook(({ userId }) => useRaidRoomDisplay(fixture.room.roomId, fixture.room, userId, loader), { initialProps: { userId: 'first' } });
  const membership = () => hook.result.current.data?.membership;
  await waitFor(() => assert.equal(resolvers.length, 1));
  hook.rerender({ userId: 'second' });
  assert.equal(hook.result.current.data, null);
  await waitFor(() => assert.equal(resolvers.length, 2));
  await act(async () => resolvers[1]({ ...data, membership: 'rescue' }));
  assert.equal(membership(), 'rescue');
  await act(async () => resolvers[0]({ ...data, membership: 'owner' }));
  assert.equal(membership(), 'rescue');
});
test('統合: 空loadingLabelは文字なしspinnerと操作禁止を維持', () => {
  const view = render(<OutlawButton isLoading loadingLabel="">救援に向かう</OutlawButton>);
  const button = view.getByRole('button');
  assert.equal(button.textContent, '');
  assert.ok(button.querySelector('.spinner'));
  assert.equal(button.hasAttribute('disabled'), true);
});
test('統合: 未指定loadingLabelは既存fallbackを維持', () => {
  const view = render(<OutlawButton isLoading>進む</OutlawButton>);
  assert.equal(view.getByRole('button').textContent, '処理中…');
});
test('統合: 明示labelと処理完了後の操作表示を維持', () => {
  const view = render(<OutlawButton isLoading loadingLabel="確認しています">進む</OutlawButton>);
  assert.equal(view.getByRole('button').textContent, '確認しています');
  view.rerender(<OutlawButton isLoading={false} loadingLabel="">進む</OutlawButton>);
  assert.equal(view.getByRole('button').textContent, '進む');
  assert.equal(view.getByRole('button').hasAttribute('disabled'), false);
  assert.equal(view.container.querySelector('.spinner'), null);
});

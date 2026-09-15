import React from 'react';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import RaidEnemySelection from '../../src/app/components/raid/RaidEnemySelection';
import RaidRoomListCard from '../../src/app/components/raid/RaidRoomListCard';
import RaidResultDetails from '../../src/app/components/raid/RaidResultDetails';
import RaidRescueLink from '../../src/app/components/raid/RaidRescueLink';
import { createTopFixture } from '../../src/app/qa/raid-top/topFixture';
import { RAID_TOP_ENEMIES } from '../../src/domain/raidTopAssets';
import { success, known } from '../../src/app/qa/raid-detail/detailFixture';

afterEach(cleanup);
test('敵選択と難易度変更は確定前にcreateしない', async () => {
  let confirmed=0;const selected:string[]=[];const difficulties:string[]=[];
  const ui=render(<RaidEnemySelection choices={success(RAID_TOP_ENEMIES.slice(0,2).map(enemy=>({raidVariantId:enemy.variantId,name:enemy.bossName})))} selectedVariantId={RAID_TOP_ENEMIES[0].variantId} difficultyId="beginner" onSelectVariant={id=>selected.push(id)} onSelectDifficulty={id=>difficulties.push(id)} onConfirm={()=>confirmed++} onCancel={()=>{}} onRetry={()=>{}} busy={false}/>);
  fireEvent.click((await ui.findAllByRole('button',{name:/この敵を選ぶ/}))[0]);
  assert.equal(confirmed,0);assert.equal(selected[0],RAID_TOP_ENEMIES[1].variantId);
  fireEvent.click(ui.getByRole('button',{name:'中級'}));assert.deepEqual(difficulties,['intermediate']);assert.equal(confirmed,0);
  fireEvent.click(ui.getByRole('button',{name:'この敵に挑む'}));assert.equal(confirmed,1);
});
test('挑戦先取得失敗を空とせず確認を表示しない', async()=>{
  const ui=render(<RaidEnemySelection choices={{status:'error',data:null,error:'fail'}} selectedVariantId="" difficultyId="beginner" onSelectVariant={()=>{}} onSelectDifficulty={()=>{}} onConfirm={()=>{}} onCancel={()=>{}} onRetry={()=>{}} busy={false}/>);
  await ui.findByRole('alert');assert.equal(ui.queryByText('現在、挑戦できる敵はいません。'),null);assert.equal(ui.queryByRole('button',{name:'この敵に挑む'}),null);
});
test('一覧カードは本人roleと登録人数を表示して対象roomへ遷移',async()=>{
  const data=createTopFixture('single',Date.now());if(data.participating.status!=='ready')throw Error('fixture');const entry=data.participating.data[0];let target='';
  const ui=render(<RaidRoomListCard room={entry.room} now={Date.now()} enemy={entry.enemy} ownerGuild={entry.ownerGuild} membership={known('rescue')} onOpen={id=>target=id}/>);
  fireEvent.click(await ui.findByRole('button',{name:'戦況を見る'}));assert.equal(target,entry.room.roomId);assert.match(ui.container.textContent||'',/救援参加/);assert.match(ui.container.textContent||'',/登録/);assert.doesNotMatch(ui.container.textContent||'',/オンライン/);
});
test('個人敗北と共有開催中、late確定のHP非反映を区別',()=>{
  const ui=render(<RaidResultDetails victory={false} roomState={known('active')} lateFinalization modeResult={{stats:[{label:'貢献',value:'125,000'}]}}/>);
  assert.match(ui.container.textContent||'',/敗北/);assert.match(ui.container.textContent||'',/開催中/);assert.match(ui.container.textContent||'',/共有HPには反映されません/);assert.doesNotMatch(ui.container.textContent||'',/撃破済み/);
});
test('救援cardは終了後も元rescue識別子を保持し不一致カードを混在させない',async()=>{
  process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED='true';
  const data=createTopFixture('single',Date.now());if(data.rescues.status!=='ready')throw Error('fixture');const entry=data.rescues.data[0];if(entry.rescue.status!=='available')throw Error('fixture');
  const ui=render(<RaidRescueLink rescueId={entry.rescue.value.rescueId} entry={{...entry,room:{...entry.room,state:known('cleared')}}}/>);
  await waitFor(()=>assert.match(ui.container.textContent||'',/撃破済み/));assert.match(ui.getByRole('button').textContent||'',/戦況を見る/);
  ui.rerender(<RaidRescueLink rescueId="different-reference" entry={entry}/>);assert.equal(ui.container.querySelector('[data-room-id]'),null);assert.doesNotMatch(ui.container.textContent||'',/キングス/);
});

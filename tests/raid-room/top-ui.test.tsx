import React from 'react';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import RaidTop from '../../src/app/components/raid/RaidTop';
import RaidRoomBrowser from '../../src/app/components/raid/RaidRoomBrowser';
import { createRaidRoomController } from '../../src/domain/raidRoomClient';
import { createTopFixture, type TopScenario } from '../../src/app/qa/raid-top/topFixture';
import { RAID_TOP_ENEMIES } from '../../src/domain/raidTopAssets';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
afterEach(cleanup);
function mount(scenario: TopScenario) { const calls: unknown[] = []; const data = createTopFixture(scenario); const view=render(<RaidTop data={data} onOpenRoom={(...args) => calls.push(args)} onChooseEnemy={enemy => calls.push(['choose',enemy.variantId])} onBrowse={()=>calls.push(['browse'])} onRefresh={()=>calls.push(['refresh'])}/>); return {view,calls,data}; }
async function ready(h: ReturnType<typeof mount>) { await h.view.findByTestId('raid-top'); }
test('7エリア/5体の現行マスター素材は存在し日次fixtureは2エリアのみ',()=>{assert.equal(RAID_TOP_ENEMIES.length,7); for(const enemy of RAID_TOP_ENEMIES){assert.equal(enemy.roster.length,5);for(const path of [enemy.backgroundUrl,enemy.leaderImageUrl,...enemy.roster.map(m=>m.imageUrl)])assert.ok(existsSync(resolve('public',path.replace(/^\//,''))),path);} const data=createTopFixture('empty');assert.equal(data.dailyTargets.status,'ready');if(data.dailyTargets.status==='ready')assert.equal(data.dailyTargets.data.targets.length,2);});
for (const scenario of ['empty','single','multiple'] as const) test(`${scenario}: 0件は枠を省き1/複数件は維持`,async()=>{const h=mount(scenario);await ready(h);const n=scenario==='empty'?0:scenario==='single'?1:3;assert.equal(h.view.queryAllByRole('region',{name:'参戦中'}).length,n?1:0);assert.equal(h.view.queryAllByRole('region',{name:'救援依頼'}).length,n?1:0);assert.equal(h.view.getAllByRole('button',{name:'この敵に挑む'}).length,2);if(n)assert.equal(h.view.getAllByRole('button',{name:'救援に向かう'}).length,n);});
for(const scenario of ['loading','error','unavailable'] as const)test(`${scenario}: 0件と区別し捏造カードなし`,async()=>{const h=mount(scenario);if(scenario==='loading'){assert.ok(h.view.getByRole('status',{name:'通信中'}));}else{await ready(h);assert.ok(h.view.getByRole('region',{name:'参戦中'}));assert.ok(h.view.getByRole('region',{name:'救援依頼'}));}assert.equal(h.view.queryAllByRole('button',{name:'この敵に挑む'}).length,0);assert.doesNotMatch(h.view.container.textContent||'',/Now Loading|読み込み中|処理中/);});
test('救援タップは対象IDと救援元参照を保持',async()=>{const h=mount('multiple');await ready(h);fireEvent.click(h.view.getAllByRole('button',{name:'救援に向かう'})[1]);assert.deepEqual(h.calls,[['qa-top-rescue-1','qa-rescue-reference-1']]);});
test('敵のタップは選択callbackだけを発火',async()=>{const h=mount('empty');await ready(h);fireEvent.click(h.view.getAllByRole('button',{name:'この敵に挑む'})[0]);assert.deepEqual(h.calls,[['choose',RAID_TOP_ENEMIES[0].variantId]]);});
test('主催/通常参加/救援参加を保持し人数をonline扱いしない',async()=>{const h=mount('multiple');await ready(h);const region=within(h.view.getByRole('region',{name:'参戦中'}));for(const text of ['挑戦者：あなた','挑戦者：確認用挑戦者2','挑戦者：確認用挑戦者3'])assert.ok(region.getByText(text));if(h.data.participating.status==='ready')assert.deepEqual(h.data.participating.data.map(e=>e.membership),['owner','member','rescue'].map(value=>({status:'available',value})));assert.doesNotMatch(h.view.container.textContent||'',/オンライン|楽勝|討伐困難/);});
test('終了した救援は戦況を見る導線に変更',async()=>{const h=mount('ended');await ready(h);assert.equal(h.view.queryAllByRole('button',{name:'救援に向かう'}).length,0);assert.equal(h.view.getAllByRole('button',{name:'戦況を見る'}).length,3);});
test('Browserトップは一覧取得をせず明示browseで取得',async()=>{let lists=0;const controller=createRaidRoomController({listRooms:async()=>{lists++;return [];},getRoom:async()=>{throw Error('unused');},listParticipants:async()=>[],getRewards:async()=>[],joinRoom:async()=>{throw Error('unused');}});const view=render(<RaidRoomBrowser controller={controller} topData={createTopFixture('empty')} onBattleReady={()=>{}} setInteractionBlocking={()=>{}}/>);try{await view.findByTestId('raid-top');assert.equal(lists,0);fireEvent.click(view.getByRole('button',{name:/開催中のレイドを探す/}));await waitFor(()=>assert.equal(lists,1));}finally{cleanup();controller.dispose();}});


test('snapshot境界は不正日次・重複部屋・人物URLを拒否、unknownは維持',async()=>{
 const {parseRaidTopSnapshot,resolveRaidDailyTargets}=await import('../../src/domain/raidTopData');
 const base=createTopFixture('single');assert.equal((await parseRaidTopSnapshot(base)).dailyTargets.status,'ready');
 const unknown=await parseRaidTopSnapshot(createTopFixture('unknown'));assert.equal(unknown.participating.status,'ready');if(unknown.participating.status==='ready')assert.equal(unknown.participating.data[0].ownerGuild.status,'unknown');
 assert.equal(resolveRaidDailyTargets({dateJst:'2026-02-30',variantIds:RAID_TOP_ENEMIES.slice(0,2).map(e=>e.variantId)}),null);
 assert.equal(resolveRaidDailyTargets({dateJst:'2026-09-09',variantIds:RAID_TOP_ENEMIES.map(e=>e.variantId)}),null);
 const duplicate=structuredClone(base);if(duplicate.participating.status==='ready')Object.assign(duplicate.participating,{data:[duplicate.participating.data[0],duplicate.participating.data[0]]});await assert.rejects(parseRaidTopSnapshot(duplicate));
 const bad=structuredClone(base);if(bad.participating.status==='ready')Object.assign(bad.participating.data[0],{participants:{status:'available',value:[{userId:'qa',name:'qa',leaderIconUrl:{status:'available',value:'javascript:bad'}}]}});await assert.rejects(parseRaidTopSnapshot(bad));
});

test('Connectedトップ帰還revisionで一括再取得し参戦中HPを更新、一覧RPCなし',async()=>{
 const {default:Connected}=await import('../../src/app/components/raid/RaidRoomConnectedBrowser');let loads=0;const calls:string[]=[];
 const rpcClient={rpc:async(name:string)=>{calls.push(name);throw Error('no RPC on top');}};
 const loadTop=async()=>createTopFixture(++loads===1?'single':'returned');
 const props={rpcClient,userId:'qa-user',loadTop,onBattleReady(){},setInteractionBlocking(){}};
 const view=render(<Connected {...props} refreshRevision={0}/>);await view.findByTestId('raid-top');await waitFor(()=>assert.match(view.container.textContent||'',/72%/));
 view.rerender(<Connected {...props} refreshRevision={1}/>);await waitFor(()=>assert.match(view.container.textContent||'',/22%/));assert.equal(loads,2);assert.deepEqual(calls,[]);
});

test('useRaidTopは本人切替で古いsnapshotを即隠し遅延応答を破棄、エラーを0件にしない',async()=>{
 const {renderHook,act}=await import('@testing-library/react');const {useRaidTop}=await import('../../src/app/components/raid/useRaidTop');
 let resolveOld!:(value:ReturnType<typeof createTopFixture>)=>void;let calls=0;
 const old=new Promise<ReturnType<typeof createTopFixture>>(resolve=>{resolveOld=resolve;});
 const loadTop=async()=>++calls===1?old:createTopFixture('empty');const rpcClient={rpc:async()=>{throw Error('unused');}};
 const h=renderHook(({user})=>useRaidTop({rpcClient,userId:user,enabled:true,canCreate:true,refreshRevision:0,loadTop}),{initialProps:{user:'a'}});
 await waitFor(()=>assert.equal(calls,1));h.rerender({user:'b'});assert.equal(String(h.result.current.data.participating.status),'loading');await waitFor(()=>assert.equal(h.result.current.data.participating.status,'ready'));
 await act(async()=>{resolveOld(createTopFixture('multiple'));await old;});const result=h.result.current.data.participating;assert.equal(result.status,'ready');if(result.status==='ready')assert.equal(result.data.length,0);h.unmount();
 const failure=renderHook(()=>useRaidTop({rpcClient,userId:'a',enabled:true,canCreate:true,refreshRevision:0,loadTop:failLoader}));await waitFor(()=>assert.equal(failure.result.current.data.participating.status,'error'));
});
const failLoader=async()=>{throw Error('offline');};

test('トップ救援→既存詳細→参加は公開登録を使わず救援RPCへ元参照を渡す',async()=>{
 const {createRaidRoomRpcTransport}=await import('../../src/domain/raidRoomRpcTransport');const data=createTopFixture('single');if(data.rescues.status!=='ready')throw Error('fixture');const entry=data.rescues.data[0];const calls:{name:string,args:unknown}[]=[];let joined=false;
 const client={rpc:async(name:string,args?:Record<string,unknown>)=>{calls.push({name,args});if(name==='get_raid_room_v1')return {data:entry.room,error:null};if(name==='get_raid_room_briefing_v1')return {data:{roomId:entry.room.roomId,raidBossInstanceId:'qa-instance',raidVariantId:RAID_TOP_ENEMIES[0].variantId,bossName:RAID_TOP_ENEMIES[0].bossName,baseId:RAID_TOP_ENEMIES[0].baseId,membershipStatus:joined?'joined':'not_joined',joinEligibility:{status:'passed',reason:'qa',actualPower:null,minimumPower:null},battleStartEnabled:false},error:null};if(name==='join_raid_room_rescue_v1'){joined=true;return {data:{roomId:entry.room.roomId,membershipStatus:'joined',viaRescue:true},error:null};}throw Error(name);}};
 const controller=createRaidRoomController(createRaidRoomRpcTransport(client,{enableParticipation:true,enableRescue:true}));const view=render(<RaidRoomBrowser controller={controller} topData={data} onBattleReady={()=>{}} setInteractionBlocking={()=>{}}/>);
 try{await view.findByTestId('raid-top');fireEvent.click(view.getByRole('button',{name:'救援に向かう'}));fireEvent.click(await view.findByRole('button',{name:'参加する'}));await view.findByText('参加済み');assert.ok(calls.some(c=>c.name==='join_raid_room_rescue_v1'&&JSON.stringify(c.args)==='{"p_rescue_id":"qa-rescue-reference-0"}'));assert.ok(!calls.some(c=>c.name==='register_raid_room_v1'));}finally{cleanup();controller.dispose();}
});

test('参戦中の続きへは対象を保持しownerと参加者の表示を混同しない',async()=>{const h=mount('multiple');await ready(h);const section=within(h.view.getByRole('region',{name:'参戦中'}));const buttons=section.getAllByRole('button',{name:'続きへ'});assert.equal(buttons.length,3);fireEvent.click(buttons[1]);if(h.data.participating.status==='ready')assert.deepEqual(h.calls,[[h.data.participating.data[1].room.roomId]]);assert.match(section.getByText('挑戦者：あなた').textContent||'',/あなた/);assert.equal(section.queryByText('主催'),null);});

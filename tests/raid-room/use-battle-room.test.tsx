import test,{afterEach,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {renderHook,act,cleanup} from '@testing-library/react';
import {useBattle} from '../../src/hooks/useBattle';
import { RAID_REPLAY_NEUTRAL_BACKGROUND, resolveRaidReplayBackground, loadRaidReplayBackground } from '../../src/domain/presentation/raidReplayBackground';
beforeEach(()=>window.localStorage.clear());
afterEach(cleanup);
const noop=()=>{};
const unit=(id:string)=>({id,characterId:'c',name:'検証',stats:{hp:1000,atk:100,def:100,spd:100,luk:1},skills:[]});
const briefing:any={roomId:'room',raidBossInstanceId:'instance',raidVariantId:'BOSS_A',bossName:'ボス',membershipStatus:'joined',battleStartEnabled:true};
function setup(failures=0,throws=0,userId='user',readReceipt:any=null,existingSession:any=null,currentAttempt:any={data:{raidPoints:3,firstEntryFree:false},error:null}){
 const calls:any[]=[],errors:any[]=[];
 const receipt={room_id:'room',replay_session_id:'replay',player_snapshot:[unit('p')],enemy_snapshot:Array.from({length:5},(_,i)=>unit('e'+i)),cost:1,remaining_raid_points:4};
 (globalThis as any).__raidClient={
  async rpc(name:string,args:any){calls.push([name,args]);if(name==='get_current_raid_attempt_state'){if(currentAttempt instanceof Error)throw currentAttempt;return currentAttempt;}if(name==='start_raid_room_battle_v1' && throws-->0)throw Error('transport');const data:any=name==='acknowledge_raid_room_battle_recovery_v1'?{status:'acknowledged',requestId:args.p_request_id}:name==='get_raid_room_battle_start_receipt_v1'?readReceipt:name==='get_raid_room_briefing_v1'?briefing:name==='get_raid_room_v1'?{hp:{value:{current:1000}}}:name==='get_active_raids'?[{id:'instance',bossMasterId:'BOSS_A',currentHp:1000}]:name==='get_current_main_formation'?{characters:[{character_id:'c'}]}:name.startsWith('start_raid')?receipt:[];return {data,error:null};},
  from(name:string){const chain:any={select(){return chain},eq(){return chain},in(){return chain},insert(payload:any){calls.push(['insert:'+name,payload]);return chain},update(){return chain},single:async()=>({data:{id:'session'},error:null}),maybeSingle:async()=>({data:name==='battle_sessions'?existingSession:{id:'BOSS_A',boss_name:'ボス',max_hp:1000,skills:[]},error:null}),then(resolve:any){return Promise.resolve({data:[],error:null}).then(resolve)}};return chain;},
  functions:{async invoke(name:string,args:any){calls.push([name,args]);if(failures-->0)return {data:null,error:{message:'transient'}};return {data:{roomId:'room',winner:'ENEMY',events:[{index:0,round:1,type:'RESULT',payload:{winner:'ENEMY'}}],rawDamage:100,appliedDamage:100,personalContribution:100},error:null};}}
 };
 const options:any={session:{user:{id:userId}},userCharactersDbList:[{id:'owned',character_id:'c',level:1}],userEquipmentsList:[],userSkillsList:[],skillLimitBreakMaster:[],selectedMembers:['c'],selectedLeader:'c',userGuild:null,userGuildMember:null,gvgBaseControls:[],currentBaseId:'x',username:'検証',playCyberSe:noop,syncBootstrapData:async()=>{},pvpPoints:5,setPvpPoints:noop,userLevel:5,setUserLevel:noop,userXp:0,setUserXp:noop,vitality:100,setVitality:noop,pvpRate:1000,pvpRankings:[],raidBossHp:1000,raidBossMaxHp:1000,raidTotalDamage:0,setRaidTotalDamage:noop,setRaidPoints:(value:any)=>calls.push(['setRaidPoints',value]),setRaidFirstEntryFree:(value:any)=>calls.push(['setRaidFirstEntryFree',value]),requestRaidTopRefresh:(roomId:any)=>calls.push(['raidReturn',roomId]),setConfirmDialogConfig:(x:any)=>calls.push(['dialog',x]),setErrorMessage:(x:any)=>errors.push(x),addGuildXpAndContributionByAction:async()=>{}};
 return {hook:renderHook(()=>useBattle(options)),calls,errors,receipt,options,remount:()=>renderHook(()=>useBattle(options))};
}
const count=(calls:any[],name:string)=>calls.filter(c=>c[0]===name).length;
const savedReplay=(context:unknown={roomId:'room',raidVariantId:'RAID_SHIBUYA_V1',baseId:'RAID_SHIBUYA_V1'})=>({id:'replay',battle_mode:'RAID',source_reference_id:'instance',official_context:context});
function supplyReplayBackground(x:ReturnType<typeof setup>,result:unknown){
 const client=(globalThis as unknown as {__raidClient:{from:(name:string)=>unknown}}).__raidClient,from=client.from;
 client.from=(name:string)=>{if(name!=='battle_replay_sessions')return from(name);const filters:Array<[string,string]>=[];const chain={select(columns:string){x.calls.push(['read:replay-background',columns,filters]);return chain},eq(column:string,value:string){filters.push([column,value]);return chain},async maybeSingle(){if(result instanceof Error)throw result;return result}};return chain;};
}

test('保存Replayの7エリアだけを背景へ対応付け、未知/別Roomを推測しない',()=>{
 for(const area of ['SHINJUKU','SHIBUYA','IKEBUKURO','ROPPONGI','AKIHABARA','KAWASAKI','YOKOHAMA'])assert.equal(resolveRaidReplayBackground({roomId:'room',raidVariantId:`RAID_${area}_V1`},'room').backgroundPath,`/bg/bg_street_${area.toLowerCase()}.jpg`);
 for(const context of [null,{}, {roomId:'other',raidVariantId:'RAID_SHIBUYA_V1'},{roomId:'room',raidVariantId:'UNKNOWN',baseId:'shibuya'}])assert.equal(resolveRaidReplayBackground(context,'room').backgroundPath,RAID_REPLAY_NEUTRAL_BACKGROUND);
 assert.equal(resolveRaidReplayBackground({roomId:'room',baseId:'SHIBUYA'},'room').backgroundPath,'/bg/bg_street_shibuya.jpg');
});

test('通常確定後の背景は現在overrideより保存Replay優先・本人idで単件参照',async()=>{
 const x=setup();supplyReplayBackground(x,{data:savedReplay(),error:null});
 await act(async()=>{await x.hook.result.current.prepareRaidRoomBattle(briefing,{backgroundPath:'/bg/bg_street_yokohama.jpg',backgroundLabel:'現在の表示'})});
 assert.equal(count(x.calls,'read:replay-background'),0,'unstarted preparation has no Replay');
 await act(async()=>{assert.equal(await x.hook.result.current.confirmPreparedRaidBattle(),true)});
 assert.equal(x.hook.result.current.battlePresentationContext?.backgroundPath,'/bg/bg_street_shibuya.jpg');
 assert.equal(x.hook.result.current.battlePresentationContext?.backgroundLabel,'渋谷');
 const reads=x.calls.filter(c=>c[0]==='read:replay-background');assert.equal(reads.length,1);assert.deepEqual(reads[0][2],[['id','replay'],['requester_user_id','user']]);
});

test('再読込も同じ保存Replay背景で再開し、追加開始/日次対象参照なし',async()=>{
 const first=setup(2);await act(async()=>{await first.hook.result.current.prepareRaidRoomBattle(briefing,{backgroundPath:'/bg/bg_street_yokohama.jpg'})});await act(async()=>{await first.hook.result.current.confirmPreparedRaidBattle()});first.hook.unmount();
 const second=setup(0,0,'user',first.receipt);supplyReplayBackground(second,{data:savedReplay(),error:null});
 await act(async()=>{assert.equal(await second.hook.result.current.resumePendingRaidRoomBattle(),true)});
 assert.equal(second.hook.result.current.battlePresentationContext?.backgroundPath,'/bg/bg_street_shibuya.jpg');assert.equal(count(second.calls,'start_raid_room_battle_v1'),0);assert.equal(count(second.calls,'list_raid_room_boss_choices_v1'),0);assert.equal(count(second.calls,'read:replay-background'),1);
});

test('既にreceiptに含まれる保存contextは再取得しない',async()=>{
 const x=setup();(x.receipt as typeof x.receipt & {official_context:unknown}).official_context=savedReplay().official_context;supplyReplayBackground(x,Error('must not read'));
 await act(async()=>{await x.hook.result.current.prepareRaidRoomBattle(briefing)});await act(async()=>{assert.equal(await x.hook.result.current.confirmPreparedRaidBattle(),true)});
 assert.equal(x.hook.result.current.battlePresentationContext?.backgroundPath,'/bg/bg_street_shibuya.jpg');assert.equal(count(x.calls,'read:replay-background'),0);
});

test('Replay背景の失敗/未知/identity不一致は中立背景、戦闘とRESULT/帰還を止めない',async()=>{
 for(const result of [{data:null,error:{code:'42501'}},Error('network'),{data:savedReplay(null),error:null},{data:{...savedReplay(),id:'other'},error:null},{data:{...savedReplay(),source_reference_id:'other'},error:null},{data:{...savedReplay(),battle_mode:'PVP'},error:null}]){
  window.localStorage.clear();const x=setup();supplyReplayBackground(x,result);
  await act(async()=>{await x.hook.result.current.prepareRaidRoomBattle(briefing,{backgroundPath:'/bg/bg_street_yokohama.jpg'})});await act(async()=>{assert.equal(await x.hook.result.current.confirmPreparedRaidBattle(),true)});
  assert.equal(x.hook.result.current.battlePresentationContext?.backgroundPath,RAID_REPLAY_NEUTRAL_BACKGROUND);assert.equal(count(x.calls,'start_raid_room_battle_v1'),1);assert.equal(count(x.calls,'resolve-battle'),1);
  await act(async()=>{await x.hook.result.current.endBattleSession('DEFEAT')});await act(async()=>{await x.hook.result.current.completeBattleResult()});assert.equal(x.hook.result.current.battleState,null);assert.deepEqual(x.calls.filter(c=>c[0]==='raidReturn'),[['raidReturn','room']]);x.hook.unmount();
 }
});
test('実useBattle Room準備キャンセルでstart/resolveなし',async()=>{const {hook,calls,errors}=setup();await act(async()=>{await hook.result.current.prepareRaidRoomBattle(briefing)});assert.equal(hook.result.current.battleState,'SETUP',JSON.stringify(errors));act(()=>{assert.equal(hook.result.current.cancelPreparedRaidBattle(),true)});assert.equal(hook.result.current.battleState,null);assert.equal(count(calls,'start_raid_room_battle_v1'),0);assert.equal(count(calls,'resolve-battle'),0);});
test('実useBattle RoomconfirmはRoom start/resolve、旧開始/報酬なし',async()=>{const {hook,calls,errors}=setup();await act(async()=>{await hook.result.current.prepareRaidRoomBattle(briefing)});let ok;await act(async()=>{ok=await hook.result.current.confirmPreparedRaidBattle()});assert.equal(ok,true,JSON.stringify(errors));assert.equal(count(calls,'start_raid_room_battle_v1'),1);assert.equal(count(calls,'resolve-battle'),1);assert.equal(count(calls,'start_raid_battle'),0);assert.equal(count(calls,'get_current_raid_battle_rewards'),0);});
test('実useBattle resolve失敗後は同Replay再試行、再開始なし',async()=>{const {hook,calls,errors}=setup(2);await act(async()=>{await hook.result.current.prepareRaidRoomBattle(briefing)});let ok;await act(async()=>{ok=await hook.result.current.confirmPreparedRaidBattle()});assert.equal(ok,false);await act(async()=>{ok=await hook.result.current.confirmPreparedRaidBattle()});assert.equal(ok,true,JSON.stringify(errors));assert.equal(count(calls,'start_raid_room_battle_v1'),1);assert.equal(count(calls,'resolve-battle'),3);assert.deepEqual([...new Set(calls.filter(c=>c[0]==='resolve-battle').map(c=>c[1].body.replaySessionId))],['replay']);});
test('実useBattle 非Roomは旧開始と旧報酬参照を維持',async()=>{const {hook,calls,errors}=setup();await act(async()=>{await hook.result.current.startCardBattle('RAID','ボス','instance')});assert.equal(count(calls,'start_raid_battle'),0,'prepare must not start');let ok;await act(async()=>{ok=await hook.result.current.confirmPreparedRaidBattle()});assert.equal(ok,true,JSON.stringify(errors));assert.equal(count(calls,'start_raid_battle'),1,'old start');assert.equal(count(calls,'start_raid_room_battle_v1'),0);assert.ok(count(calls,'get_current_raid_battle_rewards')>=1,'old rewards');});

test('実useBattle 開始throwは互換sessionを保存せず同request再試行',async()=>{const {hook,calls}=setup(0,1);await act(async()=>{await hook.result.current.prepareRaidRoomBattle(briefing)});let ok;await act(async()=>{ok=await hook.result.current.confirmPreparedRaidBattle()});assert.equal(ok,false);assert.equal(count(calls,'insert:battle_sessions'),0);assert.equal(count(calls,'resolve-battle'),0);await act(async()=>{ok=await hook.result.current.confirmPreparedRaidBattle()});assert.equal(ok,true);const starts=calls.filter(c=>c[0]==='start_raid_room_battle_v1');assert.equal(starts.length,2);assert.deepEqual(starts[0][1],starts[1][1]);assert.equal(count(calls,'insert:battle_sessions'),1);});

test('実useBattle reload後はreceiptを読むだけで同Replay確定し追加開始なし',async()=>{const first=setup(2);await act(async()=>{await first.hook.result.current.prepareRaidRoomBattle(briefing)});await act(async()=>{await first.hook.result.current.confirmPreparedRaidBattle()});assert.equal(count(first.calls,'start_raid_room_battle_v1'),1);first.hook.unmount();const second=setup(0,0,'user',first.receipt);await act(async()=>{assert.equal(await second.hook.result.current.resumePendingRaidRoomBattle(),true)});assert.equal(count(second.calls,'get_raid_room_battle_start_receipt_v1'),1,JSON.stringify(second.errors));assert.equal(count(second.calls,'start_raid_room_battle_v1'),0);assert.equal(count(second.calls,'resolve-battle'),1);assert.equal(second.calls.find(c=>c[0]==='resolve-battle')[1].body.replaySessionId,'replay');assert.equal(window.localStorage.length,0);assert.deepEqual(second.calls.filter(c=>c[0]==='setRaidPoints'),[['setRaidPoints',3]],'current RPC value replaces old receipt RP 4');assert.deepEqual(second.calls.filter(c=>c[0]==='setRaidFirstEntryFree'),[['setRaidFirstEntryFree',false]]);const prev=second.hook.result.current.battleState;await act(async()=>{assert.equal(await second.hook.result.current.resumeActiveBattleSession('quest'),true)});assert.equal(second.hook.result.current.battleState,prev);assert.equal(count(second.calls,'resolve-battle'),1);});
test('実useBattle 開始通信不明reloadは同request同編成で再送する',async()=>{const first=setup(0,1);await act(async()=>{await first.hook.result.current.prepareRaidRoomBattle(briefing)});await act(async()=>{await first.hook.result.current.confirmPreparedRaidBattle()});const request=first.calls.find(c=>c[0]==='start_raid_room_battle_v1')[1];first.hook.unmount();const second=setup();second.options.selectedMembers=['changed'];second.options.userCharactersDbList=[];await act(async()=>{await second.hook.result.current.resumePendingRaidRoomBattle()});assert.deepEqual(second.calls.find(c=>c[0]==='start_raid_room_battle_v1')?.[1],request,JSON.stringify(second.errors));assert.equal(count(second.calls,'resolve-battle'),1);});
test('実useBattle 保存不可は開始/確定/互換sessionを送信しない',async()=>{const {hook,calls}=setup();await act(async()=>{await hook.result.current.prepareRaidRoomBattle(briefing)});const proto=Object.getPrototypeOf(window.localStorage),original=proto.setItem;proto.setItem=()=>{throw Error('quota')};try{await act(async()=>{await hook.result.current.confirmPreparedRaidBattle()})}finally{proto.setItem=original}assert.equal(count(calls,'start_raid_room_battle_v1'),0);assert.equal(count(calls,'resolve-battle'),0);assert.equal(count(calls,'insert:battle_sessions'),0);});
test('実useBattle 別userのpendingは復帰しない',async()=>{const first=setup(0,1);await act(async()=>{await first.hook.result.current.prepareRaidRoomBattle(briefing)});await act(async()=>{await first.hook.result.current.confirmPreparedRaidBattle()});first.hook.unmount();const second=setup(0,0,'other');await act(async()=>{assert.equal(await second.hook.result.current.resumePendingRaidRoomBattle(),false)});assert.equal(second.calls.length,0);assert.equal(window.localStorage.length,1);});
test('実useBattle 同時復帰呼出しはreceipt/resolve各1回',async()=>{const first=setup(0,1);await act(async()=>{await first.hook.result.current.prepareRaidRoomBattle(briefing)});await act(async()=>{await first.hook.result.current.confirmPreparedRaidBattle()});first.hook.unmount();const second=setup(0,0,'user',first.receipt);await act(async()=>{await Promise.all([second.hook.result.current.resumePendingRaidRoomBattle(),second.hook.result.current.resumePendingRaidRoomBattle()])});assert.equal(count(second.calls,'get_raid_room_battle_start_receipt_v1'),1);assert.equal(count(second.calls,'resolve-battle'),1);});
test('実useBattle receipt待機中にuser変更しても旧user応答を確定へ流さない',async()=>{
 const first=setup(0,1);await act(async()=>{await first.hook.result.current.prepareRaidRoomBattle(briefing)});await act(async()=>{await first.hook.result.current.confirmPreparedRaidBattle()});first.hook.unmount();
 const second=setup(0,0,'user',first.receipt),client=(globalThis as any).__raidClient,original=client.rpc;let release:any;client.rpc=(n:string,p:any)=>n==='get_raid_room_battle_start_receipt_v1'?new Promise(resolve=>{second.calls.push([n,p]);release=()=>resolve({data:first.receipt,error:null})}):original(n,p);
 let pending:any;act(()=>{pending=second.hook.result.current.resumePendingRaidRoomBattle()});second.options.session={user:{id:'other'}};second.hook.rerender();await act(async()=>{release();await pending});assert.equal(count(second.calls,'resolve-battle'),0);assert.equal(count(second.calls,'start_raid_room_battle_v1'),0);assert.equal(count(second.calls,'get_raid_room_briefing_v1'),0);assert.equal(window.localStorage.length,1);
});

test('実useBattle 互換session保存後clear前reloadは既存sessionを再利用',async()=>{const first=setup(2);await act(async()=>{await first.hook.result.current.prepareRaidRoomBattle(briefing)});await act(async()=>{await first.hook.result.current.confirmPreparedRaidBattle()});first.hook.unmount();const second=setup(0,0,'user',first.receipt,{id:'existing'});await act(async()=>{await second.hook.result.current.resumePendingRaidRoomBattle()});assert.equal(count(second.calls,'resolve-battle'),1);assert.equal(count(second.calls,'insert:battle_sessions'),0,JSON.stringify(second.errors));assert.equal(window.localStorage.length,0);});

test('実useBattle 復帰後の現在RP参照失敗でも表示値保持・確定Replay再開始なし',async()=>{for(const failed of [{data:null,error:{message:'offline'}},Error('transport')]){window.localStorage.clear();const first=setup(2);await act(async()=>{await first.hook.result.current.prepareRaidRoomBattle(briefing)});await act(async()=>{await first.hook.result.current.confirmPreparedRaidBattle()});first.hook.unmount();const second=setup(0,0,'user',first.receipt,null,failed);await act(async()=>{await second.hook.result.current.resumePendingRaidRoomBattle()});assert.equal(count(second.calls,'get_current_raid_attempt_state'),1);assert.equal(count(second.calls,'setRaidPoints'),0);assert.equal(count(second.calls,'setRaidFirstEntryFree'),0);assert.equal(count(second.calls,'start_raid_room_battle_v1'),0);assert.equal(count(second.calls,'resolve-battle'),1);assert.equal(window.localStorage.length,0);second.hook.unmount();}});

test('実useBattle local消失はserver開始記録から同Replay復帰、startなし',async()=>{const x=setup();const client=(globalThis as any).__raidClient,original=client.rpc;client.rpc=(n:string,p:any)=>n==='list_raid_room_battle_recoveries_v1'?(x.calls.push([n,p]),Promise.resolve({data:[{requestId:'request',roomId:'room',payload:{p_room_id:'room',p_request_id:'request',p_character_ids:['c'],p_tactic:'BALANCED'},receipt:x.receipt}],error:null})):original(n,p);await act(async()=>{assert.equal(await x.hook.result.current.resumePendingRaidRoomBattle(true),true)});assert.equal(count(x.calls,'start_raid_room_battle_v1'),0);assert.equal(count(x.calls,'resolve-battle'),1);assert.equal(count(x.calls,'acknowledge_raid_room_battle_recovery_v1'),1);assert.equal(window.localStorage.length,0);});
test('実useBattle server一覧空は自動出撃せずflag false旧bootを維持',async()=>{const x=setup();await act(async()=>{assert.equal(await x.hook.result.current.resumePendingRaidRoomBattle(),false)});assert.equal(x.calls.length,0);await act(async()=>{assert.equal(await x.hook.result.current.resumePendingRaidRoomBattle(true),false)});assert.equal(count(x.calls,'list_raid_room_battle_recoveries_v1'),1);assert.equal(count(x.calls,'start_raid_room_battle_v1'),0);assert.equal(count(x.calls,'resolve-battle'),0);});
test('実useBattle ack失敗はlocal復帰情報を保持',async()=>{const x=setup(),client=(globalThis as any).__raidClient,original=client.rpc;client.rpc=(n:string,p:any)=>n==='acknowledge_raid_room_battle_recovery_v1'?Promise.resolve({data:null,error:{message:'offline'}}):original(n,p);await act(async()=>{await x.hook.result.current.prepareRaidRoomBattle(briefing)});await act(async()=>{await x.hook.result.current.confirmPreparedRaidBattle()});assert.equal(count(x.calls,'resolve-battle'),1);assert.equal(window.localStorage.length,1);});
test('実useBattle 取消通信失敗は保持して再試行、started復帰/cancelledのみ消去',async()=>{for(const status of ['started','cancelled']){window.localStorage.clear();const first=setup(0,1);await act(async()=>{await first.hook.result.current.prepareRaidRoomBattle(briefing)});await act(async()=>{await first.hook.result.current.confirmPreparedRaidBattle()});first.hook.unmount();const x=setup(),client=(globalThis as any).__raidClient,original=client.rpc;let cancelFailures=1;client.rpc=(n:string,p:any)=>n==='get_raid_room_battle_start_receipt_v1'?Promise.resolve({data:null,error:{message:'denied'}}):n==='cancel_raid_room_battle_request_v1'?(x.calls.push([n,p]),Promise.resolve(cancelFailures-->0?{data:null,error:{message:'offline'}}:{data:{status,receipt:x.receipt},error:null})):original(n,p);await act(async()=>{await x.hook.result.current.resumePendingRaidRoomBattle()});assert.equal(window.localStorage.length,1);const dialog=x.calls.filter(c=>c[0]==='dialog').at(-1)?.[1];assert.ok(dialog);await act(async()=>{await assert.rejects(()=>dialog.onConfirm(),/offline/)});assert.equal(window.localStorage.length,1);assert.equal(count(x.calls,'resolve-battle'),0);await act(async()=>{await dialog.onConfirm()});assert.equal(count(x.calls,'start_raid_room_battle_v1'),0);assert.equal(count(x.calls,'resolve-battle'),status==='started'?1:0);assert.equal(window.localStorage.length,0);x.hook.unmount();}});

test('復帰済みRoomはpending開始なしで再生を許可し追加RPCなし',async()=>{
 const x=setup(),client=(globalThis as any).__raidClient,original=client.rpc;
 client.rpc=(n:string,p:any)=>n==='list_raid_room_battle_recoveries_v1'?Promise.resolve({data:[{requestId:'request',roomId:'room',payload:{p_room_id:'room',p_request_id:'request',p_character_ids:['c'],p_tactic:'BALANCED'},receipt:x.receipt}],error:null}):original(n,p);
 await act(async()=>{await x.hook.result.current.resumePendingRaidRoomBattle(true)});
 assert.equal(x.hook.result.current.battlePresentationContext?.raidRoomId,'room');
 const before=x.calls.length;
 await act(async()=>{assert.equal(await x.hook.result.current.confirmPreparedRaidBattle(),true)});
 assert.equal(x.calls.length,before);assert.equal(count(x.calls,'start_raid_room_battle_v1'),0);
});

test('準備画面の古い再生callbackでも確定SnapshotのIDを上書きしない',async()=>{
 const x=setup();
 await act(async()=>{await x.hook.result.current.prepareRaidRoomBattle(briefing)});
 const launchFromSetup=x.hook.result.current.launchBattlePlaying;
 await act(async()=>{assert.equal(await x.hook.result.current.confirmPreparedRaidBattle(),true)});
 const ids=x.hook.result.current.playerPartyStates.map(p=>p.id);assert.deepEqual(ids,['p']);
 await act(async()=>{launchFromSetup()});
 assert.deepEqual(x.hook.result.current.playerPartyStates.map(p=>p.id),ids);
 assert.equal(count(x.calls,'start_raid_room_battle_v1'),1);
});

test('互換table不在でもRoom RESULT確認後にackし、失敗時は結果を保持',async()=>{
 const x=setup(),client=(globalThis as any).__raidClient,originalFrom=client.from,originalRpc=client.rpc;
 client.from=(name:string)=>{const chain=originalFrom(name);if(name==='battle_sessions')chain.maybeSingle=async()=>({data:null,error:{code:'PGRST205',message:'missing retired table'}});return chain;};
 await act(async()=>{await x.hook.result.current.prepareRaidRoomBattle(briefing)});
 await act(async()=>{assert.equal(await x.hook.result.current.confirmPreparedRaidBattle(),true)});
 assert.equal(count(x.calls,'acknowledge_raid_room_battle_recovery_v1'),0);assert.equal(window.localStorage.length,1);
 assert.equal(x.hook.result.current.battlePresentationContext?.raidRoomId,'room');
 await act(async()=>{await x.hook.result.current.endBattleSession('DEFEAT')});assert.equal(x.hook.result.current.battleState,'RESULT');
 client.rpc=(n:string,p:any)=>n==='acknowledge_raid_room_battle_recovery_v1'?Promise.resolve({data:null,error:{message:'offline'}}):originalRpc(n,p);
 await act(async()=>{await x.hook.result.current.completeBattleResult()});assert.equal(x.hook.result.current.battleState,'RESULT');assert.equal(window.localStorage.length,1);
 assert.equal(count(x.calls,'raidReturn'),0); client.rpc=originalRpc;
 await act(async()=>{await x.hook.result.current.completeBattleResult()});assert.equal(x.hook.result.current.battleState,null);assert.equal(window.localStorage.length,0);assert.equal(count(x.calls,'start_raid_room_battle_v1'),1);assert.equal(count(x.calls,'resolve-battle'),1);
 assert.deepEqual(x.calls.filter(c=>c[0]==='raidReturn'),[['raidReturn','room']]);
});

test('resolved saved result avoids another read',async()=>{
 const x=setup(),client=(globalThis as unknown as {__raidClient:{functions:{invoke:(...args:unknown[])=>Promise<{data:Record<string,unknown>}>}}}).__raidClient,invoke=client.functions.invoke;
 client.functions.invoke=async (...args:unknown[])=>{const response=await invoke(...args);response.data={...response.data,mode:'RAID',raidInstanceId:'instance',raidVariantId:'RAID_SHIBUYA_V1',baseId:'shibuya'};return response};
 supplyReplayBackground(x,Error('must not read'));
 await act(async()=>{await x.hook.result.current.prepareRaidRoomBattle(briefing,{backgroundPath:'/bg/bg_street_yokohama.jpg'})});await act(async()=>{assert.equal(await x.hook.result.current.confirmPreparedRaidBattle(),true)});
 assert.equal(x.hook.result.current.battlePresentationContext?.backgroundPath,'/bg/bg_street_shibuya.jpg');assert.equal(count(x.calls,'read:replay-background'),0);
 const background=await loadRaidReplayBackground(()=>{throw Error('must not read')},{replayId:'replay',roomId:'room',userId:'user',sourceReferenceId:'instance'},null,{mode:'RAID',roomId:'room',raidInstanceId:'instance',raidVariantId:'UNKNOWN',baseId:'shibuya'});
 assert.equal(background.backgroundPath,RAID_REPLAY_NEUTRAL_BACKGROUND);
});
test('unresponsive background read uses neutral after deadline',async()=>{
 const background=await loadRaidReplayBackground(()=>new Promise(()=>{}),{replayId:'replay',roomId:'room',userId:'user',sourceReferenceId:'instance'});
 assert.equal(background.backgroundPath,RAID_REPLAY_NEUTRAL_BACKGROUND);
});

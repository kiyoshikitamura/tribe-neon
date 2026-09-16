import React from 'react';
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {render,cleanup,waitFor} from '@testing-library/react';
import RaidTab from '../../src/app/components/RaidTab';
const original=process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED;
afterEach(()=>{cleanup();if(original===undefined)delete process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED;else process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=original;});
(globalThis as any).__cutoverReact=React;
const calls:string[]=[];
function setup(flag?:string){
 if(flag===undefined)delete process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED;else process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=flag;
 calls.length=0;(globalThis as any).__roomProps=null;
 (globalThis as any).__rankingGame={session:{user:{id:'user-test'}},userLevel:5,raidPoints:4,raidFirstEntryFree:false,userGuildMember:{},raidRescueTarget:{rescueId:'rescue-test',revision:3},setGlobalInteractionBlocking(){},setRaidPoints(){},setRaidFirstEntryFree(){}};
 (globalThis as any).__cutoverRpc=async(name:string)=>{calls.push(name);return {data:name==='get_current_raid_attempt_state'?{raidPoints:4,firstEntryFree:false}:[],error:null};};
 (globalThis as any).__cutoverFrom=(table:string)=>{calls.push('table:'+table);const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{quantity:0},error:null})};return q;};
}
test('Room flag trueは旧UIと旧取得を停止しRoom接続を表示',async()=>{
 setup('true');const view=render(<RaidTab/>);await waitFor(()=>assert(view.getByTestId('room-browser')));
 assert.deepEqual(calls,[]);assert.doesNotMatch(view.container.textContent||'',/現在開催中のレイドはありません|レイド情報を取得中|挑戦する/);
 const props=(globalThis as any).__roomProps;assert.equal(props.userId,'user-test');assert.equal(props.rescueId,'rescue-test');
 assert.deepEqual(props.authorities,{enableParticipation:true,enableCreation:true,enableRescue:true});
 for(const name of ['onOpenPresents','onBriefingReady','setInteractionBlocking'])assert.equal(typeof props[name],'function');
});
for(const flag of [undefined,'false'])test('Room flag '+String(flag)+'は既存一覧を維持しRoom画面を表示しない',async()=>{
 setup(flag);const view=render(<RaidTab/>);await waitFor(()=>assert.match(view.container.textContent||'',/現在開催中のレイドはありません/));
 assert.equal(view.queryByTestId('room-browser'),null);assert(calls.includes('get_active_raids'));assert(calls.includes('get_current_raid_attempt_state'));assert(!calls.includes('list_raid_rooms_v1'));
});

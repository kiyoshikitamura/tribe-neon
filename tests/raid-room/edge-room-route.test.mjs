import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRaidFinalizer} from '../../supabase/functions/resolve-battle/raid-room-route.ts';

test('Edge Room route uses server lookup with the saved replay ID', async () => {
 const ids=[];
 const target=await selectRaidFinalizer('saved-replay',async id=>{ids.push(id);return {data:'ROOM',error:null};});
 assert.equal(target,'finalize_raid_room_battle_v1');
 assert.deepEqual(ids,['saved-replay']);
});
test('Edge legacy route preserves legacy finalizer',async()=>{
 assert.equal(await selectRaidFinalizer('legacy',async()=>({data:'LEGACY',error:null})),'finalize_raid_battle');
});
test('Edge invalid routes reject without legacy fallback',async()=>{
 for(const data of [null,undefined,'room',{},true,['ROOM']]) {
  await assert.rejects(()=>selectRaidFinalizer('id',async()=>({data,error:null})),/Invalid Raid authority/);
 }
});
test('Edge server authority errors and network failures reject without fallback',async()=>{
 await assert.rejects(()=>selectRaidFinalizer('id',async()=>({data:'ROOM',error:{message:'receipt mismatch'}})),/receipt mismatch/);
 await assert.rejects(()=>selectRaidFinalizer('id',async()=>{throw new Error('network failure');}),/network failure/);
});

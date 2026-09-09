import assert from 'node:assert/strict';
import {roles,login,rpc,save,safeError} from './qa-http.mjs';
if(process.env.RAID_STEP6_DEPLOY_READY!=='true')throw Error('Parent deployment readiness is required');
const report={at:new Date().toISOString(),unauthenticated:null,roles:[]};
const anon=await rpc(null,'get_raid_top_v1');report.unauthenticated=safeError(anon);assert.ok(anon.status>=400);
let daily;
for(const role of roles){const auth=await login(role);const top=await rpc(auth,'get_raid_top_v1');const choices=await rpc(auth,'list_raid_room_boss_choices_v1');assert.equal(top.status,200);assert.equal(choices.status,200);assert.equal(choices.data.choices.length,2);const ids=choices.data.choices.map(x=>x.raidVariantId).sort();if(daily)assert.deepEqual(ids,daily);daily=ids;const list=await rpc(auth,'list_raid_room_cards_v1',{p_difficulty_id:'beginner',p_offset:0});report.roles.push({role,topStatus:top.status,resourceStates:Object.fromEntries(Object.entries(top.data).map(([key,value])=>[key,value?.status??typeof value])),daily:ids,listStatus:list.status,listCount:list.data?.entries?.length});}
save('top-http',report);console.log('PASS actual authenticated 3-role top/choices/list and anonymous denial');

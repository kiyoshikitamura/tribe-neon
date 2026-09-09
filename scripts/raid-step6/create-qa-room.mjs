import fs from 'node:fs';import assert from 'node:assert/strict';import {login,rpc,save} from './qa-http.mjs';
if(process.env.RAID_STEP6_DEPLOY_READY!=='true'||process.env.RAID_STEP6_QA_WRITE!=='true')throw Error('Parent readiness/QA-only write gate required');
const statePath='outputs/raid-step6/new-room-state.json';const state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath)):{createRequest:crypto.randomUUID(),rescueRequest:crypto.randomUUID()};
const persist=()=>save('new-room-state',state);persist();
async function checked(auth,name,args){const r=await rpc(auth,name,args);if(r.status!==200)throw Error(`${auth.role} ${name}: status ${r.status} code ${r.data?.code??'unknown'}`);return r.data;}
const host=await login('host'),normal=await login('normal'),rescue=await login('rescue');
if(!state.variant){const c=await checked(host,'list_raid_room_boss_choices_v1',{});assert.equal(c.choices.length,2);state.variant=c.choices[0].raidVariantId;persist();}
const payload={p_difficulty_id:'beginner',p_raid_variant_id:state.variant,p_request_id:state.createRequest};
const room=await checked(host,'create_raid_room_v1',payload);if(state.roomId)assert.equal(room.roomId,state.roomId);state.roomId=room.roomId;state.ownerId=host.id;state.room=room;persist();
const protectedState=JSON.parse(fs.readFileSync('outputs/raid-step6/preflight-roles.json'));assert.ok(!protectedState.protectedRooms.some(x=>x.roomId===state.roomId));assert.equal(room.owner.value.userId,host.id);
const replay=await checked(host,'create_raid_room_v1',payload);assert.equal(replay.roomId,state.roomId);
const membership=await checked(normal,'register_raid_room_v1',{p_room_id:state.roomId});state.normalMembership=membership;persist();
const publication=await checked(host,'request_raid_room_rescue_v1',{p_room_id:state.roomId,p_request_id:state.rescueRequest});state.publication=publication;persist();const target=publication.publications.find(x=>x.channel==='ACTIVITY');assert.ok(target?.rescueId);state.rescueId=target.rescueId;persist();
state.rescueMembership=await checked(rescue,'join_raid_room_rescue_v1',{p_rescue_id:state.rescueId});assert.equal(state.rescueMembership.roomId,state.roomId);persist();
state.displays={};for(const auth of [host,normal,rescue]){const d=await checked(auth,'get_raid_room_display_v1',{p_room_id:state.roomId});const b=await checked(auth,'get_raid_room_briefing_v1',{p_room_id:state.roomId});state.displays[auth.role]={membership:d.membership,briefing:b};}persist();console.log('PASS new QA-only room, same-request create, normal/rescue membership and 3 role display');

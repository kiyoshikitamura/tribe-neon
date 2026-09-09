import fs from 'node:fs';import assert from 'node:assert/strict';import {login,rpc,request,save} from './qa-http.mjs';
if(process.env.RAID_STEP6_QA_WRITE!=='true'||process.env.RAID_STEP6_HP_FIXTURE_READY!=='true')throw Error('Parent fixture READY required');
const roomId='a6940cc4-12eb-4c64-ba80-af3430134e96',name='host-final-battle',file=`outputs/raid-step6/${name}.json`;
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{roomId,role:'host',acknowledged:false};const persist=()=>save(name,state);assert.equal(state.roomId,roomId);
if(state.resolved)throw Error('Resolved Replay belongs to C; do not repeat');
const auth=await login('host');
if(!state.payload){const room=await rpc(auth,'get_raid_room_v1',{p_room_id:roomId});assert.equal(room.status,200);assert.equal(room.data.hp.value.current,1);assert.equal(room.data.hp.value.max,28000000);assert.equal(room.data.owner.value.userId,auth.id);const f=await rpc(auth,'get_current_main_formation');assert.equal(f.status,200);state.payload={p_room_id:roomId,p_character_ids:f.data.characters.map(c=>c.character_id),p_tactic:'ATTACK_PRIORITY',p_request_id:crypto.randomUUID()};assert.equal(state.payload.p_character_ids.length,5);persist();}
assert.equal(state.payload.p_room_id,roomId);
const started=await rpc(auth,'start_raid_room_battle_v1',state.payload);state.startStatus=started.status;state.startCode=started.data?.code??null;persist();assert.equal(started.status,200);assert.equal(started.data.room_id,roomId);if(state.replayId)assert.equal(state.replayId,started.data.replay_session_id);state.replayId=started.data.replay_session_id;persist();
const result=await request(auth,'/functions/v1/resolve-battle',{replaySessionId:state.replayId});state.resolveStatus=result.status;state.resolveCode=result.data?.code??null;persist();assert.equal(result.status,200);assert.equal(result.data.roomId,roomId);state.result=result.data;state.resolved=true;persist();
assert.equal(result.data.remainingBossHp,0);assert.equal(result.data.roomOutcome,'DEFEAT_SUCCESS');assert.equal(result.data.lateFinalization,false);
const receipt=await rpc(auth,'get_raid_room_battle_start_receipt_v1',{p_request_id:state.payload.p_request_id});assert.equal(receipt.status,200);assert.equal(receipt.data.replay_session_id,state.replayId);state.receiptSameReplay=true;persist();
console.log(JSON.stringify({roomId,replayId:state.replayId,personalWinner:result.data.winner,sharedOutcome:result.data.roomOutcome,rawDamage:result.data.rawDamage,appliedDamage:result.data.appliedDamage,acknowledged:false,handoff:'C owns Replay UI and ack'}));

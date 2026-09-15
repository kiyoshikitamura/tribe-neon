import fs from 'node:fs';
import assert from 'node:assert/strict';
import {login,rpc,request,save} from './qa-http.mjs';
if(process.env.RAID_STEP6_QA_WRITE!=='true')throw Error('Parent QA write gate required');
const roomId='a6940cc4-12eb-4c64-ba80-af3430134e96';
const current=JSON.parse(fs.readFileSync('outputs/raid-step6/new-room-state.json'));assert.equal(current.roomId,roomId);
assert.ok(!JSON.parse(fs.readFileSync('outputs/raid-step6/preflight-roles.json')).protectedRooms.some(x=>x.roomId===roomId));
for(const role of ['host','rescue']){
 const auth=await login(role),name=`qualification-${role}`,file=`outputs/raid-step6/${name}.json`;
 const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{roomId,role,attempts:[]};assert.equal(state.roomId,roomId);assert.equal(state.role,role);
 const persist=()=>save(name,state);
 const goal=()=>{const done=state.attempts.filter(a=>a.acknowledged);return role==='host'?done.length>=1&&done.reduce((sum,a)=>sum+a.rawDamage,0)>0:done.length>=2&&done.reduce((sum,a)=>sum+a.rawDamage,0)>=16000;};
 while(!goal()){
  let attempt=state.attempts.find(a=>!a.acknowledged);
  if(!attempt){if(state.attempts.length>=(role==='host'?1:6)){state.stop='attempt_limit';persist();break;}
   const formation=await rpc(auth,'get_current_main_formation');assert.equal(formation.status,200);
   attempt={payload:{p_room_id:roomId,p_character_ids:formation.data.characters.map(c=>c.character_id),p_tactic:'ATTACK_PRIORITY',p_request_id:crypto.randomUUID()}};assert.equal(attempt.payload.p_character_ids.length,5);state.attempts.push(attempt);persist();
  }
  assert.equal(attempt.payload.p_room_id,roomId);
  if(!attempt.replayId){const started=await rpc(auth,'start_raid_room_battle_v1',attempt.payload);attempt.startStatus=started.status;attempt.startCode=started.data?.code??null;persist();if(started.status!==200){state.stop='start_rejected_no_more_attempts';persist();console.log(JSON.stringify({role,status:started.status,code:attempt.startCode,stop:state.stop}));break;}assert.equal(started.data.room_id,roomId);attempt.replayId=started.data.replay_session_id;persist();}
  if(!attempt.resolved){const result=await request(auth,'/functions/v1/resolve-battle',{replaySessionId:attempt.replayId});attempt.resolveStatus=result.status;attempt.resolveCode=result.data?.code??null;persist();assert.equal(result.status,200);assert.equal(result.data.roomId,roomId);assert.equal(result.data.lateFinalization,false);attempt.rawDamage=result.data.rawDamage;attempt.appliedDamage=result.data.appliedDamage;attempt.remainingBossHp=result.data.remainingBossHp;attempt.winner=result.data.winner;attempt.resolved=true;persist();}
  const receipt=await rpc(auth,'get_raid_room_battle_start_receipt_v1',{p_request_id:attempt.payload.p_request_id});assert.equal(receipt.status,200);assert.equal(receipt.data.replay_session_id,attempt.replayId);attempt.sameReplay=true;
  const ack=await rpc(auth,'acknowledge_raid_room_battle_recovery_v1',{p_request_id:attempt.payload.p_request_id});attempt.ackStatus=ack.status;persist();assert.equal(ack.status,200);assert.equal(ack.data.status,'acknowledged');assert.equal(ack.data.requestId,attempt.payload.p_request_id);attempt.acknowledged=true;persist();
  console.log(JSON.stringify({role,attempt:state.attempts.length,rawDamage:attempt.rawDamage,appliedDamage:attempt.appliedDamage,ack:true,cumulativeDamage:state.attempts.reduce((s,a)=>s+(a.rawDamage??0),0)}));
 }
 state.goalReached=goal();persist();if(!state.goalReached)break;
}

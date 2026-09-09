import fs from 'node:fs';import assert from 'node:assert/strict';import {login,rpc,request,save} from './qa-http.mjs';
if(process.env.RAID_STEP6_QA_WRITE!=='true'||process.env.RAID_STEP6_REWARD_HANDOFF_READY!=='true')throw Error('Parent/C reward UI ownership release required');
const roomId='a6940cc4-12eb-4c64-ba80-af3430134e96',name='new-room-reward-claims',file=`outputs/raid-step6/${name}.json`;
if(fs.existsSync(file))throw Error('Existing claim attempt; manual read reconciliation required, no automatic repeat');
const state={roomId,claims:[]};save(name,state);
for(const role of ['host','normal','rescue']){
 const auth=await login(role);
 const items=async item=>{const r=await request(auth,`/rest/v1/user_items?select=quantity&user_id=eq.${auth.id}&item_id=eq.${encodeURIComponent(item)}`);assert.equal(r.status,200);return r.data.reduce((n,x)=>n+Number(x.quantity),0);};
 for(const [kind,itemId] of [['clear','EQUIP_EXP_S'],...(role==='rescue'?[['rescue','CHAR_EXP_S']]:[])]){
  const read=()=>rpc(auth,`get_raid_room_${kind}_reward_v1`,{p_room_id:roomId});
  const reward=await read();assert.equal(reward.status,200);assert.equal(reward.data.roomId,roomId);assert.equal(reward.data.status,'issued');assert.equal(reward.data.items.length,1);
  const grant=reward.data.items[0];assert.equal(grant.itemId,itemId);assert.equal(grant.quantity,1);assert.equal(grant.presentStatus,'UNCLAIMED');assert.ok(grant.presentId);
  const record={role,kind,roomId,presentId:grant.presentId,itemId,quantity:grant.quantity,beforeQuantity:await items(itemId),phase:'OUTCOME_UNKNOWN'};state.claims.push(record);save(name,state);
  const claim=await rpc(auth,'claim_present',{p_present_id:grant.presentId});record.claimStatus=claim.status;record.claimCode=claim.data?.code??null;save(name,state);assert.equal(claim.status,200);assert.equal(claim.data.status,'success');assert.equal(claim.data.present_id,grant.presentId);
  record.afterQuantity=await items(itemId);assert.equal(record.afterQuantity,record.beforeQuantity+grant.quantity);
  const after=await read();assert.equal(after.status,200);assert.equal(after.data.items[0].presentId,grant.presentId);assert.equal(after.data.items[0].presentStatus,'CLAIMED');record.phase='CLAIMED';save(name,state);
  const duplicate=await rpc(auth,'claim_present',{p_present_id:grant.presentId});record.duplicateStatus=duplicate.status;record.duplicateCode=duplicate.data?.code??null;record.afterDuplicateQuantity=await items(itemId);save(name,state);assert.ok(duplicate.status>=400);assert.equal(record.afterDuplicateQuantity,record.afterQuantity);record.phase='VERIFIED';save(name,state);
  console.log(JSON.stringify({role,kind,presentId:record.presentId,claimStatus:record.claimStatus,duplicateStatus:record.duplicateStatus,delta:record.afterQuantity-record.beforeQuantity}));
 }
}
state.complete=true;save(name,state);

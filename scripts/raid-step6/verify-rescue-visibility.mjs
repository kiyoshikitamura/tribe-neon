import fs from 'node:fs';
import assert from 'node:assert/strict';
import {roles,login,request,rpc,save} from './qa-http.mjs';
const state=JSON.parse(fs.readFileSync('outputs/raid-step6/new-room-state.json'));
const publications=state.publication.publications;
const report={at:new Date().toISOString(),roomId:state.roomId,publications,roles:[],guildNegative:'not observed'};
for(const role of roles){
  const auth=await login(role);
  const membership=await request(auth,`/rest/v1/guild_members?user_id=eq.${auth.id}&select=guild_id`);
  const guildIds=membership.status===200&&Array.isArray(membership.data)?membership.data.map(x=>x.guild_id):null;
  const row={role,userId:auth.id,guildReadStatus:membership.status,guildReadCode:membership.data?.code??null,guildIds,links:[]};
  for(const pub of publications){
    const detail=await rpc(auth,'get_raid_room_rescue_v1',{p_rescue_id:pub.rescueId});
    const batch=await rpc(auth,'get_raid_rescue_cards_v1',{p_rescue_ids:[pub.rescueId]});
    const available=batch.data?.entries?.find(e=>e.rescue?.status==='available'&&e.rescue.value.rescueId===pub.rescueId);
    const allowed=pub.channel==='ACTIVITY'||(guildIds!==null&&guildIds.includes(pub.guildId));
    row.links.push({channel:pub.channel,rescueId:pub.rescueId,detailStatus:detail.status,detailCode:detail.data?.code??null,batchStatus:batch.status,batchCode:batch.data?.code??null,entryCount:batch.data?.entries?.length??null,source:available?.rescue?.value?.source??null,scope:available?.rescue?.value?.scope??null,guildId:available?.rescue?.value?.guildId??null,expectedAllowed:guildIds===null&&pub.channel==='GUILD'?null:allowed});
    assert.equal(batch.status,200);
    if(allowed){assert.equal(detail.status,200);assert.equal(detail.data.roomId,state.roomId);assert.equal(detail.data.rescueId,pub.rescueId);assert.equal(detail.data.channel,pub.channel);assert.equal(detail.data.guildId,pub.guildId);assert.ok(available);assert.equal(available.room.roomId,state.roomId);assert.equal(available.rescue.value.source,pub.channel==='ACTIVITY'?'activity':'guild_chat');assert.equal(available.rescue.value.scope,pub.channel);assert.equal(available.rescue.value.guildId,pub.guildId);}
    else if(guildIds!==null){assert.ok(detail.status===403||detail.status===404);assert.equal(batch.data.entries.length,0);report.guildNegative=`PASS: ${role} outside publication Guild`;}
  }
  report.roles.push(row);
}
if(report.guildNegative==='not observed')report.guildNegative='UNVERIFIED: no confirmed outside-Guild role among the three existing QA accounts; membership unchanged';
save('rescue-visibility-http',report);
console.log(JSON.stringify(report,null,2));

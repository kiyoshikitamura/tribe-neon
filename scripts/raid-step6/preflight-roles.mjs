import fs from 'node:fs';import {resolve} from 'node:path';
import {roles,login,request,rpc,save,prior} from './qa-http.mjs';
const old=JSON.parse(fs.readFileSync(resolve(prior,'outputs/raid-smoke-state.json')));
const protectedRooms=[old.room,old.expiryRoom].filter(Boolean).map(r=>({roomId:r.roomId??r.id,reason:'Existing QA room: preserve current HP, expiry, outcomes and receipts'}));
const report={at:new Date().toISOString(),roles:[],protectedRooms};
for(const role of roles){const auth=await login(role);const user=await request(auth,`/rest/v1/users?id=eq.${auth.id}&select=id,username,level`);const rooms=[];for(const r of protectedRooms){const result=await rpc(auth,'get_raid_room_v1',{p_room_id:r.roomId});rooms.push({roomId:r.roomId,status:result.status,state:result.data?.state,expiresAt:result.data?.expiresAt});}report.roles.push({role,userId:auth.id,login:'PASS',profileStatus:user.status,level:user.data?.[0]?.level,rooms});}
save('preflight-roles',report);console.log(JSON.stringify({roles:report.roles.map(x=>({role:x.role,login:x.login,profileStatus:x.profileStatus})),protectedRoomCount:protectedRooms.length}));

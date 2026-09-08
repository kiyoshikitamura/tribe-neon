import type {RaidParticipantDto,RaidObserved} from '@/domain/raidRoom';
import type {RaidRoomResource,RaidRoomBriefing} from '@/domain/raidRoomClient';
import type {RaidRoomDisplay,RaidRewardPlan} from '@/domain/raidRoomDisplay';
import type {RaidRoomClearReward} from '@/domain/raidRoomClearReward';
import type {RaidRoomRescueReward} from '@/domain/raidRoomRescueReward';
import {createTopFixture} from '../raid-top/topFixture';
import {RAID_TOP_ENEMIES} from '@/domain/raidTopAssets';
import {ITEMS_MASTER_DATA} from '@/utils/items_master_data';
export const DETAIL_SCENARIOS=['owner','member','rescue','not_joined','cleared','expired','loading','error','unknown','many','long-name','no-guild','reward-unconfigured','reward-planned','reward-issued','reward-error','profile-error'] as const;
export type DetailScenario=typeof DETAIL_SCENARIOS[number];
export const known=<T,>(value:T):RaidObserved<T>=>({status:'available',value});
export const success=<T,>(data:T):RaidRoomResource<T>=>({status:'success',data,error:null});
const unknown={status:'unknown'} as const;
export function createDetailFixture(scenario:DetailScenario,now:number){
 const top=createTopFixture('single',now);if(top.participating.status!=='ready')throw Error('fixture');
 const base=top.participating.data[0];const state:'active'|'cleared'|'expired'=scenario==='cleared'?'cleared':scenario==='expired'?'expired':'active';
 const room={...base.room,state:known(state),hp:known({current:state==='cleared'?0:7400000,max:10000000}),expiresAt:known(new Date(now+(state==='expired'?-1:3600000)).toISOString()),participantCount:known(scenario==='many'||scenario==='long-name'?20:3)};
 const role=(['owner','member','rescue','not_joined'] as const).find(r=>r===scenario)||'member';const currentUserId=role==='owner'?'qa-person-0':role==='not_joined'?'qa-visitor':'qa-person-1';
 const people:readonly RaidParticipantDto[]=Array.from({length:scenario==='many'||scenario==='long-name'?20:3},(_,i)=>({roomId:room.roomId,player:{userId:`qa-person-${i}`,name:scenario==='long-name'?`確認用の非常に長い参加者名ABCDEFGHIJKLMN_${i}`:`確認用参加者${i+1}`,leaderIconUrl:known(RAID_TOP_ENEMIES[i%7].leaderImageUrl)},currentGuild:scenario==='unknown'?unknown:known(scenario==='no-guild'?null:{guildId:'qa-guild',name:scenario==='long-name'?'確認用の非常に長いGuild名ABCDEFGHIJKLMN':'確認用Guild'}),battleGuildSnapshot:unknown,finalizedBattles:scenario==='unknown'?unknown:known(i),rawDamage:scenario==='unknown'?unknown:known(i*135001),appliedDamage:scenario==='unknown'?unknown:known(i*125000)}));
 const plan:RaidRewardPlan={status:scenario==='reward-unconfigured'?'unconfigured':'configured',items:scenario==='reward-unconfigured'?[]:ITEMS_MASTER_DATA.slice(0,18).map((item,i)=>({itemId:item.id,quantity:i+1}))};
 const display:RaidRoomDisplay={roomId:room.roomId,ownerGuild:scenario==='unknown'?unknown:known(scenario==='no-guild'?null:{guildId:'qa-guild',name:'確認用Guild'}),membership:role,leaderCharacterIds:Object.fromEntries(people.map((p,i)=>[p.player.userId,RAID_TOP_ENEMIES[i%7].roster[0].id])),clearPlan:plan,rescuePlan:plan};
 const briefing:RaidRoomBriefing={roomId:room.roomId,raidBossInstanceId:'qa-instance',raidVariantId:RAID_TOP_ENEMIES[0].variantId,bossName:RAID_TOP_ENEMIES[0].bossName,baseId:RAID_TOP_ENEMIES[0].baseId,membershipStatus:role==='not_joined'?'not_joined':'joined',joinEligibility:{status:'passed',reason:'qa',actualPower:240000,minimumPower:null},battleStartEnabled:state==='active'};
 const resource=<T,>(data:T):RaidRoomResource<T>=>scenario==='loading'?{status:'loading',data:null,error:null}:scenario==='error'?{status:'error',data:null,error:'qa'}:success(data);
 const issued=scenario==='reward-issued';const items=issued?plan.items.map((item,i)=>({...item,presentId:`qa-present-${i}`,presentStatus:i%3===0?'CLAIMED':'UNCLAIMED',claimedAt:i%3===0?new Date(now).toISOString():null,expiresAt:new Date(now+86400000*30).toISOString()})):[];
 const clear:RaidRoomClearReward={roomId:room.roomId,status:issued?'issued':scenario==='reward-unconfigured'?'unconfigured':'not_eligible',clearGate:{status:issued?'succeeded':scenario==='reward-unconfigured'?'unknown':'not_succeeded',ruleVersion:1,contributionDamage:125000,minimumContributionDamage:scenario==='reward-unconfigured'?null:125000,cleared:issued},issuedAt:issued?new Date(now).toISOString():null,expiresAt:issued?new Date(now+86400000*30).toISOString():null,items};
 const rescue:RaidRoomRescueReward={roomId:room.roomId,status:clear.status,rescueGate:{status:clear.clearGate.status,minimumBattles:scenario==='reward-unconfigured'?null:2,minimumContributionDamage:scenario==='reward-unconfigured'?null:125000},issuedAt:clear.issuedAt,expiresAt:clear.expiresAt,items};
 return {room,briefing:resource(briefing),display:resource(display),participants:resource(people),people,currentUserId,plan,clear,rescue,role};
}

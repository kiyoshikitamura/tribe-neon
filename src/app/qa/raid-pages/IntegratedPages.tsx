'use client';
import React, { useEffect, useMemo, useRef } from 'react';
import RaidRoomRescuePanel from '@/app/components/raid/RaidRoomRescuePanel';
import RaidRoomBrowser from '@/app/components/raid/RaidRoomBrowser';
import { createRaidRoomController } from '@/domain/raidRoomClient';
import { RAID_TOP_ENEMIES } from '@/domain/raidTopAssets';
import { createTopFixture } from '../raid-top/topFixture';
import { createDetailFixture } from '../raid-detail/detailFixture';
import type { RaidEnemyLoader, RaidListLoader } from '@/domain/raidPages';
import pool from '@/domain/gameplay/canonical/data/quest_enemy_pools_20260830.json';
import skills from '@/domain/gameplay/canonical/data/skills_20260821.json';
import { ITEMS_MASTER_DATA } from '@/utils/items_master_data';

export function fixtureEnemySkills(variantId: string) {
  const enemy = RAID_TOP_ENEMIES.find(entry => entry.variantId === variantId);
  if (!enemy) throw Error('Unknown canonical enemy');
  return Object.fromEntries(enemy.roster.map(member => {
    const override = pool.entries.filter(entry => entry.characterId === member.id && entry.difficulty === 'HARD').sort((a, b) => b.localAffinity.localeCompare(a.localAffinity) || b.weight-a.weight)[0];
    const exclusive = skills.skills.filter(skill => skill.exclusive_character_id === member.id).sort((a, b) => a.skill_id.localeCompare(b.skill_id)).slice(0, 2);
    const regular = skills.skills.filter(skill => skill.exclusive_character_id === null).sort((a, b) => a.skill_id.localeCompare(b.skill_id)).slice(0, 2);
    const refs = override?.skillLoadout ?? (exclusive.length ? exclusive : regular).map(skill => skill.skill_id);
    return [member.id, refs.map(id => { const skill = skills.skills.find(entry => entry.skill_id === id); if (!skill) throw Error('Unknown canonical skill'); return { id, name: skill.name }; })];
  }));
}
export default function IntegratedPages({ scenario, now, onAction }: { scenario:string; now:number; onAction:(value:string)=>void }) {
  const connection = useMemo(() => {
    const fixture=createDetailFixture(scenario==='owner'||scenario==='rescue'||scenario==='cleared'||scenario==='expired'?scenario:'member',now);
    const top=createTopFixture('single',now);if(top.participating.status!=='ready')throw Error('Fixture');
    const base=top.participating.data[0];
    const controller=createRaidRoomController({listRooms:async()=>{throw Error('Legacy full-list must not be called');},getRoom:async id=>({...fixture.room,roomId:id}),listParticipants:async id=>fixture.people.map(person=>({...person,roomId:id})),getRewards:async()=>[],getBriefing:async id=>({...fixture.briefing.data!,roomId:id}),listBossChoices:async()=>RAID_TOP_ENEMIES.slice(0,2).map(enemy=>({raidVariantId:enemy.variantId,name:enemy.bossName})),createRoom:async request=>{onAction(`create:${request.requestId}`);return {...fixture.room,roomId:'qa-created',difficultyId:request.difficultyId};},joinRoom:async request=>({roomId:request.roomId,replayId:'qa-replay'})});
    const loadListPage:RaidListLoader=async(difficulty,offset)=>{onAction(`list:${difficulty}:${offset}`);if(scenario==='error')throw Error('Mock list error');return {entries:Array.from({length:offset===0?20:1},(_,index)=>({...base,room:{...fixture.room,roomId:`qa-room-${offset+index}`,difficultyId:difficulty}})),nextOffset:offset===0?20:null};};
    const loadEnemyInfo:RaidEnemyLoader=async variant=>({variantId:variant,skillsByCharacterId:fixtureEnemySkills(variant),clearPlan:fixture.plan,rescuePlan:fixture.plan});
    return {controller,loadListPage,loadEnemyInfo,fixture,loadDisplay:async(id:string)=>({...fixture.display.data!,roomId:id})};
  },[scenario,now,onAction]);
  const connections=useRef(new Map<typeof connection,number>());
  useEffect(()=>{const counts=connections.current;counts.set(connection,(counts.get(connection)??0)+1);return()=>{counts.set(connection,(counts.get(connection)??0)-1);queueMicrotask(()=>{if(!counts.get(connection)){connection.controller.dispose();counts.delete(connection);}});};},[connection]);
  return <RaidRoomBrowser renderRescue={(room,disabled)=><RaidRoomRescuePanel roomId={room.roomId} userId={connection.fixture.currentUserId} disabled={disabled} setInteractionBlocking={()=>{}} client={{getLink:async()=>({roomId:room.roomId,rescueId:'qa-rescue',channel:'ACTIVITY',guildId:null}),join:async()=>({roomId:room.roomId,membershipStatus:'joined',viaRescue:true}),getStatus:async()=>({roomId:room.roomId,isOwner:true,requestEnabled:true,activityCount:0,guildCount:0,maxPerChannel:3,viaRescue:false,finalizedBattles:0,contributionDamage:0}),request:async(roomId,requestId)=>({roomId,requestId,activityCount:1,guildCount:1,maxPerChannel:3,publications:[]})}} />} controller={connection.controller} currentUserId={connection.fixture.currentUserId} loadDisplay={connection.loadDisplay} loadListPage={connection.loadListPage} loadEnemyInfo={connection.loadEnemyInfo} resolveRewardName={id=>ITEMS_MASTER_DATA.find(item=>item.id===id)?.name} onBattleReady={()=>onAction('battle')} onBriefingReady={()=>onAction('briefing')} setInteractionBlocking={()=>{}} />;
}

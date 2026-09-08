'use client';
import React,{useEffect,useMemo,useState,useRef} from 'react';
import {GameContext} from '@/app/context/GameContext';
import HubPage from '@/app/components/ui/HubPage';
import OutlawButton from '@/app/components/ui/OutlawButton';
import CanonicalDialog from '@/app/components/ui/CanonicalDialog';
import PublicUserProfile from '@/app/components/profile/PublicUserProfile';
import RaidRoomDetail from '@/app/components/raid/RaidRoomDetail';
import RaidRoomBrowser from '@/app/components/raid/RaidRoomBrowser';
import {createRaidRoomController} from '@/domain/raidRoomClient';
import RaidRoomDialogs from '@/app/components/raid/RaidRoomDialogs';
import RaidRoomClearRewardPanel from '@/app/components/raid/RaidRoomClearRewardPanel';
import RaidRoomRescueRewardPanel from '@/app/components/raid/RaidRoomRescueRewardPanel';
import {createDetailFixture,DETAIL_SCENARIOS,type DetailScenario,success} from './detailFixture';
import {RAID_TOP_ENEMIES} from '@/domain/raidTopAssets';
import '@/app/components/RaidTab.css';
import './RaidDetailHarness.css';
export default function RaidDetailHarness(){
 const [integrated,setIntegrated]=useState(false);
 const [scenario,setScenario]=useState<DetailScenario>('member');const [now]=useState(()=>Date.now());
 const fixture=useMemo(()=>createDetailFixture(scenario,now),[scenario,now]);
 const [kind,setKind]=useState<'participants'|'rewards'|null>(null);const [profile,setProfile]=useState<string|null>(null);const [destination,setDestination]=useState<string|null>(null);const [profileError,setProfileError]=useState(false);
 const context=useMemo(()=>({playCyberSe:()=>undefined}),[]);
 const clearClient=useMemo(()=>({getReward:async()=>{if(scenario==='reward-error')throw Error('QA failure');return fixture.clear;}}),[scenario,fixture]);
 const rescueClient=useMemo(()=>({getReward:async()=>{if(scenario==='reward-error')throw Error('QA failure');return fixture.rescue;}}),[scenario,fixture]);
 const openProfile=async(userId:string)=>{if(scenario==='profile-error'){setProfileError(true);throw Error('QA profile failure');}setProfile(userId);};
 const openPresents=()=>{setKind(null);setDestination('通常プレゼントBOXへの受け渡し確認');};
 return <GameContext.Provider value={context}><main className="raid-detail-qa"><header className="raid-detail-qa-tools"><label>Mockシナリオ<select aria-label="Mockシナリオ" value={scenario} onChange={event=>{setKind(null);setProfile(null);setScenario(event.target.value as DetailScenario);}}>{DETAIL_SCENARIOS.map(key=><option key={key}>{key}</option>)}</select></label><label><input type="checkbox" aria-label="実Browser統合" checked={integrated} onChange={e=>setIntegrated(e.target.checked)}/>実Browser統合</label><small>Mock専用・実戦闘/受取なし</small></header>
 <div className="raid-detail-qa-content"><HubPage title="レイド" hideVisualHeader className="raid-view">{integrated?<IntegratedDetail fixture={fixture} onOpenProfile={openProfile} profileOpen={!!profile} onNavigate={setDestination}/>:<RaidRoomDetail room={fixture.room} briefing={fixture.briefing} display={fixture.display} participants={fixture.participants} currentUserId={fixture.currentUserId} now={now} busy={scenario==='loading'} onParticipants={()=>setKind('participants')} onRewards={()=>setKind('rewards')} onEnemyInfo={()=>setDestination('既存敵編成への受け渡し確認')} action={<OutlawButton fullWidth disabled={scenario==='cleared'||scenario==='expired'||scenario==='loading'} onClick={()=>setDestination('既存参加・出撃への受け渡し確認')}>{fixture.role==='not_joined'?'参加する':'挑む'}</OutlawButton>} />}</HubPage></div>
 <footer className="raid-detail-qa-footer"><OutlawButton onClick={()=>setDestination('トップへ戻るMock')}>トップへ</OutlawButton></footer>
 <RaidRoomDialogs kind={kind} roomId={fixture.room.roomId} ownerUserId="qa-person-0" currentUserId={fixture.currentUserId} participants={fixture.participants} onClose={()=>setKind(null)} onRefresh={()=>undefined} onOpenProfile={openProfile} profileOpen={!!profile} rewards={success([])} renderRewards={(roomId)=><><h3>討伐報酬</h3><RaidRoomClearRewardPanel client={clearClient} roomId={roomId} userId={fixture.currentUserId} plan={fixture.plan} onOpenPresents={openPresents}/><h3>救援報酬</h3><RaidRoomRescueRewardPanel client={rescueClient} roomId={roomId} plan={fixture.plan} onOpenPresents={openPresents}/></>}/>
 {profile&&<PublicUserProfile profile={{id:profile,status:'ready',username:fixture.people.find(p=>p.player.userId===profile)?.player.name||'確認用参加者',level:30,leaderCharacterId:RAID_TOP_ENEMIES[0].roster[0].id,guildId:scenario==='no-guild'?null:'qa-guild',guildName:scenario==='no-guild'?null:'確認用Guild',bio:'参加者一覧からの往復確認',totalPower:240000}} currentUserId={fixture.currentUserId} onClose={()=>setProfile(null)} onRetry={()=>undefined} onGuild={()=>{setProfile(null);setKind(null);setDestination('既存Guild遷移への受け渡し確認');}} onDm={()=>{setProfile(null);setKind(null);setDestination('既存DM遷移への受け渡し確認');}}/>}
 {destination&&<CanonicalDialog title="導線確認（Mock）" onClose={()=>setDestination(null)} actions={[{label:'戻る',onClick:()=>setDestination(null)}]}><p>{destination}</p></CanonicalDialog>}
 <output hidden data-testid="profile-error">{profileError?'error':''}</output>
 </main></GameContext.Provider>;
}

function IntegratedDetail({fixture,onOpenProfile,profileOpen,onNavigate}:{fixture:ReturnType<typeof createDetailFixture>;onOpenProfile:(id:string)=>Promise<void>;profileOpen:boolean;onNavigate:(label:string)=>void}){
 const connection=useMemo(()=>({controller:createRaidRoomController({listRooms:async()=>[fixture.room],getRoom:async()=>fixture.room,listParticipants:async()=>fixture.people,getRewards:async()=>[],getBriefing:async()=>{if(!fixture.briefing.data)throw Error('QA briefing unavailable');return fixture.briefing.data;},registerParticipation:async()=>({roomId:fixture.room.roomId,membershipStatus:'joined'}),joinRoom:async()=>({roomId:fixture.room.roomId,replayId:'qa-replay'})})}),[fixture]);
 const loadDisplay=useMemo(()=>async()=>{if(!fixture.display.data)throw Error('QA display unavailable');return fixture.display.data;},[fixture]);
 const clearClient=useMemo(()=>({getReward:async()=>fixture.clear}),[fixture]);const rescueClient=useMemo(()=>({getReward:async()=>fixture.rescue}),[fixture]);
 const counts=useRef(new Map<object,number>());
 useEffect(()=>{const map=counts.current;map.set(connection,(map.get(connection)||0)+1);void connection.controller.selectRoom(fixture.room.roomId);return()=>{map.set(connection,(map.get(connection)||0)-1);queueMicrotask(()=>{if(!map.get(connection)){connection.controller.dispose();map.delete(connection);}});};},[connection,fixture.room.roomId]);
 return <RaidRoomBrowser controller={connection.controller} currentUserId={fixture.currentUserId} loadDisplay={loadDisplay} onBattleReady={()=>onNavigate('既存戦闘への受け渡し確認')} onBriefingReady={()=>onNavigate('既存出撃準備への受け渡し確認')} setInteractionBlocking={()=>{}} onOpenProfile={onOpenProfile} profileOpen={profileOpen} renderRewards={(roomId,close)=><><h3>討伐報酬</h3><RaidRoomClearRewardPanel client={clearClient} roomId={roomId} userId={fixture.currentUserId} plan={fixture.plan} onOpenPresents={()=>{close();onNavigate('通常プレゼントBOXへの受け渡し確認');}}/><h3>救援報酬</h3><RaidRoomRescueRewardPanel client={rescueClient} roomId={roomId} plan={fixture.plan} onOpenPresents={()=>{close();onNavigate('通常プレゼントBOXへの受け渡し確認');}}/></>}/>;
}

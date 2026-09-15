'use client';
import { useEffect, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { CHARACTERS_MASTER, getCharacterTransparentImg } from '@/utils/game_constants';
import { isEncounterPresentationSafe, revisitableQuestEncounters, type QuestRaidEncounter as Encounter } from '@/domain/quest/raidEncounter';
import FullScreenPanel from '../ui/FullScreenPanel';
import OutlawButton from '../ui/OutlawButton';
import { hasPresentedDialog } from '../ui/dialogPresence';
import './QuestRaidEncounter.css';
const towns:Record<string,string>={shinjuku:'新宿',shibuya:'渋谷',ikebukuro:'池袋',roppongi:'六本木',akihabara:'秋葉原',kawasaki:'川崎',yokohama:'横浜'};
const grades={beginner:'初級',intermediate:'中級',advanced:'上級'};
const paint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));

export default function QuestRaidEncounter() {
 const {questRaidEncounter,questEncounterDismissedVisit,setQuestEncounterDismissedVisit,openQuestEncounterRaid,
  activeTab,setActiveTab,battleState,scoutAnimationState,confirmDialogConfig,showMissionPanel,showPatrolRewardModal,
  globalInteractionBlocking,setGlobalInteractionBlocking,onboardingState,session}=useGame();
 const [shown,setShown]=useState<Encounter|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
 const safe=isEncounterPresentationSafe({battle:battleState,gacha:scoutAnimationState,dialog:confirmDialogConfig,mission:showMissionPanel,patrolReward:showPatrolRewardModal,blocked:globalInteractionBlocking});
 useEffect(()=>{setShown(null);setError(null);},[session?.user?.id]);
 useEffect(()=>{
  if(shown||!safe||hasPresentedDialog()||questEncounterDismissedVisit||!onboardingState?.gameplay_authorized||!['home','patrol','quest','raid'].includes(activeTab))return;
  const next=questRaidEncounter.entries.find((e:Encounter)=>!e.acknowledged);
  if(next)setShown(next);
 },[shown,safe,activeTab,questRaidEncounter.entries,questEncounterDismissedVisit,onboardingState?.gameplay_authorized]);
 async function proceed(entry:Encounter,raid:boolean){
  if(busy)return;setBusy(true);setGlobalInteractionBlocking(true);setError(null);
  try{
   if(raid&&entry.roomId)await openQuestEncounterRaid(entry.roomId);
   if(!await questRaidEncounter.acknowledge(entry))return;
   if(!raid)setActiveTab('patrol');
   setQuestEncounterDismissedVisit(true);
   await paint();setShown(null);
  }catch{setError('画面を開けませんでした。もう一度お試しください。');}
  finally{setBusy(false);setGlobalInteractionBlocking(false);}
 }
 const revisitable=revisitableQuestEncounters(questRaidEncounter.entries, Date.now());
 const master=shown?CHARACTERS_MASTER.find(c=>c.id===shown.leaderId):null;
 const ended=shown&&(shown.ended||Boolean(shown.expiresAt&&Date.parse(shown.expiresAt)<=Date.now()));
 return <>
  {!shown&&!battleState&&['raid','patrol','quest'].includes(activeTab)&&revisitable.length>0&&<section className="quest-encounter-revisit" aria-label="発見した強敵">{revisitable.map((e:Encounter)=><div key={e.patrolId}><span>{towns[e.areaId]} ／ {e.difficulty&&grades[e.difficulty]}</span><strong>{e.bossName}</strong><span className="quest-encounter-bonus">{e.bonusCash !== undefined ? `撃破で追加CASH ${e.bonusCash.toLocaleString()} / EXP ${e.bonusUserXp ?? 0}` : '撃破ボーナス'}</span><OutlawButton onClick={()=>proceed(e,true)} disabled={busy}>挑む</OutlawButton></div>)}</section>}
  {!shown&&!battleState&&activeTab==='raid'&&questRaidEncounter.error&&<div role="alert">{questRaidEncounter.error}<OutlawButton onClick={()=>questRaidEncounter.refresh()}>再試行</OutlawButton></div>}
  {shown&&<FullScreenPanel className="quest-encounter-panel" onClose={()=>{void proceed(shown,false);}} showCloseButton={false} closeDisabled={busy}>
   <div className="quest-encounter-scene" style={{backgroundImage:`linear-gradient(0deg,#0b1019,transparent),url('/bg/bg_street_${towns[shown.areaId]?shown.areaId:'shinjuku'}.jpg')`}}>
    <span className="quest-encounter-area">{towns[shown.areaId]} ／ {shown.difficulty&&grades[shown.difficulty]}</span>
    <h1>{ended?'遭遇終了':'強敵出現'}</h1>
    {master&&<img src={getCharacterTransparentImg(master.name)} alt={master.jpName}/>}
   </div>
   <div className="quest-encounter-actions">
    <p>{ended?'この強敵との戦いは終了しました':'レイドボスを発見！'}</p><h2>{shown.bossName}</h2>
    {shown.bonusCash !== undefined && <span className="quest-encounter-bonus">撃破で追加CASH {shown.bonusCash.toLocaleString()} / EXP {shown.bonusUserXp ?? 0}</span>}
    {error&&<p role="alert">{error}</p>}
    {!ended&&<OutlawButton variant="primary" fullWidth disabled={busy} onClick={()=>proceed(shown,true)}>今すぐ挑む</OutlawButton>}
    <OutlawButton fullWidth disabled={busy} onClick={()=>proceed(shown,false)}>{ended?'探索へ':'あとで'}</OutlawButton>
   </div>
  </FullScreenPanel>}
 </>;
}

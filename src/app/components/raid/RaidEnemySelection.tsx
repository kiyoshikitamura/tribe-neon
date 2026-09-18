"use client";
import React, { useState } from "react";
import type { RaidBossChoice,RaidRoomResource } from "@/domain/raidRoomClient";
import { RAID_DIFFICULTIES,type RaidDifficultyId,type RaidObserved } from "@/domain/raidRoom";
import type { RaidRewardPlan } from "@/domain/raidRoomDisplay";
import { resolveRaidTopEnemy } from "@/domain/raidTopAssets";
import { getRaidParticipationRequirement } from "@/domain/raidRoomPresentation";
import SectionHeader from "../ui/SectionHeader";
import OutlawButton from "../ui/OutlawButton";
import SubTabNav from "../ui/SubTabNav";
import CanonicalItemIcon from "../ui/CanonicalItemIcon";
import CanonicalDialog from "../ui/CanonicalDialog";
import { RAID_BACKGROUND_FALLBACK,RAID_PERSON_FALLBACK,useRaidPageAssets,RaidPageSpinner } from "./raidPagePresentation";
import "./RaidEnemySelection.css";
import RaidStrategySummary from "./RaidStrategySummary";
import RaidRewardComparison from "./RaidRewardComparison";
import type { RaidEnemyInfo } from "@/domain/raidPages";

export interface RaidEnemySelectionProps {
 choices:RaidRoomResource<readonly RaidBossChoice[]>;selectedVariantId:string;memberCharacterIds?:readonly string[]|null;
 difficultyId:RaidDifficultyId;onSelectVariant:(id:string)=>void;onSelectDifficulty:(id:RaidDifficultyId)=>void;
 onConfirm:()=>void;onCancel:()=>void;onRetry:()=>void;busy:boolean;canConfirm?:boolean;error?:string|null;
 rewardPlan?:RaidRoomResource<RaidRewardPlan>;resolveRewardName?:(id:string)=>string|null|undefined;
 onEnemyInfo?:(variantId:string)=>void;skillsByCharacterId?:RaidObserved<Readonly<Record<string,readonly {id:string;name:string}[]>>>;
 enemyInfo?:RaidRoomResource<RaidEnemyInfo>;
}
export default function RaidEnemySelection({choices,selectedVariantId,memberCharacterIds,difficultyId,onSelectDifficulty,onConfirm,onCancel,onRetry,busy,canConfirm=true,error,onEnemyInfo,skillsByCharacterId,enemyInfo}:RaidEnemySelectionProps){
 const [rewardOpen,setRewardOpen]=useState(false);
 const candidates=choices.status==='success'?choices.data??[]:[];
 const selectedChoice=candidates.find(choice=>choice.raidVariantId===selectedVariantId);
 const enemy=selectedChoice?resolveRaidTopEnemy(selectedChoice.raidVariantId,memberCharacterIds??undefined):null;
 const assets=useRaidPageAssets(enemy?[{src:enemy.backgroundUrl,fallbackSrc:RAID_BACKGROUND_FALLBACK},...enemy.roster.map(member=>({src:member.imageUrl,fallbackSrc:RAID_PERSON_FALLBACK}))]:[]);
 if(choices.status==='loading'||!assets.ready)return <RaidPageSpinner/>;
 const loadingProfile=enemyInfo?.status==='loading'||enemyInfo?.status==='idle';
 const profile=enemyInfo?.status==='success'?enemyInfo.data:null;
 return <section className="raid-enemy-selection raid-enemy-selection--fixed" aria-label="街別レイド挑戦">
  <OutlawButton loadingLabel="" fullWidth disabled={busy} onClick={onCancel}>トップへ戻る</OutlawButton>
  {choices.status==='error'||assets.failed?<div role="alert"><p>挑戦先を取得できませんでした。</p><OutlawButton loadingLabel="" disabled={busy} onClick={assets.failed?assets.retry:onRetry}>再試行</OutlawButton></div>:!selectedChoice||!enemy?<p>選択した街の敵情報を取得できませんでした。</p>:<>
   <div className="raid-enemy-selection__selected-hero"><img src={assets.resolve(enemy.backgroundUrl)} alt=""/><div><span>{enemy.areaName}</span><h2>{enemy.bossName}</h2></div></div>
   <h3>難易度</h3>
   <SubTabNav tabs={RAID_DIFFICULTIES.map(entry=>({id:entry.id,label:entry.label,disabled:busy}))} activeTabId={difficultyId} onSelect={id=>onSelectDifficulty(id as RaidDifficultyId)}/>
   <p className="raid-enemy-selection__requirement">{getRaidParticipationRequirement(difficultyId)}</p>
   {loadingProfile&&<RaidPageSpinner/>}
   {enemyInfo?.status==='error'&&<p role="alert">選択した難易度の敵編成を取得できませんでした。難易度を選び直してください。</p>}
   {profile&&<>
    <div className="raid-enemy-selection__hp"><span>敵HP</span><strong>{profile.maxHp.toLocaleString('ja-JP')}</strong></div>
    <div className="raid-enemy-selection__members" aria-label="敵5人の編成">
     {enemy.roster.map((member,index)=>{
      const detail=profile.members.find(row=>row.characterId===member.id);
      const skills=profile.skillsByCharacterId[member.id]??[];
      return <article key={member.id} className="raid-enemy-selection__member">
       <img src={assets.resolve(member.imageUrl)} alt=""/>
       <strong>{member.name}</strong>
       <div className="raid-enemy-selection__loadout">
        <span className="raid-enemy-selection__loadout-label">装備</span>
        <div>{detail?.equipmentIds.map(id=><CanonicalItemIcon key={id} itemId={id} className="raid-enemy-selection__loadout-icon"/>)}</div>
        <span className="raid-enemy-selection__loadout-label">スキル</span>
        <div>{skills.map(skill=><span key={skill.id} className="raid-enemy-selection__skill-icon" title={skill.name}>S</span>)}</div>
       </div>
      </article>;
     })}
    </div>
    {onEnemyInfo&&<OutlawButton loadingLabel="" fullWidth disabled={busy} onClick={()=>onEnemyInfo(selectedVariantId)}>敵情報を見る</OutlawButton>}
    <RaidStrategySummary areaId={enemy.baseId}/>
    <OutlawButton loadingLabel="" fullWidth variant="primary" disabled={busy||loadingProfile||!canConfirm||!profile} onClick={onConfirm}>この敵に挑む</OutlawButton>
    <OutlawButton loadingLabel="" fullWidth variant="secondary" disabled={busy} onClick={()=>setRewardOpen(true)}>報酬を確認</OutlawButton>
   </>}
  </>}
  {error&&<p role="alert">{error.replaceAll('Room','レイド')}</p>}
  {rewardOpen&&<CanonicalDialog title="レイド報酬" onClose={()=>setRewardOpen(false)} actions={[{label:"閉じる",onClick:()=>setRewardOpen(false)}]}><RaidRewardComparison selected={difficultyId}/></CanonicalDialog>}
 </section>;
}

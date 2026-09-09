"use client";
import type { RaidBossChoice,RaidRoomResource } from "@/domain/raidRoomClient";
import { RAID_DIFFICULTIES,type RaidDifficultyId,type RaidObserved } from "@/domain/raidRoom";
import type { RaidRewardPlan } from "@/domain/raidRoomDisplay";
import { resolveRaidTopEnemy } from "@/domain/raidTopAssets";
import { getRaidParticipationRequirement } from "@/domain/raidRoomPresentation";
import OutlawButton from "../ui/OutlawButton";
import SubTabNav from "../ui/SubTabNav";
import CanonicalItemIcon, { canonicalItemAssetPath } from "../ui/CanonicalItemIcon";
import { RAID_BACKGROUND_FALLBACK,RAID_PERSON_FALLBACK,useRaidPageAssets,RaidPageSpinner } from "./raidPagePresentation";
import "./RaidEnemySelection.css";
export interface RaidEnemySelectionProps {choices:RaidRoomResource<readonly RaidBossChoice[]>;selectedVariantId:string;memberCharacterIds?:readonly string[]|null;difficultyId:RaidDifficultyId;onSelectVariant:(id:string)=>void;onSelectDifficulty:(id:RaidDifficultyId)=>void;onConfirm:()=>void;onCancel:()=>void;onRetry:()=>void;busy:boolean;canConfirm?:boolean;error?:string|null;rewardPlan?:RaidRoomResource<RaidRewardPlan>;resolveRewardName?:(id:string)=>string|null|undefined;onEnemyInfo?:(variantId:string)=>void;skillsByCharacterId?:RaidObserved<Readonly<Record<string,readonly {id:string;name:string}[]>>>;}
export default function RaidEnemySelection({choices,selectedVariantId,memberCharacterIds,difficultyId,onSelectVariant,onSelectDifficulty,onConfirm,onCancel,onRetry,busy,canConfirm=true,error,rewardPlan,resolveRewardName,onEnemyInfo,skillsByCharacterId}:RaidEnemySelectionProps){
 const candidates=choices.status==='success'?choices.data??[]:[];
 const entries=candidates.map(choice=>{const rosterKnown=memberCharacterIds===undefined||(choice.raidVariantId===selectedVariantId&&memberCharacterIds!==null);return {choice,rosterKnown,enemy:resolveRaidTopEnemy(choice.raidVariantId,rosterKnown&&choice.raidVariantId===selectedVariantId?memberCharacterIds:undefined)};});
 const selectedEntry=entries.find(({choice})=>choice.raidVariantId===selectedVariantId);
 const selectedEnemy=selectedEntry?.rosterKnown?selectedEntry.enemy:null;
 const leaderId=selectedEnemy?.roster[0]?.id;
 const leaderSkills=skillsByCharacterId?.status==='available'&&leaderId?skillsByCharacterId.value[leaderId]:undefined;
 const rewardAssets=rewardPlan?.status==="success"?rewardPlan.data?.items.flatMap(item=>{const src=canonicalItemAssetPath(item.itemId);return src?[{src,fallbackSrc:RAID_BACKGROUND_FALLBACK}]:[];})??[]:[];
 const assets=useRaidPageAssets([...rewardAssets,...entries.flatMap(({enemy,rosterKnown})=>enemy?[{src:enemy.backgroundUrl,fallbackSrc:RAID_BACKGROUND_FALLBACK},...(rosterKnown?[{src:enemy.leaderImageUrl,fallbackSrc:RAID_PERSON_FALLBACK}]:[])]:[])]);
 if(choices.status==='loading'||!assets.ready)return <RaidPageSpinner/>;
 return <section className="raid-enemy-selection" aria-label="挑む敵を選ぶ"><h2>挑む敵を選ぶ</h2>
 {choices.status==='error'||assets.failed?<div role="alert"><p>挑戦先を取得できませんでした。</p><OutlawButton loadingLabel="" disabled={busy} onClick={assets.failed?assets.retry:onRetry}>再試行</OutlawButton></div>:choices.status==='idle'?<p>本日の対象は未取得です。</p>:<>
 {entries.length===0?<p>現在、挑戦できる敵はいません。</p>:<div className="raid-enemy-selection__choices" role="group" aria-label="本日の挑戦先">{entries.map(({choice,enemy,rosterKnown})=><button type="button" key={choice.raidVariantId} className="raid-enemy-selection__card active-scale-effect" aria-pressed={selectedVariantId===choice.raidVariantId} disabled={busy} onClick={()=>onSelectVariant(choice.raidVariantId)}>{enemy&&<><img className="raid-enemy-selection__background" src={assets.resolve(enemy.backgroundUrl)} alt=""/>{rosterKnown&&<img className="raid-enemy-selection__leader" src={assets.resolve(enemy.leaderImageUrl)} alt=""/>}</>}<span className="raid-enemy-selection__caption"><span>{enemy?.areaName??'エリア未確認'}</span><strong>{enemy?.bossName??choice.name}</strong>{enemy&&rosterKnown?<span>先頭：{enemy.roster[0].name} / 敵{enemy.roster.length}人</span>:<span>敵編成は未取得です。</span>}<span>{selectedVariantId===choice.raidVariantId?'選択中':'この敵を選ぶ'}</span></span></button>)}</div>}
 {selectedEnemy&&<div className="raid-enemy-selection__skills"><h3>先頭の使用スキル</h3>{leaderSkills===undefined?<p className="raid-enemy-selection__muted">使用スキルは未取得です。</p>:leaderSkills.length===0?<p>使用スキルはありません。</p>:<ul>{leaderSkills.slice(0,2).map(skill=><li key={skill.id}>{skill.name}</li>)}</ul>}</div>}
 {onEnemyInfo&&candidates.some(choice=>choice.raidVariantId===selectedVariantId)&&<OutlawButton loadingLabel="" disabled={busy} onClick={()=>onEnemyInfo(selectedVariantId)}>敵情報を見る</OutlawButton>}
 <h3>難易度</h3><SubTabNav tabs={RAID_DIFFICULTIES.map(entry=>({id:entry.id,label:entry.label,disabled:busy}))} activeTabId={difficultyId} onSelect={id=>onSelectDifficulty(id as RaidDifficultyId)}/><p className="raid-enemy-selection__requirement">{getRaidParticipationRequirement(difficultyId)}</p>
 <div className="raid-enemy-selection__reward"><h3>討伐報酬の予定</h3>{rewardPlan?.status==='loading'?<RaidPageSpinner/>:rewardPlan?.status==='error'?<p role="alert">報酬予定を取得できませんでした。</p>:rewardPlan?.status==='success'&&rewardPlan.data?.status==='configured'?<ul>{rewardPlan.data.items.map(item=><li key={item.itemId}>{canonicalItemAssetPath(item.itemId) && assets.resolve(canonicalItemAssetPath(item.itemId)!)===canonicalItemAssetPath(item.itemId) ? <CanonicalItemIcon itemId={item.itemId} alt="" fallback={null}/> : <span aria-label="アイコン未取得"/>}<span>{resolveRewardName?.(item.itemId)??'報酬アイテム'} × {item.quantity.toLocaleString('ja-JP')}</span></li>)}</ul>:<p>{rewardPlan?.status==='success'?'報酬予定は未設定です。':'報酬予定は未取得です。'}</p>}<p className="raid-enemy-selection__muted">獲得には参加・貢献などの条件があります。</p></div>
 <p className="raid-enemy-selection__muted">選んだ敵と難易度を確認して挑んでください。</p>
 <OutlawButton loadingLabel="" fullWidth variant="primary" disabled={busy||!canConfirm||!candidates.some(choice=>choice.raidVariantId===selectedVariantId)} onClick={onConfirm}>この敵に挑む</OutlawButton></>}
 {error&&<p role="alert">{error.replaceAll('Room','レイド')}</p>}<OutlawButton loadingLabel="" fullWidth disabled={busy} onClick={onCancel}>選択を閉じる</OutlawButton></section>;
}

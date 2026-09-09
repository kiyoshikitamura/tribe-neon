"use client";
import type {RaidObserved} from "@/domain/raidRoom";
import {findCanonicalRaidVariant} from "@/domain/presentation/raidRosterPresentation";
import {resolveRaidTopEnemy} from "@/domain/raidTopAssets";
import {CHARACTERS_MASTER} from "@/utils/game_constants";
import PvpDeckPresentation from "../pvp/PvpDeckPresentation";
import OutlawButton from "../ui/OutlawButton";
import {RAID_PERSON_FALLBACK,RAID_BACKGROUND_FALLBACK,useRaidPageAssets,RaidPagePortrait,RaidPageSpinner} from "./raidPagePresentation";
import "./RaidEnemyRoster.css";
export interface RaidEnemyRosterProps {bossMasterId?:string;raidName?:string;className?:string;presentation?:"compact"|"detail";skillsByCharacterId?:RaidObserved<Readonly<Record<string,readonly {id:string;name:string}[]>>>;}
export default function RaidEnemyRoster({bossMasterId,raidName,className='',presentation='compact',skillsByCharacterId}:RaidEnemyRosterProps){
 const variant=findCanonicalRaidVariant(bossMasterId,raidName);const enemy=variant?resolveRaidTopEnemy(variant.raidVariantId):null;
 const assets=useRaidPageAssets(enemy?[{src:enemy.backgroundUrl,fallbackSrc:RAID_BACKGROUND_FALLBACK},...enemy.roster.map(member=>({src:member.imageUrl,fallbackSrc:RAID_PERSON_FALLBACK}))]:[]);
 if(!assets.ready)return <RaidPageSpinner/>;
 if(!enemy)return <p className="raid-enemy-roster__notice">敵の編成情報は未取得です。</p>;
 if(assets.failed)return <div role="alert"><p>敵画像を取得できませんでした。</p><OutlawButton loadingLabel="" onClick={assets.retry}>再試行</OutlawButton></div>;
 if(presentation==="compact")return <section className={`raid-enemy-roster raid-enemy-roster--compact ${className}`} aria-label="レイドのエネミーメンバー" data-raid-variant-id={enemy.variantId} data-roster-ready="true"><header><strong>メンバー</strong><span>{enemy.roster.length}人</span></header><div className="raid-enemy-roster__content"><PvpDeckPresentation ariaLabel="レイドのエネミーメンバー一覧" members={enemy.roster.map((member,index)=>({key:`${enemy.variantId}-${index}`,characterId:member.id,name:member.name,imageSrc:assets.resolve(member.imageUrl)}))}/><div className="raid-enemy-roster__names">{enemy.roster.map((member,index)=><span key={`${member.id}-${index}`}>{member.name}</span>)}</div></div></section>;
 return <section className={`raid-enemy-roster ${className}`} aria-label="レイドのエネミーメンバー" data-raid-variant-id={enemy.variantId} data-roster-ready="true"><div className="raid-enemy-roster__area"><img src={assets.resolve(enemy.backgroundUrl)} alt=""/><div><span>{enemy.areaName}</span><h3>{enemy.bossName}</h3><span>敵編成 {enemy.roster.length}人</span></div></div><ol className="raid-enemy-roster__members">{enemy.roster.map((member,index)=>{const master=CHARACTERS_MASTER.find(entry=>entry.id===member.id);const skills=skillsByCharacterId?.status==='available'?skillsByCharacterId.value[member.id]:undefined;return <li key={`${member.id}-${index}`}><div className="raid-enemy-roster__portrait"><RaidPagePortrait src={assets.resolve(member.imageUrl)} name={member.name}/></div><div className="raid-enemy-roster__identity"><span>{index===0?'先頭':`${index+1}人目`} / {master?({ORDER:'秩序',JUSTICE:'正義',EVIL:'悪',CHAOS:'混沌'} as Record<string,string>)[master.alignment]??'属性未確認':'属性未確認'}</span><strong>{member.name}</strong>{skills===undefined?<p>使用スキル未取得</p>:skills.length===0?<p>使用スキルなし</p>:<ul aria-label={`${member.name}の使用スキル`}>{skills.map(skill=><li key={skill.id}>{skill.name}</li>)}</ul>}</div></li>;})}</ol></section>;
}

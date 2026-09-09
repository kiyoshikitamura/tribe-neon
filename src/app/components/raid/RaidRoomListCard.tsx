"use client";
import type { RaidRoomDto,RaidObserved,RaidGuildSummary } from "@/domain/raidRoom";
import type { RaidTopEnemy } from "@/domain/raidTop";
import {getRaidDifficultyLabel} from "@/domain/raidRoomPresentation";
import {getRaidRoomLifecyclePresentation} from "@/domain/raidRoomLifecyclePresentation";
import OutlawCard from "../ui/OutlawCard";
import OutlawButton from "../ui/OutlawButton";
import {RAID_PERSON_FALLBACK,RAID_BACKGROUND_FALLBACK,useRaidPageAssets,RaidPagePortrait,RaidPageSpinner} from "./raidPagePresentation";
import "./RaidRoomListCard.css";
export interface RaidRoomListCardProps {room:RaidRoomDto;now:number|null;enemy?:RaidObserved<RaidTopEnemy>;ownerGuild?:RaidObserved<RaidGuildSummary|null>;membership?:RaidObserved<'owner'|'member'|'rescue'|'not_joined'>;onOpen:(roomId:string)=>void;busy?:boolean;}
export default function RaidRoomListCard({room,now,enemy,ownerGuild,membership,onOpen,busy}:RaidRoomListCardProps){
 const foe=enemy?.status==='available'?enemy.value:null;const owner=room.owner.status==='available'?room.owner.value:null;const icon=owner?.leaderIconUrl.status==='available'?owner.leaderIconUrl.value:null;
 const assets=useRaidPageAssets([...(foe?[{src:foe.backgroundUrl,fallbackSrc:RAID_BACKGROUND_FALLBACK},{src:foe.leaderImageUrl,fallbackSrc:RAID_PERSON_FALLBACK}]:[]),{src:icon??RAID_PERSON_FALLBACK,fallbackSrc:RAID_PERSON_FALLBACK}]);
 const lifecycle=getRaidRoomLifecyclePresentation(room,now);const hp=room.hp.status==='available'&&room.hp.value.max>0?room.hp.value:null;const percent=hp?Math.max(0,Math.min(100,hp.current/hp.max*100)):null;
 if(!assets.ready)return <RaidPageSpinner/>;
 if(assets.failed)return <div role="alert"><p>画像を取得できませんでした。</p><OutlawButton loadingLabel="" onClick={assets.retry}>再試行</OutlawButton></div>;
 return <OutlawCard className="raid-list-card"><div className="raid-list-card__visual">{foe&&<><img className="raid-list-card__background" src={assets.resolve(foe.backgroundUrl)} alt=""/><img className="raid-list-card__enemy" src={assets.resolve(foe.leaderImageUrl)} alt=""/></>}<div><span>{getRaidDifficultyLabel(room.difficultyId)} / {foe?.areaName??'エリア未確認'}</span><h3>{foe?.bossName??'敵情報未取得'}</h3></div></div>
 <div className="raid-list-card__body"><div className="raid-list-card__owner"><span className="raid-list-card__avatar"><RaidPagePortrait src={assets.resolve(icon??RAID_PERSON_FALLBACK)}/></span><div><span>主催者</span><strong>{owner?.name??'主催者未確認'}</strong><span>{ownerGuild?.status==='available'?ownerGuild.value?.name??'Guild未所属':'Guild未確認'}</span></div>{membership?.status==='available'&&membership.value!=='not_joined'&&<span className="raid-list-card__role">あなた：{({owner:'主催',member:'参加中',rescue:'救援参加',not_joined:''})[membership.value]}</span>}</div>
 <div className="raid-list-card__hp-label"><span>残HP <strong>{percent===null?'未確認':`${Number(percent.toFixed(1))}%`}</strong></span><span>{lifecycle.stateLabel}</span></div>{hp&&<progress className="raid-list-card__hp" aria-label="レイド残HP" value={Math.max(0,hp.current)} max={hp.max}/>}
 <div className="raid-list-card__facts"><span>{lifecycle.remainingLabel}</span><span>登録 {room.participantCount.status==='available'?`${room.participantCount.value}人`:'未確認'}</span></div><OutlawButton loadingLabel="" fullWidth onClick={()=>onOpen(room.roomId)} disabled={busy}>戦況を見る</OutlawButton></div></OutlawCard>;
}

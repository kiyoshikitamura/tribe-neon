"use client";
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import { getRarityBadgeAsset } from "@/utils/rarityAssets";
import { getAttributeBadgeAsset, getAttributeLabel } from "@/utils/attributeAssets";
import { CANONICAL_SKILL_VIEW } from "@/utils/skills_master_data";
import { SkillDetailDialog, SkillIconGrid } from "../skill/SkillPresentation";
import type { QuestBattleViewerProps } from "./QuestBattleViewer";
import "./StreetFlow.css";
import { preloadBattleImage } from "./battleAssetPreload";
import { exclusiveEquipmentForBattleMember } from "@/domain/presentation/exclusiveContent";
import { EXCLUSIVE_EYE_CUTINS } from "@/domain/presentation/approvedAssets20260914";

type Member = QuestBattleViewerProps["playerParty"][number];
const master = (m?:Pick<Member,"characterId">)=>CHARACTERS_MASTER.find(c=>c.id===m?.characterId || c.name===m?.characterId);
const art = (m?:Pick<Member,"characterId">)=>{const c=master(m);return c?getCharacterTransparentImg(c.name):undefined;};
const tactics = [{id:"ATTACK_PRIORITY",label:"攻撃優先"},{id:"HEAL_PRIORITY",label:"回復優先"},{id:"SKILL_PRIORITY",label:"スキル優先"},{id:"BALANCED",label:"バランス"},{id:"WEAKNESS_FOCUS",label:"弱点集中"}];
export default function StreetBattleSetup({playerParty,playerLeader,enemyParty,playerPower,enemyPower,tutorial,mode,label,background,tactic,onTactic,onStart,onBack,startLabel,backLabel,resourceLabel,enemyLeader,enemyDetails}:{playerParty:Member[];playerLeader?:Pick<Member,"characterId"|"name">|null;enemyParty:Member[];playerPower:number;enemyPower:number;tutorial:boolean;mode:string;label:string;background?:string;tactic:string;onTactic:(value:string)=>void;onStart:()=>void;onBack?:()=>void;startLabel?:string;backLabel?:string;resourceLabel?:string;enemyLeader?:Pick<Member,"characterId"|"name">;enemyDetails?:ReactNode}) {
  const [selected,setSelected] = useState<Member|null>(null);
  const [selectedSkill,setSelectedSkill] = useState<(typeof CANONICAL_SKILL_VIEW)[number]|null>(null);
  const [readySources,setReadySources] = useState<string|null>(null);
  const [failed,setFailed] = useState(false);
  const [retry,setRetry] = useState(0);
  const dialog=useRef<HTMLDialogElement>(null);
  const visiblePlayerLeader = playerLeader === undefined ? playerParty[0] : playerLeader;
  const visibleEnemyLeader = enemyLeader || enemyParty[0];
  const sources = JSON.stringify([...new Set([...playerParty,...enemyParty,...(playerLeader?[playerLeader]:[]),...(enemyLeader?[enemyLeader]:[])].flatMap(m=>{const c=master(m);return c?[getCharacterTransparentImg(c.name),getRarityBadgeAsset(c.rarity),getAttributeBadgeAsset(c.alignment)!]:[]}).concat([background || "/bg/bg_street_shinjuku.jpg","/effects/battle-v3/street-impact.webp","/effects/battle-v3/street-support.webp", ...playerParty.flatMap(member => exclusiveEquipmentForBattleMember(member.characterId ?? "", member.equipmentMasterIds ?? []).flatMap(equipment => [equipment.imageSrc, EXCLUSIVE_EYE_CUTINS[member.characterId ?? ""]].filter((src): src is string => Boolean(src))))]).filter(Boolean))]);
  const ready = readySources === sources;
  useEffect(()=>{
    let cancelled=false;const timer=window.setTimeout(()=>{if(!cancelled)setFailed(true);},15000);
    Promise.all((JSON.parse(sources) as string[]).map(preloadBattleImage)).then(()=>Promise.all([document.fonts.load('20px TNStreetFlow','出撃準備'),document.fonts.load('20px TNStreetBattle','スキル')])).then(()=>{if(!cancelled){setReadySources(sources);setFailed(false);window.clearTimeout(timer);}}).catch(()=>{if(!cancelled)setFailed(true);});
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[sources,retry]);
  useEffect(()=>{if(selected)dialog.current?.showModal();},[selected]);
  function roster(members:Member[]) { return <div className="sf-members">{members.map(m=>{const c=master(m);return <button key={m.id} onClick={()=>setSelected(m)} aria-label={`${m.name}の詳細`}><span className="sf-face" data-character={c?.name.toLowerCase()}>{art(m)&&<img src={art(m)} alt={m.name}/>}</span><strong>{m.name}</strong><span className="sf-badges"><img src={getRarityBadgeAsset(c?.rarity || m.rarity)} alt={c?.rarity || m.rarity || "N"}/>{getAttributeBadgeAsset(c?.alignment || m.alignment)&&<img src={getAttributeBadgeAsset(c?.alignment || m.alignment)!} alt={getAttributeLabel(c?.alignment || m.alignment)}/>}</span></button>;})}</div>; }
  const skills=(selected?.skills || []).map(s=>CANONICAL_SKILL_VIEW.find(c=>c.id===(s.skill_card_id || s.skillId || s.id))).filter((s):s is (typeof CANONICAL_SKILL_VIEW)[number]=>Boolean(s));
  if (!ready) return <section className="sf-preparing" aria-busy={!failed}><div className="sf-preparing-spinner" role="status" aria-label="バトル素材を準備中"/>{failed&&<><p role="alert">素材を読み込めませんでした</p><button onClick={()=>{setFailed(false);setRetry(v=>v+1);}}>再読み込み</button></>}{onBack&&<button onClick={onBack}>{backLabel || "戻る"}</button>}</section>;
  return <section className="sf-root sf-screen sf-live-setup" data-acceptance-state={tutorial?"B1":undefined} style={background?{"--battle-background-image":`url('${background}')`} as CSSProperties:undefined}><div className="sf-setup-scroll"><header className="sf-heading"><small>{mode==="PATROL"?"QUEST":mode}</small><h1>出撃準備</h1><p>{label}</p></header><div className="sf-ready-hero">{art(visiblePlayerLeader ?? undefined)&&<img className="sf-ready-player" src={art(visiblePlayerLeader ?? undefined)} alt=""/>}{art(visibleEnemyLeader)&&<img className="sf-ready-enemy" src={art(visibleEnemyLeader)} alt=""/>}<b className="sf-versus">VS</b><div className="sf-power"><div><small>YOUR TEAM</small><b>{playerPower.toLocaleString()}</b><span>{visiblePlayerLeader?.name || "PLAYER"}</span></div><div><small>ENEMY</small><b>{enemyPower.toLocaleString()}</b><span>{visibleEnemyLeader?.name}</span></div></div></div><section className="sf-team"><header><h2>出撃メンバー</h2><span>{playerParty.length}人</span></header>{roster(playerParty)}</section><details className="sf-details"><summary>相手の編成を確認</summary><section className="sf-team">{enemyDetails || roster(enemyParty)}</section></details><div className="sf-strategy"><div><small>STRATEGY</small><strong>{tactics.find(t=>t.id===tactic)?.label || "バランス"}</strong></div>{tutorial || mode==="PATROL" ? <span>探索開始時に選んだ作戦で自動戦闘します</span> : <select aria-label="作戦" value={tactic} onChange={e=>onTactic(e.target.value)}>{tactics.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select>}</div></div>{resourceLabel&&<p className="sf-room-resource" role="status">{resourceLabel}</p>}<div className="sf-actions"><button className="sf-primary start-battle-btn" disabled={!ready} onClick={onStart}>{ready?startLabel || (mode==="PVP_PRACTICE"?"模擬戦開始":"バトルスタート"):"素材を準備中…"}</button>{failed&&!ready&&<><p role="alert">素材を読み込めませんでした</p><button onClick={()=>{setFailed(false);setRetry(v=>v+1);}}>再読み込み</button></>}{onBack&&<button className="sf-secondary" onClick={onBack}>{backLabel || "戻る"}</button>}</div><dialog ref={dialog} className="sf-dialog" onCancel={()=>setSelected(null)}><h2>{selected?.name}</h2><p>Lv.{selected?.level || 1} / HP {selected?.hp.toLocaleString()} / {selected?.maxHp.toLocaleString()}</p><SkillIconGrid skills={skills} onSelect={setSelectedSkill}/><button onClick={()=>{dialog.current?.close();setSelected(null);}}>閉じる</button>{selectedSkill&&<SkillDetailDialog skill={selectedSkill} onClose={()=>setSelectedSkill(null)}/>}</dialog></section>;
}

"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import { getRarityBadgeAsset } from "@/utils/rarityAssets";
import { getAttributeBadgeAsset, getAttributeLabel } from "@/utils/attributeAssets";
import { CANONICAL_SKILL_VIEW } from "@/utils/skills_master_data";
import { SkillDetailDialog, SkillIconGrid } from "../skill/SkillPresentation";
import type { QuestBattleViewerProps } from "./QuestBattleViewer";
import "./StreetFlow.css";

type Member = QuestBattleViewerProps["playerParty"][number];
const master = (m?:Member)=>CHARACTERS_MASTER.find(c=>c.id===m?.characterId || c.name===m?.characterId);
const art = (m?:Member)=>{const c=master(m);return c?getCharacterTransparentImg(c.name):undefined;};
const tactics = [{id:"ATTACK_PRIORITY",label:"攻撃優先"},{id:"HEAL_PRIORITY",label:"回復優先"},{id:"SKILL_PRIORITY",label:"スキル優先"},{id:"BALANCED",label:"バランス"},{id:"WEAKNESS_FOCUS",label:"弱点集中"}];
export default function StreetBattleSetup({playerParty,enemyParty,playerPower,enemyPower,tutorial,mode,label,background,tactic,onTactic,onStart,onBack}:{playerParty:Member[];enemyParty:Member[];playerPower:number;enemyPower:number;tutorial:boolean;mode:string;label:string;background?:string;tactic:string;onTactic:(value:string)=>void;onStart:()=>void;onBack?:()=>void}) {
  const [selected,setSelected] = useState<Member|null>(null);
  const [selectedSkill,setSelectedSkill] = useState<(typeof CANONICAL_SKILL_VIEW)[number]|null>(null);
  const [ready,setReady] = useState(false);
  const [failed,setFailed] = useState(false);
  const [retry,setRetry] = useState(0);
  const dialog=useRef<HTMLDialogElement>(null);
  const sources = JSON.stringify([...playerParty,...enemyParty].flatMap(m=>{const c=master(m);return c?[getCharacterTransparentImg(c.name),getRarityBadgeAsset(c.rarity),getAttributeBadgeAsset(c.alignment)!]:[]}).concat([background || "/bg/bg_street_shinjuku.jpg","/effects/battle-v3/street-impact.webp","/effects/battle-v3/street-support.webp"]));
  useEffect(()=>{
    let cancelled=false;const timer=window.setTimeout(()=>{if(!cancelled)setFailed(true);},15000);
    Promise.all((JSON.parse(sources) as string[]).map(src=>new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>image.decode().then(()=>resolve(),reject);image.onerror=reject;image.src=src;}))).then(()=>Promise.all([document.fonts.load('20px TNStreetFlow','出撃準備'),document.fonts.load('20px TNStreetBattle','スキル')])).then(()=>{if(!cancelled){setReady(true);setFailed(false);window.clearTimeout(timer);}}).catch(()=>{if(!cancelled)setFailed(true);});
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[sources,retry]);
  useEffect(()=>{if(selected)dialog.current?.showModal();},[selected]);
  function roster(members:Member[]) { return <div className="sf-members">{members.map(m=>{const c=master(m);return <button key={m.id} onClick={()=>setSelected(m)} aria-label={`${m.name}の詳細`}><span className="sf-face" data-character={c?.name.toLowerCase()}>{art(m)&&<img src={art(m)} alt={m.name}/>}</span><strong>{m.name}</strong><span className="sf-badges"><img src={getRarityBadgeAsset(c?.rarity || m.rarity)} alt={c?.rarity || m.rarity || "N"}/>{getAttributeBadgeAsset(c?.alignment || m.alignment)&&<img src={getAttributeBadgeAsset(c?.alignment || m.alignment)!} alt={getAttributeLabel(c?.alignment || m.alignment)}/>}</span></button>;})}</div>; }
  const skills=(selected?.skills || []).map(s=>CANONICAL_SKILL_VIEW.find(c=>c.id===(s.skill_card_id || s.skillId || s.id))).filter((s):s is (typeof CANONICAL_SKILL_VIEW)[number]=>Boolean(s));
  return <section className="sf-root sf-screen" data-acceptance-state={tutorial?"B1":undefined} style={background?{"--battle-background-image":`url('${background}')`} as CSSProperties:undefined}><header className="sf-heading"><small>{mode==="PATROL"?"QUEST":mode}</small><h1>出撃準備</h1><p>{label}</p></header><div className="sf-ready-hero">{art(playerParty[0])&&<img className="sf-ready-player" src={art(playerParty[0])} alt=""/>}{art(enemyParty[0])&&<img className="sf-ready-enemy" src={art(enemyParty[0])} alt=""/>}<b className="sf-versus">VS</b><div className="sf-power"><div><small>YOUR TEAM</small><b>{playerPower.toLocaleString()}</b><span>{playerParty[0]?.name}</span></div><div><small>ENEMY</small><b>{enemyPower.toLocaleString()}</b><span>{enemyParty[0]?.name}</span></div></div></div><section className="sf-team"><header><h2>出撃メンバー</h2><span>{playerParty.length}人</span></header>{roster(playerParty)}</section><details className="sf-details"><summary>相手の編成を確認</summary><section className="sf-team">{roster(enemyParty)}</section></details><div className="sf-strategy"><div><small>STRATEGY</small><strong>{tactics.find(t=>t.id===tactic)?.label || "バランス"}</strong></div>{tutorial || mode==="PATROL" ? <span>派遣時に選んだ作戦で自動戦闘します</span> : <select aria-label="作戦" value={tactic} onChange={e=>onTactic(e.target.value)}>{tactics.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select>}</div><div className="sf-actions"><button className="sf-primary start-battle-btn" disabled={!ready} onClick={onStart}>{ready?mode==="PVP_PRACTICE"?"模擬戦開始":"バトルスタート":"素材を準備中…"}</button>{failed&&!ready&&<><p role="alert">素材を読み込めませんでした</p><button onClick={()=>{setFailed(false);setRetry(v=>v+1);}}>再読み込み</button></>}{onBack&&<button className="sf-secondary" onClick={onBack}>戻る</button>}</div><dialog ref={dialog} className="sf-dialog" onCancel={()=>setSelected(null)}><h2>{selected?.name}</h2><p>Lv.{selected?.level || 1} / HP {selected?.hp.toLocaleString()} / {selected?.maxHp.toLocaleString()}</p><SkillIconGrid skills={skills} onSelect={setSelectedSkill}/><button onClick={()=>{dialog.current?.close();setSelected(null);}}>閉じる</button>{selectedSkill&&<SkillDetailDialog skill={selectedSkill} onClose={()=>setSelectedSkill(null)}/>}</dialog></section>;
}

"use client";
import React, { useEffect, useState } from "react";
import { useImmediateActionLock } from "@/hooks/useImmediateActionLock";
import { supabase } from "@/utils/supabase";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import { getCharacterTotalStats } from "@/utils/stats_calculator";
import { getCharacterLocationBackground } from "@/utils/characterVisualAssets";
import CharacterPresentation from "./CharacterPresentation";
import OutlawButton from "../ui/OutlawButton";
import "./CharacterParty.css";
const attributes: Record<string,string> = {ALL:"すべて",JUSTICE:"正義",EVIL:"悪",ORDER:"秩序",CHAOS:"混沌"};
export default function CharacterParty({game,characters,onBack}: {game:any;characters:any[];onBack:()=>void}) {
  const [saved,setSaved]=useState<string[]|null>(null);
  const [error,setError]=useState("");
  const [view,setView]=useState<"HOME"|"MEMBERS"|"LEADER">("HOME");
  const [draft,setDraft]=useState<string[]>([]);
  const [slot,setSlot]=useState<number|null>(null);
  const [attribute,setAttribute]=useState("ALL"),[rarity,setRarity]=useState("ALL");
  const {isLocked:pending,beginAction,endAction}=useImmediateActionLock();
  const refresh=async()=>{
    const {data,error}=await supabase.rpc("get_current_main_formation");
    if(error || !Array.isArray(data?.characters)) {setError("保存済みパーティを確認できませんでした。");return false;}
    setSaved(data.characters.map((entry:any)=>entry.character_id));setError("");return true;
  };
  useEffect(()=>{void refresh();},[game.session?.user?.id]);
  const power=(ids:string[])=>ids.reduce((sum,id)=>{const record=characters.find(c=>c.character_id===id);const stats=getCharacterTotalStats(record,game.userEquipmentsList||[]);return sum+stats.hp+stats.atk+stats.def;},0);
  const perform=async(action:()=>Promise<unknown>)=>{
    if(!beginAction())return;game.setGlobalInteractionBlocking(true);
    try{const result=await action();if(result===false)return;if(await refresh()){setView("HOME");setSlot(null);}}catch{setError("パーティを保存できませんでした。変更内容を確認して再実行してください。");}finally{endAction();game.setGlobalInteractionBlocking(false);}
  };
  const card=(id:string,index:number,onClick?:()=>void)=>{
    const record=characters.find(c=>c.character_id===id),master=CHARACTERS_MASTER.find(c=>c.id===id);
    return <button type="button" className="character-party-card" aria-label={master?.jpName || "枠"+(index+1)} disabled={pending || !onClick} onClick={onClick}>
      {record&&master ? <><CharacterPresentation src={getCharacterTransparentImg(master.name)} alt={master.jpName} variant="thumbnail" rarity={master.rarity} backgroundSrc={getCharacterLocationBackground(master.homeTown)} frameKind="character" metadata={false}/><strong>{master.jpName}</strong><small>Lv.{record.level || 1}</small></> : <span className="character-party-empty">＋<small>枠{index+1}</small></span>}
    </button>;
  };
  const choose=(id:string)=>{if(slot===null)return;setDraft(current=>{const next=[...current];const existing=next.indexOf(id);if(existing>=0 && existing!==slot)next[existing]=next[slot]||"";next[slot]=id;return next;});};
  const changed=JSON.stringify(draft.filter(Boolean))!==JSON.stringify(saved);
  const candidates=characters.filter(record=>{const master=CHARACTERS_MASTER.find(c=>c.id===record.character_id);return master&&(attribute==="ALL"||master.alignment===attribute)&&(rarity==="ALL"||master.rarity===rarity);});
  return <section className="character-v2-view character-v2-party" aria-busy={pending}>
    <header className="character-v2-title"><button disabled={pending} onClick={view==="HOME"?onBack:()=>{setView("HOME");setDraft([]);setSlot(null);}}> {view==="HOME"?"キャラホームへ戻る":"取消"}</button><strong>{view==="HOME"?"パーティ":view==="MEMBERS"?"メンバー変更":"リーダー変更"}</strong></header>
    {error&&<div role="alert"><p>{error}</p><OutlawButton onClick={()=>void refresh()}>再確認</OutlawButton></div>}
    {saved===null?<div role="status"><span className="spinner"/></div>:view==="HOME"?<>
      <div className="character-party-power"><span>総合力</span><strong>{power(saved).toLocaleString()}</strong></div>
      <div className="character-party-leader"><small>リーダー</small>{card(saved[0],0, saved.length?()=>setView("LEADER"):undefined)}</div>
      <div className="character-party-members">{Array.from({length:4},(_,i)=><React.Fragment key={i}>{card(saved[i+1],i+1)}</React.Fragment>)}</div>
      {!saved.length&&<p>パーティは未編成です。</p>}
      <OutlawButton variant="primary" fullWidth disabled={pending} onClick={()=>{setDraft(Array.from({length:5},(_,i)=>saved[i]||""));setView("MEMBERS");setAttribute("ALL");setRarity("ALL");}}>メンバー変更</OutlawButton>
      <OutlawButton disabled={pending || !saved.length} onClick={()=>setView("LEADER")}>リーダー変更</OutlawButton>
      <OutlawButton disabled={pending} onClick={()=>void perform(()=>game.handleAutoFormation({navigateAfter:false}))}>おまかせ編成</OutlawButton>
    </>:view==="LEADER"?<><p>現在のパーティから選択</p><div className="character-party-leader-candidates">{saved.map((id,i)=><React.Fragment key={id}>{card(id,i,()=>void perform(()=>game.handleSetPartyLeader(id)))}</React.Fragment>)}</div></>:<>
      <p>変更する枠を選択</p><div className="character-party-draft-slots">{draft.map((id,i)=><div key={i} className={slot===i?"active":""}><small>{i===0?"リーダー":"枠"+(i+1)}</small>{card(id,i,()=>setSlot(i))}</div>)}</div>
      <div className="character-party-draft-power">総合力 <strong>{power(saved).toLocaleString()} → {power(draft).toLocaleString()}</strong></div>
      <OutlawButton variant="primary" fullWidth disabled={pending||!changed||draft.filter(Boolean).length<Math.min(5,characters.length)} onClick={()=>void perform(()=>game.handleSaveParty(draft.filter(Boolean)))}>変更を確定</OutlawButton>
      {slot!==null&&<><h3>交代するキャラクターを選択</h3><div className="character-v2-filters">{Object.entries(attributes).map(([id,label])=><button key={id} aria-pressed={attribute===id} onClick={()=>setAttribute(id)}>{label}</button>)}</div><div className="character-v2-filters">{["ALL","N","R","SR","SSR"].map(value=><button key={value} aria-pressed={rarity===value} onClick={()=>setRarity(value)}>{value==="ALL"?"レアリティ":value}</button>)}</div><div className="character-party-candidates">{candidates.map((record,i)=><div key={record.id}>{card(record.character_id,i,()=>choose(record.character_id))}<small>総合力 {power([record.character_id]).toLocaleString()}</small></div>)}</div></>}
      
    </>}
  </section>;
}

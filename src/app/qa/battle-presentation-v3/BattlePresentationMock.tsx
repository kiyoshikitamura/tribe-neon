"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import { resolveCharacterGachaQuote } from "@/domain/presentation/characterGachaQuotes";
import { getRarityBadgeAsset } from "@/utils/rarityAssets";
import { getAttributeBadgeAsset, getAttributeLabel } from "@/utils/attributeAssets";
import { useAudio } from "@/audio/AudioProvider";
import "./battle-mock.css";
import { statusCatalog, makeStatus, supportive, statusKinds, effectAsset, StatusBadges, StatusDetails, StatusIcon, type Status, type StatusId } from "./StatusMock";
import "./status-mock.css";

type Character = (typeof CHARACTERS_MASTER)[number];
type Kind = "dot" | "normal" | "skill" | "heal" | "finish" | "buff" | "debuff" | "status" | "shield" | "regen" | "counter" | "cleanse";
type Phase = "idle" | "actor" | "impact" | "settle" | "mvp";
const rarities = ["N", "R", "SR", "SSR"] as const;
const find = (name: string) => CHARACTERS_MASTER.find(c => c.jpName === name)!;
const first = (rarity: string) => CHARACTERS_MASTER.find(c => c.rarity === rarity)!;
const initialActor = find("レイジ");
const opponents = ["ケンゴ", "レオ", "ミオ", "ミヤビ", "カレン"].map(find);
const asset = (c: Character) => getCharacterTransparentImg(c.name);
const impactAsset = "/effects/battle-v3/street-impact.webp";
const initialHp = () => Array(5).fill(2400) as number[];
const demo = [{kind:"normal", rarity:"N"}, ...rarities.map(rarity => ({kind:"skill", rarity})), {kind:"heal",rarity:"SSR"}, {kind:"finish",rarity:"SSR"}] as {kind:Kind;rarity:string}[];

// Visual-only fixture. Never calls battle, gacha, reward or progress APIs.
export default function BattlePresentationMock() {
  const [actor, setActor] = useState(initialActor);
  const [skillRarity, setSkillRarity] = useState<typeof rarities[number]>("N");
  const [kind, setKind] = useState<Kind>("skill");
  const [phase, setPhase] = useState<Phase>("idle");
  const [hp, setHp] = useState(initialHp);
  const [allyHp, setAllyHp] = useState(1200);
  const [target, setTarget] = useState(0);
  const [amount, setAmount] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [muted, setMuted] = useState(true);
  const [sequence, setSequence] = useState(-1);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [statuses, setStatuses] = useState<Record<string,Status[]>>({});
  const [selectedStatus, setSelectedStatus] = useState<StatusId>("POISON");
  const [activeStatus, setActiveStatus] = useState<StatusId>("POISON");
  const [details, setDetails] = useState<string|null>(null);
  const [removed, setRemoved] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const run = useRef(0);
  const busy = phase === "actor" || phase === "impact" || phase === "settle";
  const audio = useAudio();
  const tier = rarities.indexOf(actor.rarity as typeof rarities[number]);
  const special = kind!=="normal" && kind!=="dot" && (skillRarity==="SR" || skillRarity==="SSR");
  const allies = [actor, ...[initialActor, find("アゲハ"), find("ゴウ"), find("カエデ"), find("コハル")].filter(c=>c.id!==actor.id)].slice(0,5);
  const quote = resolveCharacterGachaQuote(actor.id) || "";
  const stateAction = statusKinds.includes(kind);
  const allyTarget = supportive(kind);
  const skillName = stateAction ? kind==="cleanse" ? "弱体解除" : statusCatalog[activeStatus].name : kind === "dot" ? "毒ダメージ" : kind === "normal" ? "通常攻撃" : kind === "heal" ? "回復スキル" : "ストリートパンチ";
  const liveAudio = useRef({audio,muted});
  useEffect(()=>{liveAudio.current={audio,muted};},[audio,muted]);

  useEffect(() => {
    let cancelled = false;
    const sources = [...CHARACTERS_MASTER.map(asset), ...rarities.map(getRarityBadgeAsset), ...["JUSTICE","ORDER","EVIL","CHAOS"].map(v=>getAttributeBadgeAsset(v)!), impactAsset,
      ["heal","buff","debuff"].map(effectAsset), "/effects/battle-v3/cutin-street.webp", "/bg/bg_street_shinjuku.jpg"].flat();
    Promise.all(sources.map(src => new Promise<void>((resolve,reject)=>{
      const image = new Image(); image.onload=()=>{image.decode().then(()=>resolve(),reject);}; image.onerror=reject; image.src=src;
    }))).then(()=>document.fonts.load('20px TNBattleTetsubin','新宿')).then(()=>{if(!cancelled)setReady(true);}).catch(()=>{if(!cancelled)setError(true);});
    const timeout=window.setTimeout(()=>{if(!cancelled){setError(true);}},15000);
    return()=>{cancelled=true;window.clearTimeout(timeout);};
  },[loadKey]);

  function begin(next: Kind, character = actor, reset = true, nextSequence = -1) {
    run.current++; setActor(character);setKind(next);setAmount(0);setSequence(nextSequence);setRemoved(0);
    if(reset){setHp(initialHp());setAllyHp(1200);setTotals({});setStatuses({});}
    setTarget(reset ? 0 : Math.max(0,hp.findIndex(value=>value>0)));
    rootRef.current?.scrollTo({top:0,behavior:"instant"});
    setPhase("actor");
    if(!muted) {void audio.unlockAudio();audio.playSe(next === "normal" ? "BATTLE_ATTACK" : "BATTLE_SKILL");}
  }

  useEffect(()=>{
    if(!busy) return;
    const id=run.current;
    const delay=phase==="actor" ? (kind==="dot" ? 100 : kind==="normal" ? 320 : [850,850,1000,1500][Math.max(0,tier)]) : phase==="impact" ? 550 : 600;
    // Recognition holds are real time, independent of playback speed or reduced motion.
    const minimum=phase==="actor" ? (kind==="normal"||kind==="dot" ? 100 : tier===3 ? 1200 : 800) : phase==="impact" ? 450 : 250;
    const timer=window.setTimeout(()=>{
      if(id!==run.current)return;
      if(phase==="actor"){
        const value=stateAction ? 0 : kind==="heal" ? Math.min(800,2400-allyHp) : Math.min(hp[target],kind==="dot" ? 180 : kind==="normal" ? 400 : kind==="finish" ? 2400 : 1200);
        setAmount(value);
        if(stateAction){
          const key=allyTarget ? "ally-0" : `enemy-${target}`;
          if(kind==="cleanse") {
            setRemoved((statuses[key]||[]).filter(s=>!statusCatalog[s.id].positive).length);
            setStatuses(all=>({...all,[key]:(all[key]||[]).filter(s=>statusCatalog[s.id].positive)}));
          } else setStatuses(all=>({...all,[key]:[...(all[key]||[]).filter(s=>s.id!==activeStatus),makeStatus(activeStatus)]}));
        }
        else if(kind==="heal")setAllyHp(h=>Math.min(2400,h+value));
        else {setHp(h=>h.map((v,i)=>i===target ? Math.max(0,v-value):v));setTotals(t=>({...t,[actor.id]:(t[actor.id]||0)+value}));}
        const {audio:a,muted:m}=liveAudio.current;
        if(!m)a.playSe(stateAction ? allyTarget ? "BATTLE_BUFF" : "BATTLE_DEBUFF" : kind==="heal" ? "BATTLE_BUFF" : special ? "BATTLE_CRITICAL" : "BATTLE_DAMAGE");
        setPhase("impact");
      }else if(phase==="impact")setPhase("settle");
      else if(sequence>=0 && sequence<demo.length-1){
        const next=demo[sequence+1]; const c=next.rarity==="SSR" ? initialActor : first(next.rarity);
        run.current++;setActor(c);setKind(next.kind);setTarget(Math.max(0,hp.findIndex(v=>v>0)));setAmount(0);setSequence(sequence+1);setPhase("actor");
      }else setPhase(sequence>=0 ? "mvp" : "idle");
    },Math.max(minimum,delay/speed));
    return()=>window.clearTimeout(timer);
  },[phase,actor,kind,tier,speed,sequence,busy,allyHp,hp,target,stateAction,allyTarget,activeStatus,statuses,special]);

  const winnerId=Object.keys(totals).sort((a,b)=>totals[b]-totals[a])[0];
  const winner=CHARACTERS_MASTER.find(c=>c.id===winnerId) || actor;
  const showImpact=phase==="impact" || phase==="settle";
  function roster(c: Character,index:number,enemy:boolean){
    const health=enemy ? hp[index] : index===0 ? allyHp : 2400;
    const affected=showImpact && (allyTarget ? !enemy&&index===0 : enemy&&index===target);
    return <div key={`${enemy}-${c.id}`} className={`bm-unit ${enemy?"enemy":"ally"} ${!enemy&&index===0&&busy?"acting":""} ${affected?"affected":""} ${health===0?"defeated":""}`} data-unit={`${enemy?"enemy":"ally"}-${index}`} data-positive={allyTarget} data-has-status={Boolean((statuses[`${enemy?"enemy":"ally"}-${index}`]||[]).length)}>
      <div className="bm-face"><img src={asset(c)} alt={c.jpName}/></div>
      <div className="bm-unit-info"><strong>{c.jpName}</strong><img className="bm-badge" src={getRarityBadgeAsset(c.rarity)} alt={c.rarity}/><img className="bm-attribute" src={getAttributeBadgeAsset(c.alignment)!} alt={`属性：${getAttributeLabel(c.alignment)}`}/><div className="bm-hp" role="progressbar" aria-label={`${c.jpName} HP`} aria-valuenow={health} aria-valuemin={0} aria-valuemax={2400}><i style={{width:`${health/24}%`}}/></div><small>{health.toLocaleString()} / 2,400</small></div>
      {health>0&&<StatusBadges items={statuses[`${enemy?"enemy":"ally"}-${index}`]||[]} onOpen={()=>setDetails(`${enemy?"enemy":"ally"}-${index}`)}/>}
      {health===0&&<b className="bm-ko">撃破</b>}
      {affected&&!stateAction&&<><b className={`bm-damage ${kind==="heal"?"heal":""}`}>{kind==="heal"?"+":"−"}{amount.toLocaleString()}</b>{phase==="impact"&&kind!=="heal"&&kind!=="dot"&&<img className={`bm-impact ${kind==="normal"?"normal":""}`} src={impactAsset} alt=""/>}</>}
      {affected&&phase==="impact"&&special&&<img className={`bm-special-stroke ${allyTarget?"support":"attack"}`} src={stateAction||kind==="heal"?effectAsset(kind):impactAsset} alt=""/>}
      {affected&&(stateAction||kind==="heal")&&<div className={`bs-vfx ${allyTarget?"positive":"negative"} kind-${kind}`} data-effect={kind} aria-hidden="true"><img src={effectAsset(kind)} alt=""/>{stateAction&&kind!=="cleanse"&&<StatusIcon id={activeStatus}/>}<b>{kind==="heal"?"":kind==="cleanse"?`${removed}件解除`:skillName}</b></div>}
    </div>;
  }
  function playStatus(id:StatusId){
    setActiveStatus(id);
    const k:Kind=id.endsWith("UP")?"buff":id.endsWith("DOWN")?"debuff":id==="SHIELD"?"shield":id==="REGEN"?"regen":id==="COUNTER"?"counter":"status";
    begin(k,actor,false);
  }
  function multiple(){
    setHp(initialHp());setStatuses({"ally-0":["ATK_UP","DEF_UP","SHIELD","REGEN","POISON","BLIND"].map(id=>makeStatus(id as StatusId)),"enemy-0":["ATK_DOWN","POISON","BLEED","STUN","SILENCE","TAUNT"].map(id=>makeStatus(id as StatusId))});
    rootRef.current?.scrollTo({top:0,behavior:"instant"});
  }
  if(!ready)return <main className="bm-loading"><p>{error?"素材を読み込めませんでした":"バトル素材を準備中…"}</p>{error&&<button onClick={()=>{setError(false);setLoadKey(k=>k+1);}}>再読み込み</button>}</main>;
  return <main ref={rootRef} className={`bm-root bm-tier-${actor.rarity} bm-phase-${phase} bm-skill-${skillRarity}`} data-special={special} style={{"--bm-rate":speed,"--bm-effect-time":`${Math.max(450,550/speed)}ms`} as CSSProperties}>
    <header className="bm-header"><div><small>TRIBE NEON / 演出モック</small><h1>新宿ストリート</h1></div><span>ROUND <b>01</b></span><button onClick={()=>{run.current++;setSequence(-1);setPhase("mvp");}}>SKIP</button></header>
    <section className="bm-rosters"><div><h2>YOUR TEAM</h2>{allies.map((c,i)=>roster(c,i,false))}</div><div><h2>ENEMY</h2>{opponents.map((c,i)=>roster(c,i,true))}</div></section>
    <div className="bm-event" aria-live="polite">{phase==="idle"?"操作パネルから演出を再生":phase==="actor"?`${actor.jpName} → ${allyTarget?actor.jpName:opponents[target].jpName} / ${skillName}`:stateAction?kind==="cleanse"?`${removed}件の弱体を解除`: `${skillName} 付与`:kind==="heal"?`${amount.toLocaleString()} 回復`:`${amount.toLocaleString()} ダメージ${hp[target]===0?"・撃破":""}`}</div>
    {phase==="actor"&&kind!=="normal"&&kind!=="dot"&&<section className={`bm-announcement ${tier===3?"fullscreen":"near-actor"}`} aria-label="スキル演出">
      {tier===3&&<img className="bm-full-character" src={asset(actor)} alt=""/>}
      <div className="bm-announcement-copy">{tier<3&&<div className="bm-speaker-face"><img src={asset(actor)} alt={actor.jpName}/></div>}<small>{actor.rarity} / {actor.jpName}</small><p>{quote}</p><h2>{skillName}</h2><span>SKILL {skillRarity}</span></div>
      {tier===3&&<button className="bm-cutin-skip" onClick={()=>{run.current++;setSequence(-1);setPhase("mvp");}}>SKIP</button>}
    </section>}
    <section className="bm-controls" aria-label="モック操作"><div className="bm-selection"><label>発動キャラ<select disabled={busy} value={actor.id} onChange={e=>{setActor(CHARACTERS_MASTER.find(c=>c.id===e.target.value)!);setStatuses({});}}>{CHARACTERS_MASTER.map(c=><option key={c.id} value={c.id}>{c.rarity} {c.jpName}</option>)}</select></label><button disabled={busy} onClick={()=>setSpeed(s=>s===1?2:1)}>×{speed}</button><button onClick={()=>{setMuted(m=>!m);void audio.unlockAudio();}}>SE {muted?"OFF":"ON"}</button></div>
      <label className="bm-skill-select">スキルレアリティ<select aria-label="スキルレアリティ" value={skillRarity} disabled={busy} onChange={e=>setSkillRarity(e.target.value as typeof rarities[number])}>{rarities.map(r=><option key={r}>{r}</option>)}</select></label>
      <div className="bm-buttons"><button disabled={busy} onClick={()=>begin("normal")}>通常攻撃</button>{rarities.map(r=><button key={r} disabled={busy} onClick={()=>begin("skill",r==="SSR"?initialActor:first(r))}>{r}キャラ</button>)}</div>
      <div className="bm-buttons"><button disabled={busy} onClick={()=>begin("skill")}>選択キャラ</button><button disabled={busy} onClick={()=>begin("heal")}>回復</button><button disabled={busy} onClick={()=>begin("finish")}>撃破</button><button disabled={busy} onClick={()=>begin("normal",first("N"),true,0)}>連続再生</button></div>
      <div className="bs-controls"><label>状態効果<select aria-label="状態効果" disabled={busy} value={selectedStatus} onChange={e=>setSelectedStatus(e.target.value as StatusId)}>{Object.entries(statusCatalog).map(([id,c])=><option key={id} value={id}>{c.name}</option>)}</select></label><button disabled={busy} onClick={()=>playStatus(selectedStatus)}>付与を再生</button></div>
      <div className="bm-buttons"><button disabled={busy} onClick={()=>playStatus("ATK_UP")}>バフ</button><button disabled={busy} onClick={()=>playStatus("DEF_DOWN")}>デバフ</button><button disabled={busy} onClick={()=>playStatus("SHIELD")}>シールド</button><button disabled={busy} onClick={()=>playStatus("REGEN")}>継続回復</button><button disabled={busy} onClick={()=>begin("dot",actor,false)}>DoT発生</button></div>
      <div className="bm-buttons"><button disabled={busy} onClick={multiple}>複数状態</button><button disabled={busy} onClick={()=>begin("cleanse",actor,false)}>弱体解除</button><button disabled={busy} onClick={()=>{setStatuses(all=>Object.fromEntries(Object.entries(all).map(([key,list])=>[key,list.map(s=>({...s,remaining:s.remaining-1})).filter(s=>s.remaining>0)])));rootRef.current?.scrollTo({top:0,behavior:"instant"});}}>残り表示−1</button><button disabled={busy} onClick={()=>setStatuses({})}>状態リセット</button></div>
      <small className="bm-note">状態バッジをタップで詳細。残り表示−1は表示確認用（ターン進行・行動消費の模擬）。</small>
      <small className="bm-note">固定値モック・キャラSSR＝全画面／スキルSR・SSR＝特殊効果。DoT発生は180の単発表示サンプル。セリフは既存文言の仮配置</small>
    </section>
    {details&&<StatusDetails name={details.startsWith("ally")?allies[Number(details.split("-")[1])].jpName:opponents[Number(details.split("-")[1])].jpName} items={statuses[details]||[]} onClose={()=>setDetails(null)}/>}
    {phase==="mvp"&&<section className="bm-result" role="dialog" aria-modal="true" aria-label="モック結果"><small>DEMO RESULT</small><h2>VICTORY</h2><div className="bm-mvp-art"><img src={asset(winner)} alt={winner.jpName}/></div><div className="bm-mvp-copy"><small>MVP / 与ダメージ最多</small><h3>{winner.jpName}</h3><p>{resolveCharacterGachaQuote(winner.id)}</p><strong>与ダメージ {(totals[winner.id]||0).toLocaleString()}</strong><small>固定デモの集計／未攻撃時は選択キャラの表示サンプル</small><button autoFocus onClick={()=>{setPhase("idle");setSequence(-1);setHp(initialHp());setAllyHp(1200);}}>比較へ戻る</button></div></section>}
  </main>;
}

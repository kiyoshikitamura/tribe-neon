"use client";

import type { CSSProperties } from "react";
import type { QuestBattleViewerProps } from "./QuestBattleViewer";
import BattleUnitPortrait from "./BattleUnitPortrait";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import { CANONICAL_SKILL_VIEW } from "@/utils/skills_master_data";
import { resolveCharacterGachaQuote } from "@/domain/presentation/characterGachaQuotes";
import { isActiveEffectSync, type BattleTargetResolutionGroup } from "@/domain/presentation/battlePresentationUnit";
import { battleStatusPresentationTone } from "@/domain/presentation/battleStatusPresentation";
import { isInternalBattleLabel } from "@/domain/presentation/battleSkillLabels";
import "./StreetBattle.css";

const impact = "/effects/battle-v3/street-impact.webp";
const support = "/effects/battle-v3/street-support.webp";
const masterFor = (p?: {characterId?:string;name:string}) => CHARACTERS_MASTER.find(c=>c.id===p?.characterId || c.name===p?.characterId || c.jpName===p?.name);

// A view of resolved replay events only. No target selection, damage calculation or status mutation.
function Resolution({group,special,impactBeat,multiple}:{group:BattleTargetResolutionGroup;special:boolean;impactBeat:boolean;multiple:boolean}) {
  const events = group.events.filter(e=>!isActiveEffectSync(e));
  const damageEvents = events.filter(e=>e.type==="DAMAGE");
  const damage = damageEvents.reduce((sum,e)=>sum+Math.max(0,Number(e.payload.hpDamage ?? e.payload.amount ?? 0)),0);
  const healEvents = events.filter(e=>e.type==="HEAL");
  const healing = healEvents.reduce((sum,e)=>sum+Math.max(0,Number(e.payload.effectiveAmount ?? e.payload.amount ?? 0)),0);
  const effects = events.filter(e=>e.type==="STATUS" || e.type==="EFFECT");
  const positive = healing>0 || effects.some(e=>["buff","shield"].includes(battleStatusPresentationTone(e.payload)));
  const dot = damageEvents.length>0 && damageEvents.every(e=>/POISON|BLEED|DOT/i.test(String(e.payload.source ?? e.payload.kind ?? "")));
  const asset = damageEvents.length && !dot ? impact : support;
  return <div className={`sb-resolution ${positive?"positive":"negative"} ${multiple?"multiple":""}`}>
    {impactBeat && events.length>0 && <img className={`sb-effect ${dot?"dot":""}`} src={asset} alt=""/>}
    {impactBeat && special && !dot && <img className="sb-effect special" src={asset} alt=""/>}
    <div className="sb-numbers">{damageEvents.some(e=>e.payload.critical===true)&&<small>CRITICAL</small>}{damageEvents.length>0&&<b data-battle-number="damage">{damageEvents.every(e=>e.payload.hit===false)?"MISS":`−${damage.toLocaleString()}`}</b>}{healEvents.length>0&&<b data-battle-number="heal" className="positive">+{healing.toLocaleString()}</b>}</div>
  </div>;
}

export default function StreetBattleViewer(props:QuestBattleViewerProps) {
  const action = props.actionPresentation;
  const all = [...props.playerParty,...props.enemyParty];
  const actor = all.find(p=>p.id===(action?.unit.actorId ?? props.targetLine?.fromId ?? props.authoritativeTimeline?.[0]?.id ?? props.timeline[props.timelineIndex]?.id));
  const master = masterFor(actor);
  const skill = CANONICAL_SKILL_VIEW.find(s=>s.id===action?.unit.skillId);
  const skillRarity = skill?.rarity;
  const isSkill = action ? action.tier!=="NORMAL" : Boolean(props.skillCutIn && !/通常攻撃|ATTACK/i.test(props.skillCutIn.skillName));
  const rawName = action?.skillName || props.skillCutIn?.skillName || "通常攻撃";
  const skillName = isInternalBattleLabel(rawName) ? "スキル発動" : rawName;
  const casting = isSkill && (action ? action.beat==="ACTOR" : Boolean(props.skillCutIn));
  const fullscreen = master?.rarity==="SSR";
  const special = isSkill && (skillRarity==="SR" || skillRarity==="SSR");
  const resolving = action && action.beat!=="ACTOR";
  const groups = resolving ? action.unit.targets.filter(g=>g.events.some(e=>!isActiveEffectSync(e))) : [];
  const roundLimit = props.roundLimit ?? (props.battleMode==="PATROL" ? 15 : 20);
  return <div className="playing-container sb-root" data-battle-speed={props.speed} data-action-phase={(props.presentationPhase || "IDLE").toLowerCase().replaceAll("_","-")} data-action-actor-id={actor?.id} data-skill-rarity={skillRarity} data-acceptance-state={props.tutorial ? isSkill?"B4":"B3" : undefined} style={{"--sb-background":`url('${props.backgroundPath || "/bg/bg_street_shinjuku.jpg"}')`} as CSSProperties}>
    <div className="sb-arena"><header className="sb-header"><div><small>TRIBE NEON</small><h1>{props.opponentName || "BATTLE"}</h1></div><span data-displayed-round={props.round} data-configured-round-limit={roundLimit}>ROUND <b>{String(props.round).padStart(2,"0")}</b><small> / {roundLimit}</small></span></header>
    <main className="sb-rosters">{([false,true] as const).map(enemy=><section key={String(enemy)} aria-label={enemy?"敵パーティ":"味方パーティ"}><h2>{enemy?"ENEMY":"YOUR TEAM"}</h2>{(enemy?props.enemyParty:props.playerParty).map(p=>{
      const c = masterFor(p); const group = groups.find(g=>g.targetId===p.id);
      const popup = !action && props.damagePopup?.charId===p.id ? props.damagePopup : null;
      return <BattleUnitPortrait key={p.id} street participant={p} domId={p.id} imageSrc={c?getCharacterTransparentImg(c.name):undefined} side={enemy?"enemy":"player"} rarity={c?.rarity || p.rarity} attribute={p.alignment || c?.alignment} actor={Boolean(action && actor?.id===p.id)} reaction={group} impactOverlay={group ? <Resolution key={action?.unit.replayStartCursor} group={group} special={special} impactBeat={action?.beat==="IMPACT"} multiple={groups.length>1}/> : popup ? <div className="sb-numbers"><b className={popup.type!=="dmg"?"positive":""}>{popup.type==="dmg"?"−":"+"}{popup.val.toLocaleString()}</b></div> : null}/>;
    })}</section>)}</main>
    <p className="sb-event sb-visually-hidden" aria-live="polite">{action ? `${actor?.name || ""} / ${skillName}` : props.paused ? "一時停止中" : "AUTO BATTLE"}</p>
    {casting && actor && <section key={action?.unit.replayStartCursor} className={`sb-announcement ${fullscreen?"fullscreen":"compact"}`} aria-label="スキル演出">{fullscreen && master && <img className="sb-standing" src={getCharacterTransparentImg(master.name)} alt=""/>}<div className="sb-cast-copy">{!fullscreen && master && <div className="sb-speaker sb-face" data-character={master.name.toLowerCase()}><img src={getCharacterTransparentImg(master.name)} alt={actor.name}/></div>}<small>{master?.rarity} / {actor.name}</small><h2>{skillName}</h2>{skillRarity&&<span>SKILL {skillRarity}</span>}<p>{master && resolveCharacterGachaQuote(master.id)}</p></div></section>}
    </div><footer className="sb-controls"><button onClick={()=>{props.onSpeedChange(props.speed===2?1:props.speed===1&&props.monthlyPassActive?3:2);props.onSound();}}>×{props.speed}</button><button onClick={()=>{props.onPauseChange(!props.paused);props.onSound();}}>{props.paused?"再開":"一時停止"}</button>{props.canSkip&&<button disabled={props.skipPending} onClick={props.onSkip}>{props.skipPending?"結果へ移動中":"SKIP"}</button>}{!props.tutorial&&<button onClick={props.onRetreat}>撤退</button>}</footer>
  </div>;
}

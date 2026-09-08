import { useEffect, useRef } from "react";

export const statusCatalog = {
  ATK_UP:{name:"攻撃UP",icon:"sword",positive:true,detail:"攻撃力上昇",duration:2},
  DEF_UP:{name:"防御UP",icon:"shield",positive:true,detail:"防御力上昇",duration:2},
  SPD_UP:{name:"速度UP",icon:"speed",positive:true,detail:"速度上昇",duration:2},
  LUK_UP:{name:"運UP",icon:"star",positive:true,detail:"運上昇",duration:2},
  ATK_DOWN:{name:"攻撃DOWN",icon:"sword",positive:false,detail:"攻撃力低下",duration:2},
  DEF_DOWN:{name:"防御DOWN",icon:"shield",positive:false,detail:"防御力低下",duration:2},
  SPD_DOWN:{name:"速度DOWN",icon:"speed",positive:false,detail:"速度低下",duration:2},
  LUK_DOWN:{name:"運DOWN",icon:"star",positive:false,detail:"運低下",duration:2},
  POISON:{name:"毒",icon:"poison",positive:false,detail:"継続ダメージ",duration:3},
  BLEED:{name:"出血",icon:"bleed",positive:false,detail:"継続ダメージ",duration:2},
  BLIND:{name:"暗闇",icon:"eye",positive:false,detail:"攻撃が外れる可能性が増加",duration:2},
  SILENCE:{name:"沈黙",icon:"silence",positive:false,detail:"スキル発動を制限",duration:1},
  STUN:{name:"スタン",icon:"stun",positive:false,detail:"次の行動を制限",duration:1},
  TAUNT:{name:"挑発",icon:"target",positive:false,detail:"攻撃対象を誘導",duration:2},
  REGEN:{name:"継続回復",icon:"heal",positive:true,detail:"ターンごとのHP回復",duration:3},
  SHIELD:{name:"シールド",icon:"shield",positive:true,detail:"ダメージを吸収",duration:2},
  COUNTER:{name:"反撃",icon:"counter",positive:true,detail:"被攻撃時に反撃",duration:2},
} as const;
export type StatusId = keyof typeof statusCatalog;
export type Status = {id:StatusId; remaining:number; shield?:number};
export const makeStatus = (id:StatusId):Status => ({id,remaining:statusCatalog[id].duration,...(id==="SHIELD"?{shield:480}:{})});
export const supportive = (kind:string) => ["heal","buff","shield","regen","counter","cleanse"].includes(kind);
export const statusKinds = ["buff","debuff","status","shield","regen","counter","cleanse"];
export const effectAsset = (_kind:string) => "/effects/battle-v3/street-support.webp";

const paths:Record<string,string>={
  sword:"M5 19 19 5V11L11 19ZM4 14 10 20M3 21 7 17",
  shield:"M12 3 20 6V12Q20 18 12 22Q4 18 4 12V6Z",
  speed:"M13 2 5 13H11L9 22 20 9H13Z",
  star:"M12 2 15 8 22 9 17 14 18 21 12 18 6 21 7 14 2 9 9 8Z",
  poison:"M8 3H16M10 3V9L4 18Q3 22 7 22H17Q21 22 20 18L14 9V3M7 15H17M9 18H10M14 19H15",
  bleed:"M12 2Q9 7 6 12Q1 22 12 22Q23 22 18 12Z",
  eye:"M2 12Q12 1 22 12Q12 23 2 12M3 3 21 21",
  silence:"M4 5H20V16H11L6 20V16H4ZM7 8 17 14M17 8 7 14",
  stun:"M4 7 10 9 8 3 14 7 19 3 18 10 23 11 17 15 20 21 12 18 8 22 6 15 1 15 5 11Z",
  target:"M12 1V6M12 18V23M1 12H6M18 12H23M20 12A8 8 0 1 1 4 12A8 8 0 1 1 20 12M15 12A3 3 0 1 1 9 12A3 3 0 1 1 15 12",
  heal:"M9 3H15V9H21V15H15V21H9V15H3V9H9ZM17 3 21 7M21 3V7H17",
  counter:"M4 11H15Q21 11 21 17Q21 22 15 22M4 11 10 5M4 11 10 17",
};
export function StatusIcon({id}:{id:StatusId}){
  const c=statusCatalog[id];return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[c.icon]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>{id.endsWith("UP")||id.endsWith("DOWN")?<path d={id.endsWith("UP")?"M17 8V1M14 4 17 1 20 4":"M17 1V8M14 5 17 8 20 5"} stroke="currentColor" strokeWidth="2.5" fill="none"/>:null}{id==="SHIELD"&&<path d="M8 9H16V12Q16 16 12 18Q8 16 8 12Z" fill="currentColor"/>}</svg>;
}
export function StatusBadges({items,onOpen}:{items:Status[];onOpen:()=>void}){
  return <div className="bs-badges">{items.slice(0,3).map(s=><button key={s.id} data-status={s.id} className={statusCatalog[s.id].positive?"positive":"negative"} onClick={onOpen} aria-label={`${statusCatalog[s.id].name} 残り${s.remaining}${s.id==="STUN"||s.id==="SILENCE"?"行動":"ターン"}${s.shield!==undefined?` 吸収残量${s.shield}`:""}`}><StatusIcon id={s.id}/><span>{s.remaining}</span></button>)}{items.length>3&&<button onClick={onOpen} aria-label={`他${items.length-3}件の状態を表示`}>+{items.length-3}</button>}</div>;
}
export function StatusDetails({name,items,onClose}:{name:string;items:Status[];onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close();},[]);
  return <dialog ref={ref} className="bs-details" onCancel={onClose}><h2>{name}の状態</h2><p>比較用の固定値です</p><ul>{items.map(s=><li key={s.id} className={statusCatalog[s.id].positive?"positive":"negative"}><StatusIcon id={s.id}/><div><strong>{statusCatalog[s.id].name}</strong><p>{statusCatalog[s.id].detail}</p><small>残り{s.remaining}{s.id==="STUN"||s.id==="SILENCE"?"行動":"ターン"}{s.shield!==undefined?`・吸収残量 ${s.shield}`:""}</small></div></li>)}</ul>{items.length===0&&<p>状態効果はありません</p>}<button autoFocus onClick={onClose}>閉じる</button></dialog>;
}

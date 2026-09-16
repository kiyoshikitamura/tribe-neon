"use client";

import { useRef } from "react";
import type { BattleParticipantView } from "./BattleUnitPortrait";
import { battleStatusApplyLabel } from "@/domain/presentation/battleStatusPresentation";

type Effect = NonNullable<BattleParticipantView["activeEffects"]>[number];
function label(s: Effect) { return battleStatusApplyLabel({...s,status:s.id}); }
function positive(s: Effect) { return ["BUFF","SHIELD","REGEN","COUNTER"].includes(s.kind.toUpperCase()); }
function duration(s: Effect) { return s.remainingDuration == null ? "" : `残り${s.remainingDuration}`; }
function Icon({effect:s}:{effect:Effect}) {
  const key = `${s.kind} ${s.id}`.toUpperCase();
  const path = s.stat === "ATK" ? "M5 19 19 5V11L11 19ZM4 14 10 20M3 21 7 17" : s.stat === "SPD" ? "M13 2 5 13H11L9 22 20 9H13Z" : s.stat === "LUK" ? "M12 2 15 8 22 9 17 14 18 21 12 18 6 21 7 14 2 9 9 8Z" : /SHIELD|DEF/.test(key + s.stat) ? "M12 3 20 6V12Q20 18 12 22Q4 18 4 12V6Z" : /POISON/.test(key) ? "M8 3H16M10 3V9L4 18Q3 22 7 22H17Q21 22 20 18L14 9V3M7 15H17" : /BLEED/.test(key) ? "M12 2Q9 7 6 12Q1 22 12 22Q23 22 18 12Z" : /BLIND/.test(key) ? "M2 12Q12 1 22 12Q12 23 2 12M3 3 21 21" : /REGEN/.test(key) ? "M9 3H15V9H21V15H15V21H9V15H3V9H9Z" : /SILENCE/.test(key) ? "M4 5H20V16H11L6 20V16H4ZM7 8 17 14M17 8 7 14" : /COUNTER/.test(key) ? "M4 11H15Q21 11 21 17Q21 22 15 22M4 11 10 5M4 11 10 17" : /TAUNT/.test(key) ? "M12 1V6M12 18V23M1 12H6M18 12H23M20 12A8 8 0 1 1 4 12A8 8 0 1 1 20 12" : "M4 7 10 9 8 3 14 7 19 3 18 10 23 11 17 15 20 21 12 18 8 22 6 15 1 15 5 11Z";
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>{s.stat && <path d={positive(s) ? "M17 8V1M14 4 17 1 20 4" : "M17 1V8M14 5 17 8 20 5"} fill="none" stroke="currentColor" strokeWidth="2"/>}</svg>;
}
export default function StreetStatuses({name,statuses,shield}:{name:string;statuses:Effect[];shield?:number}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <><div className="sb-statuses">{statuses.slice(0,3).map((s,i)=><button key={`${s.id}-${i}`} className={positive(s)?"positive":"negative"} onClick={()=>dialog.current?.showModal()} aria-label={`${label(s)} ${duration(s)}`}><Icon effect={s}/><span>{s.remainingDuration ?? ""}</span></button>)}{statuses.length>3&&<button onClick={()=>dialog.current?.showModal()} aria-label={`他${statuses.length-3}件の状態を表示`}>+{statuses.length-3}</button>}</div><dialog className="sb-status-dialog" ref={dialog}><h2>{name}の状態</h2><ul>{statuses.map((s,i)=><li key={`${s.id}-${i}`}><Icon effect={s}/><div><strong>{label(s)}</strong><p>{duration(s)}{s.kind === "SHIELD" && (s.amount ?? shield) != null ? `・吸収残量 ${(s.amount ?? shield)!.toLocaleString()}` : ""}{s.magnitudeBp != null ? `・${s.magnitudeBp/100}%` : ""}</p></div></li>)}</ul><button onClick={()=>dialog.current?.close()}>閉じる</button></dialog></>;
}

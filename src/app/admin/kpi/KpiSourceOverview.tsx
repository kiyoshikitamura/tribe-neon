"use client";
import { useState } from "react";

const sources=["meta","x","organic","direct","unknown"] as const;
type Source=typeof sources[number];
type Rate={numerator:number|null;denominator:number|null;value:number|null;reason?:string|null;immature_subjects?:number};
type Counts={journeys:number;landing_game_start:number;game_start_rate:Rate;game_start:number;tutorial_complete:number;tutorial_rate:Rate;guild_join:number;guild_rate:Rate;d1:Rate;d3:Rate;coverage:{unbound:number;canonical_unknown:number;legacy_source:number;post_game_start_capture:number}};
export type SourceOverview={definition_version:string;sources:Record<Source,Counts>};
const labels:Record<Source,string>={meta:"Meta",x:"X",organic:"Organic",direct:"Direct",unknown:"Unknown"};
const rows:ReadonlyArray<[string,keyof Counts,boolean]>=[
  ["Landing / Journey","journeys",false],["Landing由来Game Start","landing_game_start",false],["Game Start率","game_start_rate",true],
  ["Game Start","game_start",false],["Tutorial Complete","tutorial_complete",false],["Tutorial突破率","tutorial_rate",true],
  ["Guild Join","guild_join",false],["Guild加入率","guild_rate",true],["D1","d1",true],["D3","d3",true],
];
function RateValue({rate}:{rate:Rate}) {
  return <span className="daily-rate"><strong>{rate.numerator??"—"} / {rate.denominator??"—"}</strong>
    <b>{rate.value==null?"—":`${(rate.value*100).toLocaleString("ja-JP",{maximumFractionDigits:1})}%`}</b>
    {rate.value==null&&<small>{rate.denominator===0?"対象なし":"未観測"}</small>}
    {!!rate.immature_subjects&&<small>未成熟 {rate.immature_subjects}人</small>}</span>;
}
export default function KpiSourceOverview({periods}:{periods:Array<{date:string;acquisition_source_v1?:SourceOverview}>}) {
  const [selected,setSelected]=useState("");
  const period=periods.find(p=>p.date===selected)||periods[0];
  const data=period?.acquisition_source_v1;
  return <section className="kpi-source-overview" aria-label="流入元別KPI">
    <h2>流入元別KPI</h2>
    <label>対象期間 <select value={period?.date||""} onChange={e=>setSelected(e.target.value)}>{periods.map(p=><option key={p.date} value={p.date}>{p.date}</option>)}</select></label>
    {!data?<p role="status">未集計</p>:<div className="daily-desktop daily-period-table" role="region" aria-label="流入元別KPI・横スクロール" tabIndex={0}>
      <table><thead><tr><th scope="col">KPI</th>{sources.map(s=><th key={s} scope="col">{labels[s]}</th>)}</tr></thead><tbody>
      {rows.map(([label,key,isRate])=><SourceRows key={key} label={label} field={key} isRate={isRate} data={data}/>)}
      </tbody></table></div>}
  </section>;
}
function SourceRows({label,field,isRate,data}:{label:string;field:keyof Counts;isRate:boolean;data:SourceOverview}) {
  return <tr><th scope="row">{label}</th>{sources.map(s=><td key={s}>{isRate?<RateValue rate={data.sources[s][field] as Rate}/>:Number(data.sources[s][field]).toLocaleString("ja-JP")}</td>)}</tr>;
}

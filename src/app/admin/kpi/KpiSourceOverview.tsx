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
    {rate.value==null&&<small>{rate.denominator===0?"対象なし":"未成熟・未観測"}</small>}
    {!!rate.immature_subjects&&<small>未成熟 {rate.immature_subjects}人</small>}</span>;
}
export default function KpiSourceOverview({periods}:{periods:Array<{date:string;acquisition_source_v1?:SourceOverview}>}) {
  const [selected,setSelected]=useState("");
  const period=periods.find(p=>p.date===selected)||periods[0];
  const data=period?.acquisition_source_v1;
  const coverage=data?Object.values(data.sources).reduce((a,s)=>({unbound:a.unbound+s.coverage.unbound,legacy:a.legacy+s.coverage.legacy_source,late:a.late+s.coverage.post_game_start_capture}),{unbound:0,legacy:0,late:0}):null;
  return <section className="kpi-source-overview" aria-label="流入元別KPI">
    <h2>流入元別KPI</h2>
    <label>対象期間 <select value={period?.date||""} onChange={e=>setSelected(e.target.value)}>{periods.map(p=><option key={p.date} value={p.date}>{p.date}</option>)}</select></label>
    <p>JST。Landing期間とGame Start cohortを分けて集計します。Journey数はユーザーUUではありません。</p>
    {!data?<p role="status">流入元別KPIは未集計です。</p>:<>
      <div className="daily-desktop daily-period-table" role="region" aria-label="流入元別KPI・横スクロール" tabIndex={0}>
      <table><thead><tr><th scope="col">KPI</th>{sources.map(s=><th key={s} scope="col">{labels[s]}</th>)}</tr></thead><tbody>
      {rows.map(([label,key,isRate],i)=><SourceRows key={key} group={i===0?"Acquisition funnel · Landing期間":i===3?"Game Start cohort · 名前入力完了日":""} label={label} field={key} isRate={isRate} data={data}/>)}
      </tbody></table></div>
      <p>Game Start率：Landing由来Game Start / Journey。Tutorial突破率：完了 / Game Start。Guild加入率：Canonical JOIN / Game Start。D1・D3：成熟Game Start cohortの活動率。</p>
      <p>Unknownのうち未確定 {coverage?.unbound}人、確定unknown {data.sources.unknown.coverage.canonical_unknown}人。旧分類 {coverage?.legacy}人、登録後初観測 {coverage?.late}人。</p>
      <p>Guild Joinは既存Canonical JOIN factを使用し、通常一覧のmembership fallbackとは区別します。Raid 50%消化UU：—（未計測）。</p>
    </>}
  </section>;
}
function SourceRows({group,label,field,isRate,data}:{group:string;label:string;field:keyof Counts;isRate:boolean;data:SourceOverview}) {
  return <>{group&&<tr><th scope="rowgroup" colSpan={6}>{group}</th></tr>}<tr><th scope="row">{label}</th>{sources.map(s=><td key={s}>{isRate?<RateValue rate={data.sources[s][field] as Rate}/>:Number(data.sources[s][field]).toLocaleString("ja-JP")}</td>)}</tr></>;
}

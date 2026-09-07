"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Metric = { value: number | null; numerator: number | null; denominator: number | null; status: string; reason?: string | null };
type DayRow = { date: string; new_users: number; tutorial: Metric; guild: Metric; chat: Metric; retention: Array<Metric & { day: number }> };
type DailyResponse = { rows: DayRow[]; timezone: string };

const dataEnvironment = process.env.NEXT_PUBLIC_KPI_DATA_ENV === "production" ? "Production" : "Preview";
const percent = (metric?: Metric) => metric?.value == null ? "—" : `${(metric.value * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%`;
const state = (metric?: Metric) => metric?.value == null ? (metric?.reason === "measurement_not_started" ? "計測前" : metric?.status === "UNAVAILABLE" ? "利用不可" : "未観測") : "";

function Rate({ metric }: { metric?: Metric }) {
  return <span className="daily-rate"><b>{percent(metric)}</b>{state(metric) && <small>{state(metric)}</small>}</span>;
}

function DayLink({ row, children, className }: { row: DayRow; children: React.ReactNode; className?: string }) {
  return <Link className={className} href={`/admin/kpi/day/${row.date}`} aria-label={`${row.date} の詳細`}>{children}</Link>;
}

export default function KpiDailyOverview() {
  const [data, setData] = useState<DailyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/kpi/v2/daily", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`); return body; })
      .then(setData).catch((reason) => { if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "unavailable"); });
    return () => controller.abort();
  }, []);
  return <main className="kpi-shell daily-shell">
    <header className="kpi-header"><div><span className="kpi-kicker">TRIBE NEON / KPI DASHBOARD</span><h1>日次KPI</h1><p>異常を見つけ、日付からAuthority詳細を確認する一覧</p></div><div className="kpi-header-meta"><strong><span className="kpi-live-dot" /> {dataEnvironment} DB</strong><small>JST · 自動読込</small></div></header>
    {error && <div className="v2-alert" role="alert"><strong>日次KPIを取得できません</strong><span>{error}</span></div>}
    {!data && !error && <div className="v2-loading" aria-live="polite"><span />日次KPIを読み込んでいます…</div>}
    {data && <>
      <div className="daily-desktop"><table><thead><tr><th>日付</th><th>新規</th><th>Tutorial</th><th>Guild</th><th>Chat</th>{[1,2,3,4,5].map((day) => <th key={day}>D{day}</th>)}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.date}><td><DayLink row={row}>{row.date}</DayLink></td><td>{row.new_users}</td><td><Rate metric={row.tutorial} /></td><td><Rate metric={row.guild} /></td><td><Rate metric={row.chat} /></td>{row.retention.map((item) => <td key={item.day}><Rate metric={item} /></td>)}</tr>)}</tbody></table></div>
      <div className="daily-mobile">{data.rows.map((row) => <DayLink row={row} className="daily-card" key={row.date}><header><time>{row.date}</time><span>詳細 →</span></header><div className="daily-primary"><span><small>新規ユーザー</small><b>{row.new_users}</b></span><span><small>Tutorial</small><Rate metric={row.tutorial} /></span><span><small>Guild</small><Rate metric={row.guild} /></span><span><small>Chat</small><Rate metric={row.chat} /></span></div><div className="daily-retention">{row.retention.map((item) => <span key={item.day}><small>D{item.day}</small><Rate metric={item} /></span>)}</div></DayLink>)}</div>
      {!data.rows.length && <p className="v2-empty">対象日がありません。</p>}
    </>}
  </main>;
}

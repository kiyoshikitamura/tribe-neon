"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OverviewMetric, OverviewRow } from "@/utils/kpiMonthly";

type OverviewResponse = { rows: OverviewRow[]; timezone: string };
const dataEnvironment = process.env.NEXT_PUBLIC_KPI_DATA_ENV === "production" ? "Production" : "Preview";

function Rate({ metric }: { metric?: OverviewMetric }) {
  const hasCounts = metric?.numerator != null && metric?.denominator != null;
  const state = metric?.status === "UNAVAILABLE" ? "利用不可" : metric?.reason === "measurement_not_started" ? "計測前"
    : metric?.value == null ? (metric?.denominator === 0 ? "対象なし" : "未成熟・未観測")
      : metric?.reason === "mature_cohorts_only" ? "成熟分のみ" : "";
  return <span className="daily-rate">
    {hasCounts && <strong>{metric.numerator!.toLocaleString("ja-JP")} / {metric.denominator!.toLocaleString("ja-JP")}人</strong>}
    <b>{metric?.value == null ? "—" : `${(metric.value * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%`}</b>
    {metric?.authority_label && <small>{metric.authority_label}</small>}
    {state && <small>{state}</small>}
  </span>;
}

function PeriodTable({ mode, month, onMonth }: { mode: "daily" | "monthly"; month: string; onMonth: (month: string) => void }) {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const label = mode === "daily" ? "日次" : "月次";
  useEffect(() => {
    const controller = new AbortController();
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
    const monthEnd = month ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10) : "";
    const query = mode === "daily" && month ? `?from=${month}-01&to=${monthEnd > today ? today : monthEnd}` : "";
    fetch(`/api/admin/kpi/v2/${mode}${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`); return body; })
      .then(setData).catch((reason) => { if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "unavailable"); });
    return () => controller.abort();
  }, [mode, month, attempt]);
  return <>
    {error && <div className="v2-alert" role="alert"><strong>{label}KPIを取得できません</strong><span>{error}</span><button type="button" onClick={() => { setError(null); setAttempt((value) => value + 1); }}>再試行</button></div>}
    {!data && !error && <div className="v2-loading" role="status" aria-label={`${label}KPIを取得中`}><span /></div>}
    {data && <>
      <div className="daily-desktop daily-period-table" role="region" aria-label={`${label}KPI一覧・横スクロール`} tabIndex={0}>
        <table><thead><tr><th scope="col">{mode === "daily" ? "日付" : "月"}</th><th scope="col">新規</th><th scope="col">Tutorial</th><th scope="col">Guild</th><th scope="col">Chat</th>{[1, 2, 3, 4, 5].map((day) => <th scope="col" key={day}>D{day}</th>)}</tr></thead>
          <tbody>{data.rows.map((row) => <tr key={row.date}>
            <th scope="row">{mode === "daily" ? <Link href={`/admin/kpi/day/${row.date}`} aria-label={`${row.date} の詳細`}>{row.date}</Link>
              : <><button className="daily-month-link" type="button" onClick={() => onMonth(row.date)} aria-label={`${row.date} の日次一覧`}>{row.date}</button>{row.partial && <small>当月途中 · {row.to}まで</small>}</>}</th>
            <td><b>{row.new_users.toLocaleString("ja-JP")}人</b></td><td><Rate metric={row.tutorial} /></td><td><Rate metric={row.guild} /></td><td><Rate metric={row.chat} /></td>
            {[1, 2, 3, 4, 5].map((day) => <td key={day}><Rate metric={row.retention.find((item) => item.day === day)} /></td>)}
          </tr>)}</tbody>
        </table>
      </div>
      {!data.rows.length && <p className="v2-empty">対象期間がありません。</p>}
    </>}
  </>;
}

export default function KpiDailyOverview() {
  const [mode, setMode] = useState<"daily" | "monthly">("daily");
  const [month, setMonth] = useState("");
  return <main className="kpi-shell daily-shell">
    <header className="kpi-header"><div><span className="kpi-kicker">TRIBE NEON / KPI DASHBOARD</span><h1>{mode === "daily" ? "日次KPI" : "月次KPI"}</h1><p>新規登録日のコホート別に比較 · 日付から詳細を確認</p></div><div className="kpi-header-meta"><strong><span className="kpi-live-dot" /> {dataEnvironment} DB</strong><small>JST · 自動読込</small></div></header>
    <nav className="daily-period-switch" aria-label="KPI表示期間">
      <button type="button" aria-pressed={mode === "daily"} onClick={() => { setMode("daily"); setMonth(""); }}>日次</button>
      <button type="button" aria-pressed={mode === "monthly"} onClick={() => { setMode("monthly"); setMonth(""); }}>月次</button>
      <span>{mode === "monthly" ? "直近12か月" : month ? `${month} の日次一覧` : "直近30日"}</span>
    </nav>
    <p className="daily-period-note">{mode === "monthly" ? "月次は登録月別の人数合計から率を算出。D1〜D5は各指標の成熟済みコホートのみ。月をタップして日次一覧へ。" : "1日＝1行。日付をタップして日次詳細へ。"} 横にスクロールして全項目を比較できます。</p>
    <PeriodTable key={`${mode}:${month}`} mode={mode} month={month} onMonth={(value) => { setMonth(value); setMode("daily"); }} />
  </main>;
}

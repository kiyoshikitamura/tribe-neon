"use client";

import Link from "next/link";
import KpiDailyFunnel from "./KpiDailyFunnel";
import { useEffect, useState } from "react";
import type { OverviewMetric, OverviewRow } from "@/utils/kpiMonthly";
import KpiSourceOverview, { type SourceOverview } from "./KpiSourceOverview";

type OverviewResponse = { rows: (OverviewRow & { acquisition_source_v1?: SourceOverview })[]; timezone: string; updated_at?: string | null; stale?: boolean; missing_periods?: number; billing_authority?: string };
const number = (value?: number | null) => value == null ? "—" : value.toLocaleString("ja-JP");
const yen = (value?: number | null) => value == null || !Number.isFinite(value) ? "—" : `¥${Math.round(value).toLocaleString("ja-JP")}`;
const percent = (value?: number | null) => value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const updated = (value?: string | null) => value ? new Intl.DateTimeFormat("ja-JP", { timeZone:"Asia/Tokyo", dateStyle:"short", timeStyle:"short" }).format(new Date(value)) : "未集計";
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

function MonetizationFunnel({ row, mode }: { row?: OverviewRow; mode: "daily" | "monthly" }) {
  if (!row?.monetization) return null;
  const m = row.monetization;
  const payerLabel = mode === "daily" ? "DPU" : "MPU";
  const rateLabel = mode === "daily" ? "DPUR" : "MPUR";
  const arppuLabel = mode === "daily" ? "DARPPU" : "MARPPU";
  const cards = [
    { label: "売上", value: yen(m.revenue), description: "決済成功（GRANTED）の売上" },
    { label: payerLabel, value: `${number(m.payers)}人`, description: "期間内に1回以上決済成功したUU" },
    { label: rateLabel, value: percent(m.payer_rate), description: `${payerLabel} / ${mode === "daily" ? "DAU" : "MAU"}` },
    { label: arppuLabel, value: yen(m.arppu), description: `売上 / ${payerLabel}` },
  ];
  return <section className="daily-funnel" aria-label="Monetization KPI">
    <header><h2>{row.date} JST · Monetization</h2><span>Authority: billing_orders / GRANTED / live</span></header>
    <div className="daily-funnel-grid">{cards.map((card) => <article className="daily-funnel-card" key={card.label}>
      <h3>{card.label}</h3><strong>{card.value}</strong><p>{card.description}</p>
    </article>)}</div>
    <p className="daily-funnel-note">売上日は付与完了時刻 granted_at をJSTへ変換して判定。PENDING・失敗・キャンセルは計上しません。</p>
  </section>;
}

function MonetizationCell({ row, metric }: { row: OverviewRow; metric: "payers" | "payer_rate" | "revenue" | "arppu" | "arpu" }) {
  const monetization = row.monetization;
  if (!monetization) return <span className="daily-rate"><b>—</b><small>未集計</small></span>;
  const value = monetization[metric];
  const formatted = metric === "payers" ? (value == null ? "—" : `${number(value)}人`)
    : metric === "payer_rate" ? percent(value)
      : yen(value);
  return <span className="daily-rate"><b>{formatted}</b><small>決済成功 Authority</small></span>;
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
      <div className="daily-saved-status" role="status">最終集計 {updated(data.updated_at)} JST · 30分ごとに更新{data.stale && <strong> 更新待ち／遅延あり</strong>}{!!data.missing_periods && <span> · {data.missing_periods}期間が未集計</span>}<small>Product / Communityは保存済み結果、課金KPIは決済成功台帳を読み取ります。</small></div>
      {mode === "daily" && <KpiDailyFunnel row={data.rows[0]} />}
      <MonetizationFunnel row={data.rows[0]} mode={mode} />
      <div className="daily-desktop daily-period-table" role="region" aria-label={`${label}KPI一覧・横スクロール`} data-period={mode} tabIndex={0}>
        <table><thead><tr><th scope="col">{mode === "daily" ? "日付" : "月"}</th><th scope="col">新規ユーザー</th>{mode === "monthly" && <th scope="col">累計登録ユーザー</th>}<th scope="col">{mode === "daily" ? "DAU" : "MAU"}</th><th scope="col">Tutorial Complete</th>{mode === "daily" && <th scope="col">Raid Point消化率</th>}<th scope="col">Guild Conversion</th>{mode === "daily" && <th scope="col">Social Active率</th>}{mode === "daily" && [1, 2, 3, 4, 5].map((day) => <th scope="col" key={day}>D{day}</th>)}{(mode === "daily" ? ["DPU", "DPUR", "Revenue", "DARPPU", "DARPU"] : ["MPU", "MPUR", "Revenue", "MARPPU", "MARPU", "Active Guild", "Effective Active Guild"]).map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{data.rows.map((row) => <tr key={row.date}>
            <th scope="row">{mode === "daily" ? <Link href={`/admin/kpi/day/${row.date}`} aria-label={`${row.date} の詳細`}>{row.date}</Link>
              : <><button className="daily-month-link" type="button" onClick={() => onMonth(row.date)} aria-label={`${row.date} の日次一覧`}>{row.date}</button>{row.partial && <small>当月途中 · {row.to}まで</small>}</>}{row.saved_status === "not_aggregated" && <small>未集計</small>}</th>
            <td><b>{number(row.new_users)}{row.new_users != null && "人"}</b></td>{mode === "monthly" && <td>{number(row.total_registered)}</td>}<td className="daily-active-count"><b>{number(row.active_users)}</b></td><td><Rate metric={row.tutorial} /></td>{mode === "daily" && <td><Rate metric={row.raid_point_consumption} /></td>}<td><Rate metric={row.guild} /></td>{mode === "daily" && <td><Rate metric={row.social_active} /></td>}
            {mode === "daily" && [1, 2, 3, 4, 5].map((day) => <td key={day}><Rate metric={row.retention.find((item) => item.day === day)} /></td>)}
            {["payers", "payer_rate", "revenue", "arppu", "arpu"].map((key) => <td key={key}><MonetizationCell row={row} metric={key as "payers" | "payer_rate" | "revenue" | "arppu" | "arpu"} /></td>)}
            {mode === "monthly" && <><td>{number(row.active_guilds)}</td><td>{number(row.effective_active_guilds)}</td></>}
          </tr>)}</tbody>
        </table>
      </div>
      {!data.rows.length && <p className="v2-empty">対象期間がありません。</p>}
      <KpiSourceOverview periods={data.rows} />
    </>}
  </>;
}

export default function KpiDailyOverview() {
  const [mode, setMode] = useState<"daily" | "monthly">("daily");
  const [month, setMonth] = useState("");
  return <main className="kpi-shell daily-shell">
    <header className="kpi-header"><div><span className="kpi-kicker">TRIBE NEON / KPI DASHBOARD</span><h1>{mode === "daily" ? "日次KPI" : "月次KPI"}</h1><p>日次・月次の事業KPI · 日付から詳細を確認</p></div><div className="kpi-header-meta"><strong><span className="kpi-live-dot" /> {dataEnvironment} DB</strong><small>JST · 保存済み集計 + 課金台帳</small></div></header>
    <nav className="daily-period-switch" aria-label="KPI表示期間">
      <button type="button" aria-pressed={mode === "daily"} onClick={() => { setMode("daily"); setMonth(""); }}>日次</button>
      <button type="button" aria-pressed={mode === "monthly"} onClick={() => { setMode("monthly"); setMonth(""); }}>月次</button>
      <span>{mode === "monthly" ? "直近12か月" : month ? `${month} の日次一覧` : "直近30日"}</span>
    </nav>
    <p className="daily-period-note">{mode === "monthly" ? "MAUは月内の利用者を重複除外。累計登録は月末時点（当月は集計時点）。Guild数は月内に日次条件を満たした重複除外数。課金はGRANTED済みlive注文をJST月で集計。Social Active・Raid Point消化率は日次指標。月をタップして日次一覧へ。" : "DAUは当該JST暦日の利用者を重複除外。課金はGRANTED済みlive注文をgranted_atのJST日付で集計。日付をタップして日次詳細へ。"} 横にスクロールして全項目を比較できます。</p>
    <PeriodTable key={`${mode}:${month}`} mode={mode} month={month} onMonth={(value) => { setMonth(value); setMode("daily"); }} />
  </main>;
}

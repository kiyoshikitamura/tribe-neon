"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type View = "summary" | "guild" | "content";
type Period = "daily" | "monthly";
type Row = {
  key: string;
  status: "provisional" | "final" | "unavailable";
  updatedAt: string | null;
  [key: string]: string | number | null;
};

const views: Array<{ id: View; label: string; eyebrow: string }> = [
  { id: "summary", label: "サマリー", eyebrow: "OVERVIEW" },
  { id: "guild", label: "ギルド", eyebrow: "COMMUNITY" },
  { id: "content", label: "コンテンツ", eyebrow: "CONTENT" },
];
const dataEnvironment = process.env.NEXT_PUBLIC_KPI_DATA_ENV === "production" ? "Production" : "Preview";

function jstToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function currentRange(period: Period) {
  const today = jstToday();
  if (period === "daily") return { start: today, end: addDays(today, 1) };
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  return { start: `${year}-${String(month).padStart(2, "0")}-01`, end: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10) };
}
function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}
function numberValue(value: unknown, digits = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ja-JP", { maximumFractionDigits: digits }) : "—";
}
function percentValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%` : "—";
}
function periodLabel(key: string) { return key.replaceAll("-", "/"); }
function statusCell(row: Row) {
  return <span className={`kpi-row-status is-${row.status}`}>{row.status === "provisional" ? "暫定" : row.status === "final" ? "確定" : "—"}</span>;
}

export default function KpiDashboard() {
  const [view, setView] = useState<View>("summary");
  const [period, setPeriod] = useState<Period>("daily");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStep, setRefreshStep] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const selectedView = views.find((item) => item.id === view)!;
  const lastUpdated = useMemo(() => rows.map((row) => row.updatedAt).filter((value): value is string => !!value).sort().at(-1), [rows]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const response = await fetch(`/api/admin/kpi/timeseries?${new URLSearchParams({ view, period, page: String(page) })}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setRows([]); setMessage(result.error || "データを読み込めませんでした。"); }
    else setRows(result.rows || []);
    setLoading(false);
  }, [page, period, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRows(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  const refresh = async () => {
    if (refreshing) return;
    const categories = view === "summary" ? ["acquisition", "active_retention", "revenue"] : [view];
    const range = currentRange(period);
    setRefreshing(true); setMessage(null); setPage(1);
    for (let index = 0; index < categories.length; index += 1) {
      setRefreshStep(index + 1);
      const response = await fetch("/api/admin/kpi/refresh", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: categories[index], periodType: period, periodStart: range.start, periodEnd: range.end }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status !== "succeeded") {
        setMessage(result.error || result.errorDetail || `${categories[index]}の集計に失敗しました。`);
        setRefreshing(false); setRefreshStep(0); return;
      }
    }
    setMessage(`${period === "daily" ? "本日" : "当月"}のSnapshotを更新しました。`);
    setRefreshing(false); setRefreshStep(0); await loadRows();
  };

  const pages = Array.from({ length: Math.max(3, Math.min(5, page + 1)) }, (_, index) => index + 1);
  return (
    <main className="kpi-shell">
      <header className="kpi-header">
        <div><span className="kpi-kicker">TRIBE NEON / INTERNAL</span><h1>KPI Control Room</h1><p>保存済みSnapshotによる日次・月次モニタリング</p></div>
        <div className="kpi-header-meta"><strong><span className="kpi-live-dot" /> {dataEnvironment} DB</strong><small>最終更新 {formatTimestamp(lastUpdated)}</small></div>
      </header>
      <nav className="kpi-tabs" aria-label="KPI画面">
        {views.map((item) => <button key={item.id} className={view === item.id ? "is-active" : ""} onClick={() => { setView(item.id); setPage(1); }} type="button">{item.label}</button>)}
      </nav>
      <section className="kpi-toolbar">
        <div className="kpi-title-block"><span>{selectedView.eyebrow}</span><h2>{selectedView.label}</h2><small>{period === "daily" ? "1ページ30日" : "1ページ12か月"}・新しい順</small></div>
        <div className="kpi-period-tabs" aria-label="集計単位">
          <button type="button" className={period === "daily" ? "is-active" : ""} onClick={() => { setPeriod("daily"); setPage(1); }}>デイリー</button>
          <button type="button" className={period === "monthly" ? "is-active" : ""} onClick={() => { setPeriod("monthly"); setPage(1); }}>マンスリー</button>
        </div>
        <button className="kpi-refresh" type="button" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? `集計中 ${refreshStep}/${view === "summary" ? 3 : 1}` : period === "daily" ? "本日の集計を更新" : "当月の集計を更新"}
        </button>
      </section>
      {message && <div className="kpi-message" role="status">{message}</div>}
      <section className="kpi-table-card" aria-busy={loading}>
        <div className="kpi-table-scroll">
          <table className="kpi-table">
            {view === "summary" && <><thead><tr>
              <th>{period === "daily" ? "日付" : "月"}</th><th>{period === "daily" ? "DAU合計" : "MAU合計"}</th><th>認証</th><th>未認証</th>
              <th>売上</th><th>PU</th><th>PUR</th><th>ARPPU</th><th>ARPU</th><th>新規合計</th><th>新規認証</th><th>新規未認証</th><th>状態</th>
            </tr></thead><tbody>{rows.map((row) => <tr key={row.key}>
              <td>{periodLabel(row.key)}</td><td>{numberValue(row.activeTotal)}</td><td>{numberValue(row.activeAuthenticated)}</td><td>{numberValue(row.activeAnonymous)}</td>
              <td>N/A</td><td>N/A</td><td>N/A</td><td>N/A</td><td>N/A</td><td>{numberValue(row.newTotal)}</td><td>{numberValue(row.newAuthenticated)}</td><td>{numberValue(row.newAnonymous)}</td><td>{statusCell(row)}</td>
            </tr>)}</tbody></>}
            {view === "guild" && <><thead><tr>
              <th>{period === "daily" ? "日付" : "月"}</th><th>有効数</th><th>アクティブ数</th><th>アクティブ率</th><th>総人員数</th><th>平均人員</th><th>新設</th><th>解散</th><th>状態</th>
            </tr></thead><tbody>{rows.map((row) => <tr key={row.key}>
              <td>{periodLabel(row.key)}</td><td>{numberValue(row.validGuilds)}</td><td>{numberValue(row.activeGuilds)}</td><td>{percentValue(row.activeRate)}</td><td>{numberValue(row.memberTotal)}</td><td>{numberValue(row.memberAverage, 1)}</td><td>{numberValue(row.createdGuilds)}</td><td>{numberValue(row.disbandedGuilds)}</td><td>{statusCell(row)}</td>
            </tr>)}</tbody></>}
            {view === "content" && <><thead><tr>
              <th>{period === "daily" ? "日付" : "月"}</th><th>キャラ無料10連</th><th>スキル無料10連</th><th>装備無料10連</th><th>合計</th><th>状態</th>
            </tr></thead><tbody>{rows.map((row) => <tr key={row.key}>
              <td>{periodLabel(row.key)}</td><td>{numberValue(row.character)}</td><td>{numberValue(row.skill)}</td><td>{numberValue(row.equipment)}</td><td>{numberValue(row.total)}</td><td>{statusCell(row)}</td>
            </tr>)}</tbody></>}
          </table>
          {loading && <div className="kpi-table-loading">読込中…</div>}
        </div>
        <footer className="kpi-pagination">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>‹ 前へ</button>
          {pages.map((value) => <button type="button" key={value} className={page === value ? "is-active" : ""} onClick={() => setPage(value)}>{value}</button>)}
          <button type="button" onClick={() => setPage((value) => value + 1)}>次へ ›</button>
        </footer>
      </section>
    </main>
  );
}

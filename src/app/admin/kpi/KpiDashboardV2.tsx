"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Status = "PASS" | "FAIL" | "NOT_READY" | "UNAVAILABLE";
type Metric = { metric_key: string; numerator: number | null; denominator: number | null; value: number | null; target: number | null; status: Status; coverage?: unknown; observation_status?: string; as_of?: string; reason?: string | null };
type Bundle = { validation: any; acquisition: any; tutorial: any; guild: any; retention: any; community: any; marketing: any; postTutorial: any; daily: any };

const labels: Record<string, string> = {
  TITLE_ARRIVED: "Title Arrival", TAP_TO_START: "TAP TO START", WORLD_INTRO_STARTED: "World Intro開始",
  WORLD_INTRO_COMPLETED: "World Intro完了", NAME_COMPLETED: "Name Complete", GAME_START_BOUND: "Game Start",
  GAME_START: "Game Start", TUTORIAL_GACHA_COMPLETED: "Tutorial Gacha", TUTORIAL_BATTLE_COMPLETED: "Tutorial Battle",
  AUTH_CHOICE_SELECTED: "Auth Choice", AUTH_CHOICE_RESOLVED: "Auth Resolved", FIRST_MYPAGE_ACCESS_CONFIRMED: "Canonical Tutorial Complete",
};
const dataEnvironment = process.env.NEXT_PUBLIC_KPI_DATA_ENV === "production" ? "Production" : "Preview";

function jstToday() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function addDays(date: string, days: number) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function n(value: unknown, digits = 0) { return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ja-JP", { maximumFractionDigits: digits }) : "—"; }
function pct(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%` : "—"; }
function yen(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? `¥${value.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}` : "—"; }
function when(value?: string) { return value ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—"; }
function readable(status?: string) { return status === "NOT_READY" ? "NOT READY" : status === "UNAVAILABLE" ? "UNAVAILABLE" : status || "NOT READY"; }
function statusClass(status?: string) { return `is-${(status === "GO" ? "PASS" : status || "NOT_READY").toLowerCase().replace("_", "-")}`; }

function StatusBadge({ status }: { status?: string }) { return <span className={`v2-status ${statusClass(status)}`}>{readable(status)}</span>; }
function MetricCard({ label, metric, definition, format = "percent" }: { label: string; metric?: Metric; definition: string; format?: "percent" | "yen" | "number" }) {
  const formatted = (value: number | null | undefined) => value == null ? "—" : format === "yen" ? yen(value) : format === "number" ? n(value, 1) : pct(value);
  const notMeasured = metric?.reason === "measurement_not_started";
  return <article className="v2-metric-card">
    <div className="v2-card-head"><h3>{label}</h3><StatusBadge status={metric?.status} /></div>
    <span className="v2-card-caption">実績</span><strong className="v2-card-value">{formatted(metric?.value)}</strong>
    {notMeasured && <em className="v2-measurement-note">計測開始前 / データ不足</em>}
    <dl><div><dt>目標</dt><dd>{formatted(metric?.target)}</dd></div><div><dt>N / D</dt><dd>{n(metric?.numerator)} / {n(metric?.denominator)}</dd></div><div><dt>Coverage</dt><dd>{metric?.observation_status || "—"}</dd></div></dl>
    <p>{definition}</p><small>as of {when(metric?.as_of)} · JST</small>
  </article>;
}
function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return <section id={id} className="v2-section"><header><span>{eyebrow}</span><h2>{title}</h2></header>{children}</section>;
}

function DailyActualSummary({ row }: { row?: any }) {
  const actual = (label: string, metric?: any, detail?: React.ReactNode) => <article><span>{label}</span><strong className="actual-pair">{metric?.numerator == null || metric?.denominator == null || metric.denominator === 0 ? "—" : `${n(metric.numerator)} / ${n(metric.denominator)}人`}</strong><b className="actual-rate">{pct(metric?.value)}</b>{detail}<small className="actual-authority">計測方式：{metric?.authority_label || (metric?.authority === "canonical" ? "Canonical" : metric?.authority === "membership_periods" ? "Guild Membership" : metric?.authority?.includes("legacy") ? "旧計測" : "—")}</small></article>;
  return <section className="v2-section daily-actual-summary"><header><span>DAILY ACTUALS</span><h2>日次実数</h2></header><div className="v2-stat-grid">
    <article><span>新規ユーザー</span><strong className="actual-pair">{row ? `${n(row.new_users)}人` : "—"}</strong><small className="actual-authority">計測方式：kpi_subjects</small></article>
    {actual("チュートリアル突破", row?.tutorial)}
    {actual("ギルド設立・加入", row?.guild, row?.guild?.create != null && row?.guild?.join != null ? <small>設立 {n(row.guild.create)}人 · 加入 {n(row.guild.join)}人</small> : null)}
    {actual("ギルドチャット", row?.chat)}
  </div></section>;
}

export default function KpiDashboardV2({ fixedDate }: { fixedDate?: string }) {
  const today = useMemo(() => jstToday(), []);
  const [from, setFrom] = useState(fixedDate || addDays(today, -29));
  const [to, setTo] = useState(fixedDate || today);
  const [grain, setGrain] = useState("CAMPAIGN");
  const [data, setData] = useState<Bundle | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setErrors([]);
    const base = new URLSearchParams({ from, to });
    const routes: Array<[keyof Bundle, string]> = [
      ["validation", `/api/admin/kpi/v2/validation?${base}&grain=${grain}`], ["acquisition", `/api/admin/kpi/v2/acquisition?${base}`],
      ["tutorial", `/api/admin/kpi/v2/tutorial?${base}`], ["guild", `/api/admin/kpi/v2/guild?${base}`],
      ["retention", `/api/admin/kpi/v2/retention?${base}`], ["community", `/api/admin/kpi/v2/community?${base}`],
      ["marketing", `/api/admin/kpi/v2/marketing?${base}&grain=${grain}`], ["postTutorial", `/api/admin/kpi/v2/post-tutorial?${base}`],
      ["daily", `/api/admin/kpi/v2/daily?${base}`],
    ];
    const entries = await Promise.all(routes.map(async ([key, url]) => {
      try { const response = await fetch(url, { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`); return [key, body, null] as const; }
      catch (error) { return [key, null, `${key}: ${error instanceof Error ? error.message : "unavailable"}`] as const; }
    }));
    const next: any = {}; const nextErrors: string[] = [];
    entries.forEach(([key, body, error]) => { next[key] = body; if (error) nextErrors.push(error); });
    setData(next as Bundle); setErrors(nextErrors); setLoading(false);
  }, [from, grain, to]);
  useEffect(() => { void load(); }, [load]);

  const validation = data?.validation;
  const latestMarketingDay = validation?.marketing?.days?.at(-1);
  const marketingGateMetric = latestMarketingDay?.cpc ? { ...latestMarketingDay.cpc, status: latestMarketingDay.gate_status } : undefined;
  const marketingRows = data?.marketing?.rows || [];
  const marketingTotals = marketingRows.reduce((sum: any, row: any) => ({ spend: sum.spend + Number(row.spend || 0), impressions: sum.impressions + Number(row.impressions || 0), clicks: sum.clicks + Number(row.clicks || 0) }), { spend: 0, impressions: 0, clicks: 0 });
  const marketingDerived = { ctr: marketingTotals.impressions ? marketingTotals.clicks / marketingTotals.impressions : null, cpc: marketingTotals.clicks ? marketingTotals.spend / marketingTotals.clicks : null, cpm: marketingTotals.impressions ? marketingTotals.spend * 1000 / marketingTotals.impressions : null };
  const latestCommunity = (data?.community?.series || []).at(-1);
  const formalOpen = validation?.formal_open;
  const formalRetention = formalOpen?.retention || {};
  const communityContinuity = formalOpen?.effective_active_guild || data?.community?.effective_active_guild;
  const phases = [
    { label: "Development", status: "PASS", note: "事業判断として固定" },
    { label: "Acquisition", status: validation?.acquisition?.status || "NOT_READY", note: "Title Arrival → Game Start" },
    { label: "Product / Community", status: formalOpen?.status === "GO" ? "PASS" : formalOpen?.status || "NOT_READY", note: "Canonical Product / Community gates" },
    { label: "Monetization", status: "UNAVAILABLE", note: "Payment CLOSED" },
  ];
  const retentionSummary: Metric | undefined = formalRetention.d1;
  const communityMetric: Metric = { metric_key: "community.effective_active_guild_continuity", numerator: communityContinuity?.current_consecutive_days ?? null, denominator: 3, value: communityContinuity?.current_consecutive_days == null ? null : communityContinuity.current_consecutive_days / 3, target: 1, status: communityContinuity?.status || "NOT_READY", as_of: latestCommunity?.date, observation_status: communityContinuity?.status === "NOT_READY" ? "incomplete" : "complete" };
  return <main className="kpi-shell v2-shell">
    <header className="kpi-header"><div><span className="kpi-kicker">TRIBE NEON / KPI DASHBOARD V2</span><h1>{fixedDate ? `${fixedDate} JST` : "Validation Room"}</h1><p>Canonical Authorityによるread-only detail</p></div><div className="kpi-header-meta">{fixedDate && <Link className="v2-back" href="/admin/kpi">← 日次一覧</Link>}<strong><span className="kpi-live-dot" /> {dataEnvironment} DB</strong><small>JST · 自動読込</small></div></header>
    {!fixedDate && <details className="v2-filters"><summary>表示条件</summary><section className="v2-toolbar"><label>FROM<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label><label>TO<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label><label>MARKETING GRAIN<select value={grain} onChange={(e) => setGrain(e.target.value)}><option value="CAMPAIGN">Campaign</option><option value="LINE_ITEM">Line item</option><option value="CREATIVE">Creative</option><option value="ACCOUNT">Account</option></select></label><button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "再読込"}</button></section></details>}
    {errors.length > 0 && <div className="v2-alert" role="alert"><strong>一部Authorityを取得できません</strong><span>{errors.join(" / ")}</span><button type="button" onClick={() => void load()}>再試行</button></div>}
    {loading && !data && <div className="v2-loading" aria-live="polite"><span />Canonical KPIを読み込んでいます…</div>}

    {fixedDate && <DailyActualSummary row={data?.daily?.rows?.find((row: any) => row.date === fixedDate)} />}

    <Section eyebrow="01 / VALIDATION STATUS" title="Validation Status"><div className="v2-phase-grid">{phases.map((phase) => <article key={phase.label}><StatusBadge status={phase.status} /><h3>{phase.label}</h3><p>{phase.note}</p></article>)}</div></Section>
    <Section eyebrow="02 / CURRENT RELEASE GATE" title="Current Release Gate"><div className="v2-card-grid">
      <MetricCard label="Marketing" metric={marketingGateMetric} format="yen" definition="CPC ≤ ¥28.5 AND Clicks ≥ 350 / JST day" />
      <MetricCard label="Acquisition" metric={validation?.acquisition} definition="Game Start bound journey / Title Arrival journey" />
      <MetricCard label="Tutorial" metric={validation?.tutorial} definition="FIRST_MYPAGE_ACCESS_CONFIRMED UU / Game Start UU" />
      <MetricCard label="Activation" metric={validation?.guild_chat_activation} definition="Guild Chat activated subject / Guild Conversion subject" />
      <MetricCard label="Retention D1" metric={retentionSummary} definition="Latest 3 mature cohorts · UU weighted" />
      <MetricCard label="Community" metric={communityMetric} definition="Effective Active Guild ≥18 / 3 consecutive completed JST days" />
    </div></Section>
    <Section eyebrow="03 / MARKETING" title="Marketing"><div className="v2-stat-grid">{[["Spend", yen(marketingRows.length ? marketingTotals.spend : null)], ["Impressions", n(marketingRows.length ? marketingTotals.impressions : null)], ["Clicks", n(marketingRows.length ? marketingTotals.clicks : null)], ["CTR", pct(marketingDerived.ctr)], ["CPC", yen(marketingDerived.cpc)], ["CPM", yen(marketingDerived.cpm)]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><div className="v2-note-grid"><p><b>GATE</b> CPC ≤ ¥28.5 + Clicks ≥ 350/day</p><p><b>TARGET</b> CPC ≤ ¥20 · CTR ≈ 0.7%</p><p><b>STRONG</b> CPC ≤ ¥15 · CTR 0.8–1.0% · Clicks 400–500/day</p></div>{marketingRows.length > 0 && <div className="v2-marketing-list">{marketingRows.slice(0, 20).map((row: any) => <article key={row.id || `${row.report_date_jst}-${row.external_key}`}><div><strong>{row.campaign_name || row.campaign_key || "Campaign"}</strong><small>{row.report_date_jst} · {row.reporting_grain}</small></div><span>{yen(Number(row.spend))}</span><span>{n(Number(row.clicks))} clicks</span><span>{row.cpc == null ? "CPC —" : `CPC ${yen(Number(row.cpc))}`}</span></article>)}</div>}{!marketingRows.length && <p className="v2-empty"><StatusBadge status="NOT_READY" /> Marketing source dataがありません。0として判定しません。</p>}</Section>
    <Section eyebrow="04 / ACQUISITION" title="Acquisition Funnel"><div className="v2-funnel">{(data?.acquisition?.steps || []).map((step: any, index: number, all: any[]) => { const first = all[0]?.journeys; const previous = all[index - 1]?.journeys; return <article key={step.event_type}><span>{index + 1}</span><div><h3>{labels[step.event_type]}</h3><strong>{n(step.journeys)}</strong><small>Prev {previous == null || previous === 0 ? "—" : pct(step.journeys / previous)} · Title {first == null || first === 0 ? "—" : pct(step.journeys / first)}</small></div></article>; })}</div>{data?.acquisition?.measurement_status === "NOT_MEASURED" && <p className="v2-measurement-note">計測開始前 / データ不足</p>}<p className="v2-definition">Primary Gate: bound Game Start journeys / TITLE_ARRIVED journeys ≥ 80%。X ClickはMarketing Authorityとして分離。</p>
      <h3>Source / Campaign / Creative</h3>
      <div className="v2-retention-scroll"><table className="v2-retention"><thead><tr><th>Source</th><th>Campaign</th><th>Creative</th><th>Landing</th><th>Game Start</th><th>Tutorial</th><th>Guild</th><th>Guild Join</th><th>Chat</th>{[1,2,3,4,5,6,7].map((day) => <th key={day}>D{day}</th>)}</tr></thead><tbody>{(data?.acquisition?.breakdown || []).map((row: any) => <tr key={JSON.stringify([row.source,row.campaign,row.creative])}><td><b>{row.source}</b></td><td>{row.campaign || "—"}</td><td>{row.creative || "—"}</td><td>{n(row.landing)}</td><td>{n(row.game_start)}</td><td>{n(row.tutorial_complete)}</td><td>{n(row.guild)}</td><td>{n(row.guild_join)}</td><td>{n(row.guild_chat_activation)}</td>{row.retention.map((item: any) => <td key={item.day}>{item.observation_status === "incomplete" ? <b>—</b> : <><b>{pct(item.value)}</b><small>{n(item.numerator)} / {n(item.denominator)}</small></>}</td>)}</tr>)}</tbody></table></div>
      {!data?.acquisition?.breakdown?.length && <p className="v2-empty">Attribution rowがありません。</p>}
    </Section>
    <Section eyebrow="05 / TUTORIAL" title="Tutorial Funnel"><div className="v2-funnel">{(data?.tutorial?.steps || []).map((step: any, index: number) => <article key={step.fact_type} className={step.observation_status === "partial" ? "is-partial" : ""}><span>{index + 1}</span><div><h3>{labels[step.fact_type]}</h3><strong>{n(step.subjects)}</strong><small>{step.observation_status === "partial" ? "PARTIAL COVERAGE" : "Canonical Authority"}</small></div></article>)}</div><p className="v2-definition">Canonical completeはFIRST_MYPAGE_ACCESS_CONFIRMEDのみ。legacy COMPLETEはnumeratorに含みません。Gate 60% / Strong 70%。</p></Section>
    <Section eyebrow="06 / POST TUTORIAL" title="Post Tutorial Activation"><div className="v2-stat-grid">{(data?.postTutorial?.metrics || []).map((item: any) => <article key={item.key}><span>{item.label || item.key}</span><strong>{n(item.uu)} UU</strong><small>{item.key === "SKILL_NORMAL" || item.key === "EQUIP_NORMAL" ? item.key : item.observation_status === "unavailable" ? "AUTHORITY UNAVAILABLE" : "First use after tutorial"}</small></article>)}</div></Section>
    <Section eyebrow="07 / GUILD" title="Guild Funnel"><div className="v2-guild-flow"><article><span>Tutorial Complete</span><strong>{n(data?.guild?.conversion?.denominator)}</strong></article><i>→</i><article><span>Guild Conversion</span><strong>{n(data?.guild?.conversion?.numerator)}</strong><small>CREATE {n(data?.guild?.create)} / JOIN {n(data?.guild?.join)}</small></article><i>→</i><article><span>Chat Activation</span><strong>{n(data?.guild?.chat_activation?.numerator)}</strong><small>{pct(data?.guild?.chat_activation?.value)} · PASS 30%</small></article></div></Section>
    <Section eyebrow="08 / RETENTION" title="JST Classic Retention"><div className="v2-retention-scroll"><table className="v2-retention"><thead><tr><th>Cohort Date</th><th>Game Start UU</th>{[1,2,3,4,5].map((d) => <th key={d}>D{d}<small>{[38,30,26,23,21][d-1]}%</small></th>)}</tr></thead><tbody>{(data?.retention?.cohorts || []).map((cohort: any) => <tr key={cohort.cohort_date}><td>{cohort.cohort_date}</td><td>{n(cohort.game_start_uu)}</td>{cohort.days.map((day: any) => <td key={day.day}>{day.observation_status === "incomplete" ? <><b>—</b><small>NOT READY</small></> : <><b>{pct(day.value)}</b><small>{n(day.numerator)} / {n(day.denominator)}</small></>}</td>)}</tr>)}</tbody></table></div>{!data?.retention?.cohorts?.length && <p className="v2-empty">対象cohortがありません。</p>}<h3>Formal Open · latest 3 mature cohorts (UU weighted)</h3><div className="v2-stat-grid">{[1,2,3,4,5].map((day) => { const item = formalRetention[`d${day}`]; return <article key={day}><span>D{day} weighted</span><strong>{pct(item?.value)}</strong><StatusBadge status={item?.status} /><small>{n(item?.numerator)} / {n(item?.denominator)} · mature {n(item?.mature_cohort_count)} · {item?.cohorts_used?.join(", ") || "—"}</small></article>; })}</div><p className="v2-definition">Identity: subject_id（AUTH_LINK_SAME_SUBJECTは継続。ACCOUNT_SWITCH_TO_EXISTINGはmergeせず、diagnostic {n(data?.retention?.account_switch_diagnostic_count)}件）</p></Section>
    <Section eyebrow="09 / COMMUNITY" title="Community"><div className="v2-stat-grid">{[["Guild Active UU", latestCommunity?.guild_active_uu], ["Active Guild", latestCommunity?.active_guild_count], ["Guild Chat Active UU", latestCommunity?.guild_chat_active_uu], ["Chat messages", latestCommunity?.guild_chat_message_count], ["Effective Active Guild", latestCommunity?.effective_active_guild_count]].map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{n(value)}</strong><small>{label === "Effective Active Guild" ? "Target 18" : latestCommunity?.date || "NOT READY"}</small></article>)}</div><div className="v2-readiness"><StatusBadge status={communityContinuity?.status} /><div><h3>Effective Active Guild continuity</h3><p>Target 18 / 3 consecutive completed JST days · current {n(communityContinuity?.current_consecutive_days)} days</p></div></div></Section>
    <Section eyebrow="10 / FORMAL OPEN" title="Formal Open Readiness"><div className="v2-readiness"><StatusBadge status={formalOpen?.status || "NOT_READY"} /><div><h3>{formalOpen?.status === "GO" ? "GO — Decision Support" : formalOpen?.status === "FAIL" ? "Threshold not met" : "Observation not ready"}</h3><p>{formalOpen?.reasons?.length ? formalOpen.reasons.join(" / ") : "All canonical gates passed"}。DashboardからPayment/GvG等を操作しません。</p></div></div></Section>
    <Section eyebrow="11–13 / POST FORMAL OPEN" title="GvG / Monetization / Mission"><div className="v2-shell-grid"><article><StatusBadge status="UNAVAILABLE" /><h3>GvG</h3><p>NOT OPEN — Entry Authorityは後続実装。</p></article><article><StatusBadge status="UNAVAILABLE" /><h3>Monetization</h3><p>Payment CLOSED — 0売上とは表示しません。</p></article><article><StatusBadge status="NOT_READY" /><h3>Mission Diagnostics</h3><p>Daily / Normal / Limited</p><small>DAILY → Daily · NORMAL → Normal · SPECIAL → Limited</small></article></div></Section>
  </main>;
}

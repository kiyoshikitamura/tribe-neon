import type { OverviewMetric, OverviewRow } from "@/utils/kpiMonthly";

const count = (value?: number | null) => value == null ? "—" : value.toLocaleString("ja-JP");
const percent = (value?: number | null) => value == null || !Number.isFinite(value)
  ? "—" : `${(value * 100).toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export function DailyFunnelMetric({ label, metric, description }: { label: string; metric?: OverviewMetric; description: string }) {
  return <article className="daily-funnel-card"><h3>{label}</h3>
    <strong>{count(metric?.numerator)} / {count(metric?.denominator)}</strong>
    <b>{percent(metric?.value)}</b><p>{description}</p>
    {metric?.denominator === 0 && <small>対象なし</small>}
    {!metric && <small>未集計</small>}
  </article>;
}

export default function KpiDailyFunnel({ row }: { row?: OverviewRow }) {
  if (!row) return null;
  return <section className="daily-funnel" aria-label="Product / Community Funnel">
    <header><h2>{row.date} JST · Product / Community</h2><span>Game Start {count(row.new_users)}人 · DAU {count(row.active_users)}人</span></header>
    <div className="daily-funnel-grid">
      <DailyFunnelMetric label="Tutorial突破率" metric={row.tutorial} description="Tutorial完了UU / Game Start UU" />
      <DailyFunnelMetric label="Raid Point消化率" metric={row.raid_point_consumption} description="当日合計3 Point以上使用UU / DAU" />
      <DailyFunnelMetric label="Guild加入率" metric={row.guild} description="Guild設立・加入UU / Tutorial完了UU（既存定義）" />
      <DailyFunnelMetric label="Social Active率" metric={row.social_active} description="Guild / Global / DM / BBSの重複除外UU / Guild所属DAU" />
    </div>
    <p className="daily-funnel-note">Social ActiveはJST日末時点のGuild所属DAUが対象。加入当日の挨拶を含みます。</p>
  </section>;
}

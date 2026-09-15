"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { canonicalItemName } from "@/domain/gameplay/canonical/items";
import { parseMonthlyPowerRewardView, type MonthlyPowerRewardView, type MonthlyRewardItem } from "@/domain/ranking/monthlyPowerRewardPresentation";

const rankLabel = (from: number, to: number) => from === to ? `${from}位` : `${from}〜${to}位`;
const ItemList = ({ items }: { items: MonthlyRewardItem[] }) => <ul className="ranking-season-items">{items.map(item => <li key={item.item_id}><span>{canonicalItemName(item.item_id)}</span><b>×{item.quantity}</b></li>)}</ul>;

export default function MonthlyPowerRewardContent({ category }: { category: "power" | "guild_power" }) {
  const [view, setView] = useState<MonthlyPowerRewardView | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setView(null);
    setFailed(false);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_monthly_power_season_rewards_v1", { p_ranking_type: category.toUpperCase() });
        if (error) throw error;
        const parsed = parseMonthlyPowerRewardView(data);
        if (!cancelled) setView(parsed);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [category, attempt]);
  if (failed) return <div className="ranking-reward-error" role="alert"><p>シーズン報酬を取得できませんでした。</p><button type="button" onClick={() => setAttempt(value => value + 1)}>再試行</button></div>;
  if (!view) return <span className="spinner" role="status" aria-label="シーズン報酬を取得中" />;
  const guild = category === "guild_power";
  const currentTier = view.tiers.find(tier => view.current_rank !== null && view.current_rank >= tier.rank_min && view.current_rank <= tier.rank_max);
  return <div className="ranking-reward-sections">
    <section className="ranking-season-planned" aria-label="現在獲得予定のシーズン報酬">
      <header><strong>{view.finalized ? "確定順位" : "現在順位"}</strong><span>{view.current_rank ? `${view.current_rank}位` : "順位なし"}</span></header>
      {!view.season && <p>正式オープンから開催します。</p>}
      <p>{guild && view.eligibility.eligible !== true ? "在籍条件を満たした場合の予定報酬" : view.finalized ? "確定順位の報酬" : "現在の獲得予定報酬（終了時に確定）"}</p>
      {guild && view.eligibility.status === "NOT_MEMBER" ? <p>Guild未所属のため、Member報酬の対象外です。</p> : <>
        {currentTier && <p>{currentTier.honor_label}{guild ? "（Guildに付与）" : ""}</p>}
        {view.planned_items.length ? <ItemList items={view.planned_items} /> : <p>{currentTier && guild ? "Member報酬は在籍条件を満たす必要があります。" : "現在の順位で獲得予定のアイテムはありません。"}</p>}
      </>}
    </section>
    {guild && <div className="ranking-reward-cosmetic-notes"><p>Member報酬の対象：シーズン終了時に対象Guildへ所属し、当該シーズン中に7日以上在籍しているメンバー。</p><p>終了時に受領資格を確定します。その後に脱退しても受領権は維持されます。Guildの名誉報酬はMemberの在籍条件とは別に付与されます。</p></div>}
    <section aria-label="シーズン全順位帯の報酬"><header><strong>{guild ? "Guild総合力" : "個人総合力"}・シーズン報酬</strong><span>月次</span></header>
      {view.tiers.map(tier => <div key={tier.rank_min} className={`ranking-season-tier ${currentTier === tier ? "is-current" : ""}`}>
        <strong>{rankLabel(tier.rank_min, tier.rank_max)}{currentTier === tier ? "（現在）" : ""}</strong>
        <p>{tier.honor_label}{guild ? "（Guildに付与）" : ""}</p>
        {guild && <small>条件を満たすMember 1人あたり</small>}
        <ItemList items={tier.items} />
      </div>)}
      <p>{guild ? "21位" : "101位"}以下：報酬なし</p>
    </section>
    {view.cosmetics_status === "UNRESOLVED_MASTER_BINDINGS" && <p className="ranking-season-pending">称号・装飾は準備中です。</p>}
  </div>;
}

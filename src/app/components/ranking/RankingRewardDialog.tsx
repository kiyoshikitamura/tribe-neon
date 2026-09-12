"use client";

import CanonicalDialog from "../ui/CanonicalDialog";
import CanonicalItemIcon from "../ui/CanonicalItemIcon";
import { canonicalItemName } from "@/domain/gameplay/canonical/items";
import {
  guildSeasonCosmeticRewardSectionsFromPayload,
  rankingRewardSections,
  rankingRewardSectionsFromPayload,
  type RankingRewardCategory,
  type RankingRewardMasterPayload,
  type RankingRewardPeriod,
} from "@/domain/ranking/rankingRewardPresentation";
import "./RankingRewardDialog.css";

const rankLabel = (from: number, to: number) => from === to ? `${from}位` : `${from}〜${to}位`;

export default function RankingRewardDialog({ category, period, currentRank = null, finalized = false, master, loading = false, error = null, preopenGuildSeason = false, onPeriodChange, onRetry, onClose }: {
  currentRank?: number | null;
  finalized?: boolean;
  category: RankingRewardCategory;
  period: RankingRewardPeriod;
  master?: RankingRewardMasterPayload | null;
  loading?: boolean;
  error?: string | null;
  preopenGuildSeason?: boolean;
  onPeriodChange: (period: RankingRewardPeriod) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const showGuildSeasonCosmetics = category === "guild_power" && period === "season" && preopenGuildSeason;
  const sections = showGuildSeasonCosmetics
    ? guildSeasonCosmeticRewardSectionsFromPayload(master)
    : master === undefined ? rankingRewardSections(category, period) : rankingRewardSectionsFromPayload(master, category, period);
  return <CanonicalDialog title="ランキング報酬" ariaLabel="ランキング報酬確認" onClose={onClose} loading={loading} actions={[{ label: "閉じる", onClick: onClose, disabled: loading }]}>
    <div className="ranking-reward-dialog-content">
      <div className="ranking-reward-period-tabs" role="group" aria-label="報酬期間">
        {(["daily", "season"] as const).map((rewardPeriod) => <button
          key={rewardPeriod}
          type="button"
          className={period === rewardPeriod ? "is-active" : ""}
          aria-pressed={period === rewardPeriod}
          disabled={loading}
          onClick={() => onPeriodChange(rewardPeriod)}
        >{rewardPeriod === "daily" ? "デイリー" : "シーズン"}</button>)}
      </div>
      {currentRank && <p className="ranking-reward-standing">{currentRank}位・{finalized ? "確定順位" : "現在順位での報酬（確定前）"}</p>}
      <div className="ranking-reward-scroll" tabIndex={0} aria-label="ランキング報酬一覧">
        {loading ? <span className="spinner" role="status" aria-label="報酬情報を取得中" /> : error ? <div className="ranking-reward-error" role="alert"><p>{error}</p><button type="button" onClick={onRetry}>再試行</button></div> : sections.length === 0 ? <p className="ranking-reward-empty">{period === "season" ? "このランキングのシーズン報酬はありません" : "このランキングのデイリー報酬はありません"}</p> : <div className="ranking-reward-sections">
          {sections.map((rewardSection) => <section key={rewardSection.title}>
            <header><strong>{rewardSection.title}</strong><span>{rewardSection.cadence === "MONTHLY" ? "月次" : rewardSection.cadence === "WEEKLY" ? "週次" : "日次"}</span></header>
            <div className="ranking-reward-tiers">{rewardSection.tiers.map((tier) => <div key={`${tier.from}-${tier.to}-${tier.itemId}`} className={`ranking-reward-tier ${tier.rewardKind === "cosmetic" ? "is-cosmetic" : ""} ${currentRank && currentRank >= tier.from && currentRank <= tier.to ? "is-current" : ""}`}>
              <strong>{tier.eligibilityLabel || rankLabel(tier.from, tier.to)}{currentRank && currentRank >= tier.from && currentRank <= tier.to ? <small>現在</small> : currentRank && tier.to === Math.max(0, ...rewardSection.tiers.filter(t => t.to < currentRank).map(t => t.to)) ? <small>次の報酬帯</small> : null}</strong>{tier.rewardKind === "cosmetic" ? <span className="ranking-reward-cosmetic-mark">装飾</span> : <CanonicalItemIcon itemId={tier.itemId} alt={canonicalItemName(tier.itemId)} fallback="券" />}<span>{tier.displayName || canonicalItemName(tier.itemId)}</span>{tier.rewardKind === "cosmetic" ? null : <b>×{tier.quantity}</b>}
            </div>)}</div>
          </section>)}
          {showGuildSeasonCosmetics && <div className="ranking-reward-cosmetic-notes">
            <p>上位3ギルドにも参加記念ギルド装飾を付与します。</p>
            <p>ランキング報酬の限定ギルド装飾は、正式オープン後のギルド装飾機能追加時に使用できるようになります。</p>
          </div>}
        </div>}
      </div>
    </div>
  </CanonicalDialog>;
}

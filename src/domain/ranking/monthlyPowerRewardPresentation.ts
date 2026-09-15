export type MonthlyRewardItem = { item_id: string; quantity: number };
export type MonthlyRewardTier = { rank_min: number; rank_max: number; honor_label: string; items: MonthlyRewardItem[] };
export type MonthlyPowerRewardView = {
  season: { id: string; starts_at: string; ends_at: string; status: string } | null;
  tiers: MonthlyRewardTier[];
  current_rank: number | null;
  planned_items: MonthlyRewardItem[];
  eligibility: { status: string; eligible: boolean | null; season_days?: number };
  cosmetics_status: string;
  finalized: boolean;
};

export function parseMonthlyPowerRewardView(value: unknown): MonthlyPowerRewardView {
  if (!value || typeof value !== "object") throw new Error("Missing season rewards");
  const row = value as MonthlyPowerRewardView;
  const validItems = (items: MonthlyRewardItem[]) => Array.isArray(items) && items.every(item =>
    typeof item?.item_id === "string" && item.item_id.length > 0 && Number.isInteger(item.quantity) && item.quantity > 0);
  if (!Array.isArray(row.tiers) || !row.tiers.length || !row.tiers.every(tier =>
    Number.isInteger(tier.rank_min) && tier.rank_min > 0 && Number.isInteger(tier.rank_max)
    && tier.rank_max >= tier.rank_min && typeof tier.honor_label === "string" && validItems(tier.items))
    || !validItems(row.planned_items) || !row.eligibility || typeof row.eligibility.status !== "string"
    || typeof row.finalized !== "boolean" || typeof row.cosmetics_status !== "string"
    || (row.current_rank !== null && (!Number.isInteger(row.current_rank) || row.current_rank <= 0))) {
    throw new Error("Invalid season rewards");
  }
  return row;
}

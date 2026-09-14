export type PvpMatchReward = { cash: number; diamonds: number; xp: number; raidTickets: number };
export type PvpMatchRewards = Record<"VICTORY" | "DEFEAT", PvpMatchReward>;

export function pvpRewardLabel(reward?: PvpMatchReward): string {
  if (!reward) return "報酬を確認中";
  return [reward.raidTickets > 0 ? `レイドチケット ×${reward.raidTickets}` : null,
    reward.cash > 0 ? `${reward.cash.toLocaleString()} CASH` : null,
    reward.diamonds > 0 ? `ダイヤ ${reward.diamonds.toLocaleString()}` : null,
    reward.xp > 0 ? `EXP ${reward.xp.toLocaleString()}` : null].filter(Boolean).join("・") || "勝敗報酬なし";
}

export default function PvpBattleRewards({ rewards }: { rewards: PvpMatchRewards | null }) {
  return <section className="pvp-battle-rewards" aria-label="対戦報酬">
    <strong>勝利してレイドに挑もう</strong>
    <p><b>勝利報酬</b> {pvpRewardLabel(rewards?.VICTORY)}</p>
    <p><b>敗北時</b> {pvpRewardLabel(rewards?.DEFEAT)}</p>
  </section>;
}

import type { RaidObserved, RaidGuildSummary } from './raidRoom';

/** 表示補完のみ。参加/報酬資格の正本は既存RPC。予定とPresentを混同しない。 */
export interface RaidRewardPlan {
  readonly status: 'unconfigured' | 'configured';
  readonly items: readonly { readonly itemId: string; readonly quantity: number }[];
}
export interface RaidRoomDisplay {
  readonly roomId: string;
  readonly ownerGuild: RaidObserved<RaidGuildSummary | null>;
  readonly leaderCharacterIds: Readonly<Record<string, string | null>>;
  readonly membership: 'owner' | 'member' | 'rescue' | 'not_joined';
  readonly clearPlan: RaidRewardPlan;
  readonly rescuePlan: RaidRewardPlan;
}

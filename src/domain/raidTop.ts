import type { RaidObserved, RaidRoomDto, RaidGuildSummary, RaidPlayerSummary } from './raidRoom';

/** トップの表示専用契約。未取得/失敗/正本未接続は0件に変換しない。 */
export type RaidTopResource<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'error' }
  | { readonly status: 'unavailable' };

export interface RaidTopEnemy {
  readonly variantId: string;
  readonly baseId: string;
  readonly areaName: string;
  readonly bossName: string;
  readonly backgroundUrl: string;
  readonly leaderImageUrl: string;
  readonly roster: readonly { readonly id: string; readonly name: string; readonly imageUrl: string }[];
}

export interface RaidTopEntry {
  readonly room: RaidRoomDto;
  readonly enemy: RaidObserved<RaidTopEnemy>;
  readonly ownerGuild: RaidObserved<RaidGuildSummary | null>;
  readonly participants: RaidObserved<readonly RaidPlayerSummary[]>;
  readonly membership: RaidObserved<'owner' | 'member' | 'rescue' | 'not_joined'>;
  readonly rescue: RaidObserved<{ readonly rescueId: string; readonly source: 'activity' | 'guild_chat' }>;
}

/** 日次正本の返値を受け取る。全7エリアやクライアント独自抽選で代替しない。 */
export interface RaidDailyTargets {
  readonly dateJst: string;
  readonly targets: readonly [RaidTopEnemy, RaidTopEnemy];
}

export interface RaidTopData {
  readonly participating: RaidTopResource<readonly RaidTopEntry[]>;
  readonly rescues: RaidTopResource<readonly RaidTopEntry[]>;
  readonly dailyTargets: RaidTopResource<RaidDailyTargets>;
  readonly canCreate: boolean;
}

export interface RaidTopProps {
  readonly data: RaidTopData;
  readonly onOpenRoom: (roomId: string, rescueId?: string) => void;
  readonly onChooseEnemy: (enemy: RaidTopEnemy) => void;
  readonly onBrowse: () => void;
  readonly onRefresh: () => void;
  readonly disabled?: boolean;
}

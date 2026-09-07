/** 新レイドの表示契約。戦闘・参加資格・報酬の確定処理はサーバーが担当する。 */
export type RaidDifficultyId = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface RaidDifficultyDefinition {
  readonly id: RaidDifficultyId;
  readonly label: string;
  readonly minimumPower: number | null;
  readonly recommendedPower: { readonly min: number; readonly max: number | null } | null;
}

/** 最低値は確定条件。推奨値は表示用目安であり、判定には使用しない。 */
export const RAID_DIFFICULTIES: readonly RaidDifficultyDefinition[] = Object.freeze([
  Object.freeze({ id: 'beginner' as const, label: '初級', minimumPower: null, recommendedPower: null }),
  Object.freeze({ id: 'intermediate' as const, label: '中級', minimumPower: 160000, recommendedPower: Object.freeze({ min: 180000, max: 220000 }) }),
  Object.freeze({ id: 'advanced' as const, label: '上級', minimumPower: 200000, recommendedPower: Object.freeze({ min: 220000, max: 260000 }) }),
  Object.freeze({ id: 'expert' as const, label: '超級', minimumPower: 240000, recommendedPower: Object.freeze({ min: 260000, max: null }) }),
]);

export type RaidPowerGateReason = 'no_power_restriction' | 'meets_minimum' | 'below_minimum'
  | 'power_unavailable' | 'invalid_power' | 'invalid_difficulty';

export interface RaidPowerGateResult {
  readonly status: 'passed' | 'failed' | 'unknown';
  readonly minimumPower: number | null;
  readonly actualPower: number | null;
  readonly reason: RaidPowerGateReason;
}

/** 総合力条件のみを判定する。passed は Room への参加許可を意味しない。 */
export function evaluateRaidPowerGate(difficultyId: RaidDifficultyId, power: unknown): RaidPowerGateResult {
  const difficulty = RAID_DIFFICULTIES.find((entry) => entry.id === difficultyId);
  const actualPower = typeof power === 'number' && Number.isFinite(power) && power >= 0 ? power : null;
  if (!difficulty) {
    return { status: 'unknown', minimumPower: null, actualPower, reason: 'invalid_difficulty' };
  }
  const minimumPower = difficulty.minimumPower;
  if (minimumPower === null) {
    return { status: 'passed', minimumPower, actualPower, reason: 'no_power_restriction' };
  }
  if (actualPower === null) {
    return { status: 'unknown', minimumPower, actualPower, reason: power == null ? 'power_unavailable' : 'invalid_power' };
  }
  const passed = actualPower >= minimumPower;
  return { status: passed ? 'passed' : 'failed', minimumPower, actualPower, reason: passed ? 'meets_minimum' : 'below_minimum' };
}

/** 未取得は null や数値0へ置き換えない。available の null は確認済みの不在を表す。 */
export type RaidObserved<T> = { readonly status: 'unknown' }
  | { readonly status: 'available'; readonly value: T };

/** reasons はサーバーの機械識別子。未知の識別子でも ineligible を変更しない。 */
export type RaidServerEligibility = { readonly status: 'unknown' }
  | { readonly status: 'eligible'; readonly evaluatedAt: string }
  | { readonly status: 'ineligible'; readonly evaluatedAt: string; readonly reasons: readonly string[] };

export interface RaidPlayerSummary {
  readonly userId: string;
  readonly name: string;
  readonly leaderIconUrl: RaidObserved<string | null>;
}

export interface RaidGuildSummary {
  readonly guildId: string;
  readonly name: string;
}

/** 既存状態との接続用。新状態遷移や終了条件をこのDTOでは決定しない。 */
export type RaidRoomState = 'active' | 'cleared' | 'expired';

export interface RaidRoomDto {
  readonly roomId: string;
  readonly difficultyId: RaidDifficultyId;
  readonly owner: RaidObserved<RaidPlayerSummary>;
  readonly state: RaidObserved<RaidRoomState>;
  readonly createdAt: RaidObserved<string>;
  readonly expiresAt: RaidObserved<string>;
  readonly endedAt: RaidObserved<string | null>;
  readonly hp: RaidObserved<{ readonly current: number; readonly max: number }>;
  readonly participantCount: RaidObserved<number>;
  readonly serverEligibility: RaidServerEligibility;
}

export interface RaidParticipantDto {
  readonly roomId: string;
  readonly player: RaidPlayerSummary;
  readonly currentGuild: RaidObserved<RaidGuildSummary | null>;
  readonly battleGuildSnapshot: RaidObserved<RaidGuildSummary | null>;
  readonly finalizedBattles: RaidObserved<number>;
  readonly rawDamage: RaidObserved<number>;
  readonly appliedDamage: RaidObserved<number>;
}

export interface RaidRescueDto {
  readonly rescueId: string;
  readonly roomId: string;
  readonly requester: RaidObserved<RaidPlayerSummary>;
  readonly source: RaidObserved<'activity' | 'guild_chat'>;
  readonly requestedAt: RaidObserved<string>;
  readonly navigation: RaidObserved<{ readonly canOpen: boolean; readonly reason: string | null }>;
}

/** 成功判定の候補数値をクライアント側の報酬資格計算に使用しない。 */
export interface RaidResultDto {
  readonly roomId: string;
  readonly replayId: RaidObserved<string | null>;
  readonly state: RaidObserved<RaidRoomState>;
  readonly rawDamage: RaidObserved<number>;
  readonly appliedDamage: RaidObserved<number>;
  readonly remainingBossHp: RaidObserved<number>;
  readonly rescueSucceeded: RaidObserved<boolean>;
  readonly rewardEligibility: RaidServerEligibility;
  readonly rewards: RaidObserved<readonly RaidRewardDto[]>;
}

export interface RaidRewardDto {
  readonly itemId: string;
  readonly quantity: number;
  readonly deliveryState: RaidObserved<'pending' | 'delivered'>;
  readonly presentId: RaidObserved<string | null>;
}

import type { RaidRoomDto } from './raidRoom';

export interface RaidRoomLifecyclePresentation {
  readonly stateLabel: string;
  readonly remainingLabel: string;
  /** 表示上の抑止だけを担当する。falseでも参加許可はサーバー判定が必要。 */
  readonly blockJoin: boolean;
  readonly joinBlockLabel: string | null;
}

/** now=nullはSSRと初回描画共通。端末時刻からDTOや討伐結果を変更しない。 */
export function getRaidRoomLifecyclePresentation(room: RaidRoomDto, now: number | null): RaidRoomLifecyclePresentation {
  const blocked = (stateLabel: string, remainingLabel: string, joinBlockLabel: string): RaidRoomLifecyclePresentation =>
    ({ stateLabel, remainingLabel, blockJoin: true, joinBlockLabel });
  if (room.state.status !== 'available') {
    return blocked('状態未確認', '残り時間 未確認', 'Roomの状態を確認できません');
  }
  if (room.state.value === 'cleared') return blocked('討伐済み', '討伐済み', 'このRoomは終了しました');
  if (room.state.value === 'expired') return blocked('終了', '開催終了', 'このRoomは終了しました');
  if (room.hp.status === 'available' && room.hp.value.current <= 0) {
    return blocked('終了状態の確認が必要', 'HPがなくなりました。更新してください。', 'Roomを更新してください');
  }
  const expiry = room.expiresAt.status === 'available' ? Date.parse(room.expiresAt.value) : NaN;
  if (!Number.isFinite(expiry)) return blocked('状態未確認', '残り時間 未確認', 'Roomの期限を確認できません');
  if (now === null || !Number.isFinite(now)) return blocked('開催中', '残り時間 未確認', 'Roomの期限を確認できません');
  const remaining = expiry - now;
  if (remaining <= 0) {
    return blocked('終了状態の確認が必要', '期限を過ぎました。更新してください。', 'Roomを更新してください');
  }
  const minutes = Math.ceil(remaining / 60000);
  const hours = Math.floor(minutes / 60);
  return {
    stateLabel: '開催中',
    remainingLabel: hours > 0 ? `残り ${hours}時間${minutes % 60}分` : `残り ${minutes}分`,
    blockJoin: false, joinBlockLabel: null,
  };
}

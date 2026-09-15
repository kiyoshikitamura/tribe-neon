import type { RaidRoomBriefing } from './raidRoomClient';

type Gate = RaidRoomBriefing['joinEligibility'];
const power = (value: number | null) => value !== null && Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('ja-JP') : '未確認';

/** 表示だけを行う。数値の大小や理由からサーバー判定を上書きしない。 */
export function getRaidJoinRequirementMessage(gate: Gate): string | null {
  if (gate.status === 'passed') return null;
  if (gate.status === 'unknown') return '参加条件を確認できません。レイドを更新してください。';
  switch (gate.reason) {
    case 'level_requirement': return '参戦にはプレイヤーLv5以上が必要です。';
    case 'below_minimum': return `総合力が参加条件に届いていません。必要総合力：${power(gate.minimumPower)}${gate.minimumPower !== null && gate.minimumPower >= 0 ? '以上' : ''}／現在の総合力：${power(gate.actualPower)}`;
    case 'room_full': return '参加人数が上限に達しています。別のレイドを選んでください。';
    case 'room_ended': return 'このレイドの参加受付は終了しています。';
    case 'power_unavailable':
    case 'invalid_power': return '現在の総合力を確認できません。編成を確認してレイドを更新してください。';
    default: return '参加できません。条件の詳細を確認できないため、レイドを更新してください。';
  }
}

/** 既知の拒否だけを伝搬し、任意のサーバーメッセージを製品表示しない。 */
export class RaidRoomRequirementError extends Error {
  readonly displayMessage: string;
  constructor(displayMessage: string) { super('Raid requirement rejected'); this.name = 'RaidRoomRequirementError'; this.displayMessage = displayMessage; }
}

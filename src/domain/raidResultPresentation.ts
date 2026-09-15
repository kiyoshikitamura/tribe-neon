import type { RaidObserved, RaidRoomState } from './raidRoom';
export interface RaidResultReceipt { roomId: string; roomState: RaidObserved<RaidRoomState>; lateFinalization?: boolean }
/** Shared raid outcome is the headline; personal replay victory remains a detail. */
export function raidResultHeadline(receipt: RaidResultReceipt | undefined, roomId: string): string {
  if (receipt?.roomId !== roomId || receipt.roomState.status !== 'available') return '戦闘終了';
  return receipt.roomState.value === 'cleared' ? '討伐成功'
    : receipt.roomState.value === 'expired' ? '開催終了' : '戦闘終了';
}
/** Snapshot of the finalized receipt, never inferred from personal victory or HP. */
export function projectRaidResultReceipt(value: unknown): RaidResultReceipt | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const receipt = value as Record<string, unknown>;
  if (typeof receipt.roomId !== 'string' || !receipt.roomId.trim()) return undefined;
  const state = receipt.roomOutcome === 'DEFEAT_SUCCESS' ? 'cleared'
    : receipt.roomOutcome === 'TIMEOUT_FAILURE' ? 'expired'
    : receipt.roomOutcome === null && receipt.lateFinalization === false ? 'active' : null;
  return { roomId: receipt.roomId, roomState: state ? { status: 'available', value: state } : { status: 'unknown' },
    lateFinalization: typeof receipt.lateFinalization === 'boolean' ? receipt.lateFinalization : undefined };
}

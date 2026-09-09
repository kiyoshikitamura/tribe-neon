import { CANONICAL_RAID_PRODUCTION } from '../gameplay/canonical/combat_production';
import { getCanonicalBattleAreaName, getCanonicalBattleBackground } from '../../utils/game_constants';

/** A neutral, local presentation surface. Never imply a city when its saved identity is unknown. */
export const RAID_REPLAY_NEUTRAL_BACKGROUND = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22%3E%3Cpath fill=%22%2310141c%22 d=%22M0 0h1v1H0z%22/%3E%3C/svg%3E';
export interface RaidReplayBackground { backgroundPath: string; backgroundLabel: string }
const unavailable = (): RaidReplayBackground => ({ backgroundPath: RAID_REPLAY_NEUTRAL_BACKGROUND, backgroundLabel: '戦闘エリア未取得' });
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Only saved battle context is accepted; current Room choices/briefing/visual overrides are not fallbacks. */
export function resolveRaidReplayBackground(officialContext: unknown, roomId: string): RaidReplayBackground {
  const context = record(officialContext);
  if (!context || context.roomId !== roomId) return unavailable();
  if (context.raidVariantId != null && typeof context.raidVariantId !== 'string') return unavailable();
  const variant = CANONICAL_RAID_PRODUCTION.variants.find(entry => entry.raidVariantId === context.raidVariantId);
  // A present but unknown variant must not silently select an unrelated saved/current base.
  const areaId = typeof context.raidVariantId === 'string' ? variant?.areaId
    : typeof context.baseId === 'string' ? context.baseId : undefined;
  const backgroundPath = getCanonicalBattleBackground(areaId);
  const backgroundLabel = getCanonicalBattleAreaName(areaId);
  return backgroundPath && backgroundLabel ? { backgroundPath, backgroundLabel } : unavailable();
}

export type ReadRaidReplayBackground = (replayId: string, userId: string) => PromiseLike<{ data: unknown; error: unknown }>;

/** Display-only read failure cannot invalidate a committed Replay or block Result/ack/return. */
export async function loadRaidReplayBackground(readReplay: ReadRaidReplayBackground, identity: { replayId: string; roomId: string; userId: string; sourceReferenceId: string }, receipt?: unknown, resolvedResult?: unknown): Promise<RaidReplayBackground> {
  const saved = record(receipt);
  if (saved?.replay_session_id === identity.replayId && saved.room_id === identity.roomId && 'official_context' in saved) {
    return resolveRaidReplayBackground(saved.official_context, identity.roomId);
  }
  const resultContext = record(resolvedResult);
  if (resultContext?.mode === 'RAID' && resultContext.roomId === identity.roomId
    && resultContext.raidInstanceId === identity.sourceReferenceId
    && ('raidVariantId' in resultContext || 'baseId' in resultContext)) {
    return resolveRaidReplayBackground(resultContext, identity.roomId);
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = readReplay(identity.replayId, identity.userId);
    const result = await Promise.race([read, new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), 1500); })]);
    if (!result) return unavailable();
    const row = record(result.data);
    if (result.error || !row || row.id !== identity.replayId || row.battle_mode !== 'RAID' || row.source_reference_id !== identity.sourceReferenceId) return unavailable();
    return resolveRaidReplayBackground(row.official_context, identity.roomId);
  } catch { return unavailable(); } finally { if (timeout !== undefined) clearTimeout(timeout); }
}

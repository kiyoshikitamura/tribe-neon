/** 保存するのは再送先と固定入力のみ。Snapshot・結果は常にサーバーから読む。 */
export interface RaidRoomBattlePayload {
  p_room_id: string;
  p_character_ids: string[];
  p_tactic: string;
  p_request_id: string;
}
export interface RaidRoomPendingRecord { version: 1; userId: string; payload: RaidRoomBattlePayload }
export type RaidRoomPendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const raidRoomPendingKey = (userId: string) => `tribe:raid-room:pending:v1:${encodeURIComponent(userId)}`;
const failure = () => new Error('出撃の保存情報を確認できませんでした。保存設定を確認して、もう一度お試しください。');
function browserStorage(): RaidRoomPendingStorage {
  if (typeof window === 'undefined') throw failure();
  return window.localStorage;
}
export function readRaidRoomPending(userId: string, storage: RaidRoomPendingStorage = browserStorage()): RaidRoomPendingRecord | null {
  const raw = storage.getItem(raidRoomPendingKey(userId));
  if (raw === null) return null;
  let value: any;
  try { value = JSON.parse(raw); } catch { throw failure(); }
  const p = value?.payload;
  if (value?.version !== 1 || value.userId !== userId || !p
    || typeof p.p_room_id !== 'string' || !p.p_room_id
    || typeof p.p_request_id !== 'string' || !p.p_request_id
    || typeof p.p_tactic !== 'string' || !p.p_tactic
    || !Array.isArray(p.p_character_ids) || p.p_character_ids.length < 1 || p.p_character_ids.length > 5
    || p.p_character_ids.some((id: unknown) => typeof id !== 'string' || !id)
    || new Set(p.p_character_ids).size !== p.p_character_ids.length) throw failure();
  return { version: 1, userId, payload: { p_room_id: p.p_room_id, p_request_id: p.p_request_id,
    p_character_ids: [...p.p_character_ids], p_tactic: p.p_tactic } };
}
export function saveRaidRoomPending(userId: string, payload: RaidRoomBattlePayload, storage: RaidRoomPendingStorage = browserStorage()): void {
  const record: RaidRoomPendingRecord = { version: 1, userId, payload };
  const existing = readRaidRoomPending(userId, storage);
  if (existing && (existing.payload.p_request_id !== payload.p_request_id || existing.payload.p_room_id !== payload.p_room_id || existing.payload.p_tactic !== payload.p_tactic || JSON.stringify(existing.payload.p_character_ids) !== JSON.stringify(payload.p_character_ids))) throw new Error('未確定のレイド出撃があります。先に再開してください。');
  const serialized = JSON.stringify(record);
  storage.setItem(raidRoomPendingKey(userId), serialized);
  if (storage.getItem(raidRoomPendingKey(userId)) !== serialized) throw failure();
}
export function clearRaidRoomPending(userId: string, requestId: string, storage: RaidRoomPendingStorage = browserStorage()): void {
  const existing = readRaidRoomPending(userId, storage);
  if (existing?.payload.p_request_id === requestId) storage.removeItem(raidRoomPendingKey(userId));
}

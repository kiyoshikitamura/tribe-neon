/** 再送用の識別子だけを保存する。送信結果の正本はサーバーのreceipt。 */
export interface RaidRoomRescuePendingRecord { version: 1; userId: string; roomId: string; requestId: string }
export type RaidRoomRescuePendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const raidRoomRescuePendingKey = (userId: string, roomId: string) => `tribe:raid-room:rescue-pending:v1:${encodeURIComponent(userId)}:${encodeURIComponent(roomId)}`;
const failure = () => new Error('救援依頼の保存情報を確認できませんでした。保存設定を確認して、もう一度お試しください。');
function browserStorage(): RaidRoomRescuePendingStorage {
  if (typeof window === 'undefined') throw failure();
  return window.localStorage;
}
export function readRaidRoomRescuePending(userId: string, roomId: string, storage: RaidRoomRescuePendingStorage = browserStorage()): RaidRoomRescuePendingRecord | null {
  if (!userId || !roomId) throw failure();
  const raw = storage.getItem(raidRoomRescuePendingKey(userId, roomId));
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw failure(); }
  const record = value as Partial<RaidRoomRescuePendingRecord> | null;
  if (!record || record.version !== 1 || record.userId !== userId || record.roomId !== roomId || typeof record.requestId !== 'string' || !record.requestId.trim()) throw failure();
  return { version: 1, userId, roomId, requestId: record.requestId };
}
export function saveRaidRoomRescuePending(userId: string, roomId: string, requestId: string, storage: RaidRoomRescuePendingStorage = browserStorage()): void {
  if (!requestId.trim()) throw failure();
  const existing = readRaidRoomRescuePending(userId, roomId, storage);
  if (existing && existing.requestId !== requestId) throw failure();
  const serialized = JSON.stringify({ version: 1, userId, roomId, requestId });
  storage.setItem(raidRoomRescuePendingKey(userId, roomId), serialized);
  if (storage.getItem(raidRoomRescuePendingKey(userId, roomId)) !== serialized) throw failure();
}
export function clearRaidRoomRescuePending(userId: string, roomId: string, requestId: string, storage: RaidRoomRescuePendingStorage = browserStorage()): void {
  const existing = readRaidRoomRescuePending(userId, roomId, storage);
  if (!existing) return;
  if (existing.requestId !== requestId) throw failure();
  storage.removeItem(raidRoomRescuePendingKey(userId, roomId));
  if (storage.getItem(raidRoomRescuePendingKey(userId, roomId)) !== null) throw failure();
}

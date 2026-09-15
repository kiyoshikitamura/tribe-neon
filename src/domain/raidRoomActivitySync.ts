import type { RaidRoomDto } from './raidRoom';
import type { RaidRoomTransport } from './raidRoomClient';

export interface RaidRoomActivityTracker {
  getSnapshot(): number;
  subscribe(listener: () => void): () => void;
  observeTransport(transport: RaidRoomTransport): RaidRoomTransport;
}

/** 開催通知用の参照結果。戦闘・参加・報酬の正本には使用しない。 */
export function createRaidRoomActivityTracker(isCurrent = () => true, now = () => Date.now()): RaidRoomActivityTracker {
  let sequence = 0;
  let listRevision = 0;
  let activeUntil = 0;
  const rooms = new Map<string, { revision: number; room: RaidRoomDto }>();
  const listeners = new Set<() => void>();
  const publish = () => {
    const currentTime = now();
    let next = 0;
    rooms.forEach(({ room }) => {
      if (room.state.status !== 'available' || room.state.value !== 'active'
        || room.hp.status !== 'available' || room.hp.value.current <= 0
        || room.expiresAt.status !== 'available') return;
      const expiry = Date.parse(room.expiresAt.value);
      if (Number.isFinite(expiry) && expiry > currentTime) next = Math.max(next, expiry);
    });
    if (next !== activeUntil) { activeUntil = next; listeners.forEach(listener => listener()); }
  };
  const acceptRoom = (room: RaidRoomDto, revision: number) => {
    if (!isCurrent() || revision < listRevision || revision < (rooms.get(room.roomId)?.revision ?? 0)) return;
    rooms.set(room.roomId, { revision, room });
    publish();
  };
  return {
    getSnapshot: () => activeUntil,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    observeTransport(transport) {
      return {
        ...transport,
        async listRooms() {
          const revision = ++sequence;
          const result = await transport.listRooms();
          if (isCurrent() && revision >= listRevision) {
            listRevision = revision;
            // 後から開始した詳細/作成の結果は、古い一覧に載っていなくても維持する。
            rooms.forEach((entry, id) => { if (entry.revision <= revision) rooms.delete(id); });
            result.forEach(room => {
              if ((rooms.get(room.roomId)?.revision ?? 0) <= revision) rooms.set(room.roomId, { revision, room });
            });
            publish();
          }
          return result;
        },
        async getRoom(roomId) {
          const revision = ++sequence;
          const room = await transport.getRoom(roomId);
          if (room.roomId === roomId) acceptRoom(room, revision);
          return room;
        },
        ...(transport.createRoom ? { async createRoom(request: Parameters<NonNullable<RaidRoomTransport['createRoom']>>[0]) {
          const revision = ++sequence;
          const room = await transport.createRoom!(request);
          if (isCurrent() && room.difficultyId === request.difficultyId
            && (rooms.get(room.roomId)?.revision ?? 0) <= revision) {
            // 作成の確定前に走った一覧には新Roomが載らない。完了時の順序で保護する。
            // 一方、同じRoomの新しい詳細を既に読んでいれば作成receiptで巻き戻さない。
            rooms.set(room.roomId, { revision: ++sequence, room });
            publish();
          }
          return room;
        } } : {}),
      };
    },
  };
}

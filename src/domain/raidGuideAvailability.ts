import type { RaidRoomDto } from './raidRoom';
import type { RaidRoomRpcClient } from './raidRoomRpcTransport';

export type RaidGuideAvailability = 'active' | 'inactive' | 'unknown';

/** 一覧の取得失敗・不完全なFactを「未開催」に変換しない。 */
export async function loadRaidGuideAvailability(input: {
  roomEnabled: boolean;
  client: RaidRoomRpcClient;
  listRooms: () => Promise<readonly RaidRoomDto[]>;
  now?: number;
}): Promise<RaidGuideAvailability> {
  try {
    if (!input.roomEnabled) {
      // Raid画面と同じ公開対象。Roomモードから旧RPCへfallbackしない。
      const { data, error } = await input.client.rpc('get_active_raids');
      if (error || !Array.isArray(data)) return 'unknown';
      if (data.length === 0) return 'inactive';
      const complete = data.every(row => row && typeof row.id === 'string' && row.status === 'ACTIVE'
        && typeof row.currentHp === 'number' && Number.isFinite(row.currentHp) && typeof row.expiresAt === 'string'
        && Number.isFinite(Date.parse(row.expiresAt)));
      if (!complete) return 'unknown';
      const now = input.now ?? Date.now();
      // Raid画面もHP 0/期限切れでは出撃不可。返却後の期限越えを開催中と扱わない。
      return data.some(row => row.currentHp > 0 && Date.parse(row.expiresAt) > now) ? 'active' : 'inactive';
    }
    const rooms = await input.listRooms();
    const now = input.now ?? Date.now();
    let incomplete = false;
    for (const room of rooms) {
      if (room.state.status !== 'available') { incomplete = true; continue; }
      if (room.state.value !== 'active') continue;
      if (room.hp.status !== 'available' || room.expiresAt.status !== 'available'
        || !Number.isFinite(Date.parse(room.expiresAt.value))) { incomplete = true; continue; }
      if (room.hp.value.current > 0 && Date.parse(room.expiresAt.value) > now) return 'active';
    }
    return incomplete ? 'unknown' : 'inactive';
  } catch { return 'unknown'; }
}

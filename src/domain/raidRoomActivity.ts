import { createRaidRoomRpcTransport, type RaidRoomRpcClient } from './raidRoomRpcTransport.ts';

/** Roomモードでは副作用を持つ旧一覧RPCへフォールバックしない。 */
export async function loadRaidActivity(client: RaidRoomRpcClient, roomEnabled: boolean, now = Date.now()) {
  if (!roomEnabled) {
    const result = await client.rpc('get_active_raids');
    return { mode: 'legacy' as const, ...result };
  }
  const rooms = await createRaidRoomRpcTransport(client).listRooms();
  const activeUntil = rooms.reduce((latest, room) => {
    if (room.state.status !== 'available' || room.state.value !== 'active'
      || room.hp.status !== 'available' || room.hp.value.current <= 0
      || room.expiresAt.status !== 'available') return latest;
    const expiry = Date.parse(room.expiresAt.value);
    return expiry > now ? Math.max(latest, expiry) : latest;
  }, 0);
  return { mode: 'room' as const, activeUntil };
}

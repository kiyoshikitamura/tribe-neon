import type { RaidRoomRpcClient } from './raidRoomRpcTransport';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid rescue response');
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid rescue ID');
  return value;
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid rescue count');
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid rescue flag');
  return value;
}
export interface RaidRoomRescueStatus {
  roomId: string; isOwner: boolean; requestEnabled: boolean; activityCount: number; guildCount: number;
  maxPerChannel: 3; viaRescue: boolean; finalizedBattles: number; contributionDamage: number;
}
export function createRaidRoomRescueClient(client: RaidRoomRpcClient) {
  async function rpc(name: string, args: Record<string, unknown>) {
    const response = await client.rpc(name, args);
    if (response.error != null) throw new Error('救援情報を確認できませんでした。');
    return record(response.data);
  }
  function counts(result: Record<string, unknown>) {
    const activityCount = count(result.activityCount), guildCount = count(result.guildCount);
    if (activityCount > 3 || guildCount > 3 || result.maxPerChannel !== 3) throw new Error('Invalid rescue limit');
    return { activityCount, guildCount, maxPerChannel: 3 as const };
  }
  return {
    async getStatus(roomId: string): Promise<RaidRoomRescueStatus> {
      const r = await rpc('get_raid_room_rescue_status_v1', { p_room_id: id(roomId) });
      if (r.roomId !== roomId) throw new Error('Invalid rescue room');
      return { roomId, ...counts(r), isOwner: bool(r.isOwner), requestEnabled: bool(r.requestEnabled), viaRescue: bool(r.viaRescue), finalizedBattles: count(r.finalizedBattles), contributionDamage: count(r.contributionDamage) };
    },
    async request(roomId: string, requestId: string) {
      const r = await rpc('request_raid_room_rescue_v1', { p_room_id: id(roomId), p_request_id: id(requestId) });
      if (r.roomId !== roomId || r.requestId !== requestId || !Array.isArray(r.publications)) throw new Error('Invalid rescue receipt');
      const publications = r.publications.map(value => {
        const p = record(value);
        if (p.channel !== 'ACTIVITY' && p.channel !== 'GUILD') throw new Error('Invalid rescue channel');
        return { rescueId: id(p.rescueId), channel: p.channel, guildId: p.guildId === null ? null : id(p.guildId) };
      });
      return { roomId, requestId, publications, ...counts(r) };
    },
    async getLink(rescueId: string) {
      const r = await rpc('get_raid_room_rescue_v1', { p_rescue_id: id(rescueId) });
      if (r.rescueId !== rescueId) throw new Error('Invalid rescue link');
      return { rescueId, roomId: id(r.roomId) };
    },
    async join(rescueId: string) {
      const r = await rpc('join_raid_room_rescue_v1', { p_rescue_id: id(rescueId) });
      if (r.membershipStatus !== 'joined' && r.membershipStatus !== 'already_joined') throw new Error('Invalid rescue membership');
      return { roomId: id(r.roomId), membershipStatus: r.membershipStatus as 'joined' | 'already_joined', viaRescue: bool(r.viaRescue) };
    },
  };
}
export type RaidRoomRescueClient = ReturnType<typeof createRaidRoomRescueClient>;
/** 表示用リンクのみ。権限・参加資格はRPCで再確認する。 */
export function getRaidRescueActivityId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as Record<string, unknown>;
  if (event.activity_type !== 'RAID_HELP_REQUEST') return null;
  const payload = event.display_payload;
  if (!payload || typeof payload !== 'object') return null;
  const rescueId = (payload as Record<string, unknown>).rescueId;
  return typeof rescueId === 'string' && rescueId.trim() ? rescueId : null;
}

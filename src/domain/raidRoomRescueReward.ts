import type { RaidRoomRpcClient } from './raidRoomRpcTransport';

export interface RaidRoomRescueReward {
  roomId: string;
  status: 'not_eligible' | 'unconfigured' | 'pending' | 'issued';
  rescueGate: { status: 'unknown' | 'not_succeeded' | 'succeeded'; minimumBattles: number | null; minimumContributionDamage: number | null };
  issuedAt: string | null;
  expiresAt: string | null;
  items: { itemId: string; quantity: number; presentId: string; presentStatus: string | null; claimedAt: string | null; expiresAt: string | null }[];
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid rescue reward');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid rescue reward text');
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid rescue reward count');
  return value;
}
function date(value: unknown): string | null {
  if (value === null) return null;
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error('Invalid rescue reward date');
  return result;
}
export function createRaidRoomRescueRewardClient(client: RaidRoomRpcClient) {
  return {
    async getReward(roomId: string): Promise<RaidRoomRescueReward> {
      const response = await client.rpc('get_raid_room_rescue_reward_v1', { p_room_id: text(roomId) });
      if (response.error != null) throw new Error('救援報酬を確認できませんでした。');
      const r = object(response.data), gate = object(r.rescueGate);
      if (r.roomId !== roomId || !['not_eligible', 'unconfigured', 'pending', 'issued'].includes(String(r.status)) || !['unknown', 'not_succeeded', 'succeeded'].includes(String(gate.status)) || !Array.isArray(r.items)) throw new Error('Invalid rescue reward response');
      const items = r.items.map(value => {
        const item = object(value), quantity = number(item.quantity);
        if (quantity < 1) throw new Error('Invalid rescue reward quantity');
        return { itemId: text(item.itemId), quantity, presentId: text(item.presentId), presentStatus: item.presentStatus === null ? null : text(item.presentStatus), claimedAt: date(item.claimedAt), expiresAt: date(item.expiresAt) };
      });
      const issuedAt = date(r.issuedAt), expiresAt = date(r.expiresAt);
      if (r.status === 'issued' && (!issuedAt || !expiresAt || items.length === 0)) throw new Error('Incomplete rescue reward receipt');
      if (r.status !== 'issued' && items.length !== 0) throw new Error('Unexpected rescue reward receipt');
      return { roomId, status: r.status as RaidRoomRescueReward['status'], issuedAt, expiresAt, items,
        rescueGate: { status: gate.status as RaidRoomRescueReward['rescueGate']['status'], minimumBattles: gate.minimumBattles === null ? null : number(gate.minimumBattles), minimumContributionDamage: gate.minimumContributionDamage === null ? null : number(gate.minimumContributionDamage) } };
    },
  };
}
export type RaidRoomRescueRewardClient = ReturnType<typeof createRaidRoomRescueRewardClient>;

import type { RaidRoomRpcClient } from './raidRoomRpcTransport';
import type { RaidRoomDisplay, RaidRewardPlan } from './raidRoomDisplay';
import type { RaidPlayerSummary } from './raidRoom';
import { CHARACTERS_MASTER, getCharacterTransparentImg } from '@/utils/game_constants';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid raid display');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid raid display text');
  return value;
}
function plan(value: unknown): RaidRewardPlan {
  const row = object(value);
  if (!['configured', 'unconfigured'].includes(String(row.status)) || !Array.isArray(row.items)) throw new Error('Invalid reward plan');
  const items = row.items.map(value => {
    const item = object(value);
    if (!Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || 'presentId' in item) throw new Error('Invalid planned item');
    return { itemId: text(item.itemId), quantity: Number(item.quantity) };
  });
  if ((row.status === 'unconfigured' && items.length) || (row.status === 'configured' && items.length === 0)) throw new Error('Unconfigured reward plan');
  return { status: row.status as RaidRewardPlan['status'], items };
}
export async function getRaidRoomDisplay(client: RaidRoomRpcClient, roomId: string): Promise<RaidRoomDisplay> {
  const { data, error } = await client.rpc('get_raid_room_display_v1', { p_room_id: roomId });
  if (error) throw new Error('Raid display request failed');
  const row = object(data), guild = object(row.ownerGuild), leaders = object(row.leaderCharacterIds);
  if (row.roomId !== roomId || !['owner', 'member', 'rescue', 'not_joined'].includes(String(row.membership))) throw new Error('Invalid raid display identity');
  const leaderCharacterIds = Object.fromEntries(Object.entries(leaders).map(([id, value]) => [text(id), value === null ? null : text(value)]));
  if (Object.keys(leaders).length > 21) throw new Error('Too many leader identities');
  if (guild.status !== 'available' && guild.status !== 'unknown') throw new Error('Invalid raid guild');
  return { roomId, membership: row.membership as RaidRoomDisplay['membership'], leaderCharacterIds,
    ownerGuild: guild.status === 'unknown' ? { status: 'unknown' } : { status: 'available', value: guild.value === null ? null : { guildId: text(object(guild.value).guildId), name: text(object(guild.value).name) } },
    clearPlan: plan(row.clearPlan), rescuePlan: plan(row.rescuePlan) };
}
export function withRaidLeader(player: RaidPlayerSummary, display?: RaidRoomDisplay | null): RaidPlayerSummary {
  if (!display || !Object.prototype.hasOwnProperty.call(display.leaderCharacterIds, player.userId)) return player;
  const id = display.leaderCharacterIds[player.userId];
  const master = CHARACTERS_MASTER.find(character => character.id === id);
  return { ...player, leaderIconUrl: id === null ? { status: 'available', value: null } : master ? { status: 'available', value: getCharacterTransparentImg(master.name) } : { status: 'unknown' } };
}

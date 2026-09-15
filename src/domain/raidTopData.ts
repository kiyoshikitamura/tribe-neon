import type { RaidDailyTargets, RaidTopData } from './raidTop';
import { resolveRaidTopEnemy } from './raidTopAssets';

/** 認証済み・上限付き一括投影の注入境界。ローカルMockも同じparserを通す。 */
export type RaidTopLoader = () => Promise<Omit<RaidTopData, 'canCreate'>>;

export function unavailableRaidTopData(canCreate: boolean): RaidTopData {
  return { participating: { status: 'unavailable' }, rescues: { status: 'unavailable' }, dailyTargets: { status: 'unavailable' }, canCreate };
}

/** 正本の2エリアのみ解決。ローカルの時計/乱数/旧ローテーションを使わない。 */
export function resolveRaidDailyTargets(value: { readonly dateJst: string; readonly variantIds: readonly string[] }): RaidDailyTargets | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.dateJst) || value.variantIds.length !== 2) return null;
  const date = new Date(`${value.dateJst}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.dateJst) return null;
  const first = resolveRaidTopEnemy(value.variantIds[0]);
  const second = resolveRaidTopEnemy(value.variantIds[1]);
  if (!first || !second || first.baseId === second.baseId) return null;
  return { dateJst: value.dateJst, targets: [first, second] };
}

import { createRaidRoomRpcTransport } from './raidRoomRpcTransport';
import type { RaidObserved, RaidPlayerSummary, RaidGuildSummary } from './raidRoom';
import { CHARACTERS_MASTER, getCharacterTransparentImg } from '@/utils/game_constants';
import type { RaidTopEntry, RaidTopResource } from './raidTop';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid raid top response');
  return value as Record<string, unknown>;
}
function nonempty(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid raid top response');
  return value;
}
function observed<T>(value: unknown, parse: (value: unknown) => T): RaidObserved<T> {
  const item = record(value);
  if (item.status === 'unknown') return { status: 'unknown' };
  if (item.status !== 'available') throw new Error('Invalid raid top observation');
  return { status: 'available', value: parse(item.value) };
}
function leaderIcon(item: Record<string, unknown>): unknown {
  if (!('leaderCharacterId' in item)) return item.leaderIconUrl;
  const leader = observed(item.leaderCharacterId, (id) => id === null ? null : nonempty(id));
  if (leader.status === 'unknown') return leader;
  if (leader.value === null) return { status: 'available', value: null };
  const character = CHARACTERS_MASTER.find((entry) => entry.id === leader.value);
  return character ? { status: 'available', value: getCharacterTransparentImg(character.name) } : { status: 'unknown' };
}
function player(value: unknown): RaidPlayerSummary {
  const item = record(value);
  return { userId: nonempty(item.userId), name: nonempty(item.name), leaderIconUrl: observed(leaderIcon(item), (url) => {
    if (url === null) return null;
    const path = nonempty(url);
    if (!/^\/(?!\/)/.test(path) && !/^https:\/\//.test(path)) throw new Error('Invalid raid top image');
    return path;
  }) };
}

async function entry(value: unknown): Promise<RaidTopEntry> {
  const item = record(value);
  const sourceRoom = record(item.room);
  const rawRoom = { ...sourceRoom, owner: observed(sourceRoom.owner, player) };
  // 既存DTO parserを再利用するメモリ内transport。ネットワーク要求は発生しない。
  const room = await createRaidRoomRpcTransport({ rpc: async () => ({ data: rawRoom, error: null }) }).getRoom(nonempty(sourceRoom.roomId));
  return {
    room,
    enemy: observed(item.enemy, (value) => {
      const enemy = resolveRaidTopEnemy(nonempty(record(value).variantId));
      if (!enemy) throw new Error('Unknown raid top variant');
      return enemy;
    }),
    ownerGuild: observed<RaidGuildSummary | null>(item.ownerGuild, (value) => value === null ? null : { guildId: nonempty(record(value).guildId), name: nonempty(record(value).name) }),
    participants: observed(item.participants, (value) => {
      if (!Array.isArray(value) || value.length > 5) throw new Error('Invalid raid top participants');
      const players = value.map(player);
      if (new Set(players.map((p) => p.userId)).size !== players.length) throw new Error('Duplicate raid top participants');
      return players;
    }),
    membership: observed(item.membership, (value) => {
      if (value !== 'owner' && value !== 'member' && value !== 'rescue' && value !== 'not_joined') throw new Error('Invalid raid top membership');
      return value;
    }),
    rescue: observed(item.rescue, (value) => {
      const rescue = record(value);
      if (rescue.source !== 'activity' && rescue.source !== 'guild_chat') throw new Error('Invalid raid top rescue source');
      const rescueId = nonempty(rescue.rescueId);
      if (!('scope' in rescue) && !('guildId' in rescue)) return { rescueId, source: rescue.source };
      if (rescue.source === 'activity' && rescue.scope === 'ACTIVITY' && rescue.guildId === null) {
        return { rescueId, source: rescue.source, scope: rescue.scope, guildId: null };
      }
      if (rescue.source === 'guild_chat' && rescue.scope === 'GUILD') {
        return { rescueId, source: rescue.source, scope: rescue.scope, guildId: nonempty(rescue.guildId) };
      }
      throw new Error('Invalid raid top rescue scope');
    }),
  };
}
async function resource<T>(value: unknown, parse: (value: unknown) => Promise<T>): Promise<RaidTopResource<T>> {
  const item = record(value);
  if (item.status === 'loading' || item.status === 'error' || item.status === 'unavailable') return { status: item.status };
  if (item.status !== 'ready') throw new Error('Invalid raid top resource');
  return { status: 'ready', data: await parse(item.data) };
}

/** Mock/将来の一括read共通境界。上限20、重複拒否、観測状態保持、素材は実マスターへ解決。 */
export async function parseRaidTopSnapshot(value: unknown): Promise<Omit<RaidTopData, 'canCreate'>> {
  const item = record(value);
  const entries = async (value: unknown) => {
    if (!Array.isArray(value) || value.length > 20) throw new Error('Invalid raid top page');
    const result = await Promise.all(value.map(entry));
    if (new Set(result.map((entry) => entry.room.roomId)).size !== result.length) throw new Error('Duplicate raid top rooms');
    return result;
  };
  const [participating, rescues, dailyTargets] = await Promise.all([
    resource(item.participating, entries),
    resource(item.rescues, entries),
    resource(item.dailyTargets, async (value) => {
      const daily = record(value);
      if (!Array.isArray(daily.targets)) throw new Error('Invalid raid daily targets');
      const targets = resolveRaidDailyTargets({ dateJst: nonempty(daily.dateJst), variantIds: daily.targets.map((target) => nonempty(record(target).variantId)) });
      if (!targets) throw new Error('Invalid raid daily targets');
      return targets;
    }),
  ]);
  return { participating, rescues, dailyTargets };
}

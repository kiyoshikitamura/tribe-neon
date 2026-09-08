import { createRaidRoomRescueClient } from './raidRoomRescue.ts';
import { RaidRoomStoppedError } from './raidRoomErrors.ts';
import type { RaidObserved, RaidParticipantDto, RaidPlayerSummary, RaidRewardDto, RaidRoomDto, RaidServerEligibility } from './raidRoom';
import { RAID_DIFFICULTIES } from './raidRoom.ts';
import type { RaidBattleReference, RaidRoomTransport, RaidRoomBriefing } from './raidRoomClient';

/** 認証済みクライアントを親から注入する。接続先・資格情報をこのadapterで生成しない。 */
export interface RaidRoomRpcClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/** 未接続の権利処理は後続のサーバーAuthorityからのみ注入する。 */
export interface RaidRoomRpcAuthorities {
  enableCreation?: boolean;
  enableParticipation?: boolean;
  enableRescue?: boolean;
  getRewards?: (roomId: string) => Promise<unknown>;
  joinRoom?: (request: { readonly roomId: string; readonly rescueId?: string }) => Promise<unknown>;
}

function invalid(): never { throw new Error('Invalid raid room response'); }
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) invalid();
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function isoTime(value: unknown): string {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) invalid();
  return result;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) invalid();
  return value as T;
}
function observed<T>(value: unknown, parse: (entry: unknown) => T): RaidObserved<T> {
  const entry = object(value);
  if (entry.status === 'unknown') return { status: 'unknown' };
  if (entry.status !== 'available') invalid();
  return { status: 'available', value: parse(entry.value) };
}
function nullable<T>(parse: (entry: unknown) => T): (entry: unknown) => T | null {
  return (entry) => entry === null ? null : parse(entry);
}
function array<T>(value: unknown, parse: (entry: unknown) => T): T[] {
  if (!Array.isArray(value)) invalid();
  return value.map(parse);
}
function icon(value: unknown): string {
  const result = text(value);
  if (!/^\/(?!\/)/.test(result) && !/^https:\/\//.test(result)) invalid();
  return result;
}
function player(value: unknown): RaidPlayerSummary {
  const entry = object(value);
  return { userId: text(entry.userId), name: text(entry.name), leaderIconUrl: observed(entry.leaderIconUrl, nullable(icon)) };
}
function guild(value: unknown) {
  const entry = object(value);
  return { guildId: text(entry.guildId), name: text(entry.name) };
}
function eligibility(value: unknown): RaidServerEligibility {
  const entry = object(value);
  if (entry.status === 'unknown') return { status: 'unknown' };
  const evaluatedAt = isoTime(entry.evaluatedAt);
  if (entry.status === 'eligible') {
    if ('reasons' in entry && (!Array.isArray(entry.reasons) || entry.reasons.length !== 0)) invalid();
    return { status: 'eligible', evaluatedAt };
  }
  if (entry.status !== 'ineligible') invalid();
  const reasons = array(entry.reasons, text);
  return { status: 'ineligible', evaluatedAt, reasons };
}
function room(value: unknown): RaidRoomDto {
  const entry = object(value);
  return {
    roomId: text(entry.roomId),
    difficultyId: choice(entry.difficultyId, RAID_DIFFICULTIES.map((difficulty) => difficulty.id)),
    owner: observed(entry.owner, player),
    state: observed(entry.state, (state) => choice(state, ['active', 'cleared', 'expired'] as const)),
    createdAt: observed(entry.createdAt, isoTime),
    expiresAt: observed(entry.expiresAt, isoTime),
    endedAt: observed(entry.endedAt, nullable(isoTime)),
    hp: observed(entry.hp, (value) => {
      const hp = object(value);
      const current = integer(hp.current);
      const max = integer(hp.max);
      if (max === 0 || current > max) invalid();
      return { current, max };
    }),
    participantCount: observed(entry.participantCount, (value) => {
      const count = integer(value);
      if (count > 20) invalid();
      return count;
    }),
    serverEligibility: eligibility(entry.serverEligibility),
  };
}
function participant(value: unknown): RaidParticipantDto {
  const entry = object(value);
  return {
    roomId: text(entry.roomId), player: player(entry.player),
    currentGuild: observed(entry.currentGuild, nullable(guild)),
    battleGuildSnapshot: observed(entry.battleGuildSnapshot, nullable(guild)),
    finalizedBattles: observed(entry.finalizedBattles, integer),
    rawDamage: observed(entry.rawDamage, integer), appliedDamage: observed(entry.appliedDamage, integer),
  };
}
function reward(value: unknown): RaidRewardDto {
  const entry = object(value);
  const quantity = integer(entry.quantity);
  if (quantity === 0) invalid();
  return {
    itemId: text(entry.itemId), quantity,
    deliveryState: observed(entry.deliveryState, (state) => choice(state, ['pending', 'delivered'] as const)),
    presentId: observed(entry.presentId, nullable(text)),
  };
}

export function createRaidRoomRpcTransport(client: RaidRoomRpcClient, authorities: RaidRoomRpcAuthorities = {}): RaidRoomTransport {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await client.rpc(name, args);
    if (!result || result.error != null) {
      const error = result?.error as { code?: string; message?: string } | undefined;
      if (name === 'create_raid_room_v1' && error?.code === '55000' && error.message === 'room creation disabled') throw new RaidRoomStoppedError();
      throw new Error('Raid room request failed');
    }
    return result.data;
  }
  async function pages<T>(name: string, args: Record<string, unknown>, key: string, parse: (value: unknown) => T, identity: (entry: T) => string): Promise<T[]> {
    const entries: T[] = [];
    const seen = new Set<string>();
    let offset = 0;
    // 破損したcursorで無限通信を起こさない。途中結果を成功として返さない。
    for (let page = 0; page < 1000; page++) {
      const response = object(await rpc(name, { ...args, p_limit: 20, p_offset: offset }));
      const batch = array(response[key], parse);
      for (const entry of batch) {
        const id = identity(entry);
        if (seen.has(id)) invalid();
        seen.add(id);
        entries.push(entry);
      }
      if (response.nextOffset === null) return entries;
      const next = integer(response.nextOffset);
      if (batch.length === 0 || next <= offset) invalid();
      offset = next;
    }
    throw new Error('Raid room pagination limit exceeded');
  }
  return {
    ...(authorities.enableRescue ? {
      async registerRescueParticipation(roomId: string, rescueId: string) {
        const receipt = await createRaidRoomRescueClient(client).join(rescueId);
        if (receipt.roomId !== roomId) invalid();
        return receipt;
      },
    } : {}),
    ...(authorities.enableParticipation ? {
      async registerParticipation(roomId: string) {
        const id = text(roomId);
        const result = object(await rpc('register_raid_room_v1', { p_room_id: id }));
        if (result.roomId !== id) invalid();
        return { roomId: id, membershipStatus: choice(result.membershipStatus, ['joined', 'already_joined'] as const) };
      },
      async getBriefing(roomId: string): Promise<RaidRoomBriefing> {
        const id = text(roomId);
        const result = object(await rpc('get_raid_room_briefing_v1', { p_room_id: id }));
        if (result.roomId !== id || typeof result.battleStartEnabled !== 'boolean') invalid();
        const gate = object(result.joinEligibility);
        return {
          roomId: id, raidBossInstanceId: text(result.raidBossInstanceId),
          raidVariantId: nullable(text)(result.raidVariantId), bossName: nullable(text)(result.bossName), baseId: nullable(text)(result.baseId),
          membershipStatus: choice(result.membershipStatus, ['joined', 'not_joined'] as const),
          joinEligibility: { status: choice(gate.status, ['passed', 'failed', 'unknown'] as const), reason: text(gate.reason), actualPower: nullable(integer)(gate.actualPower), minimumPower: nullable(integer)(gate.minimumPower) },
          battleStartEnabled: result.battleStartEnabled,
        };
      },
    } : {}),
    ...(authorities.enableCreation ? {
      async listBossChoices() {
        const response = object(await rpc('list_raid_room_boss_choices_v1', {}));
        const choices = array(response.choices, value => {
          const entry = object(value);
          return { raidVariantId: text(entry.raidVariantId), name: text(entry.name) };
        });
        if (new Set(choices.map(entry => entry.raidVariantId)).size !== choices.length) invalid();
        return choices;
      },
      async createRoom(request: import('./raidRoomClient').RaidRoomCreateRequest) {
        const difficultyId = choice(request.difficultyId, RAID_DIFFICULTIES.map(entry => entry.id));
        const response = room(await rpc('create_raid_room_v1', {
          p_difficulty_id: difficultyId, p_raid_variant_id: text(request.raidVariantId), p_request_id: text(request.requestId),
        }));
        if (response.difficultyId !== difficultyId) invalid();
        return response;
      },
    } : {}),
    listRooms: () => pages('list_raid_rooms_v1', { p_difficulty_id: null }, 'rooms', room, (entry) => entry.roomId),
    async getRoom(roomId) {
      const id = text(roomId);
      const result = room(await rpc('get_raid_room_v1', { p_room_id: id }));
      if (result.roomId !== id) invalid();
      return result;
    },
    async listParticipants(roomId) {
      const id = text(roomId);
      return pages('get_raid_room_participants_v1', { p_room_id: id }, 'participants', (value) => {
        const result = participant(value);
        if (result.roomId !== id) invalid();
        return result;
      }, (entry) => entry.player.userId);
    },
    async getRewards(roomId) {
      const id = text(roomId);
      if (!authorities.getRewards) throw new Error('Raid room reward authority is not connected');
      return array(await authorities.getRewards(id), reward);
    },
    async joinRoom(request): Promise<RaidBattleReference> {
      const roomId = text(request.roomId);
      const rescueId = request.rescueId === undefined ? undefined : text(request.rescueId);
      if (!authorities.joinRoom) throw new Error('Raid room join authority is not connected');
      const response = object(await authorities.joinRoom({ roomId, ...(rescueId === undefined ? {} : { rescueId }) }));
      const reference = { roomId: text(response.roomId), replayId: text(response.replayId) };
      if (reference.roomId !== roomId) invalid();
      return reference;
    },
  };
}

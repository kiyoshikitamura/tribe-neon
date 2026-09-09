import type { RaidDifficultyId } from './raidRoom';
import type { RaidTopEntry } from './raidTop';
import type { RaidRewardPlan } from './raidRoomDisplay';
import type { RaidRoomRpcClient } from './raidRoomRpcTransport';
import { parseRaidTopSnapshot } from './raidTopData';
import { resolveRaidTopEnemy } from './raidTopAssets';

export interface RaidListPage { entries: readonly RaidTopEntry[]; nextOffset: number | null }
export interface RaidEnemyInfo { variantId: string; skillsByCharacterId: Readonly<Record<string, readonly { id: string; name: string }[]>>; clearPlan: RaidRewardPlan; rescuePlan: RaidRewardPlan }
export type RaidListLoader = (difficulty: RaidDifficultyId, offset: number) => Promise<RaidListPage>;
export type RaidEnemyLoader = (variant: string, difficulty: RaidDifficultyId) => Promise<RaidEnemyInfo>;
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid raid page'); return value as Record<string, unknown>; }
function text(value: unknown): string { if (typeof value !== 'string' || !value.trim()) throw Error('Invalid raid page'); return value; }
function plan(value: unknown): RaidRewardPlan {
  const p = record(value);
  if ((p.status !== 'configured' && p.status !== 'unconfigured') || !Array.isArray(p.items)) throw Error('Invalid reward plan');
  const items = p.items.map(value => { const i = record(value); if ('presentId' in i || typeof i.quantity !== 'number' || !Number.isSafeInteger(i.quantity) || i.quantity <= 0) throw Error('Invalid reward plan'); return { itemId: text(i.itemId), quantity: i.quantity }; });
  if ((p.status === 'configured') !== (items.length > 0)) throw Error('Invalid reward plan');
  return { status: p.status, items };
}
async function entries(value: unknown): Promise<readonly RaidTopEntry[]> {
  const parsed = await parseRaidTopSnapshot({ participating: { status: 'ready', data: value }, rescues: { status: 'unavailable' }, dailyTargets: { status: 'unavailable' } });
  if (parsed.participating.status !== 'ready') throw Error('Invalid raid page');
  return parsed.participating.data;
}
async function rpc(client: RaidRoomRpcClient, name: string, args: Record<string, unknown>) { const response = await client.rpc(name, args); if (response.error) throw Error('Raid page request failed'); return record(response.data); }
export async function loadRaidListPage(client: RaidRoomRpcClient, difficulty: RaidDifficultyId, offset: number): Promise<RaidListPage> {
  const data = await rpc(client, 'list_raid_room_cards_v1', { p_difficulty_id: difficulty, p_offset: offset });
  if (data.nextOffset !== null && (typeof data.nextOffset !== 'number' || !Number.isSafeInteger(data.nextOffset) || data.nextOffset !== offset + 20)) throw Error('Invalid raid page cursor');
  const page = await entries(data.entries);
  if (page.some(entry => entry.room.difficultyId !== difficulty) || (data.nextOffset !== null && page.length !== 20)) throw Error('Invalid raid page');
  return { entries: page, nextOffset: data.nextOffset as number | null };
}
export async function loadRaidEnemyInfo(client: RaidRoomRpcClient, variant: string, difficulty: RaidDifficultyId): Promise<RaidEnemyInfo> {
  const data = await rpc(client, 'get_raid_enemy_info_v1', { p_variant_id: variant, p_difficulty_id: difficulty });
  const enemy = resolveRaidTopEnemy(variant);
  if (data.variantId !== variant || !enemy || !Array.isArray(data.memberCharacterIds) || JSON.stringify(data.memberCharacterIds) !== JSON.stringify(enemy.roster.map(member => member.id))) throw Error('Raid roster mismatch');
  const raw = record(data.skillsByCharacterId);
  const skillsByCharacterId: Record<string, { id: string; name: string }[]> = {};
  for (const member of enemy.roster) { const skills = raw[member.id]; if (!Array.isArray(skills)) throw Error('Invalid raid skills'); skillsByCharacterId[member.id] = skills.map(value => { const skill = record(value); return { id: text(skill.id), name: text(skill.name) }; }); }
  return { variantId: variant, skillsByCharacterId, clearPlan: plan(data.clearPlan), rescuePlan: plan(data.rescuePlan) };
}
export async function loadRaidRescueCards(client: RaidRoomRpcClient, ids: readonly string[]): Promise<readonly RaidTopEntry[]> {
  if (ids.length > 50) throw Error('Too many rescue cards');
  const data = await rpc(client, 'get_raid_rescue_cards_v1', { p_rescue_ids: [...new Set(ids)] });
  if (!Array.isArray(data.entries) || data.entries.length > ids.length) throw Error('Invalid rescue cards');
  // Multiple publications may refer to one room; validate each separately without losing rescue identity.
  const result = await Promise.all(data.entries.map(async entry => (await entries([entry]))[0]));
  const seen = new Set<string>();
  for (const entry of result) { if (entry.rescue.status !== 'available' || !ids.includes(entry.rescue.value.rescueId) || seen.has(entry.rescue.value.rescueId)) throw Error('Invalid rescue identity'); seen.add(entry.rescue.value.rescueId); }
  return result;
}

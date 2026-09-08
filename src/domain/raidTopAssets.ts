import { CANONICAL_RAID_PRODUCTION } from '@/domain/gameplay/canonical/combat_production';
import { CHARACTERS_MASTER, getCanonicalBattleAreaName, getCanonicalBattleBackground, getCharacterTransparentImg } from '@/utils/game_constants';
import type { RaidTopEnemy } from './raidTop';

/** 表示素材だけを実マスターから引く。日次選出/戦闘編成の生成には使用しない。 */
export function resolveRaidTopEnemy(variantId: string): RaidTopEnemy | null {
  const variant = CANONICAL_RAID_PRODUCTION.variants.find((entry) => entry.raidVariantId === variantId);
  if (!variant) return null;
  const baseId = variant.areaId.toLowerCase();
  const areaName = getCanonicalBattleAreaName(baseId);
  const backgroundUrl = getCanonicalBattleBackground(baseId);
  const roster = variant.memberCharacterIds.map((id) => {
    const character = CHARACTERS_MASTER.find((entry) => entry.id === id);
    return character ? { id, name: character.jpName, imageUrl: getCharacterTransparentImg(character.name) } : null;
  });
  if (!areaName || !backgroundUrl || roster.length !== 5 || roster.some((entry) => entry === null)) return null;
  const members = roster.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  return { variantId, baseId, areaName, bossName: variant.raidName, backgroundUrl, leaderImageUrl: members[0].imageUrl, roster: members };
}

/** 全7エリアの素材目録。『本日の対象』ではない。 */
export const RAID_TOP_ENEMIES: readonly RaidTopEnemy[] = CANONICAL_RAID_PRODUCTION.variants
  .map((variant) => resolveRaidTopEnemy(variant.raidVariantId))
  .filter((enemy): enemy is RaidTopEnemy => enemy !== null);

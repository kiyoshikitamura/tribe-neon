import { CANONICAL_RAID_PRODUCTION } from "@/domain/gameplay/canonical/combat_production";

export type CanonicalRaidVariant = (typeof CANONICAL_RAID_PRODUCTION.variants)[number];

export function findCanonicalRaidVariant(bossMasterId?: string, raidName?: string): CanonicalRaidVariant | undefined {
  return CANONICAL_RAID_PRODUCTION.variants.find((variant) =>
    variant.raidVariantId === bossMasterId || variant.raidName === raidName,
  );
}

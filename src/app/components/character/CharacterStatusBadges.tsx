import React from "react";
import { getAwakeningBadgeAsset, getRarityBadgeAsset, normalizeProductionRarity } from "@/utils/rarityAssets";
import "./CharacterStatusBadges.css";

export function RarityBadge({ rarity }: { rarity: string }) {
  return <img className="character-status-badge is-rarity" src={getRarityBadgeAsset(rarity)} alt={normalizeProductionRarity(rarity)} />;
}

export function AwakeningBadge({ level, showUnawakened = false }: { level: number; showUnawakened?: boolean }) {
  const src = getAwakeningBadgeAsset(level);
  return src ? <img className="character-status-badge is-awakening" src={src} alt={`覚醒 +${level}`} />
    : showUnawakened ? <span className="character-status-unawakened">未覚醒</span> : null;
}

export default function CharacterStatusBadges({ rarity, awakeningLevel }: { rarity: string; awakeningLevel: number }) {
  return <span className="character-status-badges"><RarityBadge rarity={rarity} /><AwakeningBadge level={awakeningLevel} /></span>;
}

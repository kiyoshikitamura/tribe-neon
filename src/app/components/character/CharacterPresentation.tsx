"use client";

import React, { useMemo, useState } from "react";
import "./CharacterPresentation.css";
import { getCharacterPresentationMetadata } from "./characterPresentationMetadata";
import { getRarityBadgeAsset, getRarityFrameAsset, type RarityFrameKind } from "@/utils/rarityAssets";
import { getAttributeBadgeAsset, getAttributeLabel } from "@/utils/attributeAssets";
import { useScreenReadiness } from "../../hooks/useScreenReadiness";

export type CharacterPresentationVariant = "portrait" | "dialogue" | "dialogue-bust" | "reveal" | "quest" | "battle-leader" | "card" | "gacha-result-compact" | "thumbnail" | "full-body" | "home-hero" | "battle" | "icon" | "user-avatar";

type Props = {
  src?: string;
  alt: string;
  variant: CharacterPresentationVariant;
  rarity?: string;
  name?: string;
  level?: number;
  selected?: boolean;
  badge?: string;
  frameKind?: RarityFrameKind | false;
  rarityBadge?: boolean;
  attribute?: string;
  attributeBadge?: boolean;
  backgroundSrc?: string;
  className?: string;
  metadata?: boolean;
};

function ResilientCharacterImage({ src, alt }: { src: string; alt: string }) {
  const [attempt, setAttempt] = useState(0);
  if (attempt > 2) return <span className="character-presentation-missing" role="img" aria-label={`${alt}の画像は準備中`} />;
  const retrySrc = attempt > 0 ? `${src}${src.includes("?") ? "&" : "?"}asset_retry=${attempt}` : src;
  return <img key={retrySrc} className="character-presentation-character" src={retrySrc} alt={alt} onError={() => setAttempt((current) => current + 1)} />;
}

export default function CharacterPresentation({
  src,
  alt,
  variant,
  rarity,
  name,
  level,
  selected = false,
  badge,
  frameKind,
  rarityBadge = false,
  attribute,
  attributeBadge = false,
  backgroundSrc,
  className = "",
  metadata = true,
}: Props) {
  const rarityClass = rarity ? `character-presentation-rarity-${rarity.toLowerCase()}` : "";
  const framing = getCharacterPresentationMetadata(src || "");
  const presentationStyle = {
    "--character-focal-x": `${framing.focalX}%`,
    "--character-thumbnail-focal-y": `${framing.thumbnailFocalY}%`,
    "--character-portrait-focal-y": `${framing.portraitFocalY}%`,
    "--character-card-focal-y": `${framing.cardFocalY}%`,
    "--character-thumbnail-scale": framing.thumbnailScale,
    "--character-thumbnail-x": `${framing.thumbnailX}%`,
    "--character-thumbnail-y": `${framing.thumbnailY}%`,
    "--character-card-scale": framing.cardScale,
    "--character-card-x": `${framing.cardX}%`,
    "--character-card-y": `${framing.cardY}%`,
    "--character-compact-scale": framing.compactScale,
    "--character-compact-x": `${framing.compactX}%`,
    "--character-compact-y": `${framing.compactY}%`,
    "--character-reveal-scale": framing.revealScale,
    "--character-reveal-x": `${framing.revealX}%`,
    "--character-reveal-y": `${framing.revealY}%`,
    "--character-battle-scale": framing.battleScale,
    "--character-battle-x": `${framing.battleX}%`,
    "--character-battle-y": `${framing.battleY}%`,
    "--character-battle-icon-scale": framing.battleIconScale,
    "--character-battle-icon-x": `${framing.battleIconX}%`,
    "--character-battle-icon-y": `${framing.battleIconY}%`,
    "--character-cutin-scale": framing.cutInScale,
    "--character-cutin-x": `${framing.cutInX}%`,
    "--character-cutin-y": `${framing.cutInY}%`,
    "--character-home-scale": framing.homeScale,
    "--character-home-x": `${framing.homeX}%`,
    "--character-home-y": `${framing.homeY}%`,
  } as React.CSSProperties;
  const frameClass = frameKind ? `has-rarity-frame is-frame-${frameKind}` : "";
  const frameSrc = rarity && frameKind ? getRarityFrameAsset(frameKind, rarity) : "";
  const rarityBadgeSrc = rarity && rarityBadge ? getRarityBadgeAsset(rarity) : "";
  const attributeBadgeSrc = attributeBadge ? getAttributeBadgeAsset(attribute) || "" : "";
  const visualSources = useMemo(
    () => [backgroundSrc, src, frameSrc, rarityBadgeSrc, attributeBadgeSrc].filter(Boolean) as string[],
    [attributeBadgeSrc, backgroundSrc, frameSrc, rarityBadgeSrc, src],
  );
  const visualReadiness = useScreenReadiness({
    assets: visualSources.map((assetSrc) => ({ src: assetSrc, required: false })),
  });
  const visualReady = visualSources.length === 0 || visualReadiness.status === "ready";
  const content = (
    <>
      <div className="character-presentation-art" aria-hidden={!visualReady}>
        {backgroundSrc && <img className="character-presentation-background" src={backgroundSrc} alt="" aria-hidden="true" />}
        {src ? <ResilientCharacterImage key={src} src={src} alt={alt} /> : <span className="character-presentation-missing" role="img" aria-label={`${alt}の画像は準備中`} />}
        <span className="character-presentation-light" aria-hidden="true" />
      </div>
      {frameSrc && <img className={`character-presentation-frame is-${frameKind}`} src={frameSrc} alt="" aria-hidden="true" />}
      {rarityBadgeSrc && <img className="character-presentation-rarity-badge" src={rarityBadgeSrc} alt={rarity} />}
      {attributeBadgeSrc && <img className="character-presentation-attribute-badge" src={attributeBadgeSrc} alt={getAttributeLabel(attribute)} />}
      {badge && <span className="character-presentation-badge">{badge}</span>}
      {metadata && (name || rarity || typeof level === "number") && (
        <figcaption className="character-presentation-meta">
          {rarity && !rarityBadge && <span className="character-presentation-rarity">{rarity}</span>}
          {name && <strong>{name}</strong>}
          {typeof level === "number" && <span>Lv.{level}</span>}
        </figcaption>
      )}
    </>
  );
  return <figure style={presentationStyle} aria-busy={!visualReady} className={`character-presentation character-presentation-${variant} ${rarityClass} ${frameClass} ${visualReady ? "is-visual-ready" : "is-visual-loading"} ${selected ? "is-selected" : ""} ${className}`.trim()}>
    {frameKind === "character" ? <div className="character-presentation-frame-layout">{content}</div> : content}
  </figure>;
}

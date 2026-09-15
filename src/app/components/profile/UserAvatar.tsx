"use client";

import CharacterPresentation from "../character/CharacterPresentation";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import "./UserAvatar.css";

// Identity only: no rarity, level, state or frame props are accepted here.
export default function UserAvatar({ characterId, src, alt, className = "" }: {
  characterId?: string | null;
  src?: string;
  alt: string;
  className?: string;
}) {
  const master = CHARACTERS_MASTER.find(entry => entry.id === characterId);
  return <CharacterPresentation
    src={src || (master ? getCharacterTransparentImg(master.name) : undefined)}
    alt={alt} variant="user-avatar" frameKind={false} metadata={false}
    className={`user-avatar ${className}`}
  />;
}

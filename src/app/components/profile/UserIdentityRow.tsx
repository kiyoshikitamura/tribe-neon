"use client";

import CharacterPresentation from "../character/CharacterPresentation";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import "./UserIdentityRow.css";

export default function UserIdentityRow({ userName, guildName, title, leaderCharacterId, leaderImageSrc, identityReady = true, onOpen, variant = "standard" }: {
  userName: string;
  guildName?: string | null;
  title?: string | null;
  leaderCharacterId?: string | null;
  leaderImageSrc?: string;
  identityReady?: boolean;
  onOpen?: () => void;
  variant?: "compact" | "standard";
}) {
  const master = CHARACTERS_MASTER.find((entry) => entry.id === leaderCharacterId);
  const content = <>
    {identityReady
      ? <CharacterPresentation src={leaderImageSrc || (master ? getCharacterTransparentImg(master.name) : undefined)} alt={`${userName}のリーダー`} variant="thumbnail" rarity={master?.rarity} frameKind={false} metadata={false} className="user-identity-leader-face" />
      : <span className="user-identity-leader-loading" role="status" aria-label="リーダーを読み込み中" />}
    <span><strong>{userName}</strong>{guildName ? <small>TRIBE {guildName}</small> : <small>未所属</small>}{title ? <small>{title}</small> : null}</span>
  </>;
  return onOpen
    ? <button type="button" className={`user-identity-row is-${variant}`} onClick={onOpen} aria-label={`${userName}のプロフィールを開く`}>{content}</button>
    : <div className={`user-identity-row is-${variant}`}>{content}</div>;
}

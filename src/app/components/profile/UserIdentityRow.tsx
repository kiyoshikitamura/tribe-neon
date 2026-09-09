"use client";

import UserAvatar from "./UserAvatar";
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
  const content = <>
    {identityReady
      ? <UserAvatar characterId={leaderCharacterId} src={leaderImageSrc} alt={`${userName}のリーダー`} className="user-identity-leader-face" />
      : <span className="user-identity-leader-loading" role="status" aria-label="リーダーを読み込み中" />}
    <span><strong>{userName}</strong>{guildName ? <small>TRIBE {guildName}</small> : <small>未所属</small>}{title ? <small>{title}</small> : null}</span>
  </>;
  return onOpen
    ? <button type="button" className={`user-identity-row is-${variant}`} onClick={onOpen} aria-label={`${userName}のプロフィールを開く`}>{content}</button>
    : <div className={`user-identity-row is-${variant}`}>{content}</div>;
}

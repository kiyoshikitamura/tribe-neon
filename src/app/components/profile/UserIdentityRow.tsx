"use client";

import UserAvatar from "./UserAvatar";
import GuildIdentity from "./GuildIdentity";
import "./UserIdentityRow.css";

export default function UserIdentityRow({ userName, guildName, guildId, title, leaderCharacterId, leaderImageSrc, identityReady = true, verified = false, onOpen, variant = "standard" }: {
  userName: string;
  guildName?: string | null;
  guildId?: string | null;
  title?: string | null;
  leaderCharacterId?: string | null;
  leaderImageSrc?: string;
  identityReady?: boolean;
  verified?: boolean;
  onOpen?: () => void;
  variant?: "compact" | "standard";
}) {
  const content = <>
    {identityReady
      ? <UserAvatar characterId={leaderCharacterId} src={leaderImageSrc} alt={`${userName}のリーダー`} className="user-identity-leader-face" />
      : <span className="user-identity-leader-loading" role="status" aria-label="リーダーを読み込み中" />}
    <span><span className="user-identity-name"><strong>{userName}</strong>{verified && <span className="user-identity-verified" aria-label="認証済み" title="認証済み">✓</span>}</span>{guildName ? <small className="user-identity-guild"><GuildIdentity guildId={guildId} name={guildName} /></small> : <small>未所属</small>}{title ? <small>{title}</small> : null}</span>
  </>;
  return onOpen
    ? <button type="button" className={`user-identity-row is-${variant}`} onClick={onOpen} aria-label={`${userName}のプロフィールを開く`}>{content}</button>
    : <div className={`user-identity-row is-${variant}`}>{content}</div>;
}

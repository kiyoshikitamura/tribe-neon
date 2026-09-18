"use client";

import UserAvatar from "./UserAvatar";
import GuildIdentity from "./GuildIdentity";
import VerifiedUserName from "./VerifiedUserName";
import "./UserIdentityRow.css";

export default function UserIdentityRow({ userId, userName, guildName, guildId, title, leaderCharacterId, leaderImageSrc, identityReady = true, verified, onOpen, variant = "standard" }: {
  userId?: string | null;
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
    <span><span className="user-identity-name"><strong><VerifiedUserName userId={userId} name={userName} verified={verified} /></strong></span>{guildName ? <small className="user-identity-guild"><GuildIdentity guildId={guildId} name={guildName} /></small> : <small>未所属</small>}{title ? <small>{title}</small> : null}</span>
  </>;
  return onOpen
    ? <button type="button" className={`user-identity-row is-${variant}`} onClick={onOpen} aria-label={`${userName}のプロフィールを開く`}>{content}</button>
    : <div className={`user-identity-row is-${variant}`}>{content}</div>;
}

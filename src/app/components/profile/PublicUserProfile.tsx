"use client";

import { useState } from "react";
import CharacterPresentation from "../character/CharacterPresentation";
import UserAvatar from "./UserAvatar";
import CanonicalDialog from "../ui/CanonicalDialog";
import OutlawButton from "../ui/OutlawButton";
import { SkillDetailDialog, SkillIconGrid } from "../skill/SkillPresentation";
import type { SkillCardMaster } from "@/utils/skills_master_data";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import { normalizeUserBio } from "@/domain/presentation/userBio";
import "./PublicUserProfile.css";

export type PublicProfileCharacter = {
  characterId: string;
  name?: string;
  level?: number;
  rarity?: string;
  assetIdentifier?: string;
  power?: number;
  atk?: number;
  def?: number;
  spd?: number;
  skillIds?: string[];
};

export type PublicUserProfileModel = {
  id: string;
  status?: "loading" | "ready" | "error";
  username: string;
  leaderCharacterId?: string | null;
  bio?: string | null;
  level: number;
  titleName?: string | null;
  guildId?: string | null;
  guildName?: string | null;
  totalPower?: number;
  dailyPvpRank?: number | null;
  party?: PublicProfileCharacter[];
  errorMessage?: string;
};

const HIDDEN_TITLES = new Set(["", "title_none", "称号なし", "No Title", "半グレの首領"]);

export function publicBioText(value?: string | null) {
  return normalizeUserBio(value);
}

export function publicTitleText(value?: string | null) {
  const normalized = String(value || "").trim();
  return HIDDEN_TITLES.has(normalized) ? "" : normalized;
}

function ProfileCharacter({ character, leader = false }: { character?: PublicProfileCharacter; leader?: boolean }) {
  const master = CHARACTERS_MASTER.find((entry) => entry.id === character?.characterId);
  const name = master?.jpName || character?.name || "リーダー未設定";
  if (leader) return <UserAvatar characterId={character?.characterId} src={character?.assetIdentifier} alt={name} className="public-profile-leader-icon" />;
  return <CharacterPresentation
    src={character?.assetIdentifier || (master ? getCharacterTransparentImg(master.name) : undefined)}
    alt={name}
    variant={leader ? "icon" : "thumbnail"}
    rarity={master?.rarity || character?.rarity}
    frameKind="character"
    metadata={false}
    className={leader ? "public-profile-leader-icon" : "public-profile-deck-icon"}
  />;
}

export default function PublicUserProfile({ profile, currentUserId, onClose, onRetry, onGuild, onDm }: {
  profile: PublicUserProfileModel;
  currentUserId?: string;
  onClose: () => void;
  onRetry: () => void;
  onGuild?: (guildId: string) => void;
  onDm?: (userId: string) => void;
}) {
  const [selectedCharacter, setSelectedCharacter] = useState<PublicProfileCharacter | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillCardMaster | null>(null);
  const bio = publicBioText(profile.bio);
  const title = publicTitleText(profile.titleName);
  const leader = profile.leaderCharacterId ? { characterId: profile.leaderCharacterId } : undefined;
  const isOtherUser = Boolean(currentUserId && profile.id && profile.id !== currentUserId);

  return <><CanonicalDialog size="large" ariaLabel={`${profile.username}の公開プロフィール`} onClose={onClose} loading={profile.status === "loading"}>
    {profile.status === "loading" ? <div className="public-profile-loading" role="status">プロフィールを取得しています…</div>
      : profile.status === "error" ? <div className="public-profile-error"><p>{profile.errorMessage || "プロフィールを取得できませんでした。"}</p><OutlawButton variant="primary" onClick={onRetry}>再試行</OutlawButton></div>
      : <div className="public-profile">
        <section className="public-profile-identity">
          <ProfileCharacter character={leader} leader />
          <div><h2>{profile.username}</h2><div className="public-profile-meta"><span>Lv.{Math.max(1, Number(profile.level || 1))}</span>{profile.guildId && profile.guildName ? <button type="button" onClick={() => onGuild?.(profile.guildId!)}>TRIBE {profile.guildName}</button> : <span>未所属</span>}{title && <span>称号 {title}</span>}{profile.dailyPvpRank ? <span>デイリー {profile.dailyPvpRank}位</span> : null}</div>{isOtherUser && onDm && <OutlawButton variant="primary" className="public-profile-dm-action" onClick={() => onDm(profile.id)}>DMを送る</OutlawButton>}</div>
        </section>
        {bio && <section className="public-profile-bio" aria-label="自己紹介"><h3>自己紹介</h3><p>{bio}</p></section>}
        {profile.party && profile.party.length > 0 && <section className="public-profile-deck"><h3>{isOtherUser ? "DECK" : "MY DECK"}</h3><div>{profile.party.slice(0, 5).map((character, index) => <button type="button" key={`${character.characterId}:${index}`} onClick={() => setSelectedCharacter(character)} aria-label={`${character.name || "キャラクター"}の詳細`}><ProfileCharacter character={character} />{typeof character.level === "number" && <small>Lv.{character.level}</small>}</button>)}</div></section>}
        {selectedCharacter && <section className="public-profile-character-detail" aria-label={`${selectedCharacter.name || "キャラクター"}の詳細`}>
          <button type="button" className="public-profile-character-detail-close" aria-label="キャラクター詳細を閉じる" onClick={() => setSelectedCharacter(null)}>×</button>
          <div className="public-profile-character-detail-identity"><ProfileCharacter character={selectedCharacter} /><div><h3>{selectedCharacter.name || "キャラクター"}</h3><span>Lv.{Math.max(1, Number(selectedCharacter.level || 1))}</span><strong>総合力 {Math.max(0, Number(selectedCharacter.power || 0)).toLocaleString()}</strong></div></div>
          {[selectedCharacter.atk, selectedCharacter.def, selectedCharacter.spd].some((value) => typeof value === "number") && <dl className="public-profile-character-stats">
            {typeof selectedCharacter.atk === "number" && <div><dt>ATK</dt><dd>{selectedCharacter.atk.toLocaleString()}</dd></div>}
            {typeof selectedCharacter.def === "number" && <div><dt>DEF</dt><dd>{selectedCharacter.def.toLocaleString()}</dd></div>}
            {typeof selectedCharacter.spd === "number" && <div><dt>SPD</dt><dd>{selectedCharacter.spd.toLocaleString()}</dd></div>}
          </dl>}
          {selectedCharacter.skillIds && selectedCharacter.skillIds.length > 0 && <div className="public-profile-character-skills"><h3>装備スキル</h3><SkillIconGrid skills={selectedCharacter.skillIds} onSelect={setSelectedSkill} /></div>}
        </section>}
        <div className="public-profile-power"><span>総合力</span><strong>{Math.max(0, Number(profile.totalPower || 0)).toLocaleString()}</strong></div>
      </div>}
  </CanonicalDialog>{selectedSkill && <SkillDetailDialog skill={selectedSkill} onClose={() => setSelectedSkill(null)} />}</>;
}

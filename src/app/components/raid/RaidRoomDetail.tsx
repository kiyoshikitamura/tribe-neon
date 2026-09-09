"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { RaidParticipantDto, RaidRoomDto } from "@/domain/raidRoom";
import type { RaidRoomBriefing, RaidRoomResource } from "@/domain/raidRoomClient";
import type { RaidRoomDisplay } from "@/domain/raidRoomDisplay";
import { resolveRaidTopEnemy } from "@/domain/raidTopAssets";
import { getRaidDifficultyLabel } from "@/domain/raidRoomPresentation";
import { getRaidRoomLifecyclePresentation } from "@/domain/raidRoomLifecyclePresentation";
import { CHARACTERS_MASTER, getCharacterTransparentImg } from "@/utils/game_constants";
import { preloadAssetManifest, type AssetResult } from "@/app/lib/screenAssets";
import { getCharacterPresentationMetadata } from "../character/characterPresentationMetadata";
import OutlawButton from "../ui/OutlawButton";
import CanonicalDialog from "../ui/CanonicalDialog";
import OutlawCard from "../ui/OutlawCard";
import SectionHeader from "../ui/SectionHeader";
import "./RaidRoomDetail.css";

export interface RaidRoomDetailProps {
  room: RaidRoomDto;
  briefing: RaidRoomResource<RaidRoomBriefing>;
  display: RaidRoomResource<RaidRoomDisplay>;
  participants: RaidRoomResource<readonly RaidParticipantDto[]>;
  currentUserId?: string;
  now: number | null;
  busy: boolean;
  onParticipants: () => void;
  onRewards: () => void;
  onEnemyInfo: () => void;
  action: ReactNode;
  rescue?: ReactNode;
}

const PERSON_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'%3E%3Crect width='128' height='128' fill='%23151d2a'/%3E%3Ccircle cx='64' cy='43' r='18' fill='%23697482'/%3E%3Cpath d='M24 118V98a40 40 0 0 1 80 0v20' fill='%23697482'/%3E%3C/svg%3E";
const BACKGROUND_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cpath fill='%23151d2a' d='M0 0h128v128H0z'/%3E%3C/svg%3E";
const ENTRANCES = [{ id: "enemy", label: "敵情報", icon: "/ui/icon_raid.png" }, { id: "participants", label: "参加者", icon: "/ui/icon_friends.png" }, { id: "rewards", label: "報酬", icon: "/ui/icon_present.png" }] as const;
const number = (value: number) => value.toLocaleString("ja-JP");
function Spinner() { return <div className="raid-detail__wait" role="status" aria-label="通信中"><span className="spinner" aria-hidden="true" /></div>; }
function Portrait({ url, name }: { url: string; name: string }) {
  const crop = getCharacterPresentationMetadata(url);
  const style = { "--raid-detail-portrait-scale": url.startsWith("data:") ? 1 : crop.thumbnailScale, "--raid-detail-portrait-x": `${crop.thumbnailX}%`, "--raid-detail-portrait-y": `${crop.thumbnailY}%` } as CSSProperties;
  return <span className="raid-detail__portrait"><img src={url} alt={name} style={style} /></span>;
}

export default function RaidRoomDetail({ room, briefing, display, participants, currentUserId, now, busy, onParticipants, onRewards, onEnemyInfo, action, rescue }: RaidRoomDetailProps) {
  const [rescueOpen, setRescueOpen] = useState(false);
  const details = display.status === "success" && display.data?.roomId === room.roomId ? display.data : null;
  const brief = briefing.status === "success" && briefing.data?.roomId === room.roomId ? briefing.data : null;
  const enemy = brief?.raidVariantId ? resolveRaidTopEnemy(brief.raidVariantId) : null;
  const owner = room.owner.status === "available" ? room.owner.value : null;
  const role = details?.membership ?? (owner?.userId === currentUserId && currentUserId ? "owner" : brief?.membershipStatus === "joined" ? "joined_unknown" : brief?.membershipStatus === "not_joined" ? "not_joined" : "unknown");
  const isJoined = role === "owner" || role === "member" || role === "rescue" || role === "joined_unknown";
  const roleLabel = { owner: "挑戦者", member: "通常参加", rescue: "救援参加", not_joined: "未参加", joined_unknown: "参加中・参加経路未確認", unknown: "参加状態未確認" }[role];
  const memberList = participants.status === "success" ? participants.data?.filter(entry => entry.roomId === room.roomId) ?? [] : [];
  const faces = memberList.slice(0, 5);
  const me = currentUserId ? memberList.find(entry => entry.player.userId === currentUserId) : undefined;
  const leaderUrl = (userId: string, priorUrl?: string | null) => {
    if (details && Object.prototype.hasOwnProperty.call(details.leaderCharacterIds, userId)) {
      const character = CHARACTERS_MASTER.find(entry => entry.id === details.leaderCharacterIds[userId]);
      return character ? getCharacterTransparentImg(character.name) : PERSON_FALLBACK;
    }
    return priorUrl || PERSON_FALLBACK;
  };
  const ownerUrl = owner ? leaderUrl(owner.userId, owner.leaderIconUrl.status === "available" ? owner.leaderIconUrl.value : null) : PERSON_FALLBACK;
  const faceImages = faces.map(entry => ({ id: entry.player.userId, name: entry.player.name, url: leaderUrl(entry.player.userId, entry.player.leaderIconUrl.status === "available" ? entry.player.leaderIconUrl.value : null) }));
  const manifest = [
    { src: ownerUrl, fallbackSrc: PERSON_FALLBACK, required: true },
    ...faceImages.map(entry => ({ src: entry.url, fallbackSrc: PERSON_FALLBACK, required: true })),
    ...ENTRANCES.map(entry => ({ src: entry.icon, fallbackSrc: BACKGROUND_FALLBACK, required: true })),
    ...(enemy ? [{ src: enemy.backgroundUrl, fallbackSrc: BACKGROUND_FALLBACK, required: true }, { src: enemy.leaderImageUrl, fallbackSrc: PERSON_FALLBACK, required: true }] : []),
  ];
  const manifestKey = JSON.stringify(manifest);
  const [assets, setAssets] = useState<{ key: string; results: AssetResult[] } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void preloadAssetManifest(JSON.parse(manifestKey)).then(results => { if (!cancelled) setAssets({ key: manifestKey, results }); });
    return () => { cancelled = true; };
  }, [manifestKey, retry]);
  const resolve = (url: string) => assets?.results.find(result => result.requestedSrc === url)?.resolvedSrc ?? PERSON_FALLBACK;
  if (assets?.key !== manifestKey || briefing.status === "loading" || display.status === "loading") return <Spinner />;
  if (assets.results.some(result => result.status === "failed")) return <div className="raid-detail__notice" role="alert"><p>画像を取得できませんでした。</p><OutlawButton loadingLabel="" onClick={() => { setAssets(null); setRetry(value => value + 1); }}>再試行</OutlawButton></div>;
  const lifecycle = getRaidRoomLifecyclePresentation(room, now);
  const hp = room.hp.status === "available" && room.hp.value.max > 0 ? room.hp.value : null;
  const percent = hp ? Math.max(0, Math.min(100, hp.current / hp.max * 100)) : null;
  const guild = details?.ownerGuild.status === "available" ? details.ownerGuild.value?.name ?? "Guild未所属" : "Guild未確認";
  const expires = room.expiresAt.status === "available" ? Date.parse(room.expiresAt.value) : NaN;
  return <div className="raid-detail" data-testid="raid-room-detail">
    <section className="raid-detail__hero" aria-label="対戦する敵">
      {enemy && <><img className="raid-detail__background" src={resolve(enemy.backgroundUrl)} alt="" /><img className="raid-detail__enemy" src={resolve(enemy.leaderImageUrl)} alt="" /></>}
      <span className="raid-detail__difficulty">{getRaidDifficultyLabel(room.difficultyId)}</span>
      <div className="raid-detail__hero-caption"><span>{enemy?.areaName ?? "エリア未確認"}</span><h2>{enemy?.bossName ?? brief?.bossName ?? "敵情報未確認"}</h2></div>
    </section>
    {(briefing.status === "error" || display.status === "error") && <p className="raid-detail__notice" role="alert">{briefing.status === "error" ? "敵・参加条件" : "所属・参加状態"}を取得できませんでした。画面を更新してください。</p>}
    <section className="raid-detail__battle" aria-label="戦況">
      <div className="raid-detail__hp-heading"><span>残HP</span><strong>{percent === null ? "未確認" : `${Number(percent.toFixed(1))}%`}</strong><span className="raid-detail__state">{lifecycle.stateLabel}</span></div>
      {hp ? <progress className="raid-detail__hp" value={Math.max(0, hp.current)} max={hp.max} aria-label="レイド残HP" /> : <div className="raid-detail__hp raid-detail__hp--unknown" />}
      <div className="raid-detail__hp-value">{hp ? `${number(hp.current)} / ${number(hp.max)}` : "HP未確認"}</div>
      <div className="raid-detail__battle-facts"><div><strong>{lifecycle.remainingLabel}</strong><span>{Number.isFinite(expires) ? `期限 ${new Date(expires).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} JST` : "期限未確認"}</span></div><div><strong>{room.participantCount.status === "available" ? `${number(room.participantCount.value)}人` : "未確認"}</strong><span>登録参加者</span></div></div>
      {faces.length > 0 && <div className="raid-detail__faces" aria-label="登録参加者のリーダー">{faceImages.map(person => <Portrait key={person.id} url={resolve(person.url)} name={person.name} />)}</div>}
    </section>
    <nav className="raid-detail__entrances" aria-label="レイドの詳細情報">{ENTRANCES.map(entry => <OutlawButton key={entry.id} loadingLabel="" disabled={busy || (entry.id === "participants" && !isJoined)} aria-label={entry.label === "参加者" ? "参加者一覧" : entry.label} onClick={entry.id === "participants" ? onParticipants : entry.id === "rewards" ? onRewards : onEnemyInfo}><img src={resolve(entry.icon)} alt="" /><span>{entry.label}</span></OutlawButton>)}{rescue && <OutlawButton loadingLabel="" disabled={busy} aria-label="救援" onClick={() => setRescueOpen(true)}><img src={resolve("/ui/icon_friends.png")} alt="" /><span>救援</span></OutlawButton>}</nav>
    {!isJoined && <p className="raid-detail__hint">参加者の詳細は参戦後に確認できます。</p>}
    {isJoined && <OutlawCard className="raid-detail__contribution"><SectionHeader title="あなたの貢献" />{participants.status === "loading" ? <Spinner /> : <><div className="raid-detail__contribution-values"><div><span>貢献ダメージ</span><strong>{me?.appliedDamage.status === "available" ? number(me.appliedDamage.value) : "未確認"}</strong></div><div><span>戦闘回数</span><strong>{me?.finalizedBattles.status === "available" ? `${number(me.finalizedBattles.value)}戦` : "未確認"}</strong></div></div>{participants.status === "error" && <p className="raid-detail__notice" role="alert">貢献情報を取得できませんでした。</p>}</>}</OutlawCard>}
    <div className="raid-detail__action">{action}</div>
    {rescue && rescueOpen && createPortal(<CanonicalDialog title="救援" onClose={() => setRescueOpen(false)} actions={[{label:"閉じる",semantic:"secondary",onClick:()=>setRescueOpen(false)}]}>{rescue}</CanonicalDialog>, document.body)}
  </div>;
}

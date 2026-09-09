"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RaidTopEntry, RaidTopProps, RaidTopResource } from "@/domain/raidTop";
import type { RaidPlayerSummary } from "@/domain/raidRoom";
import { getRaidDifficultyLabel } from "@/domain/raidRoomPresentation";
import { getRaidRoomLifecyclePresentation } from "@/domain/raidRoomLifecyclePresentation";
import { preloadAssetManifest, type AssetResult } from "@/app/lib/screenAssets";
import OutlawButton from "../ui/OutlawButton";
import UserAvatar from "../profile/UserAvatar";
import OutlawCard from "../ui/OutlawCard";
import SectionHeader from "../ui/SectionHeader";
import "./RaidTop.css";

const FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'%3E%3Crect width='128' height='128' fill='%23151d2a'/%3E%3Ccircle cx='64' cy='43' r='18' fill='%23697482'/%3E%3Cpath d='M24 118V98a40 40 0 0 1 80 0v20' fill='%23697482'/%3E%3C/svg%3E";
const BACKGROUND_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cpath fill='%23151d2a' d='M0 0h128v128H0z'/%3E%3C/svg%3E";
type ImageResolver = (url: string) => string;

function Spinner() {
  return <div className="raid-top__wait" role="status" aria-label="通信中"><span className="spinner" aria-hidden="true" /></div>;
}
function PersonIcon({ player, resolve }: { player?: RaidPlayerSummary; resolve: ImageResolver }) {
  const image = player?.leaderIconUrl.status === "available" ? player.leaderIconUrl.value : null;
  return <span className="raid-top__avatar" title={player?.name}>
    <UserAvatar src={image ? resolve(image) : FALLBACK} alt="" />
  </span>;
}
function challengerName(entry: RaidTopEntry) {
  if (entry.membership.status === "available" && entry.membership.value === "owner") return "あなた";
  return entry.room.owner.status === "available" ? entry.room.owner.value.name : "未確認";
}
function Owner({ entry, resolve }: { entry: RaidTopEntry; resolve: ImageResolver }) {
  const owner = entry.room.owner.status === "available" ? entry.room.owner.value : undefined;
  const guild = entry.ownerGuild.status === "available" ? entry.ownerGuild.value?.name ?? "Guild未所属" : "Guild未確認";
  return <div className="raid-top__owner"><PersonIcon player={owner} resolve={resolve} /><div className="raid-top__identity"><strong>挑戦者：{challengerName(entry)}</strong><span className="raid-top__guild">{guild}</span></div></div>;
}
function BattleState({ entry, now, resolve, compact = false }: { entry: RaidTopEntry; now: number | null; resolve: ImageResolver; compact?: boolean }) {
  const { room } = entry;
  const lifecycle = getRaidRoomLifecyclePresentation(room, now);
  const hp = room.hp.status === "available" && room.hp.value.max > 0 ? room.hp.value : null;
  const percent = hp ? Math.max(0, Math.min(100, hp.current / hp.max * 100)) : null;
  const participants = entry.participants.status === "available" ? entry.participants.value.slice(0, 4) : [];
  return <div className={`raid-top__battle${compact ? " raid-top__battle--compact" : ""}`}>
    <div className="raid-top__hp-label"><span>残HP</span><strong>{percent === null ? "未確認" : `${Number(percent.toFixed(1))}%`}</strong><span className="raid-top__state">{lifecycle.stateLabel}</span></div>
    {hp ? <progress className="raid-top__hp" value={Math.max(0, hp.current)} max={hp.max} aria-label="レイド残HP" /> : <div className="raid-top__hp raid-top__hp--unknown" />}
    <div className="raid-top__battle-meta"><span>{lifecycle.remainingLabel}</span>{!compact && <span>参加 {room.participantCount.status === "available" ? `${room.participantCount.value}人` : "未確認"}</span>}</div>
    {!compact && <div className="raid-top__participants"><div className="raid-top__avatar-stack">{participants.map(player => <PersonIcon key={player.userId} player={player} resolve={resolve} />)}</div><span>{entry.participants.status === "unknown" ? "参加者アイコン未取得" : "登録参加者"}</span></div>}
  </div>;
}
function ResourceNotice({ resource, onRefresh, unavailable, disabled }: { resource: RaidTopResource<unknown>; onRefresh: () => void; unavailable: string; disabled?: boolean }) {
  if (resource.status === "loading") return <Spinner />;
  if (resource.status === "ready") return null;
  return <div className="raid-top__notice" role={resource.status === "error" ? "alert" : "status"}><p>{resource.status === "error" ? "取得できませんでした" : unavailable}</p>{resource.status === "error" && <OutlawButton loadingLabel="" onClick={onRefresh} disabled={disabled}>再試行</OutlawButton>}</div>;
}

export default function RaidTop({ data, onOpenRoom, onChooseEnemy, onBrowse, onRefresh, disabled }: RaidTopProps) {
  const carousel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ key: "", index: 0 });
  const [now, setNow] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const manifest = useMemo(() => {
    const urls = new Set<string>();
    const backgrounds = new Set<string>();
    const entries = [data.participating, data.rescues].flatMap(resource => resource.status === "ready" ? [...resource.data] : []);
    const enemies = entries.flatMap(entry => entry.enemy.status === "available" ? [entry.enemy.value] : []);
    if (data.dailyTargets.status === "ready") enemies.push(...data.dailyTargets.data.targets);
    for (const enemy of enemies) { urls.add(enemy.backgroundUrl); backgrounds.add(enemy.backgroundUrl); urls.add(enemy.leaderImageUrl); enemy.roster.forEach(member => urls.add(member.imageUrl)); }
    for (const entry of entries) {
      const people = entry.participants.status === "available" ? [...entry.participants.value.slice(0, 4)] : [];
      if (entry.room.owner.status === "available") people.push(entry.room.owner.value);
      people.forEach(person => { if (person.leaderIconUrl.status === "available" && person.leaderIconUrl.value) urls.add(person.leaderIconUrl.value); });
    }
    return [...urls].filter(Boolean).map(src => ({ src, fallbackSrc: backgrounds.has(src) ? BACKGROUND_FALLBACK : FALLBACK, required: true }));
  }, [data]);
  const assetKey = JSON.stringify(manifest);
  const [assets, setAssets] = useState<{ key: string; results: AssetResult[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void preloadAssetManifest(manifest).then(results => { if (!cancelled) setAssets({ key: assetKey, results }); });
    return () => { cancelled = true; };
  }, [assetKey, manifest, retry]);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const participating = data.participating.status === "ready" ? data.participating.data : [];
  const rescues = data.rescues.status === "ready" ? data.rescues.data : [];
  const showParticipating = data.participating.status !== "ready" || participating.length > 0;
  const showRescues = data.rescues.status !== "ready" || rescues.length > 0;
  const rescueKey = rescues.map(entry => `${entry.room.roomId}:${entry.rescue.status === "available" ? entry.rescue.value.rescueId : "unknown"}`).join("|");
  useEffect(() => {
    if (carousel.current) carousel.current.scrollLeft = 0;
  }, [rescueKey]);
  const slide = position.key === rescueKey ? Math.min(position.index, Math.max(0, rescues.length - 1)) : 0;
  const resolve: ImageResolver = url => assets?.results.find(result => result.requestedSrc === url)?.resolvedSrc ?? FALLBACK;
  if ([data.participating, data.rescues, data.dailyTargets].some(resource => resource.status === "loading") || assets?.key !== assetKey) return <Spinner />;
  if (assets.results.some(result => result.status === "failed")) return <div className="raid-top__notice" role="alert"><p>画像を取得できませんでした</p><OutlawButton loadingLabel="" onClick={() => { setAssets(null); setRetry(value => value + 1); }}>再試行</OutlawButton></div>;
  const move = (direction: number) => {
    const track = carousel.current;
    if (!track) return;
    const card = track.firstElementChild as HTMLElement | null;
    track.scrollBy({ left: direction * ((card?.offsetWidth ?? track.clientWidth) + 12), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return <div className="raid-top" data-testid="raid-top">
    {showParticipating && <section aria-label="参戦中" className="raid-top__section"><SectionHeader title="参戦中" />
      <ResourceNotice resource={data.participating} onRefresh={onRefresh} disabled={disabled} unavailable="参戦情報は現在確認できません" />
      <div className="raid-top__joined-list">{participating.map(entry => <OutlawCard key={entry.room.roomId} className="raid-top__joined">
        <div className="raid-top__joined-visual">{entry.enemy.status === "available" && <img src={resolve(entry.enemy.value.leaderImageUrl)} alt="" />}</div>
        <div className="raid-top__joined-main"><div className="raid-top__eyebrow"><span>{getRaidDifficultyLabel(entry.room.difficultyId)}</span></div><h3>{entry.enemy.status === "available" ? entry.enemy.value.bossName : "敵情報未確認"}</h3><p className="raid-top__challenger" title={`挑戦者：${challengerName(entry)}`}>挑戦者：{challengerName(entry)}</p><BattleState entry={entry} now={now} resolve={resolve} compact /></div>
        <OutlawButton className="raid-top__continue" loadingLabel="" onClick={() => onOpenRoom(entry.room.roomId)} disabled={disabled}>続きへ</OutlawButton>
      </OutlawCard>)}</div>
    </section>}
    {showRescues && <section aria-label="救援依頼" className="raid-top__section"><div className="raid-top__section-row"><SectionHeader title="救援依頼" subTitle="ほかの挑戦者に加勢する" />{rescues.length > 1 && <div className="raid-top__arrows"><OutlawButton loadingLabel="" aria-label="前の救援" disabled={slide <= 0} onClick={() => move(-1)}>‹</OutlawButton><OutlawButton loadingLabel="" aria-label="次の救援" disabled={slide >= rescues.length - 1} onClick={() => move(1)}>›</OutlawButton></div>}</div>
      <ResourceNotice resource={data.rescues} onRefresh={onRefresh} disabled={disabled} unavailable="救援情報は現在確認できません" />
      <div className={`raid-top__rescue-track ${rescues.length > 1 ? "raid-top__rescue-track--multiple" : ""}`} ref={carousel} onScroll={event => { const track = event.currentTarget; const card = track.firstElementChild as HTMLElement | null; setPosition({ key: rescueKey, index: Math.round(track.scrollLeft / ((card?.offsetWidth ?? track.clientWidth) + 12)) }); }}>
        {rescues.map(entry => <OutlawCard key={`${entry.room.roomId}-${entry.rescue.status === "available" ? entry.rescue.value.rescueId : "unknown"}`} className="raid-top__rescue">
          <div className="raid-top__requester-art">{entry.room.owner.status === "available" && entry.room.owner.value.leaderIconUrl.status === "available" && entry.room.owner.value.leaderIconUrl.value ? <img src={resolve(entry.room.owner.value.leaderIconUrl.value)} alt="" /> : <PersonIcon resolve={resolve} />}</div><Owner entry={entry} resolve={resolve} />
          <div className="raid-top__rescue-visual">{entry.enemy.status === "available" && <><img className="raid-top__background" src={resolve(entry.enemy.value.backgroundUrl)} alt="" /><img className="raid-top__leader" src={resolve(entry.enemy.value.leaderImageUrl)} alt="" /></>}<div className="raid-top__enemy-caption"><span>{getRaidDifficultyLabel(entry.room.difficultyId)}{entry.enemy.status === "available" && ` / ${entry.enemy.value.areaName}`}</span><h3>{entry.enemy.status === "available" ? entry.enemy.value.bossName : "敵情報未確認"}</h3></div></div>
          <div className="raid-top__rescue-body"><BattleState entry={entry} now={now} resolve={resolve} />{entry.rescue.status === "unknown" && <p className="raid-top__muted">救援情報を確認できません</p>}<OutlawButton loadingLabel="" fullWidth variant="primary" disabled={disabled || entry.rescue.status === "unknown"} onClick={() => onOpenRoom(entry.room.roomId, entry.rescue.status === "available" ? entry.rescue.value.rescueId : undefined)}>{entry.room.state.status === "available" && entry.room.state.value !== "active" ? "戦況を見る" : "救援に向かう"}</OutlawButton></div>
        </OutlawCard>)}
      </div>{rescues.length > 1 && <div className="raid-top__page-count" aria-live="polite">{Math.min(slide + 1, rescues.length)} / {rescues.length}</div>}
    </section>}
    <section aria-label="今日の強敵" className="raid-top__section"><SectionHeader title="今日の強敵" subTitle={data.dailyTargets.status === "ready" ? "本日の2エリア" : undefined} />
      <ResourceNotice resource={data.dailyTargets} onRefresh={onRefresh} disabled={disabled} unavailable="本日の対象エリアは未確認です" />
      {data.dailyTargets.status === "ready" && <div className="raid-top__targets">{data.dailyTargets.data.targets.map(enemy => <OutlawCard key={enemy.variantId} className="raid-top__target"><div className="raid-top__target-visual"><img className="raid-top__background" src={resolve(enemy.backgroundUrl)} alt="" /><img className="raid-top__leader" src={resolve(enemy.leaderImageUrl)} alt="" /><div className="raid-top__enemy-caption"><span>{enemy.areaName}</span><h3>{enemy.bossName}</h3></div></div><div className="raid-top__target-body"><OutlawButton loadingLabel="" fullWidth disabled={disabled || !data.canCreate} onClick={() => onChooseEnemy(enemy)}>この敵に挑む</OutlawButton></div></OutlawCard>)}</div>}
      {data.dailyTargets.status === "ready" && !data.canCreate && <p className="raid-top__muted">現在、新たな挑戦は受け付けていません</p>}
    </section>
    <section aria-label="開催中のレイドを探す" className="raid-top__section raid-top__browse"><OutlawButton loadingLabel="" fullWidth onClick={onBrowse} disabled={disabled}><span className="raid-top__browse-copy"><strong>開催中のレイドを探す</strong><small>ほかの挑戦者に加勢する</small></span><span aria-hidden="true">›</span></OutlawButton></section>
  </div>;
}

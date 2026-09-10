'use client';
import React, { useEffect, useState, type CSSProperties } from 'react';
import { useGame } from '../../context/GameContext';
import type { RaidTopEntry } from '../../../domain/raidTop';
import { RAID_DIFFICULTIES } from '../../../domain/raidRoom';
import { getCharacterPresentationMetadata } from '../character/characterPresentationMetadata';
import OutlawButton from '../ui/OutlawButton';
import './RaidRescueLink.css';

export interface RaidRescueLinkProps {
  rescueId: unknown;
  onOpen?: () => void;
  entry?: RaidTopEntry;
  source?: 'activity' | 'guild_chat';
  status?: 'idle' | 'loading' | 'success' | 'error';
}
function Portrait({ url }: { url: string }) {
  const crop = getCharacterPresentationMetadata(url);
  const style = { '--rescue-face-scale': url.startsWith('data:') ? 1 : crop.thumbnailScale, '--rescue-face-x': `${crop.thumbnailX}%`, '--rescue-face-y': `${crop.thumbnailY}%` } as CSSProperties;
  return <img src={url} alt="" style={style} onError={event => { event.currentTarget.hidden = true; }} />;
}
/** Card data is batch-supplied by its host. This component never fetches profiles or room pages. */
export default function RaidRescueLink({ rescueId, onOpen, entry, source, status }: RaidRescueLinkProps) {
  const { openRaidRescue } = useGame();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED !== 'true' || typeof rescueId !== 'string' || !rescueId.trim() || !entry) return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    queueMicrotask(() => setNow(Date.now()));
    return () => clearInterval(timer);
  }, [rescueId, entry]);
  if (process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED !== 'true' || typeof rescueId !== 'string' || !rescueId.trim()) return null;
  const card = entry?.rescue.status === 'available' && entry.rescue.value.rescueId === rescueId ? entry : undefined;
  const enemy = card?.enemy.status === 'available' ? card.enemy.value : null;
  const owner = card?.room.owner.status === 'available' ? card.room.owner.value : null;
  const hp = card?.room.hp.status === 'available' ? card.room.hp.value : null;
  const rate = hp && hp.max > 0 ? Math.max(0, Math.min(100, hp.current / hp.max * 100)) : null;
  const state = card?.room.state.status === 'available' ? card.room.state.value : null;
  const expires = card?.room.expiresAt.status === 'available' ? Date.parse(card.room.expiresAt.value) : null;
  const expired = state === 'expired' || (now !== null && expires !== null && expires <= now);
  const ended = state === 'cleared' || expired;
  const canJoin = Boolean(card && state === 'active' && !expired);
  const minutes = now !== null && expires !== null ? Math.max(0, Math.ceil((expires - now) / 60000)) : null;
  const origin = card?.rescue.status === 'available' ? card.rescue.value.source : source;
  return <section className="raid-rescue-link" aria-label="レイド救援" data-rescue-id={rescueId} data-room-id={card?.room.roomId}>
    <div className="raid-rescue-link__origin">{origin === 'guild_chat' ? 'Guildからの救援' : origin === 'activity' ? '全体からの救援' : '救援依頼'}</div>
    {card ? <>
      <div className="raid-rescue-link__owner"><span className="raid-rescue-link__avatar">{owner?.leaderIconUrl.status === 'available' && owner.leaderIconUrl.value && <Portrait url={owner.leaderIconUrl.value} />}</span><span><strong>{owner?.name ?? '挑戦者未取得'}</strong><small>{card.ownerGuild.status === 'available' ? card.ownerGuild.value?.name ?? 'Guild未所属' : 'Guild未取得'}</small></span></div>
      <div className="raid-rescue-link__enemy">{enemy && <img src={enemy.leaderImageUrl} alt="" onError={event => { event.currentTarget.hidden = true; }} />}<div><strong>{enemy?.bossName ?? '敵情報未取得'}</strong><small>{RAID_DIFFICULTIES.find(difficulty => difficulty.id === card.room.difficultyId)?.label}</small></div></div>
      <div className="raid-rescue-link__hp"><span>残HP {rate === null ? '未取得' : `${Math.ceil(rate)}%`}</span>{rate !== null && <progress max={100} value={rate} aria-label="残HP" />}</div>
      <div className="raid-rescue-link__battle"><span>{state === 'cleared' ? '撃破済み' : expired ? '期限終了' : minutes === null ? '残り時間未取得' : `残り${Math.floor(minutes / 60)}時間${minutes % 60}分`}</span><span>{card.room.participantCount.status === 'available' ? `登録${card.room.participantCount.value}人` : '人数未取得'}</span></div>
    </> : <p className="raid-rescue-link__unknown">{status === 'loading' ? <span className="raid-rescue-link__spinner" role="status" aria-label="読み込み中" /> : status === 'error' ? '戦況を取得できませんでした' : status === 'success' ? '戦況を表示できません。公開先や所属を確認してください' : '対象レイドの戦況を確認できます。'}</p>}
    {canJoin ? <OutlawButton loadingLabel="" fullWidth aria-label="救援に向かう" onClick={() => { openRaidRescue(rescueId); onOpen?.(); }}>救援に向かう</OutlawButton>
      : ended ? <OutlawButton loadingLabel="" fullWidth aria-label="戦況を見る" disabled>戦況を見る</OutlawButton> : null}
  </section>;
}

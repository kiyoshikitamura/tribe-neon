'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RaidParticipantDto, RaidRewardDto } from '../../../domain/raidRoom';
import type { RaidRoomResource } from '../../../domain/raidRoomClient';
import CanonicalDialog from '../ui/CanonicalDialog';
import OutlawButton from '../ui/OutlawButton';
import UserAvatar from '../profile/UserAvatar';
import './RaidRoomDialogs.css';

function ParticipantPortrait({ url }: { url: string }) {
  return <UserAvatar src={url} alt="" />;
}

export interface RaidRoomDialogsProps {
  kind: 'participants' | 'rewards' | null;
  roomId: string | null;
  ownerUserId?: string;
  currentUserId?: string;
  participants: RaidRoomResource<readonly RaidParticipantDto[]>;
  onClose: () => void;
  onRefresh: () => void;
  onOpenProfile?: (userId: string) => Promise<void>;
  profileOpen?: boolean;
  renderRewards?: (roomId: string, close: () => void) => React.ReactNode;
  rewards: RaidRoomResource<readonly RaidRewardDto[]>;
  resolveRewardName?: (itemId: string) => string | null | undefined;
}

export default function RaidRoomDialogs({ kind, roomId, ownerUserId, currentUserId, participants, onClose, onRefresh, onOpenProfile, profileOpen = false, renderRewards, rewards, resolveRewardName }: RaidRoomDialogsProps) {
  const host = useRef<HTMLDivElement>(null);
  const scroll = useRef({ key: '', top: 0, player: '' });
  const request = useRef(0);
  const [openingProfile, setOpeningProfile] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const key = `${currentUserId ?? ''}:${roomId ?? ''}:${kind ?? ''}`;
  const activeKey = useRef(key);
  const visible = !!kind && !!roomId && !openingProfile && !profileOpen;
  useLayoutEffect(() => {
    if (activeKey.current !== key) { activeKey.current = key; request.current++; scroll.current = { key, top: 0, player: '' }; }
    if (!visible) return;
    const body = host.current?.querySelector<HTMLElement>('.canonical-dialog-body');
    if (body) body.scrollTop = scroll.current.key === key ? scroll.current.top : 0;
    const previousPlayer = Array.from(host.current?.querySelectorAll<HTMLButtonElement>('[data-profile-user]') ?? []).find(button => button.dataset.profileUser === scroll.current.player);
    previousPlayer?.focus({ preventScroll: true });
  }, [key, visible]);
  const openProfile = async (userId: string) => {
    if (!onOpenProfile || openingProfile) return;
    scroll.current = { key, top: host.current?.querySelector<HTMLElement>('.canonical-dialog-body')?.scrollTop ?? 0, player: userId };
    const version = ++request.current;
    setProfileError(false); setOpeningProfile(true);
    try { await onOpenProfile(userId); }
    catch { if (version === request.current) setProfileError(true); }
    finally { setOpeningProfile(false); }
  };
  if (!visible || !kind || !roomId || typeof document === 'undefined') return null;
  return createPortal(<div className="raid-room-dialogs" ref={host}>
    <CanonicalDialog title={kind === 'participants' ? '参加者' : '報酬'} onClose={onClose} actions={[{ label: '閉じる', onClick: onClose }]}>
      {kind === 'participants' ? <>
        <p className="raid-room-dialogs__note">登録している参加者です。</p>
        {profileError && <p role="alert">プロフィールを開けませんでした。もう一度お試しください。</p>}
        {participants.status === 'loading' && <span className="spinner" role="status" aria-label="通信中" />}
        {participants.status === 'idle' && <p>参加者情報は未取得です。</p>}
        {participants.status === 'error' && <p role="alert">参加者を取得できませんでした。</p>}
        {(participants.status === 'error' || participants.status === 'idle') && <OutlawButton loadingLabel="" onClick={onRefresh}>再取得</OutlawButton>}
        {participants.status === 'success' && <ul className="raid-room-dialogs__participants">{participants.data?.map(participant => <li key={participant.player.userId}>
          <button type="button" className="raid-room-dialogs__person" disabled={!onOpenProfile} data-profile-user={participant.player.userId} onClick={() => void openProfile(participant.player.userId)} aria-label={`${participant.player.name}のプロフィール`}>
            <span className="raid-room-dialogs__person-head"><span className="raid-room-dialogs__avatar">{participant.player.leaderIconUrl.status === 'available' && participant.player.leaderIconUrl.value && <ParticipantPortrait url={participant.player.leaderIconUrl.value} />}</span>
            <span className="raid-room-dialogs__identity"><strong>{participant.player.name}</strong><span>{participant.player.userId === ownerUserId ? '挑戦者' : '参加者'}{participant.player.userId === currentUserId ? '・あなた' : ''}</span><span>{participant.currentGuild.status === 'available' ? participant.currentGuild.value?.name ?? 'Guild未所属' : 'Guild未取得'}</span></span>
            <span className="raid-room-dialogs__chevron" aria-hidden="true">›</span>
            </span><span className="raid-room-dialogs__contribution"><span>貢献 {participant.appliedDamage.status === 'available' ? participant.appliedDamage.value.toLocaleString('ja-JP') : '未取得'}</span><span>{participant.finalizedBattles.status === 'available' ? `${participant.finalizedBattles.value.toLocaleString('ja-JP')}戦` : '戦数未取得'}</span></span>
          </button>
        </li>)}</ul>}
        {participants.status === 'success' && participants.data?.length === 0 && <p>参加者はいません。</p>}
      </> : renderRewards ? renderRewards(roomId, onClose) : <>
        {rewards.status === 'loading' && <span className="spinner" role="status" aria-label="通信中" />}
        {rewards.status === 'idle' && <p>報酬情報は未取得です。</p>}
        {rewards.status === 'error' && <p role="alert">報酬を取得できませんでした。</p>}
        {(rewards.status === 'error' || rewards.status === 'idle') && <OutlawButton loadingLabel="" onClick={onRefresh}>再取得</OutlawButton>}
        {rewards.status === 'success' && <ul className="raid-room-dialogs__fallback-rewards">{rewards.data?.map((reward, index) => <li key={`${reward.itemId}:${index}`}>{resolveRewardName?.(reward.itemId) ?? '報酬情報を確認できません'} × {reward.quantity.toLocaleString('ja-JP')}</li>)}</ul>}
      </>}
    </CanonicalDialog>
  </div>, document.body);
}

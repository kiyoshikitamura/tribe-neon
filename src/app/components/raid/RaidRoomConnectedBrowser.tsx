"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RaidRoomActivityTracker } from '../../../domain/raidRoomActivitySync';
import { createRaidRoomController } from '../../../domain/raidRoomClient';
import { createRaidRoomRpcTransport, type RaidRoomRpcAuthorities, type RaidRoomRpcClient } from '../../../domain/raidRoomRpcTransport';
import { createRaidRoomRescueClient } from '../../../domain/raidRoomRescue';
import { createRaidRoomRescueRewardClient } from '../../../domain/raidRoomRescueReward';
import { createRaidRoomClearRewardClient } from '../../../domain/raidRoomClearReward';
import RaidRoomClearRewardPanel from './RaidRoomClearRewardPanel';
import RaidRoomRescueRewardPanel from './RaidRoomRescueRewardPanel';
import RaidRoomRescuePanel from './RaidRoomRescuePanel';
import OutlawButton from '../ui/OutlawButton';
import RaidRoomBrowser, { type RaidRoomBrowserProps } from './RaidRoomBrowser';
import { useRaidTop } from './useRaidTop';
import { getRaidRoomDisplay } from '../../../domain/raidRoomDisplayClient';
import { loadRaidListPage, loadRaidEnemyInfo } from '../../../domain/raidPages';
import type { RaidTopLoader } from '../../../domain/raidTopData';

export interface RaidRoomConnectedBrowserProps extends Omit<RaidRoomBrowserProps, 'controller'> {
  rpcClient: RaidRoomRpcClient;
  authorities?: RaidRoomRpcAuthorities;
  onOpenPresents?: () => void | Promise<void>;
  rescueId?: string | null;
  userId?: string;
  activityTracker?: RaidRoomActivityTracker;
  refreshRevision?: number;
  returnRoomId?: string;
  loadTop?: RaidTopLoader;
}

/** 接続元の認証client・画面遷移・全体操作blockを受け取る。既存GameContextを変更しない。 */
export default function RaidRoomConnectedBrowser({ rpcClient, authorities, rescueId, onOpenPresents, userId, activityTracker, refreshRevision, returnRoomId, loadTop, ...browserProps }: RaidRoomConnectedBrowserProps) {
  const loadDisplay = useCallback((roomId: string) => getRaidRoomDisplay(rpcClient, roomId), [rpcClient]);
  const loadListPage = useCallback((difficulty: import('../../../domain/raidRoom').RaidDifficultyId, offset: number) => activityTracker ? activityTracker.observePage(() => loadRaidListPage(rpcClient, difficulty, offset)) : loadRaidListPage(rpcClient, difficulty, offset), [rpcClient, activityTracker]);
  const loadEnemyInfo = useCallback((variant: string, difficulty: import('../../../domain/raidRoom').RaidDifficultyId) => loadRaidEnemyInfo(rpcClient, variant, difficulty), [rpcClient]);
  const enableRescue = authorities?.enableRescue;
  const rewardClient = useMemo(() => createRaidRoomRescueRewardClient(rpcClient), [rpcClient]);
  const clearRewardClient = useMemo(() => createRaidRoomClearRewardClient(rpcClient), [rpcClient]);
  const rescueClient = useMemo(() => createRaidRoomRescueClient(rpcClient), [rpcClient]);
  const [linkError, setLinkError] = useState(false);
  const [linkRevision, setLinkRevision] = useState(0);
  const enableParticipation = authorities?.enableParticipation;
  const enableCreation = authorities?.enableCreation;
  const top = useRaidTop({ rpcClient, userId, refreshRevision, enabled: true, canCreate: !!enableCreation, loadTop });
  const getRewards = authorities?.getRewards;
  const joinRoom = authorities?.joinRoom;
  const connection = useMemo(() => {
    const transport = createRaidRoomRpcTransport(rpcClient, { getRewards, joinRoom, enableCreation, enableParticipation, enableRescue });
    return { controller: createRaidRoomController(activityTracker ? activityTracker.observeTransport(transport) : transport), mounts: 0 };
  }, [rpcClient, getRewards, joinRoom, enableCreation, enableParticipation, enableRescue, activityTracker, userId]);
  const previousRefresh = useRef(refreshRevision);
  useEffect(() => {
    if (returnRoomId && !rescueId) void connection.controller.selectRoom(returnRoomId);
  }, [connection, returnRoomId, rescueId, refreshRevision]);
  useEffect(() => {
    if (previousRefresh.current === refreshRevision) return;
    previousRefresh.current = refreshRevision;
    // 戦闘終了/復帰イベント時だけ参照し直す。通常の一覧取得と同じ通知経路を使う。
    // 帰還先ありの場合は直前のselectRoom内で取得済み。同じ詳細RPCを二重発行しない。
    if (returnRoomId && !rescueId) return;
    void connection.controller.refreshRoom();
  }, [connection, refreshRevision, returnRoomId, rescueId]);
  useEffect(() => {
    connection.mounts++;
    return () => {
      connection.mounts--;
      // StrictModeのeffect再接続では生存するcontrollerをdisposeしない。
      queueMicrotask(() => { if (connection.mounts === 0) connection.controller.dispose(); });
    };
  }, [connection]);
  useEffect(() => {
    if (!enableRescue || !rescueId) return;
    let current = true;
    setLinkError(false);
    void rescueClient.getLink(rescueId).then(link => {
      if (current) return connection.controller.selectRoom(link.roomId, rescueId);
    }).catch(() => { if (current) setLinkError(true); });
    return () => { current = false; };
  }, [connection, rescueClient, rescueId, enableRescue, linkRevision]);
  return <>{linkError && <><p role="alert">救援先を開けませんでした。所属や公開状態を確認してください。</p><OutlawButton loadingLabel="" onClick={() => setLinkRevision(value => value + 1)}>再試行</OutlawButton></>}<RaidRoomBrowser {...browserProps} loadListPage={loadListPage} loadEnemyInfo={loadEnemyInfo} currentUserId={userId} loadDisplay={loadDisplay} topData={top.data} onTopRefresh={top.refresh} listRefreshRevision={refreshRevision} controller={connection.controller} renderRewards={enableRescue || enableParticipation ? (roomId, close, display) => <div key={`${userId ?? ""}:${roomId}`}>
      <h3>討伐報酬</h3>
      <RaidRoomClearRewardPanel plan={display?.clearPlan} client={clearRewardClient} roomId={roomId} userId={userId} onOpenPresents={onOpenPresents ? async () => { await onOpenPresents(); close(); } : undefined} />
      {enableRescue && <><h3>救援成功報酬</h3><RaidRoomRescueRewardPanel plan={display?.rescuePlan} client={rewardClient} roomId={roomId} onOpenPresents={onOpenPresents ? async () => { await onOpenPresents(); close(); } : undefined} /></>}
    </div> : browserProps.renderRewards} renderRescue={enableRescue ? (room, disabled) => <RaidRoomRescuePanel key={room.roomId} client={rescueClient} userId={userId} roomId={room.roomId} disabled={disabled} setInteractionBlocking={browserProps.setInteractionBlocking} /> : undefined} /></>;
}

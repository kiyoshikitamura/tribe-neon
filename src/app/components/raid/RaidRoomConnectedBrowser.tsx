"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { createRaidRoomController } from '../../../domain/raidRoomClient';
import { createRaidRoomRpcTransport, type RaidRoomRpcAuthorities, type RaidRoomRpcClient } from '../../../domain/raidRoomRpcTransport';
import { createRaidRoomRescueClient } from '../../../domain/raidRoomRescue';
import RaidRoomRescuePanel from './RaidRoomRescuePanel';
import OutlawButton from '../ui/OutlawButton';
import RaidRoomBrowser, { type RaidRoomBrowserProps } from './RaidRoomBrowser';

export interface RaidRoomConnectedBrowserProps extends Omit<RaidRoomBrowserProps, 'controller'> {
  rpcClient: RaidRoomRpcClient;
  authorities?: RaidRoomRpcAuthorities;
  rescueId?: string | null;
}

/** 接続元の認証client・画面遷移・全体操作blockを受け取る。既存GameContextを変更しない。 */
export default function RaidRoomConnectedBrowser({ rpcClient, authorities, rescueId, ...browserProps }: RaidRoomConnectedBrowserProps) {
  const enableRescue = authorities?.enableRescue;
  const rescueClient = useMemo(() => createRaidRoomRescueClient(rpcClient), [rpcClient]);
  const [linkError, setLinkError] = useState(false);
  const [linkRevision, setLinkRevision] = useState(0);
  const enableParticipation = authorities?.enableParticipation;
  const enableCreation = authorities?.enableCreation;
  const getRewards = authorities?.getRewards;
  const joinRoom = authorities?.joinRoom;
  const connection = useMemo(() => ({
    controller: createRaidRoomController(createRaidRoomRpcTransport(rpcClient, { getRewards, joinRoom, enableCreation, enableParticipation, enableRescue })),
    mounts: 0,
  }), [rpcClient, getRewards, joinRoom, enableCreation, enableParticipation, enableRescue]);
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
  return <>{linkError && <><p role="alert">救援先を開けませんでした。所属や公開状態を確認してください。</p><OutlawButton loadingLabel="" onClick={() => setLinkRevision(value => value + 1)}>再試行</OutlawButton></>}<RaidRoomBrowser {...browserProps} controller={connection.controller} renderRescue={enableRescue ? (room, disabled) => <RaidRoomRescuePanel key={room.roomId} client={rescueClient} roomId={room.roomId} disabled={disabled} setInteractionBlocking={browserProps.setInteractionBlocking} /> : undefined} /></>;
}

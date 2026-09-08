"use client";

import React, { useEffect, useMemo } from 'react';
import { createRaidRoomController } from '../../../domain/raidRoomClient';
import { createRaidRoomRpcTransport, type RaidRoomRpcAuthorities, type RaidRoomRpcClient } from '../../../domain/raidRoomRpcTransport';
import RaidRoomBrowser, { type RaidRoomBrowserProps } from './RaidRoomBrowser';

export interface RaidRoomConnectedBrowserProps extends Omit<RaidRoomBrowserProps, 'controller'> {
  rpcClient: RaidRoomRpcClient;
  authorities?: RaidRoomRpcAuthorities;
}

/** 接続元の認証client・画面遷移・全体操作blockを受け取る。既存GameContextを変更しない。 */
export default function RaidRoomConnectedBrowser({ rpcClient, authorities, ...browserProps }: RaidRoomConnectedBrowserProps) {
  const enableParticipation = authorities?.enableParticipation;
  const enableCreation = authorities?.enableCreation;
  const getRewards = authorities?.getRewards;
  const joinRoom = authorities?.joinRoom;
  const connection = useMemo(() => ({
    controller: createRaidRoomController(createRaidRoomRpcTransport(rpcClient, { getRewards, joinRoom, enableCreation, enableParticipation })),
    mounts: 0,
  }), [rpcClient, getRewards, joinRoom, enableCreation, enableParticipation]);
  useEffect(() => {
    connection.mounts++;
    return () => {
      connection.mounts--;
      // StrictModeのeffect再接続では生存するcontrollerをdisposeしない。
      queueMicrotask(() => { if (connection.mounts === 0) connection.controller.dispose(); });
    };
  }, [connection]);
  return <RaidRoomBrowser {...browserProps} controller={connection.controller} />;
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RaidRoomRpcClient } from '@/domain/raidRoomRpcTransport';
import type { RaidTopData } from '@/domain/raidTop';
import { createRaidTopRpcLoader, millisecondsUntilNextRaidJstDay } from '@/domain/raidTopRpc';
import { unavailableRaidTopData, parseRaidTopSnapshot, type RaidTopLoader } from '@/domain/raidTopData';

interface UseRaidTopOptions {
  readonly rpcClient: RaidRoomRpcClient;
  readonly userId: string | null | undefined;
  readonly refreshRevision: number | undefined;
  readonly enabled: boolean;
  readonly canCreate: boolean;
  /** 省略時は認証済み一括RPC。ローカルMock注入を維持する。 */
  readonly loadTop?: RaidTopLoader;
}

export function useRaidTop({ rpcClient, userId, refreshRevision, enabled, canCreate, loadTop }: UseRaidTopOptions): { data: RaidTopData; refresh: () => void } {
  const [revision, setRevision] = useState(0);
  const loader = useMemo(() => loadTop ?? createRaidTopRpcLoader(rpcClient), [loadTop, rpcClient]);
  const request = useMemo(() => ({ rpcClient, userId, refreshRevision, enabled, loadTop: loader, revision }), [rpcClient, userId, refreshRevision, enabled, loader, revision]);
  const [snapshot, setSnapshot] = useState<{ request: typeof request; data: Omit<RaidTopData, 'canCreate'> } | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!request.enabled || !request.userId || !request.loadTop) return;
    let cancelled = false;
    void Promise.resolve().then(request.loadTop).then(parseRaidTopSnapshot).then((data) => {
      if (!cancelled) setSnapshot({ request, data });
    }).catch(() => {
      if (!cancelled) setSnapshot({ request, data: { participating: { status: 'error' }, rescues: { status: 'error' }, dailyTargets: { status: 'error' } } });
    });
    return () => { cancelled = true; };
  }, [request]);

  useEffect(() => {
    if (!enabled || !userId) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { timer = setTimeout(() => { refresh(); schedule(); }, millisecondsUntilNextRaidJstDay(Date.now())); };
    const resume = () => { if (document.visibilityState === 'visible') refresh(); };
    schedule();
    document.addEventListener('visibilitychange', resume);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', resume); };
  }, [enabled, userId, refresh]);

  // 認証なし/無効時は要求しない。全ページ/カード別取得は使わない。
  if (!enabled || !userId) return { data: unavailableRaidTopData(canCreate), refresh };
  const data: RaidTopData = snapshot?.request === request
    ? { ...snapshot.data, canCreate }
    : { participating: { status: 'loading' }, rescues: { status: 'loading' }, dailyTargets: { status: 'loading' }, canCreate };
  return { data, refresh };
}

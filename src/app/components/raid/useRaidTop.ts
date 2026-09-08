'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RaidRoomRpcClient } from '@/domain/raidRoomRpcTransport';
import type { RaidTopData } from '@/domain/raidTop';
import { unavailableRaidTopData, parseRaidTopSnapshot, type RaidTopLoader } from '@/domain/raidTopData';

interface UseRaidTopOptions {
  readonly rpcClient: RaidRoomRpcClient;
  readonly userId: string | null | undefined;
  readonly refreshRevision: number | undefined;
  readonly enabled: boolean;
  readonly canCreate: boolean;
  /** ローカルMockまたは将来の認証済み一括参照。未実装RPCを本番で呼ばない。 */
  readonly loadTop?: RaidTopLoader;
}

export function useRaidTop({ rpcClient, userId, refreshRevision, enabled, canCreate, loadTop }: UseRaidTopOptions): { data: RaidTopData; refresh: () => void } {
  const [revision, setRevision] = useState(0);
  const request = useMemo(() => ({ rpcClient, userId, refreshRevision, enabled, loadTop, revision }), [rpcClient, userId, refreshRevision, enabled, loadTop, revision]);
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

  // SQL250/252: 本人参加テーブルは直接参照不可。全体一覧＋カード別取得で代替しない。
  if (!enabled || !userId || !loadTop) return { data: unavailableRaidTopData(canCreate), refresh };
  const data: RaidTopData = snapshot?.request === request
    ? { ...snapshot.data, canCreate }
    : { participating: { status: 'loading' }, rescues: { status: 'loading' }, dailyTargets: { status: 'loading' }, canCreate };
  return { data, refresh };
}

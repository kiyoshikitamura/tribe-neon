'use client';
import { useEffect, useMemo, useState } from 'react';
import type { RaidRoomResource } from '@/domain/raidRoomClient';
/** Hides previous-user/page data immediately and ignores superseded responses. */
export function useRaidPageResource<T>(key: string | null, loader: (() => Promise<T>) | undefined): RaidRoomResource<T> {
  const request = useMemo(() => ({ key, loader }), [key, loader]);
  const [state, setState] = useState<{ request: typeof request; data: T | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!request.key || !request.loader) return;
    let active = true;
    void request.loader().then(data => { if (active) setState({ request, data, error: false }); }).catch(() => { if (active) setState({ request, data: null, error: true }); });
    return () => { active = false; };
  }, [request]);
  if (!key || !loader) return { status: 'idle', data: null, error: null };
  if (state?.request !== request) return { status: 'loading', data: null, error: null };
  return state.error ? { status: 'error', data: null, error: '表示情報を取得できませんでした' } : { status: 'success', data: state.data, error: null };
}

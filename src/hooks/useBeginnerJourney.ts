import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '@/utils/supabase';
import type { BeginnerJourney } from '@/domain/mission/beginnerJourney';
/** サーバー投影。更新中も同一ownerの表示を維持し、重複更新は末尾1回へまとめる。 */
export function useBeginnerJourney(owner: string | undefined, enabled: boolean, revision: unknown) {
  const [state, setState] = useState<{ owner: string; journey: BeginnerJourney } | null>(null);
  const current = useRef(owner);
  useLayoutEffect(() => { current.current = owner; }, [owner]);
  const serial = useRef(0);
  const pending = useRef<{ owner: string; promise: Promise<boolean> } | null>(null);
  const refreshBeginnerJourney = useCallback((): Promise<boolean> => {
    ++serial.current;
    if (!owner || !enabled) { setState(null); return Promise.resolve(false); }
    if (pending.current?.owner === owner) return pending.current.promise;
    const entry = { owner, promise: Promise.resolve(false) };
    entry.promise = (async () => {
      try {
        while (current.current === owner) {
          const request = serial.current;
          let data: any, error: any;
          try { ({ data, error } = await supabase.rpc('get_beginner_mission_journey')); }
          catch (failure) { error = failure; }
          if (current.current !== owner) return false;
          if (request !== serial.current) continue;
          if (error || !data?.facts || !Array.isArray(data?.missions)) { setState(null); return false; }
          setState({ owner, journey: data as BeginnerJourney });
          return true;
        }
        return false;
      } finally { if (pending.current === entry) pending.current = null; }
    })();
    pending.current = entry;
    return entry.promise;
  }, [owner, enabled]);
  useEffect(() => { void refreshBeginnerJourney(); }, [refreshBeginnerJourney, revision]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') void refreshBeginnerJourney(); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [refreshBeginnerJourney]);
  return { beginnerJourney: enabled && state && state.owner === owner ? state.journey : null, refreshBeginnerJourney };
}

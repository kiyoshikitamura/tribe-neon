import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/utils/supabase';
import type { BeginnerJourney } from '@/domain/mission/beginnerJourney';
/** サーバー投影のみ保持。ブラウザに達成履歴を作らない。 */
export function useBeginnerJourney(owner: string | undefined, enabled: boolean, revision: unknown) {
  const [state, setState] = useState<{ owner: string; journey: BeginnerJourney } | null>(null);
  const current = useRef(owner);
  current.current = owner;
  const serial = useRef(0);
  const refreshBeginnerJourney = useCallback(async () => {
    const request = ++serial.current;
    setState(null);
    if (!owner || !enabled) { setState(null); return false; }
    let response;
    try { response = await supabase.rpc('get_beginner_mission_journey'); }
    catch {
      if (current.current === owner && request === serial.current) setState(null);
      return false;
    }
    const { data, error } = response;
    if (current.current !== owner || request !== serial.current) return false;
    if (error || !data?.facts || !Array.isArray(data?.missions)) { setState(null); return false; }
    setState({ owner, journey: data as BeginnerJourney });
    return true;
  }, [owner, enabled]);
  useEffect(() => { void refreshBeginnerJourney(); }, [refreshBeginnerJourney, revision]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') void refreshBeginnerJourney(); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [refreshBeginnerJourney]);
  return { beginnerJourney: enabled && state && state.owner === owner ? state.journey : null, refreshBeginnerJourney };
}

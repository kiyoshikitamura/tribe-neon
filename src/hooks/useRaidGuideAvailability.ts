import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { createRaidRoomRpcTransport } from '@/domain/raidRoomRpcTransport';
import type { RaidRoomActivityTracker } from '@/domain/raidRoomActivitySync';
import { createRaidTopRpcLoader, millisecondsUntilNextRaidJstDay } from '@/domain/raidTopRpc';
import { loadRaidGuideAvailability, type RaidGuideAvailability } from '@/domain/raidGuideAvailability';

/** Home/Missionで、表示中のRaidと同じ一覧を確認する。参加Factは変更しない。 */
export function useRaidGuideAvailability(owner: string | undefined, enabled: boolean,
  tracker: RaidRoomActivityTracker, activityRevision: boolean): RaidGuideAvailability {
  const [result, setResult] = useState<{ owner: string; availability: RaidGuideAvailability } | null>(null);
  useEffect(() => {
    if (!owner || !enabled) return;
    let cancelled = false;
    let revision = 0;
    const check = async () => {
      const current = ++revision;
      setResult(null);
      const availability = await loadRaidGuideAvailability({
        roomEnabled: process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED === 'true',
        client: supabase,
        loadTop: createRaidTopRpcLoader(supabase),
        listRooms: () => tracker.observeTransport(createRaidRoomRpcTransport(supabase)).listRooms(),
      });
      if (!cancelled && current === revision) setResult({ owner, availability });
    };
    void check();
    const visible = () => { if (document.visibilityState === 'visible') void check(); };
    let dayTimer: ReturnType<typeof setTimeout>;
    const scheduleDay = () => { dayTimer = setTimeout(() => { void check(); scheduleDay(); }, millisecondsUntilNextRaidJstDay(Date.now())); };
    scheduleDay();
    document.addEventListener('visibilitychange', visible);
    return () => { cancelled = true; clearTimeout(dayTimer); document.removeEventListener('visibilitychange', visible); };
  }, [owner, enabled, tracker, activityRevision]);
  return enabled && owner && result?.owner === owner ? result.availability : 'unknown';
}

"use client";
import { useCallback, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { supabase } from '@/utils/supabase';
import { loadRaidRescueCards } from '@/domain/raidPages';
import { useRaidPageResource } from './useRaidPageResource';

/** One bounded request per visible feed; never fetch a room/profile per card. */
export function useRaidRescueCards(values: readonly unknown[], enabled: boolean) {
  const { session, userGuildMember } = useGame();
  const idsKey = JSON.stringify([...new Set(values.filter((value): value is string => typeof value === 'string' && !!value.trim()))].slice(-50).sort());
  const ids: string[] = useMemo(() => JSON.parse(idsKey), [idsKey]);
  const loader = useCallback(() => loadRaidRescueCards(supabase, ids), [ids]);
  // A new session or Guild must hide the previous projection before an effect runs.
  const key = enabled && process.env.NEXT_PUBLIC_RAID_ROOM_UI_ENABLED === 'true' && session?.user?.id && ids.length
    ? JSON.stringify([session.user.id, session.access_token, userGuildMember?.guild_id, ids]) : null;
  const resource = useRaidPageResource(key, loader);
  const byId = new Map((resource.data ?? []).flatMap(entry => entry.rescue.status === 'available' ? [[entry.rescue.value.rescueId, entry] as const] : []));
  return { byId, status: resource.status, statusFor: (id: unknown) => typeof id === 'string' && ids.includes(id) ? resource.status : 'idle' as const };
}

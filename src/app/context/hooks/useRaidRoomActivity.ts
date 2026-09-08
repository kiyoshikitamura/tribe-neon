"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRaidRoomActivityTracker, type RaidRoomActivityTracker } from '../../../domain/raidRoomActivitySync';

export function useRaidRoomActivity(userId: string | undefined, enabled: boolean) {
  const current = useRef<RaidRoomActivityTracker | null>(null);
  const tracker = useMemo(() => {
    const next = createRaidRoomActivityTracker(() => current.current === next && enabled && !!userId);
    return next;
  }, [userId, enabled]);
  current.current = tracker;
  const activeUntil = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot, tracker.getSnapshot);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!enabled || !userId || activeUntil <= Date.now()) return;
    const timer = setTimeout(() => tick(value => value + 1), Math.min(2_147_483_647, activeUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [activeUntil, enabled, userId]);
  return { tracker, isActive: enabled && !!userId && activeUntil > Date.now() };
}

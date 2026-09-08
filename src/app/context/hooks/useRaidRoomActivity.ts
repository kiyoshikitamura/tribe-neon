"use client";

import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createRaidRoomActivityTracker } from '../../../domain/raidRoomActivitySync';

export function useRaidRoomActivity(userId: string | undefined, enabled: boolean) {
  const lifecycle = useMemo(() => {
    let active = false;
    return {
      tracker: createRaidRoomActivityTracker(() => active && enabled && !!userId),
      activate: () => { active = true; },
      deactivate: () => { active = false; },
    };
  }, [userId, enabled]);
  useLayoutEffect(() => {
    lifecycle.activate();
    return lifecycle.deactivate;
  }, [lifecycle]);
  const tracker = lifecycle.tracker;
  const activeUntil = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot, tracker.getSnapshot);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!enabled || !userId || activeUntil <= Date.now()) return;
    const timer = setTimeout(() => tick(value => value + 1), Math.min(2_147_483_647, activeUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [activeUntil, enabled, userId]);
  return { tracker, isActive: enabled && !!userId && activeUntil > Date.now() };
}

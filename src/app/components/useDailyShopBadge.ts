"use client";

import { useEffect, useState } from "react";

const seenDays = new Map<string, string>();
const DAY_MS = 86400000;
const JST_OFFSET_MS = 9 * 3600000;
export const shopBadgeDay = (now: number) => new Date(now + JST_OFFSET_MS).toISOString().slice(0, 10);
export const nextShopBadgeDayDelay = (now: number) => DAY_MS - ((now + JST_OFFSET_MS) % DAY_MS) + 50;

export function useDailyShopBadge(userId: string | undefined, shopOpen: boolean, activeTab: string) {
  const [badge, setBadge] = useState({ userId: "", visible: false });
  useEffect(() => {
    if (!userId || !shopOpen) return;
    const key = `tribe-neon:shop-visited:${userId}`;
    let timer: number;
    const refresh = () => {
      window.clearTimeout(timer);
      const now = Date.now();
      const today = shopBadgeDay(now);
      let seen = seenDays.get(key);
      try { seen = window.localStorage.getItem(key) || seen; } catch { /* Retain session state if storage is unavailable. */ }
      if (activeTab === "shop" && document.visibilityState !== "hidden") {
        seen = today;
        seenDays.set(key, today);
        try { window.localStorage.setItem(key, today); } catch { /* The in-memory visit still dismisses the badge. */ }
      }
      setBadge({ userId, visible: seen !== today });
      timer = window.setTimeout(refresh, nextShopBadgeDayDelay(now));
    };
    const onStorage = (event: StorageEvent) => { if (event.key === key) refresh(); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [userId, shopOpen, activeTab]);
  return Boolean(userId && shopOpen && activeTab !== "shop" && badge.userId === userId && badge.visible);
}

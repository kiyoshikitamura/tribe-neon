import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/utils/supabase";

type News = { id: string | number; title?: string; content?: string };
type Seen = Record<string, string>;
const version = (news: News) => JSON.stringify([news.title || "", news.content || ""]);
function readSeen(key: string): Seen {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

// Read state is retained on this device per account, without KPI/DB writes.
export function useNewsBadges(userId: string | undefined) {
  const [newsState, setNewsState] = useState<{ userId?: string; news: News[] }>({ news: [] });
  const [seenState, setSeenState] = useState<{ userId?: string; seen: Seen }>({ seen: {} });
  const storageKey = userId ? `tribe-neon:news-read:${userId}` : null;
  useEffect(() => {
    if (!storageKey || !userId) return;
    const read = () => setSeenState({ userId, seen: readSeen(storageKey) });
    read();
    const sync = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) read(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey, userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let running = false;
    const refresh = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const { data, error } = await supabase.from("news").select("id,title,content").order("created_at", { ascending: false });
        if (!cancelled && !error && data) setNewsState({ userId, news: data });
      } catch { /* Keep the last successful projection during connection failures. */ }
      finally { running = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [userId]);

  const markNewsRead = useCallback((item: News) => {
    if (!userId || !storageKey) return;
    const seen = { ...(seenState.userId === userId ? seenState.seen : {}), ...readSeen(storageKey), [String(item.id)]: version(item) };
    try { localStorage.setItem(storageKey, JSON.stringify(seen)); } catch { /* In-memory fallback. */ }
    setSeenState({ userId, seen });
  }, [storageKey, userId, seenState]);
  const unreadNewsCount = useMemo(() => userId && seenState.userId === userId && newsState.userId === userId
    ? newsState.news.filter(item => seenState.seen[String(item.id)] !== version(item)).length : 0, [newsState, seenState, userId]);
  return { unreadNewsCount, markNewsRead };
}

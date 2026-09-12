import { useEffect, useState } from "react";
import type { MissionAvailability } from "@/domain/mission/availability";
export function useMissionClock(missions: MissionAvailability[]) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { setNow(Date.now()); }, [missions]);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const deadlines = missions.flatMap(m => [m.eventClaimEndAt, m.eventProgressEndAt]).filter(Boolean).map(v => Date.parse(v!)).filter(v => Number.isFinite(v) && v > Date.now());
    const timer = deadlines.length ? window.setTimeout(refresh, Math.min(2147483647, Math.max(1, Math.min(...deadlines) - Date.now() + 1))) : null;
    document.addEventListener("visibilitychange", refresh);
    return () => { if (timer !== null) window.clearTimeout(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [missions, now]);
  return now;
}

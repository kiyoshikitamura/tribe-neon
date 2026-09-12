export type MissionAvailability = { status?: string; eventClaimEndAt?: string | null; eventProgressEndAt?: string | null; eventProgressOpen?: boolean };
export function missionClaimExpired(mission: MissionAvailability, now: number): boolean {
  if (!mission.eventClaimEndAt) return false;
  const deadline = Date.parse(mission.eventClaimEndAt);
  return !Number.isFinite(deadline) || deadline <= now;
}
export function canClaimMission(mission: MissionAvailability, now = Date.now()): boolean {
  return mission.status === "CLEAR" && !missionClaimExpired(mission, now);
}
export function missionProgressEnded(mission: MissionAvailability, now: number): boolean {
  return mission.eventProgressOpen === false || Boolean(mission.eventProgressEndAt && Date.parse(mission.eventProgressEndAt) <= now);
}
export async function reconcileMissionClaim<T>(request: () => Promise<T>, refresh: () => Promise<void>, isCurrent: () => boolean): Promise<T> {
  let result: T;
  try { result = await request(); }
  catch (error) {
    if (isCurrent()) { try { await refresh(); } catch { /* Preserve the original claim error. */ } }
    throw error;
  }
  if (isCurrent()) await refresh();
  return result;
}

export function missionEventPriority(mission: MissionAvailability, now: number): number {
  if (!missionProgressEnded(mission, now) && !missionClaimExpired(mission, now)) return 0;
  if (canClaimMission(mission, now)) return 1;
  return 2;
}
export function needsMissionGuild(mission: { ctaTab?: string; ctaAction?: string; triggerType?: string }): boolean {
  return mission.ctaTab === "guild" || mission.ctaAction === "guild_chat" || String(mission.triggerType || "").startsWith("GUILD");
}

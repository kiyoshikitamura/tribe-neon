export type QuestProgress = {
  id: string; status: string; secondsLeft?: number; has_battle_event?: boolean;
  battle_resolved?: boolean; started_at?: string;
};
export function questProgressState(patrol: QuestProgress): 'REWARD' | 'BATTLE' | 'WAITING' | 'UNKNOWN' {
  if (patrol.status === 'COMPLETED') return 'UNKNOWN';
  if (!Number.isFinite(patrol.secondsLeft)) return 'UNKNOWN';
  if (Number(patrol.secondsLeft) > 0) return 'WAITING';
  if (patrol.has_battle_event === true && patrol.battle_resolved === false) return 'BATTLE';
  if (patrol.battle_resolved === true || patrol.has_battle_event === false) return 'REWARD';
  return 'UNKNOWN';
}
export function sortQuestProgress<T extends QuestProgress>(patrols: T[]): T[] {
  const priority = { REWARD: 0, BATTLE: 1, WAITING: 2, UNKNOWN: 3 };
  return patrols.filter(p => p.status !== 'COMPLETED').slice().sort((a, b) =>
    priority[questProgressState(a)] - priority[questProgressState(b)]
    || (Date.parse(a.started_at || '') || 0) - (Date.parse(b.started_at || '') || 0)
    || a.id.localeCompare(b.id));
}

export type QuestProgress = {
  id: string; status: string; secondsLeft?: number; has_battle_event?: boolean;
  battle_resolved?: boolean; started_at?: string; progressionKind?: string; progression_kind?: string; battle_result?: string | null;
};
export function questProgressState(patrol: QuestProgress): 'REWARD' | 'BATTLE' | 'WAITING' | 'UNKNOWN' {
  if (patrol.status === 'COMPLETED' || patrol.status === 'MIGRATED') return 'UNKNOWN';
  if (!Number.isFinite(patrol.secondsLeft)) return 'UNKNOWN';
  if (Number(patrol.secondsLeft) > 0) return 'WAITING';
  if ((patrol.progressionKind || patrol.progression_kind) === 'FIRST_CLEAR' && patrol.battle_result === 'DEFEAT') return 'BATTLE';
  if (patrol.has_battle_event === true && patrol.battle_resolved === false) return 'BATTLE';
  if (patrol.battle_resolved === true || patrol.has_battle_event === false) return 'REWARD';
  return 'UNKNOWN';
}
export function sortQuestProgress<T extends QuestProgress>(patrols: T[]): T[] {
  const priority = { REWARD: 0, BATTLE: 1, WAITING: 2, UNKNOWN: 3 };
  return patrols.filter(p => p.status !== 'COMPLETED' && p.status !== 'MIGRATED').slice().sort((a, b) =>
    priority[questProgressState(a)] - priority[questProgressState(b)]
    || (Date.parse(a.started_at || '') || 0) - (Date.parse(b.started_at || '') || 0)
    || a.id.localeCompare(b.id));
}

/** Town entry always starts at EASY, independent of course order or prior clears. */
export function initialQuestCourseId(courses: { id: string; town_id: string; level_type: string }[], townId: string): string {
  return courses.find(course => course.town_id === townId && course.level_type === 'EASY')?.id || '';
}

/** Difficulty display order never depends on the database response order. */
export function questCoursesForTown<T extends { town_id: string; level_type: string }>(courses: T[], townId: string): T[] {
  const order: Record<string, number> = { EASY: 0, NORMAL: 1, HARD: 2 };
  return courses.filter(course => course.town_id === townId)
    .sort((a, b) => (order[a.level_type] ?? 3) - (order[b.level_type] ?? 3));
}

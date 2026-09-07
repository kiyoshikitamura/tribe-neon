export type TutorialSubject = { subject_id: string; source_user_id: string | null };
export type TutorialCompletion = { subject_id: string; completed_at: string };
export const TUTORIAL_UNION_AUTHORITY = {
  authority: "tutorial_completion_union_v1",
  authority_label: "統合計測（既存完了＋MyPage・重複除外）",
};

/** Map user milestones through the existing subject relation; keep the earliest valid evidence. */
export function unionTutorialCompletions(
  subjects: TutorialSubject[],
  facts: TutorialCompletion[],
  milestones: { user_id: string; first_occurred_at: string }[],
  mypage: TutorialCompletion[],
  isExcluded: (subjectId: string, at: string) => boolean = () => false,
): TutorialCompletion[] {
  const bySubject = new Map(subjects.map((subject) => [subject.subject_id, subject]));
  const byUser = new Map(subjects.filter((subject) => subject.source_user_id)
    .map((subject) => [subject.source_user_id, subject]));
  const completed = new Map<string, TutorialCompletion>();
  const add = (row: TutorialCompletion) => {
    const subject = bySubject.get(row.subject_id);
    if (!subject || !Number.isFinite(Date.parse(row.completed_at)) || isExcluded(row.subject_id, row.completed_at)) return;
    // A detached subject still retains its historical identity. Never dedupe by journey.
    const key = subject.source_user_id ? `user:${subject.source_user_id}` : `subject:${subject.subject_id}`;
    const previous = completed.get(key);
    if (!previous || Date.parse(row.completed_at) < Date.parse(previous.completed_at)) completed.set(key, row);
  };
  facts.forEach(add);
  for (const milestone of milestones) {
    const subject = byUser.get(milestone.user_id);
    if (subject) add({ subject_id: subject.subject_id, completed_at: milestone.first_occurred_at });
  }
  mypage.forEach(add);
  return [...completed.values()];
}

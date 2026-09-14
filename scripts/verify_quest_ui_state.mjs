import assert from 'node:assert/strict';
import { questProgressState, sortQuestProgress, initialQuestCourseId } from '../src/domain/questPresentationState.ts';
const p = (id, overrides) => ({ id, status: 'ONGOING', secondsLeft: 0, has_battle_event: true, battle_resolved: false, ...overrides });
assert.equal(questProgressState(p('fight')), 'BATTLE');
assert.equal(questProgressState(p('claim', { battle_resolved: true })), 'REWARD');
assert.equal(questProgressState(p('missing', { has_battle_event: undefined, battle_resolved: undefined })), 'UNKNOWN');
assert.equal(questProgressState(p('clock', { secondsLeft: undefined })), 'UNKNOWN');
assert.equal(questProgressState(p('wait', { secondsLeft: 1 })), 'WAITING');
const rows = [p('wait', { secondsLeft: 60 }), p('fight'), p('new', { battle_resolved: true, started_at: '2026-09-11T10:00:00Z' }), p('old', { battle_resolved: true, started_at: '2026-09-11T09:00:00Z' }), p('unknown', { secondsLeft: undefined }), p('done', { status: 'COMPLETED', battle_resolved: true })];
assert.deepEqual(sortQuestProgress(rows).map(p => p.id), ['old', 'new', 'fight', 'wait', 'unknown']);
assert.equal(rows[0].id, 'wait', 'sorting must not mutate shared context');
assert.deepEqual(sortQuestProgress([]), []);
console.log('Quest UI state boundaries: PASS');

const courses = [
  {id:'other_easy', town_id:'shibuya', level_type:'EASY'},
  {id:'hard', town_id:'shinjuku', level_type:'HARD'},
  {id:'easy', town_id:'shinjuku', level_type:'EASY', is_first_cleared:true},
];
assert.equal(initialQuestCourseId(courses, 'shinjuku'), 'easy');
assert.equal(initialQuestCourseId(courses, 'shibuya'), 'other_easy');
assert.equal(initialQuestCourseId(courses, 'missing'), '');
assert.equal(initialQuestCourseId([], 'shinjuku'), '');

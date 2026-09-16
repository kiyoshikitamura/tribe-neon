// Approved after Preview playtest: only Shinjuku EASY becomes an introductory battle.
// Run after the original boss-master generator; source workbook extraction stays immutable.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const source = JSON.parse(fs.readFileSync(new URL('docs/product/quest-balance-20260917/source-extracted.json', root)));
const destination = new URL('src/domain/gameplay/canonical/data/quest_bosses_20260917.json', root);
const master = JSON.parse(fs.readFileSync(destination));
const stage = master.stages.find(s => s.questId === 'q_shinjuku_1');
assert.equal(stage.members.length, 5);
for (const [index, member] of stage.members.entries()) {
  const original = source.boss_members105.find(m => m.Stage === 1 && m.Slot === index + 1);
  assert.equal(member.characterId, original['Character ID']);
  for (const stat of ['hp', 'atk', 'def']) member.stats[stat] = Math.round(original[stat.toUpperCase()] * 0.6 / 10) * 10;
}
stage.recommendedPower = stage.members.reduce((sum, m) => sum + m.stats.hp + m.stats.atk + m.stats.def, 0);
master.overrides = [{revision:'SHINJUKU_EASY_INTRO_R1',questId:stage.questId,reason:'実機敗北を受けたユーザー指示。新宿初級だけ弱体化。',hpAtkDefMultiplier:0.6,roundingUnit:10}];
fs.writeFileSync(destination, JSON.stringify(master, null, 2) + '\n');
const quote = s => "'" + s.replaceAll("'", "''") + "'";
const sql = `-- 実機受入調整: 新宿初級のみ。過去のreplay・報酬・クリア記録は変更しない。
begin;
update public.canonical_quest_master
set progression_boss_members=${quote(JSON.stringify(stage.members))}::jsonb,
    progression_recommended_power=${stage.recommendedPower}
where version='2026-08-30' and quest_id='q_shinjuku_1';

-- 初級で既に詰まっているユーザーにも次の挑戦から反映する。
-- 作成済みbattle_replay_sessionsは独立snapshotのまま保持するので、
-- PENDINGリプレイの再取得・RESOLVEDリプレイの再生結果は変わらない。
update public.user_patrols
set encounter_snapshot=public.quest_progression_enemy_snapshot_v1(encounter_snapshot,'q_shinjuku_1')
where progression_kind='FIRST_CLEAR'
  and coalesce(course_id,quest_id)='q_shinjuku_1'
  and status in ('ONGOING','CLAIMABLE')
  and battle_result is distinct from 'VICTORY';
commit;
`;
fs.writeFileSync(new URL('supabase/migrations/20260917001000_quest_shinjuku_easy_intro_adjustment.sql', root), sql);
console.log('Updated only q_shinjuku_1 HP/ATK/DEF: 60%; recommendedPower=' + stage.recommendedPower);

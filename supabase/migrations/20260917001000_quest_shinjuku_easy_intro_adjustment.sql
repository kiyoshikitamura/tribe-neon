-- 実機受入調整: 新宿初級のみ。過去のreplay・報酬・クリア記録は変更しない。
begin;
update public.canonical_quest_master
set progression_boss_members='[{"id":"enemy_q_shinjuku_1_1","characterId":"char_mio_01","name":"ミオ","team":"ENEMY","alignment":"ORDER","level":5,"awakeningLevel":0,"rarity":"SSR","stats":{"hp":5700,"atk":1430,"def":790,"spd":110,"luk":0},"equipment":[],"equippedSkillRefs":["SKILL_001"],"skills":[{"id":"SKILL_001","name":"ストリートパンチ","activationType":"ACTIVE","cooldown":3,"availableFromRound":1,"target":"ENEMY_SINGLE","effects":["DAMAGE 90% ATK"],"exclusiveCharacterId":null,"skillPlusVal":0}]},{"id":"enemy_q_shinjuku_1_2","characterId":"char_takuro_01","name":"タクロウ","team":"ENEMY","alignment":"EVIL","level":5,"awakeningLevel":0,"rarity":"SR","stats":{"hp":5180,"atk":1300,"def":720,"spd":108,"luk":0},"equipment":[],"equippedSkillRefs":["SKILL_009"],"skills":[{"id":"SKILL_009","name":"ドーピング注射","activationType":"ACTIVE","cooldown":3,"availableFromRound":1,"target":"SELF","effects":["ATK +15% / 2T"],"exclusiveCharacterId":null,"skillPlusVal":0}]},{"id":"enemy_q_shinjuku_1_3","characterId":"char_leon_01","name":"レオン","team":"ENEMY","alignment":"EVIL","level":5,"awakeningLevel":0,"rarity":"SR","stats":{"hp":5080,"atk":1270,"def":710,"spd":106,"luk":0},"equipment":[],"equippedSkillRefs":["SKILL_011"],"skills":[{"id":"SKILL_011","name":"チャージスラッシュ","activationType":"ACTIVE","cooldown":3,"availableFromRound":1,"target":"ENEMY_SINGLE","effects":["DAMAGE 130% ATK"],"exclusiveCharacterId":null,"skillPlusVal":0}]},{"id":"enemy_q_shinjuku_1_4","characterId":"char_jihoon_01","name":"ジフン","team":"ENEMY","alignment":"ORDER","level":5,"awakeningLevel":0,"rarity":"R","stats":{"hp":4980,"atk":1240,"def":690,"spd":104,"luk":0},"equipment":[],"equippedSkillRefs":["SKILL_017"],"skills":[{"id":"SKILL_017","name":"不屈の怒号","activationType":"ACTIVE","cooldown":3,"availableFromRound":2,"target":"ALLY_ALL","effects":["ATK +18% / 2T"],"exclusiveCharacterId":null,"skillPlusVal":0}]},{"id":"enemy_q_shinjuku_1_5","characterId":"char_kageyama_01","name":"カゲヤマ","team":"ENEMY","alignment":"ORDER","level":5,"awakeningLevel":0,"rarity":"SR","stats":{"hp":4980,"atk":1240,"def":690,"spd":102,"luk":0},"equipment":[],"equippedSkillRefs":["SKILL_008"],"skills":[{"id":"SKILL_008","name":"スマートスナイプ","activationType":"ACTIVE","cooldown":3,"availableFromRound":1,"target":"ENEMY_SINGLE","effects":["DAMAGE 100% ATK"],"exclusiveCharacterId":null,"skillPlusVal":0}]}]'::jsonb,
    progression_recommended_power=36000
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

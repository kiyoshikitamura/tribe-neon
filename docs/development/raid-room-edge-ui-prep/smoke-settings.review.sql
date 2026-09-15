-- Preview設定確認用。DB接続・適用・有効化は行わない。
-- 対象候補 projectRef: sufvuqdnqohpfzkwxohq / version: 1
-- projectRefは識別用注記であり接続先を検証しない。実行者が接続先を照合する。
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';
SET LOCAL standard_conforming_strings = on;
LOCK TABLE public.raid_room_difficulty_rules, public.raid_room_rescue_reward_rules, public.raid_room_clear_reward_rules, public.raid_room_rescue_reward_items, public.raid_room_clear_reward_items IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN IF (SELECT count(*) FROM public.raid_room_difficulty_rules) <> 4 OR (SELECT count(*) FROM public.raid_room_rescue_reward_rules) <> 4 OR (SELECT count(*) FROM public.raid_room_clear_reward_rules) <> 4 THEN RAISE EXCEPTION 'Apply Raid migrations through 262 first'; END IF; END $$;
UPDATE public.raid_room_difficulty_rules SET rescue_min_battles=2, rescue_min_contribution_damage=16000, rule_version=1 WHERE difficulty=E'beginner';
UPDATE public.raid_room_rescue_reward_rules SET enabled=false, reward_version=1 WHERE difficulty=E'beginner';
UPDATE public.raid_room_clear_reward_rules SET enabled=false, minimum_contribution_damage=0, rule_version=1 WHERE difficulty=E'beginner';
DELETE FROM public.raid_room_rescue_reward_items WHERE difficulty=E'beginner';
INSERT INTO public.raid_room_rescue_reward_items(difficulty,item_id,quantity) VALUES (E'beginner',E'CHAR_EXP_S',1);
DELETE FROM public.raid_room_clear_reward_items WHERE difficulty=E'beginner';
INSERT INTO public.raid_room_clear_reward_items(difficulty,item_id,quantity) VALUES (E'beginner',E'EQUIP_EXP_S',1);
UPDATE public.raid_room_difficulty_rules SET rescue_min_battles=2, rescue_min_contribution_damage=68000, rule_version=1 WHERE difficulty=E'intermediate';
UPDATE public.raid_room_rescue_reward_rules SET enabled=false, reward_version=1 WHERE difficulty=E'intermediate';
UPDATE public.raid_room_clear_reward_rules SET enabled=false, minimum_contribution_damage=0, rule_version=1 WHERE difficulty=E'intermediate';
DELETE FROM public.raid_room_rescue_reward_items WHERE difficulty=E'intermediate';
INSERT INTO public.raid_room_rescue_reward_items(difficulty,item_id,quantity) VALUES (E'intermediate',E'CHAR_EXP_S',1);
DELETE FROM public.raid_room_clear_reward_items WHERE difficulty=E'intermediate';
INSERT INTO public.raid_room_clear_reward_items(difficulty,item_id,quantity) VALUES (E'intermediate',E'EQUIP_EXP_S',1);
UPDATE public.raid_room_difficulty_rules SET rescue_min_battles=3, rescue_min_contribution_damage=205000, rule_version=1 WHERE difficulty=E'advanced';
UPDATE public.raid_room_rescue_reward_rules SET enabled=false, reward_version=1 WHERE difficulty=E'advanced';
UPDATE public.raid_room_clear_reward_rules SET enabled=false, minimum_contribution_damage=0, rule_version=1 WHERE difficulty=E'advanced';
DELETE FROM public.raid_room_rescue_reward_items WHERE difficulty=E'advanced';
INSERT INTO public.raid_room_rescue_reward_items(difficulty,item_id,quantity) VALUES (E'advanced',E'CHAR_EXP_S',1);
DELETE FROM public.raid_room_clear_reward_items WHERE difficulty=E'advanced';
INSERT INTO public.raid_room_clear_reward_items(difficulty,item_id,quantity) VALUES (E'advanced',E'EQUIP_EXP_S',1);
UPDATE public.raid_room_difficulty_rules SET rescue_min_battles=4, rescue_min_contribution_damage=290000, rule_version=1 WHERE difficulty=E'expert';
UPDATE public.raid_room_rescue_reward_rules SET enabled=false, reward_version=1 WHERE difficulty=E'expert';
UPDATE public.raid_room_clear_reward_rules SET enabled=false, minimum_contribution_damage=0, rule_version=1 WHERE difficulty=E'expert';
DELETE FROM public.raid_room_rescue_reward_items WHERE difficulty=E'expert';
INSERT INTO public.raid_room_rescue_reward_items(difficulty,item_id,quantity) VALUES (E'expert',E'CHAR_EXP_S',1);
DELETE FROM public.raid_room_clear_reward_items WHERE difficulty=E'expert';
INSERT INTO public.raid_room_clear_reward_items(difficulty,item_id,quantity) VALUES (E'expert',E'EQUIP_EXP_S',1);
SELECT * FROM public.raid_room_difficulty_rules ORDER BY difficulty;
SELECT * FROM public.raid_room_rescue_reward_items ORDER BY difficulty,item_id;
SELECT * FROM public.raid_room_clear_reward_rules ORDER BY difficulty;
SELECT * FROM public.raid_room_clear_reward_items ORDER BY difficulty,item_id;
-- 確認用は常にROLLBACK。永続適用・報酬有効化・Room公開は別手順。
ROLLBACK;

begin; set local lock_timeout='2s'; set local statement_timeout='30s';
do $$ begin if exists(select 1 from deployment_audit_raid_v1.applied_changes where project_ref='sufvuqdnqohpfzkwxohq' and change_id='raid-preview-smoke-settings-v1') then raise exception 'ALREADY_APPLIED'; end if; end $$;
do $$ begin if exists(select 1 from raid_room_rescue_reward_items) or exists(select 1 from raid_room_clear_reward_items) then raise exception 'Existing reward items'; end if;
if (select count(distinct item_id) from canonical_item_master where item_id in ('CHAR_EXP_S','EQUIP_EXP_S') and is_production_enabled)<>2 then raise exception 'Item missing'; end if;
if exists(select 1 from raid_room_creation_settings where enabled) or exists(select 1 from raid_room_battle_settings where enabled) then raise exception 'Room already enabled'; end if; end $$;
-- Preview設定確認用。DB接続・適用・有効化は行わない。
-- 対象候補 projectRef: sufvuqdnqohpfzkwxohq / version: 1
-- projectRefは識別用注記であり接続先を検証しない。実行者が接続先を照合する。

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


do $$ begin if (select count(*) from raid_room_rescue_reward_items)<>4 or (select count(*) from raid_room_clear_reward_items)<>4 then raise exception 'Items incomplete'; end if; end $$;
insert into deployment_audit_raid_v1.applied_changes(project_ref,change_id,payload_sha256,source_commit,validation_commit,execution_id,operator_identity,approval_reference,baseline_sha256,postflight)
values('sufvuqdnqohpfzkwxohq','raid-preview-smoke-settings-v1','385bbeee117ff7848ef9764fca53b4fb77b12b11eb717387c8d9df825bc1c18c','375a0ad642a81e9db10a9379f03e5e5f77fb4562','99c534bb63a2659b5569d339b3ff51c49d398339','91f73695-73cb-4ccc-8932-95a9189e9ff8','Codex','User authorized Preview connection and smoke test 2026-09-08','909753e77a5d5916a61542a0d7e2afc2f098b096dfd9e5eec323d70e3860fee1','{"status":"PASS","scope":"raid-preview-smoke-settings-v1"}');
select change_id,payload_sha256,transaction_id from deployment_audit_raid_v1.applied_changes where change_id='raid-preview-smoke-settings-v1';
commit;

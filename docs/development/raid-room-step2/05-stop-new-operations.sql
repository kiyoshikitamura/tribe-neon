-- 障害時の前進復旧用。対象Previewを別途検証し、後続工程でレビューしてから使用。
-- 既定ROLLBACK。Room既存台帳・開始済みReplay・Present・Cronを削除しない。
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
update public.raid_room_creation_settings set enabled=false where singleton;
update public.raid_room_battle_settings set enabled=false where singleton;
update public.raid_room_rescue_settings set enabled=false where singleton;
-- 旧生成・新規開始も止める。旧開始済みのfinalizeは維持。
update public.raid_legacy_settings set enabled=false where singleton;
select 'creation' as setting,enabled from public.raid_room_creation_settings
union all select 'battle',enabled from public.raid_room_battle_settings
union all select 'rescue',enabled from public.raid_room_rescue_settings
union all select 'legacy',enabled from public.raid_legacy_settings;
rollback;
-- 報酬異常が確認された場合だけ、別transactionで該当difficultyの
-- raid_room_rescue_reward_rules / raid_room_clear_reward_rules.enabledをfalseにする。
-- 無関係な報酬の停止・消費RPの返却・発行台帳の削除は行わない。

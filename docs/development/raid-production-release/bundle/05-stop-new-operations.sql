\set ON_ERROR_STOP on
\if :{?raid_commit}
\else
\set raid_commit false
\endif
-- 障害時の前進復旧用。対象Productionを別途検証し、後続工程でレビューしてから使用。
-- 既定ROLLBACK。Room既存台帳・開始済みReplay・Present・Cronを削除しない。
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
update public.raid_room_creation_settings set enabled=false where singleton;
update public.raid_room_battle_settings set enabled=false where singleton;
update public.raid_room_rescue_settings set enabled=false where singleton;
-- 旧生成・新規開始も止める。旧開始済みのfinalizeは維持。
update public.raid_legacy_settings set enabled=false where singleton;
do $stop_verify$
begin
 if (select count(*) from public.raid_room_creation_settings where singleton and not enabled)<>1
 or (select count(*) from public.raid_room_battle_settings where singleton and not enabled)<>1
 or (select count(*) from public.raid_room_rescue_settings where singleton and not enabled)<>1
 or (select count(*) from public.raid_legacy_settings where singleton and not enabled)<>1 then
 raise exception 'stop failed: all four singleton settings must exist and be false';
 end if;
end $stop_verify$;
select 'creation' as setting,enabled from public.raid_room_creation_settings
union all select 'battle',enabled from public.raid_room_battle_settings
union all select 'rescue',enabled from public.raid_room_rescue_settings
union all select 'legacy',enabled from public.raid_legacy_settings;
\if :raid_commit
commit;
\else
rollback;
\endif
-- 報酬異常が確認された場合だけ、別transactionで該当difficultyの
-- raid_room_rescue_reward_rules / raid_room_clear_reward_rules.enabledをfalseにする。
-- 無関係な報酬の停止・消費RPの返却・発行台帳の削除は行わない。



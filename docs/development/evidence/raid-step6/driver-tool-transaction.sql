-- Parent apply_migration transaction owns COMMIT.
set local statement_timeout='60s';
set local lock_timeout='2s';
set local search_path=pg_catalog,public;
do $guard$ begin
if session_user<>'postgres' then raise exception 'ADMIN_REQUIRED'; end if;
if not pg_try_advisory_xact_lock(20260909,8175140) then raise exception 'RAID_STEP6_BUSY'; end if;
if to_regnamespace('private') is not null then raise exception 'PRIVATE_SCHEMA_DRIFT'; end if;
if exists(select 1 from supabase_migrations.schema_migrations where version in ('20260908175140','20260908175143','20260908181251','20260909023226')) then raise exception 'VERSION_ALREADY_PRESENT'; end if;
if not exists(select 1 from deployment_audit_raid_v1.applied_changes where project_ref='sufvuqdnqohpfzkwxohq' and change_id='raid-room-preview-375a0ad-delta-v1' and payload_sha256='adc3bccfc6345f5fd36dfcdd1d42bbba01531882437f61f50036365ed1d77ffb') then raise exception 'OLD_LEDGER_DRIFT'; end if;
if exists(select 1 from deployment_audit_raid_v1.applied_changes where change_id='raid-preview-step6-four-sql-v1') then raise exception 'ALREADY_APPLIED'; end if;
if to_regprocedure('public._issue_raid_room_clear_rewards_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public._issue_raid_room_clear_rewards_v1(uuid)')))<>'f0c8737188ddbd097ccaad607e0b15bc' then raise exception 'FUNCTION_DRIFT _issue_raid_room_clear_rewards_v1(uuid)'; end if;
if to_regprocedure('public._issue_raid_room_rescue_rewards_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public._issue_raid_room_rescue_rewards_v1(uuid)')))<>'0e9eed03e84ba4c3270d5072be258771' then raise exception 'FUNCTION_DRIFT _issue_raid_room_rescue_rewards_v1(uuid)'; end if;
if to_regprocedure('public._raid_room_add_member_v1(uuid,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public._raid_room_add_member_v1(uuid,uuid)')))<>'5831ccf6883c8a0daf50bd242359660d' then raise exception 'FUNCTION_DRIFT _raid_room_add_member_v1(uuid,uuid)'; end if;
if to_regprocedure('public._raid_room_clear_reward_progress_v1(uuid,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public._raid_room_clear_reward_progress_v1(uuid,uuid)')))<>'72b6ceb513fec4ccbb9c66215350852b' then raise exception 'FUNCTION_DRIFT _raid_room_clear_reward_progress_v1(uuid,uuid)'; end if;
if to_regprocedure('public._raid_room_power_gate_v1(text,bigint)') is null or md5(pg_get_functiondef(to_regprocedure('public._raid_room_power_gate_v1(text,bigint)')))<>'b0f471fc30ebafc55a8207d451a2f5ed' then raise exception 'FUNCTION_DRIFT _raid_room_power_gate_v1(text,bigint)'; end if;
if to_regprocedure('public._raid_room_register_v1(uuid,uuid,text)') is null or md5(pg_get_functiondef(to_regprocedure('public._raid_room_register_v1(uuid,uuid,text)')))<>'e5034819f20327d3c2d0ba520fbe3b0e' then raise exception 'FUNCTION_DRIFT _raid_room_register_v1(uuid,uuid,text)'; end if;
if to_regprocedure('public._raid_room_rescue_gate_v1(text,boolean,bigint,bigint,boolean)') is null or md5(pg_get_functiondef(to_regprocedure('public._raid_room_rescue_gate_v1(text,boolean,bigint,bigint,boolean)')))<>'fbee753b7d6128418f85c1077ef931bb' then raise exception 'FUNCTION_DRIFT _raid_room_rescue_gate_v1(text,boolean,bigint,bigint,boolean)'; end if;
if to_regprocedure('public._raid_room_rescue_reward_progress_v1(uuid,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public._raid_room_rescue_reward_progress_v1(uuid,uuid)')))<>'a1520722a55f5e3f272ecdbfeef55c53' then raise exception 'FUNCTION_DRIFT _raid_room_rescue_reward_progress_v1(uuid,uuid)'; end if;
if to_regprocedure('public.acknowledge_raid_room_battle_recovery_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.acknowledge_raid_room_battle_recovery_v1(uuid)')))<>'429f173150fb4b029be9c1b8ff55b7e5' then raise exception 'FUNCTION_DRIFT acknowledge_raid_room_battle_recovery_v1(uuid)'; end if;
if to_regprocedure('public.admin_respawn_raid_boss(text,integer,text)') is null or md5(pg_get_functiondef(to_regprocedure('public.admin_respawn_raid_boss(text,integer,text)')))<>'3a22d60e7a35ab3ef1b8703ded57d697' then raise exception 'FUNCTION_DRIFT admin_respawn_raid_boss(text,integer,text)'; end if;
if to_regprocedure('public.calculate_user_total_power(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.calculate_user_total_power(uuid)')))<>'ab6772b65f3e345778686bfd49322828' then raise exception 'FUNCTION_DRIFT calculate_user_total_power(uuid)'; end if;
if to_regprocedure('public.cancel_raid_room_battle_request_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.cancel_raid_room_battle_request_v1(uuid)')))<>'924093eb91aa77f10e954513cb6a0d38' then raise exception 'FUNCTION_DRIFT cancel_raid_room_battle_request_v1(uuid)'; end if;
if to_regprocedure('public.canonical_pvp_rating_delta(integer,integer,text)') is null or md5(pg_get_functiondef(to_regprocedure('public.canonical_pvp_rating_delta(integer,integer,text)')))<>'9072fc7fe6c9df578ed18b05135ef058' then raise exception 'FUNCTION_DRIFT canonical_pvp_rating_delta(integer,integer,text)'; end if;
if to_regprocedure('public.canonical_raid_rotation_pair(date)') is null or md5(pg_get_functiondef(to_regprocedure('public.canonical_raid_rotation_pair(date)')))<>'e817f2add5cb0a890b3c586950603372' then raise exception 'FUNCTION_DRIFT canonical_raid_rotation_pair(date)'; end if;
if to_regprocedure('public.complete_current_tutorial_formation()') is null or md5(pg_get_functiondef(to_regprocedure('public.complete_current_tutorial_formation()')))<>'de5936a052d2adfc88ab6a42732e9b7a' then raise exception 'FUNCTION_DRIFT complete_current_tutorial_formation()'; end if;
if to_regprocedure('public.consume_raid_attempt(uuid,text,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.consume_raid_attempt(uuid,text,integer)')))<>'811c883465c9b2873d94c5fcb6608077' then raise exception 'FUNCTION_DRIFT consume_raid_attempt(uuid,text,integer)'; end if;
if to_regprocedure('public.create_raid_room_v1(text,text,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.create_raid_room_v1(text,text,uuid)')))<>'911e837f85fa0bf8decedd7280b4ccd3' then raise exception 'FUNCTION_DRIFT create_raid_room_v1(text,text,uuid)'; end if;
if to_regprocedure('public.finalize_expired_raid_instance(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.finalize_expired_raid_instance(uuid)')))<>'f84b621d0b4276b568244a46bc4c6c1b' then raise exception 'FUNCTION_DRIFT finalize_expired_raid_instance(uuid)'; end if;
if to_regprocedure('public.finalize_expired_raid_room_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.finalize_expired_raid_room_v1(uuid)')))<>'ff5d1e9333122ba20adbf99fcdc944d2' then raise exception 'FUNCTION_DRIFT finalize_expired_raid_room_v1(uuid)'; end if;
if to_regprocedure('public.finalize_expired_raid_rooms_v1(integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.finalize_expired_raid_rooms_v1(integer)')))<>'be4bad717c6bc92feeb816559070b85f' then raise exception 'FUNCTION_DRIFT finalize_expired_raid_rooms_v1(integer)'; end if;
if to_regprocedure('public.finalize_raid_battle(uuid,jsonb)') is null or md5(pg_get_functiondef(to_regprocedure('public.finalize_raid_battle(uuid,jsonb)')))<>'3505d7f666cff2a2735a0c7318849e58' then raise exception 'FUNCTION_DRIFT finalize_raid_battle(uuid,jsonb)'; end if;
if to_regprocedure('public.finalize_raid_room_battle_v1(uuid,jsonb)') is null or md5(pg_get_functiondef(to_regprocedure('public.finalize_raid_room_battle_v1(uuid,jsonb)')))<>'8e248ea14f1a41cd7d912d8b8d2c2abd' then raise exception 'FUNCTION_DRIFT finalize_raid_room_battle_v1(uuid,jsonb)'; end if;
if to_regprocedure('public.finalize_raid_season_rewards(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.finalize_raid_season_rewards(uuid)')))<>'07208e963d6a3422690e7ff9d4384eb4' then raise exception 'FUNCTION_DRIFT finalize_raid_season_rewards(uuid)'; end if;
if to_regprocedure('public.get_active_raids()') is null or md5(pg_get_functiondef(to_regprocedure('public.get_active_raids()')))<>'80efa4eb79911431549284041df84f89' then raise exception 'FUNCTION_DRIFT get_active_raids()'; end if;
if to_regprocedure('public.get_current_raid_attempt_state()') is null or md5(pg_get_functiondef(to_regprocedure('public.get_current_raid_attempt_state()')))<>'3d709a09c6d662ffd83cd810d2205159' then raise exception 'FUNCTION_DRIFT get_current_raid_attempt_state()'; end if;
if to_regprocedure('public.get_current_raid_battle_rewards(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_current_raid_battle_rewards(uuid)')))<>'7ad2e0aab34e6de5129c35ba6094ae97' then raise exception 'FUNCTION_DRIFT get_current_raid_battle_rewards(uuid)'; end if;
if to_regprocedure('public.get_my_raid_contribution_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_my_raid_contribution_v1(uuid)')))<>'ce7b6fe32f6e76703159c69d8fc509f2' then raise exception 'FUNCTION_DRIFT get_my_raid_contribution_v1(uuid)'; end if;
if to_regprocedure('public.get_pvp_opponents_page(uuid,integer,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_pvp_opponents_page(uuid,integer,integer)')))<>'636f7e768a3a554ba2b4a7f02f4bf372' then raise exception 'FUNCTION_DRIFT get_pvp_opponents_page(uuid,integer,integer)'; end if;
if to_regprocedure('public.get_raid_battle_route_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_battle_route_v1(uuid)')))<>'eca1a99a2145ac014d48c20f3665ee2c' then raise exception 'FUNCTION_DRIFT get_raid_battle_route_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_rankings(uuid,integer,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_rankings(uuid,integer,integer)')))<>'67f56c075a0539c526b49b59054e27e6' then raise exception 'FUNCTION_DRIFT get_raid_rankings(uuid,integer,integer)'; end if;
if to_regprocedure('public.get_raid_rankings(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_rankings(uuid)')))<>'198b233a6ac618d5818029d6d67ffd02' then raise exception 'FUNCTION_DRIFT get_raid_rankings(uuid)'; end if;
if to_regprocedure('public.get_raid_room_battle_result_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_battle_result_v1(uuid)')))<>'5cdd2f59e8da4f9b3b61c1919482ff59' then raise exception 'FUNCTION_DRIFT get_raid_room_battle_result_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_battle_start_receipt_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_battle_start_receipt_v1(uuid)')))<>'7de2b6b5dd68b71c0ac6809d669c8b38' then raise exception 'FUNCTION_DRIFT get_raid_room_battle_start_receipt_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_briefing_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_briefing_v1(uuid)')))<>'30a7b66b02b5f44218bba5897fe82a94' then raise exception 'FUNCTION_DRIFT get_raid_room_briefing_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_clear_reward_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_clear_reward_v1(uuid)')))<>'c190d76e4b607d6abff9fe132cbc7a9a' then raise exception 'FUNCTION_DRIFT get_raid_room_clear_reward_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_participants_v1(uuid,integer,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_participants_v1(uuid,integer,integer)')))<>'a39135093bf37ad5a99f9d139096b818' then raise exception 'FUNCTION_DRIFT get_raid_room_participants_v1(uuid,integer,integer)'; end if;
if to_regprocedure('public.get_raid_room_rescue_reward_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_rescue_reward_v1(uuid)')))<>'617b44fbfdc899a55e146fdd2eb08dbf' then raise exception 'FUNCTION_DRIFT get_raid_room_rescue_reward_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_rescue_status_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_rescue_status_v1(uuid)')))<>'dfb9f6d2fb74a134a1181b6e7435a160' then raise exception 'FUNCTION_DRIFT get_raid_room_rescue_status_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_rescue_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_rescue_v1(uuid)')))<>'23bea9f29bb2a3b7d015abd457191b3c' then raise exception 'FUNCTION_DRIFT get_raid_room_rescue_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_v1(uuid)')))<>'483edc4a6ff97ecf2aab16ba953680e8' then raise exception 'FUNCTION_DRIFT get_raid_room_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_season_rankings(integer,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_season_rankings(integer,integer)')))<>'603e6abecc7c082498c04adbc821b003' then raise exception 'FUNCTION_DRIFT get_raid_season_rankings(integer,integer)'; end if;
if to_regprocedure('public.grant_canonical_raid_day_clear_reward(uuid,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.grant_canonical_raid_day_clear_reward(uuid,uuid)')))<>'b9a9d6cfaf6cc72399dcc27b1103f746' then raise exception 'FUNCTION_DRIFT grant_canonical_raid_day_clear_reward(uuid,uuid)'; end if;
if to_regprocedure('public.grant_canonical_raid_reward(uuid,uuid,text,text)') is null or md5(pg_get_functiondef(to_regprocedure('public.grant_canonical_raid_reward(uuid,uuid,text,text)')))<>'3558fab1b5c4304105daf033fcb00173' then raise exception 'FUNCTION_DRIFT grant_canonical_raid_reward(uuid,uuid,text,text)'; end if;
if to_regprocedure('public.grant_raid_completion_xp(text)') is null or md5(pg_get_functiondef(to_regprocedure('public.grant_raid_completion_xp(text)')))<>'af4d3ce78d3ea35c4bed07595b21e2ba' then raise exception 'FUNCTION_DRIFT grant_raid_completion_xp(text)'; end if;
if to_regprocedure('public.grant_raid_reward(uuid,uuid,integer,text)') is null or md5(pg_get_functiondef(to_regprocedure('public.grant_raid_reward(uuid,uuid,integer,text)')))<>'282e7584d134510f3a5118f8de597c75' then raise exception 'FUNCTION_DRIFT grant_raid_reward(uuid,uuid,integer,text)'; end if;
if to_regprocedure('public.join_raid_room_rescue_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.join_raid_room_rescue_v1(uuid)')))<>'2658f1bfc789edcf482063a0803da85a' then raise exception 'FUNCTION_DRIFT join_raid_room_rescue_v1(uuid)'; end if;
if to_regprocedure('public.list_raid_room_battle_recoveries_v1(integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.list_raid_room_battle_recoveries_v1(integer)')))<>'43c6dab5b37a94ac6a6f4ae6f953910d' then raise exception 'FUNCTION_DRIFT list_raid_room_battle_recoveries_v1(integer)'; end if;
if to_regprocedure('public.list_raid_room_boss_choices_v1()') is null or md5(pg_get_functiondef(to_regprocedure('public.list_raid_room_boss_choices_v1()')))<>'86250813d16aa8a6684eec94436f9f2a' then raise exception 'FUNCTION_DRIFT list_raid_room_boss_choices_v1()'; end if;
if to_regprocedure('public.list_raid_rooms_v1(text,integer,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.list_raid_rooms_v1(text,integer,integer)')))<>'63e8cd67f327018fe0d6769503af4b03' then raise exception 'FUNCTION_DRIFT list_raid_rooms_v1(text,integer,integer)'; end if;
if to_regprocedure('public.on_raid_room_clear_reward_finalized_v1()') is null or md5(pg_get_functiondef(to_regprocedure('public.on_raid_room_clear_reward_finalized_v1()')))<>'3e949e0ee4fd6a51b70ac4c3b80a1497' then raise exception 'FUNCTION_DRIFT on_raid_room_clear_reward_finalized_v1()'; end if;
if to_regprocedure('public.on_raid_room_rescue_reward_finalized_v1()') is null or md5(pg_get_functiondef(to_regprocedure('public.on_raid_room_rescue_reward_finalized_v1()')))<>'48c709cc09e8a5ae215e9219143727c5' then raise exception 'FUNCTION_DRIFT on_raid_room_rescue_reward_finalized_v1()'; end if;
if to_regprocedure('public.raid_boss_defeat()') is null or md5(pg_get_functiondef(to_regprocedure('public.raid_boss_defeat()')))<>'5a7c2f185063303cdd712f6074a047e7' then raise exception 'FUNCTION_DRIFT raid_boss_defeat()'; end if;
if to_regprocedure('public.raid_room_can_read_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.raid_room_can_read_v1(uuid)')))<>'ed9422038f2bdc2886298edd9d310e33' then raise exception 'FUNCTION_DRIFT raid_room_can_read_v1(uuid)'; end if;
if to_regprocedure('public.raid_room_projection_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.raid_room_projection_v1(uuid)')))<>'0839c20e092587c1a2395d01b3ee29e9' then raise exception 'FUNCTION_DRIFT raid_room_projection_v1(uuid)'; end if;
if to_regprocedure('public.raid_season_reset()') is null or md5(pg_get_functiondef(to_regprocedure('public.raid_season_reset()')))<>'d3a814a6bf2a46eec5a916676285e693' then raise exception 'FUNCTION_DRIFT raid_season_reset()'; end if;
if to_regprocedure('public.record_raid_boss_damage_v2(uuid,text,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.record_raid_boss_damage_v2(uuid,text,integer)')))<>'aed48467e3910accde968188a0a8fce5' then raise exception 'FUNCTION_DRIFT record_raid_boss_damage_v2(uuid,text,integer)'; end if;
if to_regprocedure('public.record_raid_boss_damage(uuid,text,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.record_raid_boss_damage(uuid,text,integer)')))<>'7d8bb02940db32b284c745e474c2df30' then raise exception 'FUNCTION_DRIFT record_raid_boss_damage(uuid,text,integer)'; end if;
if to_regprocedure('public.register_raid_room_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.register_raid_room_v1(uuid)')))<>'ce11001386767d0d11e51f4ee0a768ee' then raise exception 'FUNCTION_DRIFT register_raid_room_v1(uuid)'; end if;
if to_regprocedure('public.request_raid_room_rescue_v1(uuid,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.request_raid_room_rescue_v1(uuid,uuid)')))<>'1688fc2587f3a299a73ac7b0f6220e3a' then raise exception 'FUNCTION_DRIFT request_raid_room_rescue_v1(uuid,uuid)'; end if;
if to_regprocedure('public.respawn_cleared_raid_slot(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.respawn_cleared_raid_slot(uuid)')))<>'85d35269b885e53f60945c3669d4e5ed' then raise exception 'FUNCTION_DRIFT respawn_cleared_raid_slot(uuid)'; end if;
if to_regprocedure('public.rotate_daily_raids()') is null or md5(pg_get_functiondef(to_regprocedure('public.rotate_daily_raids()')))<>'7a00578d6d6671c7f52de5b87523876d' then raise exception 'FUNCTION_DRIFT rotate_daily_raids()'; end if;
if to_regprocedure('public.save_recommended_main_formation()') is null or md5(pg_get_functiondef(to_regprocedure('public.save_recommended_main_formation()')))<>'661294beb21b8c858e13ac09386ca521' then raise exception 'FUNCTION_DRIFT save_recommended_main_formation()'; end if;
if to_regprocedure('public.start_pvp_battle(uuid,text[],text)') is null or md5(pg_get_functiondef(to_regprocedure('public.start_pvp_battle(uuid,text[],text)')))<>'56157fe8200aa512a459b6fbd8333474' then raise exception 'FUNCTION_DRIFT start_pvp_battle(uuid,text[],text)'; end if;
if to_regprocedure('public.start_raid_battle(uuid,text[],text)') is null or md5(pg_get_functiondef(to_regprocedure('public.start_raid_battle(uuid,text[],text)')))<>'aac7cc20fd0bdb127716db3cbb0a949b' then raise exception 'FUNCTION_DRIFT start_raid_battle(uuid,text[],text)'; end if;
if to_regprocedure('public.start_raid_room_battle_v1(uuid,text[],text,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.start_raid_room_battle_v1(uuid,text[],text,uuid)')))<>'5681fbadc02025793f5f683723d2b975' then raise exception 'FUNCTION_DRIFT start_raid_room_battle_v1(uuid,text[],text,uuid)'; end if;
if to_regprocedure('public.sync_and_evaluate_raid_timeout(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.sync_and_evaluate_raid_timeout(uuid)')))<>'db263ff3e5eddae1bf468f328dffef44' then raise exception 'FUNCTION_DRIFT sync_and_evaluate_raid_timeout(uuid)'; end if;
end $guard$;
create temp table raid_step6_data_before on commit drop as select 'battle_replay_events' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."battle_replay_events" t
union all
select 'battle_replay_sessions' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."battle_replay_sessions" t
union all
select 'canonical_action_resource_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_action_resource_master" t
union all
select 'canonical_character_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_character_master" t
union all
select 'canonical_daily_activity_claims' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_daily_activity_claims" t
union all
select 'canonical_daily_ranking_reward_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_daily_ranking_reward_master" t
union all
select 'canonical_equipment_lb_slot_options' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_equipment_lb_slot_options" t
union all
select 'canonical_equipment_lb_steps' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_equipment_lb_steps" t
union all
select 'canonical_equipment_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_equipment_master" t
union all
select 'canonical_gameplay_master_versions' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_gameplay_master_versions" t
union all
select 'canonical_guild_donation_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_donation_master" t
union all
select 'canonical_guild_exp_source_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_exp_source_master" t
union all
select 'canonical_guild_progression_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_progression_master" t
union all
select 'canonical_guild_recruitment_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_recruitment_master" t
union all
select 'canonical_guild_role_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_role_master" t
union all
select 'canonical_item_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_item_master" t
union all
select 'canonical_master_freeze_versions' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_master_freeze_versions" t
union all
select 'canonical_preapply_compatibility_audit' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_preapply_compatibility_audit" t
union all
select 'canonical_pvp_production_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_pvp_production_master" t
union all
select 'canonical_pvp_ranking_rewards' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_pvp_ranking_rewards" t
union all
select 'canonical_quest_encounter_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_encounter_master" t
union all
select 'canonical_quest_enemy_pool_entries' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_enemy_pool_entries" t
union all
select 'canonical_quest_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_master" t
union all
select 'canonical_quest_resource_cost' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_resource_cost" t
union all
select 'canonical_quest_reward_pool_items' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_reward_pool_items" t
union all
select 'canonical_raid_boss_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_raid_boss_master" t
union all
select 'canonical_raid_production_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_raid_production_master" t
union all
select 'canonical_raid_reward_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_raid_reward_master" t
union all
select 'canonical_raid_variants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_raid_variants" t
union all
select 'canonical_reward_supply_sources' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_reward_supply_sources" t
union all
select 'canonical_skill_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_skill_master" t
union all
select 'canonical_user_level_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_user_level_master" t
union all
select 'presents' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."presents" t
union all
select 'raid_attempt_cost_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_attempt_cost_master" t
union all
select 'raid_boss_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_boss_master" t
union all
select 'raid_bosses' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_bosses" t
union all
select 'raid_clear_reward_claims' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_clear_reward_claims" t
union all
select 'raid_clear_reward_deliveries' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_clear_reward_deliveries" t
union all
select 'raid_completion_xp_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_completion_xp_grants" t
union all
select 'raid_damage_logs' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_damage_logs" t
union all
select 'raid_instance_user_progress' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_instance_user_progress" t
union all
select 'raid_legacy_settings' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_legacy_settings" t
union all
select 'raid_production_reward_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_production_reward_grants" t
union all
select 'raid_reward_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_reward_grants" t
union all
select 'raid_rewards_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_rewards_master" t
union all
select 'raid_room_battle_request_cancellations' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_battle_request_cancellations" t
union all
select 'raid_room_battle_settings' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_battle_settings" t
union all
select 'raid_room_battle_start_requests' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_battle_start_requests" t
union all
select 'raid_room_clear_reward_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_clear_reward_grants" t
union all
select 'raid_room_clear_reward_items' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_clear_reward_items" t
union all
select 'raid_room_clear_reward_rules' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_clear_reward_rules" t
union all
select 'raid_room_clear_rewards' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_clear_rewards" t
union all
select 'raid_room_creation_requests' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_creation_requests" t
union all
select 'raid_room_creation_settings' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_creation_settings" t
union all
select 'raid_room_difficulty_rules' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_difficulty_rules" t
union all
select 'raid_room_lifecycle_rules' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_lifecycle_rules" t
union all
select 'raid_room_members' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_members" t
union all
select 'raid_room_rescue_members' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_members" t
union all
select 'raid_room_rescue_publications' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_publications" t
union all
select 'raid_room_rescue_requests' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_requests" t
union all
select 'raid_room_rescue_reward_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_reward_grants" t
union all
select 'raid_room_rescue_reward_items' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_reward_items" t
union all
select 'raid_room_rescue_reward_rules' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_reward_rules" t
union all
select 'raid_room_rescue_rewards' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_rewards" t
union all
select 'raid_room_rescue_settings' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_settings" t
union all
select 'raid_rooms' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_rooms" t
union all
select 'ranking_raid_guild_season_snapshots' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."ranking_raid_guild_season_snapshots" t
union all
select 'ranking_raid_personal_season_snapshots' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."ranking_raid_personal_season_snapshots" t
union all
select 'user_characters' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."user_characters" t
union all
select 'user_equipments' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."user_equipments" t
union all
select 'user_main_formations' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."user_main_formations" t
union all
select 'user_raid_daily_attempts' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."user_raid_daily_attempts" t
union all
select 'users' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."users" t;
create temp table raid_step6_controls_before on commit drop as select (select jsonb_build_object('creation',(select jsonb_agg(to_jsonb(t)) from raid_room_creation_settings t),'battle',(select jsonb_agg(to_jsonb(t)) from raid_room_battle_settings t),'rescue',(select jsonb_agg(to_jsonb(t)) from raid_room_rescue_settings t))) flags,(select md5(coalesce(string_agg(to_jsonb(j)::text,'' order by jobid),'')) from cron.job j) cron;
do $apply$ declare payload text:=$raid_step6_payload$
-- 20260908175140_raid_top_daily_authority.sql

-- Raid top step 2: shared JST daily authority and new-challenge validation.
create schema if not exists private;
revoke all on schema private from public,anon,authenticated,service_role;

create table private.raid_daily_targets (
 date_jst date primary key,
 first_variant_id text not null references public.canonical_raid_variants(raid_variant_id),
 second_variant_id text not null references public.canonical_raid_variants(raid_variant_id),
 first_area_id text not null,
 second_area_id text not null,
 created_at timestamptz not null default clock_timestamp(),
 check (first_variant_id <> second_variant_id),
 check (first_area_id <> second_area_id)
);
alter table private.raid_daily_targets enable row level security;
revoke all on private.raid_daily_targets from public,anon,authenticated,service_role;

-- Internal-only authority. No client date, random seed, or direct access is accepted.
create function private.raid_daily_targets_v1() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
 v_day date;
 v_saved private.raid_daily_targets%rowtype;
 v_variants text[];
 v_areas text[];
 v_count integer;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'read committed required' using errcode='25001';
 end if;
 loop
  v_day := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
  select * into v_saved from private.raid_daily_targets where date_jst=v_day;
  if found then exit; end if;
  -- Two-key namespace is dedicated to this authority. Serialize first initialization per JST day.
  perform pg_advisory_xact_lock(726402, v_day-date '2000-01-01');
  -- Waiting across midnight must initialize the new day, never return yesterday as today.
  if v_day <> (clock_timestamp() at time zone 'Asia/Tokyo')::date then continue; end if;
  select * into v_saved from private.raid_daily_targets where date_jst=v_day;
  if found then exit; end if;
  select count(distinct area_id) into v_count from public.canonical_raid_variants
   where is_production_enabled and area_id in ('SHINJUKU','SHIBUYA','IKEBUKURO','ROPPONGI','AKIHABARA','KAWASAKI','YOKOHAMA');
  if v_count <> 7 then raise exception 'daily raid master unavailable' using errcode='55000'; end if;
  -- Uniform area selection without replacement; a canonical variant is frozen for each selected area.
  select array_agg(raid_variant_id order by area_id),array_agg(area_id order by area_id)
   into v_variants,v_areas from (
    select area_id,min(raid_variant_id) raid_variant_id from public.canonical_raid_variants
    where is_production_enabled and area_id in ('SHINJUKU','SHIBUYA','IKEBUKURO','ROPPONGI','AKIHABARA','KAWASAKI','YOKOHAMA')
    group by area_id order by random() limit 2
   ) picked;
  if cardinality(v_variants) <> 2 then raise exception 'daily raid master unavailable' using errcode='55000'; end if;
  insert into private.raid_daily_targets(date_jst,first_variant_id,second_variant_id,first_area_id,second_area_id)
   values(v_day,v_variants[1],v_variants[2],v_areas[1],v_areas[2]) returning * into v_saved;
  exit;
 end loop;
 return jsonb_build_object('dateJst',v_saved.date_jst::text,'targets',jsonb_build_array(
  jsonb_build_object('variantId',v_saved.first_variant_id),jsonb_build_object('variantId',v_saved.second_variant_id)));
end $$;
revoke all on function private.raid_daily_targets_v1() from public,anon,authenticated,service_role;

create or replace function public.list_raid_room_boss_choices_v1() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare v_daily jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 v_daily := private.raid_daily_targets_v1();
 return jsonb_build_object('choices',coalesce((select jsonb_agg(
  jsonb_build_object('raidVariantId',v.raid_variant_id,'name',v.raid_name) order by v.raid_variant_id)
  from public.canonical_raid_variants v where v.is_production_enabled and exists (
   select 1 from jsonb_array_elements(v_daily->'targets') t where t->>'variantId'=v.raid_variant_id
  )),'[]'::jsonb));
end $$;
revoke all on function public.list_raid_room_boss_choices_v1() from public,anon,authenticated,service_role;
grant execute on function public.list_raid_room_boss_choices_v1() to authenticated;

-- SQL260 latest create definition: daily gate only; existing receipt/locks/lifetime retained.
create or replace function public.create_raid_room_v1(
 p_difficulty_id text,p_raid_variant_id text,p_request_id uuid
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
as $$
declare
 v_uid uuid := auth.uid();
 v_level integer;
 v_enabled boolean;
 v_power bigint;
 v_gate jsonb;
 v_rule public.raid_room_lifecycle_rules%rowtype;
 v_variant public.canonical_raid_variants%rowtype;
 v_request public.raid_room_creation_requests%rowtype;
 v_instance uuid;
 v_room uuid;
 v_now timestamptz;
 v_daily jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if current_setting('transaction_isolation') <> 'read committed' then
   raise exception 'read committed required' using errcode='25001';
 end if;
 if p_request_id is null or p_difficulty_id is null or p_raid_variant_id is null
   or p_difficulty_id not in ('beginner','intermediate','advanced','expert') then
   raise exception 'invalid creation input' using errcode='22023';
 end if;
 -- 設定無効時は再送も拒否する。作成済みRoomの参照は既存参照RPCを使う。
 select enabled into v_enabled from public.raid_room_creation_settings where singleton for share;
 if v_enabled is distinct from true then
   raise exception 'room creation disabled' using errcode='55000';
 end if;
 -- ユーザー単位で異なる難度を含む再送を直列化。全生成経路のロック順を揃える。
 select level into v_level from public.users where id=v_uid for no key update;
 if not found then raise exception 'user unavailable' using errcode='42501'; end if;
 select * into v_request from public.raid_room_creation_requests where user_id=v_uid and request_id=p_request_id;
 if found then
   if v_request.difficulty_id<>p_difficulty_id or v_request.raid_variant_id<>p_raid_variant_id then
     raise exception 'request payload conflict' using errcode='22023';
   end if;
   return public.raid_room_projection_v1(v_request.room_id);
 end if;
 if v_level is null or v_level<5 then raise exception 'raid level requirement' using errcode='42501'; end if;
 -- 難度枠を先にロックし、待機後に総合力と生成時刻を取得する。
 select * into v_rule from public.raid_room_lifecycle_rules where difficulty=p_difficulty_id for update;
 if not found then raise exception 'lifecycle rule unavailable' using errcode='22023'; end if;
 -- 空編成を既存集計関数のcoalesceで0として判定しない。初級には総合力制限がない。
 if p_difficulty_id<>'beginner' and not exists(
   select 1 from public.user_main_formations where user_id=v_uid
 ) then raise exception 'power unavailable' using errcode='42501'; end if;
 v_power := public.calculate_user_total_power(v_uid);
 if p_difficulty_id<>'beginner' and (v_power is null or v_power<0) then
   raise exception 'power unavailable' using errcode='42501';
 end if;
 v_gate := public._raid_room_power_gate_v1(p_difficulty_id,v_power);
 if v_gate->>'status' is distinct from 'passed' then
   raise exception 'raid power requirement' using errcode='42501';
 end if;
 select * into v_variant from public.canonical_raid_variants
   where raid_variant_id=p_raid_variant_id and is_production_enabled;
 if not found or v_variant.max_hp is null or v_variant.max_hp<=0 then
   raise exception 'raid variant unavailable' using errcode='22023';
 end if;
 -- Successful same-request receipts above are returned before any new-day target check.
 loop
  v_daily := private.raid_daily_targets_v1();
  v_now := clock_timestamp();
  exit when v_daily->>'dateJst' = ((v_now at time zone 'Asia/Tokyo')::date)::text;
 end loop;
 if not exists(select 1 from jsonb_array_elements(v_daily->'targets') t where t->>'variantId'=p_raid_variant_id) then
  raise exception 'raid variant outside daily targets' using errcode='22023';
 end if;
 v_instance := gen_random_uuid();
 -- 日次グループとの識別のみ。旧writerを遮断するものではないため設定は無効で出荷。
 insert into public.raid_bosses(id,boss_id,boss_master_id,current_hp,max_hp,base_id,status,
   spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key)
 values(v_instance,v_variant.raid_variant_id,v_variant.raid_variant_id,v_variant.max_hp,v_variant.max_hp,
   lower(v_variant.area_id),'ACTIVE',v_now,v_now+make_interval(hours=>v_rule.duration_hours),
   gen_random_uuid(),(v_now at time zone 'Asia/Tokyo')::date,v_variant.raid_variant_id,'ROOM:'||v_instance::text);
 v_room := (public._raid_room_register_v1(v_instance,v_uid,p_difficulty_id)->>'roomId')::uuid;
 insert into public.raid_room_creation_requests(user_id,request_id,difficulty_id,raid_variant_id,room_id)
 values(v_uid,p_request_id,p_difficulty_id,p_raid_variant_id,v_room);
 -- Room登録・所有者参加・再送台帳まで同一transaction。資源消費や戦闘開始は行わない。
 return public.raid_room_projection_v1(v_room);
end $$;
revoke all on function public.create_raid_room_v1(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_raid_room_v1(text,text,uuid) to authenticated;


-- 20260908175143_raid_top_aggregate_api.sql

-- Raid top step 2: authenticated bounded top projection.
-- 依存: Bの日次正本 private.raid_daily_targets_v1() を先に定義する。
-- 行の公開範囲を内部関数で限定するため、元テーブルのRLS/GRANTは変更しない。
create or replace function private.raid_top_snapshot_v1() returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_daily jsonb;
  v_result jsonb;
begin
  if v_uid is null or not exists(select 1 from public.users where id = v_uid) then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- 日次の遅延確定以外に書込を発生させない。失敗は例外のまま返す。
  v_daily := private.raid_daily_targets_v1();
  -- 日次ロック待機中の期限到達も反映する。
  v_now := clock_timestamp();
  with
  participating_page as materialized (
    select r.id, r.created_at
    from public.raid_rooms r
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
    where b.status = 'ACTIVE' and b.current_hp > 0 and b.expires_at > v_now
      and b.outcome_finalized_at is null
      and (r.owner_user_id = v_uid or exists (
        select 1 from public.raid_room_members m where m.room_id = r.id and m.user_id = v_uid
      ))
    order by r.created_at desc, r.id desc limit 20
  ),
  visible_rescues as (
    select p.*, row_number() over (
      partition by p.room_id order by p.created_at desc, p.id desc
    ) as publication_number
    from public.raid_room_rescue_publications p
    join public.raid_rooms r on r.id = p.room_id
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
    where b.status = 'ACTIVE' and b.current_hp > 0 and b.expires_at > v_now
      and b.outcome_finalized_at is null
      -- get_raid_room_rescue_v1 と同じ現在所属判定。移籍前Guildを認めない。
      and (p.channel = 'ACTIVITY' or (p.channel = 'GUILD' and exists (
        select 1 from public.guild_members gm
        where gm.user_id = v_uid and gm.guild_id = p.guild_id
      )))
  ),
  rescue_page as materialized (
    select * from visible_rescues where publication_number = 1
    order by created_at desc, id desc limit 20
  ),
  selected_ids as materialized (
    select id from participating_page union select room_id from rescue_page
  ),
  selected_rooms as materialized (
    select r.*, b.raid_variant_id, b.max_hp, b.current_hp, b.expires_at, b.outcome_finalized_at
    from selected_ids s join public.raid_rooms r on r.id = s.id
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
  ),
  registered as materialized (
    -- 登録参加人数。オンライン数や戦績ログ件数ではない。主催者を重複排除する。
    select r.id as room_id, r.owner_user_id as user_id from selected_rooms r
    union
    select m.room_id, m.user_id from public.raid_room_members m
    join selected_ids s on s.id = m.room_id
  ),
  member_numbers as materialized (
    select m.*, count(*) over(partition by m.room_id) as registered_count,
      row_number() over(partition by m.room_id order by (m.user_id = r.owner_user_id) desc, m.user_id) as face_number
    from registered m join selected_rooms r on r.id = m.room_id
  ),
  profile_ids as materialized (
    select owner_user_id as user_id from selected_rooms
    union select user_id from member_numbers where face_number <= 5
  ),
  profiles as materialized (
    select u.id, jsonb_build_object(
      'userId', u.id, 'name', u.username,
      'leaderIconUrl', jsonb_build_object('status', 'unknown'),
      -- 画像URLはクライアントの現行キャラクターマスターで解決する。
      -- avatar_urlは任意プロフィール画像であり、リーダーの代用にしない。
      'leaderCharacterId', jsonb_build_object('status', 'available', 'value', u.favorite_character_id)
    ) as dto
    from profile_ids p join public.users u on u.id = p.user_id
  ),
  member_summaries as (
    select m.room_id, max(m.registered_count) as registered_count,
      jsonb_agg(p.dto order by m.face_number) filter(where m.face_number <= 5) as faces
    from member_numbers m join profiles p on p.id = m.user_id
    where m.face_number <= 5
    group by m.room_id
  ),
  projected as materialized (
    select r.id, jsonb_build_object(
      'room', jsonb_build_object(
        'roomId', r.id, 'difficultyId', r.difficulty_id,
        'owner', jsonb_build_object('status', 'available', 'value', owner.dto),
        'state', jsonb_build_object('status', 'available', 'value', 'active'),
        'createdAt', jsonb_build_object('status', 'available', 'value', r.created_at),
        'expiresAt', jsonb_build_object('status', 'available', 'value', r.expires_at),
        'endedAt', jsonb_build_object('status', 'available', 'value', r.outcome_finalized_at),
        'hp', case when r.max_hp is not null and r.current_hp is not null then
          jsonb_build_object('status', 'available', 'value', jsonb_build_object('current', r.current_hp, 'max', r.max_hp))
          else jsonb_build_object('status', 'unknown') end,
        'participantCount', jsonb_build_object('status', 'available', 'value', members.registered_count),
        'serverEligibility', jsonb_build_object('status', 'unknown')
      ),
      'enemy', case when r.raid_variant_id is null then jsonb_build_object('status', 'unknown')
        else jsonb_build_object('status', 'available', 'value', jsonb_build_object('variantId', r.raid_variant_id)) end,
      'ownerGuild', case when gm.guild_id is not null and g.id is null then jsonb_build_object('status', 'unknown')
        else jsonb_build_object('status', 'available', 'value', case when g.id is null then null
          else jsonb_build_object('guildId', g.id, 'name', g.name) end) end,
      'participants', jsonb_build_object('status', 'available', 'value', coalesce(members.faces, '[]'::jsonb)),
      'membership', jsonb_build_object('status', 'available', 'value', case
        when r.owner_user_id = v_uid then 'owner'
        when rescue_member.user_id is not null then 'rescue'
        when my_member.user_id is not null then 'member'
        else 'not_joined' end),
      'rescue', jsonb_build_object('status', 'unknown')
    ) as dto
    from selected_rooms r
    join profiles owner on owner.id = r.owner_user_id
    join member_summaries members on members.room_id = r.id
    left join public.guild_members gm on gm.user_id = r.owner_user_id
    left join public.guilds g on g.id = gm.guild_id
    left join public.raid_room_members my_member on my_member.room_id = r.id and my_member.user_id = v_uid
    left join public.raid_room_rescue_members rescue_member on rescue_member.room_id = r.id and rescue_member.user_id = v_uid
  )
  select jsonb_build_object(
    'participating', jsonb_build_object('status', 'ready', 'data', coalesce((
      select jsonb_agg(p.dto order by page.created_at desc, page.id desc)
      from participating_page page join projected p on p.id = page.id
    ), '[]'::jsonb)),
    'rescues', jsonb_build_object('status', 'ready', 'data', coalesce((
      select jsonb_agg(p.dto || jsonb_build_object('rescue', jsonb_build_object('status', 'available', 'value',
        jsonb_build_object('rescueId', page.id,
          'source', case page.channel when 'ACTIVITY' then 'activity' else 'guild_chat' end,
          'scope', page.channel, 'guildId', page.guild_id)
      )) order by page.created_at desc, page.id desc)
      from rescue_page page join projected p on p.id = page.room_id
    ), '[]'::jsonb)),
    'dailyTargets', jsonb_build_object('status', 'ready', 'data', v_daily)
  ) into v_result;
  return v_result;
end;
$$;

-- privileged implementationを非公開schemaへ置き、公開入口は権限を昇格しない。
create or replace function public.get_raid_top_v1() returns jsonb
language sql volatile security invoker set search_path = pg_catalog
as $$ select private.raid_top_snapshot_v1() $$;

revoke all on function private.raid_top_snapshot_v1() from public, anon, authenticated, service_role;
revoke all on function public.get_raid_top_v1() from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.raid_top_snapshot_v1() to authenticated;
grant execute on function public.get_raid_top_v1() to authenticated;
comment on function public.get_raid_top_v1() is '本人の開催中参戦・閲覧可能救援を各20件、登録参加者の公開名/リーダーを5件まで一括投影。日次2エリア正本を共有。';


-- 20260908181251_raid_room_display_projection.sql

-- Read-only supplement: no participation, reward issuance, expiry or balance changes.
create function private.raid_room_display_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare
 v_uid uuid:=auth.uid(); v_room public.raid_rooms%rowtype;
 v_joined boolean; v_member text; v_leaders jsonb; v_guild jsonb;
 v_clear jsonb; v_rescue jsonb;
begin
 if v_uid is null or not exists(select 1 from public.users where id=v_uid) then
  raise exception 'authentication required' using errcode='42501'; end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found or not public.raid_room_can_read_v1(p_room_id) then
  raise exception 'room unavailable' using errcode='P0002'; end if;
 v_joined:=v_room.owner_user_id=v_uid or exists(select 1 from public.raid_room_members where room_id=p_room_id and user_id=v_uid)
  or exists(select 1 from public.raid_instance_user_progress where raid_boss_instance_id=v_room.raid_boss_instance_id and user_id=v_uid and finalized_battles>0);
 v_member:=case when v_room.owner_user_id=v_uid then 'owner'
  when exists(select 1 from public.raid_room_rescue_members where room_id=p_room_id and user_id=v_uid) then 'rescue'
  when v_joined then 'member' else 'not_joined' end;
 -- Same participant privacy as SQL255. An outsider receives the public owner only.
 with members as (
  select v_room.owner_user_id as user_id
  union select user_id from public.raid_room_members where room_id=p_room_id and v_joined
  union select user_id from public.raid_instance_user_progress where raid_boss_instance_id=v_room.raid_boss_instance_id and finalized_battles>0 and v_joined
 ), page as (select user_id from members order by user_id limit 20), ids as (
  select user_id from page union select v_room.owner_user_id
 ) select coalesce(jsonb_object_agg(u.id::text,u.favorite_character_id),'{}'::jsonb) into v_leaders
 from ids join public.users u on u.id=ids.user_id;
 select case when m.guild_id is not null and g.id is null then jsonb_build_object('status','unknown')
  else jsonb_build_object('status','available','value',case when g.id is null then null
   else jsonb_build_object('guildId',g.id,'name',g.name) end) end into v_guild
 from (select v_room.owner_user_id as id) owner
 left join public.guild_members m on m.user_id=owner.id left join public.guilds g on g.id=m.guild_id;
 -- Plans are read from current configuration, never copied into the issued Present collection.
 select jsonb_build_object('status',case when r.enabled and count(i.item_id)>0 then 'configured' else 'unconfigured' end,
  'items',case when r.enabled then coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) filter(where i.item_id is not null),'[]'::jsonb) else '[]'::jsonb end)
 into v_clear from public.raid_room_clear_reward_rules r left join public.raid_room_clear_reward_items i on i.difficulty=r.difficulty
 where r.difficulty=v_room.difficulty_id group by r.enabled;
 select jsonb_build_object('status',case when r.enabled and count(i.item_id)>0 then 'configured' else 'unconfigured' end,
  'items',case when r.enabled then coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) filter(where i.item_id is not null),'[]'::jsonb) else '[]'::jsonb end)
 into v_rescue from public.raid_room_rescue_reward_rules r left join public.raid_room_rescue_reward_items i on i.difficulty=r.difficulty
 where r.difficulty=v_room.difficulty_id group by r.enabled;
 return jsonb_build_object('roomId',p_room_id,'ownerGuild',v_guild,'leaderCharacterIds',v_leaders,'membership',v_member,
  'clearPlan',coalesce(v_clear,'{"status":"unconfigured","items":[]}'::jsonb),
  'rescuePlan',coalesce(v_rescue,'{"status":"unconfigured","items":[]}'::jsonb));
end $$;
create function public.get_raid_room_display_v1(p_room_id uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$select private.raid_room_display_v1(p_room_id)$$;
revoke all on function private.raid_room_display_v1(uuid),public.get_raid_room_display_v1(uuid) from public,anon,authenticated,service_role;
grant usage on schema private to authenticated;
grant execute on function private.raid_room_display_v1(uuid),public.get_raid_room_display_v1(uuid) to authenticated;


-- 20260909023226_raid_remaining_pages_projection.sql

-- Display-only reads. Existing creation, participation, rescue and reward authorities stay unchanged.
create function private.raid_page_entry_v1(p_room_id uuid,p_rescue_id uuid default null) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object(
  'room',jsonb_set(public.raid_room_projection_v1(r.id),'{owner,value,leaderCharacterId}',jsonb_build_object('status','available','value',u.favorite_character_id)),
  'enemy',case when b.raid_variant_id is null then jsonb_build_object('status','unknown') else jsonb_build_object('status','available','value',jsonb_build_object('variantId',b.raid_variant_id)) end,
  'ownerGuild',case when gm.guild_id is not null and g.id is null then jsonb_build_object('status','unknown') else jsonb_build_object('status','available','value',case when g.id is null then null else jsonb_build_object('guildId',g.id,'name',g.name) end) end,
  'participants',jsonb_build_object('status','unknown'),
  'membership',jsonb_build_object('status','available','value',case when r.owner_user_id=auth.uid() then 'owner'
   when exists(select 1 from public.raid_room_rescue_members where room_id=r.id and user_id=auth.uid()) then 'rescue'
   when exists(select 1 from public.raid_room_members where room_id=r.id and user_id=auth.uid()) then 'member' else 'not_joined' end),
  'rescue',case when p.id is null then jsonb_build_object('status','unknown') else jsonb_build_object('status','available','value',jsonb_build_object('rescueId',p.id,'source',case when p.channel='GUILD' then 'guild_chat' else 'activity' end,'scope',p.channel,'guildId',p.guild_id)) end)
 from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
 join public.users u on u.id=r.owner_user_id left join public.guild_members gm on gm.user_id=u.id left join public.guilds g on g.id=gm.guild_id
 left join public.raid_room_rescue_publications p on p.id=p_rescue_id and p.room_id=r.id where r.id=p_room_id
$$;
revoke all on function private.raid_page_entry_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function private.raid_browse_page_v1(p_difficulty_id text,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_rows jsonb; v_count integer;
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid()) then raise exception 'authentication required' using errcode='42501'; end if;
 if p_difficulty_id is null or p_difficulty_id not in ('beginner','intermediate','advanced','expert') or p_offset is null or p_offset<0 or p_offset>1000000 then raise exception 'invalid page' using errcode='22023'; end if;
 with page as (select r.id,r.created_at from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
  where r.difficulty_id=p_difficulty_id and b.status='ACTIVE' and b.current_hp>0 and b.expires_at>statement_timestamp() and b.outcome_finalized_at is null
   and public.raid_room_can_read_v1(r.id) order by r.created_at desc,r.id limit 21 offset p_offset),
 numbered as(select *,row_number() over(order by created_at desc,id) n from page)
 select coalesce(jsonb_agg(private.raid_page_entry_v1(id) order by created_at desc,id) filter(where n<=20),'[]'::jsonb),count(*) into v_rows,v_count from numbered;
 return jsonb_build_object('entries',v_rows,'nextOffset',case when v_count>20 then p_offset+20 else null end);
end $$;

create function private.raid_rescue_cards_v1(p_rescue_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_rows jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid()) then raise exception 'authentication required' using errcode='42501'; end if;
 if p_rescue_ids is null or cardinality(p_rescue_ids)>50 then raise exception 'invalid page' using errcode='22023'; end if;
 -- Ended raids remain visible on already-published links; current Guild membership still gates visibility.
 select coalesce(jsonb_agg(private.raid_page_entry_v1(p.room_id,p.id) order by p.id),'[]'::jsonb) into v_rows
 from public.raid_room_rescue_publications p where p.id=any(p_rescue_ids)
  and (p.channel='ACTIVITY' or (p.channel='GUILD' and exists(select 1 from public.guild_members where user_id=auth.uid() and guild_id=p.guild_id)))
  and public.raid_room_can_read_v1(p.room_id);
 return jsonb_build_object('entries',v_rows);
end $$;

create function private.raid_enemy_info_v1(p_variant_id text,p_difficulty_id text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_members jsonb; v_member text; v_refs jsonb; v_skills jsonb; v_map jsonb:='{}'; v_clear jsonb; v_rescue jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid()) then raise exception 'authentication required' using errcode='42501'; end if;
 if p_difficulty_id is null or p_difficulty_id not in ('beginner','intermediate','advanced','expert') then raise exception 'invalid difficulty' using errcode='22023'; end if;
 select member_character_ids into v_members from public.canonical_raid_variants where raid_variant_id=p_variant_id;
 if v_members is null or jsonb_array_length(v_members)<>5 then raise exception 'enemy unavailable' using errcode='P0002'; end if;
 for v_member in select value from jsonb_array_elements_text(v_members) loop
  -- Match start_raid_room_battle_v1 (SQL260) exactly: HARD entry override, exclusive, then regular skills.
  select coalesce((select skill_loadout from public.canonical_quest_enemy_pool_entries where version='2026-08-30' and character_id=v_member and difficulty='HARD' order by local_affinity desc,weight desc limit 1),
   (select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id=v_member order by skill_id limit 2)s),
   (select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id is null order by skill_id limit 2)s),'[]'::jsonb) into v_refs;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.skill_id,'name',s.display_name) order by x.ordinality),'[]'::jsonb) into v_skills
   from jsonb_array_elements_text(v_refs) with ordinality x(id,ordinality) join public.canonical_skill_master s on s.version='2026-08-21' and s.skill_id=x.id;
  if jsonb_array_length(v_refs)<>jsonb_array_length(v_skills) then raise exception 'enemy skills unavailable' using errcode='P0002'; end if;
  v_map:=v_map||jsonb_build_object(v_member,v_skills);
 end loop;
 select jsonb_build_object('status',case when r.enabled and count(i.item_id)>0 then 'configured' else 'unconfigured' end,'items',case when r.enabled then coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) filter(where i.item_id is not null),'[]'::jsonb) else '[]'::jsonb end)
 into v_clear from public.raid_room_clear_reward_rules r left join public.raid_room_clear_reward_items i on i.difficulty=r.difficulty where r.difficulty=p_difficulty_id group by r.enabled;
 select jsonb_build_object('status',case when r.enabled and count(i.item_id)>0 then 'configured' else 'unconfigured' end,'items',case when r.enabled then coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) filter(where i.item_id is not null),'[]'::jsonb) else '[]'::jsonb end)
 into v_rescue from public.raid_room_rescue_reward_rules r left join public.raid_room_rescue_reward_items i on i.difficulty=r.difficulty where r.difficulty=p_difficulty_id group by r.enabled;
 return jsonb_build_object('variantId',p_variant_id,'memberCharacterIds',v_members,'skillsByCharacterId',v_map,'clearPlan',coalesce(v_clear,'{"status":"unconfigured","items":[]}'),'rescuePlan',coalesce(v_rescue,'{"status":"unconfigured","items":[]}'));
end $$;

create function public.list_raid_room_cards_v1(p_difficulty_id text,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$select private.raid_browse_page_v1(p_difficulty_id,p_offset)$$;
create function public.get_raid_rescue_cards_v1(p_rescue_ids uuid[]) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$select private.raid_rescue_cards_v1(p_rescue_ids)$$;
create function public.get_raid_enemy_info_v1(p_variant_id text,p_difficulty_id text) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$select private.raid_enemy_info_v1(p_variant_id,p_difficulty_id)$$;
revoke all on function private.raid_browse_page_v1(text,integer),private.raid_rescue_cards_v1(uuid[]),private.raid_enemy_info_v1(text,text),public.list_raid_room_cards_v1(text,integer),public.get_raid_rescue_cards_v1(uuid[]),public.get_raid_enemy_info_v1(text,text) from public,anon,authenticated,service_role;
grant execute on function private.raid_browse_page_v1(text,integer),private.raid_rescue_cards_v1(uuid[]),private.raid_enemy_info_v1(text,text),public.list_raid_room_cards_v1(text,integer),public.get_raid_rescue_cards_v1(uuid[]),public.get_raid_enemy_info_v1(text,text) to authenticated;

$raid_step6_payload$;begin if encode(sha256(convert_to(payload,'UTF8')),'hex')<>'cd7310f1ccc9b3a988fbd0fe8aed56e1015dbe4aa08b30ce5c3ca293e2e85298' then raise exception 'PAYLOAD_HASH';end if;execute payload;end $apply$;
do $post$ begin
if to_regprocedure('public._issue_raid_room_clear_rewards_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public._issue_raid_room_clear_rewards_v1(uuid)')))<>'f0c8737188ddbd097ccaad607e0b15bc' then raise exception 'FUNCTION_DRIFT _issue_raid_room_clear_rewards_v1(uuid)'; end if;
if to_regprocedure('public._issue_raid_room_rescue_rewards_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public._issue_raid_room_rescue_rewards_v1(uuid)')))<>'0e9eed03e84ba4c3270d5072be258771' then raise exception 'FUNCTION_DRIFT _issue_raid_room_rescue_rewards_v1(uuid)'; end if;
if to_regprocedure('public._raid_room_add_member_v1(uuid,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public._raid_room_add_member_v1(uuid,uuid)')))<>'5831ccf6883c8a0daf50bd242359660d' then raise exception 'FUNCTION_DRIFT _raid_room_add_member_v1(uuid,uuid)'; end if;
if to_regprocedure('public._raid_room_clear_reward_progress_v1(uuid,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public._raid_room_clear_reward_progress_v1(uuid,uuid)')))<>'72b6ceb513fec4ccbb9c66215350852b' then raise exception 'FUNCTION_DRIFT _raid_room_clear_reward_progress_v1(uuid,uuid)'; end if;
if to_regprocedure('public._raid_room_power_gate_v1(text,bigint)') is null or md5(pg_get_functiondef(to_regprocedure('public._raid_room_power_gate_v1(text,bigint)')))<>'b0f471fc30ebafc55a8207d451a2f5ed' then raise exception 'FUNCTION_DRIFT _raid_room_power_gate_v1(text,bigint)'; end if;
if to_regprocedure('public._raid_room_register_v1(uuid,uuid,text)') is null or md5(pg_get_functiondef(to_regprocedure('public._raid_room_register_v1(uuid,uuid,text)')))<>'e5034819f20327d3c2d0ba520fbe3b0e' then raise exception 'FUNCTION_DRIFT _raid_room_register_v1(uuid,uuid,text)'; end if;
if to_regprocedure('public._raid_room_rescue_gate_v1(text,boolean,bigint,bigint,boolean)') is null or md5(pg_get_functiondef(to_regprocedure('public._raid_room_rescue_gate_v1(text,boolean,bigint,bigint,boolean)')))<>'fbee753b7d6128418f85c1077ef931bb' then raise exception 'FUNCTION_DRIFT _raid_room_rescue_gate_v1(text,boolean,bigint,bigint,boolean)'; end if;
if to_regprocedure('public._raid_room_rescue_reward_progress_v1(uuid,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public._raid_room_rescue_reward_progress_v1(uuid,uuid)')))<>'a1520722a55f5e3f272ecdbfeef55c53' then raise exception 'FUNCTION_DRIFT _raid_room_rescue_reward_progress_v1(uuid,uuid)'; end if;
if to_regprocedure('public.acknowledge_raid_room_battle_recovery_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.acknowledge_raid_room_battle_recovery_v1(uuid)')))<>'429f173150fb4b029be9c1b8ff55b7e5' then raise exception 'FUNCTION_DRIFT acknowledge_raid_room_battle_recovery_v1(uuid)'; end if;
if to_regprocedure('public.admin_respawn_raid_boss(text,integer,text)') is null or md5(pg_get_functiondef(to_regprocedure('public.admin_respawn_raid_boss(text,integer,text)')))<>'3a22d60e7a35ab3ef1b8703ded57d697' then raise exception 'FUNCTION_DRIFT admin_respawn_raid_boss(text,integer,text)'; end if;
if to_regprocedure('public.calculate_user_total_power(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.calculate_user_total_power(uuid)')))<>'ab6772b65f3e345778686bfd49322828' then raise exception 'FUNCTION_DRIFT calculate_user_total_power(uuid)'; end if;
if to_regprocedure('public.cancel_raid_room_battle_request_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.cancel_raid_room_battle_request_v1(uuid)')))<>'924093eb91aa77f10e954513cb6a0d38' then raise exception 'FUNCTION_DRIFT cancel_raid_room_battle_request_v1(uuid)'; end if;
if to_regprocedure('public.canonical_pvp_rating_delta(integer,integer,text)') is null or md5(pg_get_functiondef(to_regprocedure('public.canonical_pvp_rating_delta(integer,integer,text)')))<>'9072fc7fe6c9df578ed18b05135ef058' then raise exception 'FUNCTION_DRIFT canonical_pvp_rating_delta(integer,integer,text)'; end if;
if to_regprocedure('public.canonical_raid_rotation_pair(date)') is null or md5(pg_get_functiondef(to_regprocedure('public.canonical_raid_rotation_pair(date)')))<>'e817f2add5cb0a890b3c586950603372' then raise exception 'FUNCTION_DRIFT canonical_raid_rotation_pair(date)'; end if;
if to_regprocedure('public.complete_current_tutorial_formation()') is null or md5(pg_get_functiondef(to_regprocedure('public.complete_current_tutorial_formation()')))<>'de5936a052d2adfc88ab6a42732e9b7a' then raise exception 'FUNCTION_DRIFT complete_current_tutorial_formation()'; end if;
if to_regprocedure('public.consume_raid_attempt(uuid,text,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.consume_raid_attempt(uuid,text,integer)')))<>'811c883465c9b2873d94c5fcb6608077' then raise exception 'FUNCTION_DRIFT consume_raid_attempt(uuid,text,integer)'; end if;
if to_regprocedure('public.finalize_expired_raid_instance(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.finalize_expired_raid_instance(uuid)')))<>'f84b621d0b4276b568244a46bc4c6c1b' then raise exception 'FUNCTION_DRIFT finalize_expired_raid_instance(uuid)'; end if;
if to_regprocedure('public.finalize_expired_raid_room_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.finalize_expired_raid_room_v1(uuid)')))<>'ff5d1e9333122ba20adbf99fcdc944d2' then raise exception 'FUNCTION_DRIFT finalize_expired_raid_room_v1(uuid)'; end if;
if to_regprocedure('public.finalize_expired_raid_rooms_v1(integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.finalize_expired_raid_rooms_v1(integer)')))<>'be4bad717c6bc92feeb816559070b85f' then raise exception 'FUNCTION_DRIFT finalize_expired_raid_rooms_v1(integer)'; end if;
if to_regprocedure('public.finalize_raid_battle(uuid,jsonb)') is null or md5(pg_get_functiondef(to_regprocedure('public.finalize_raid_battle(uuid,jsonb)')))<>'3505d7f666cff2a2735a0c7318849e58' then raise exception 'FUNCTION_DRIFT finalize_raid_battle(uuid,jsonb)'; end if;
if to_regprocedure('public.finalize_raid_room_battle_v1(uuid,jsonb)') is null or md5(pg_get_functiondef(to_regprocedure('public.finalize_raid_room_battle_v1(uuid,jsonb)')))<>'8e248ea14f1a41cd7d912d8b8d2c2abd' then raise exception 'FUNCTION_DRIFT finalize_raid_room_battle_v1(uuid,jsonb)'; end if;
if to_regprocedure('public.finalize_raid_season_rewards(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.finalize_raid_season_rewards(uuid)')))<>'07208e963d6a3422690e7ff9d4384eb4' then raise exception 'FUNCTION_DRIFT finalize_raid_season_rewards(uuid)'; end if;
if to_regprocedure('public.get_active_raids()') is null or md5(pg_get_functiondef(to_regprocedure('public.get_active_raids()')))<>'80efa4eb79911431549284041df84f89' then raise exception 'FUNCTION_DRIFT get_active_raids()'; end if;
if to_regprocedure('public.get_current_raid_attempt_state()') is null or md5(pg_get_functiondef(to_regprocedure('public.get_current_raid_attempt_state()')))<>'3d709a09c6d662ffd83cd810d2205159' then raise exception 'FUNCTION_DRIFT get_current_raid_attempt_state()'; end if;
if to_regprocedure('public.get_current_raid_battle_rewards(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_current_raid_battle_rewards(uuid)')))<>'7ad2e0aab34e6de5129c35ba6094ae97' then raise exception 'FUNCTION_DRIFT get_current_raid_battle_rewards(uuid)'; end if;
if to_regprocedure('public.get_my_raid_contribution_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_my_raid_contribution_v1(uuid)')))<>'ce7b6fe32f6e76703159c69d8fc509f2' then raise exception 'FUNCTION_DRIFT get_my_raid_contribution_v1(uuid)'; end if;
if to_regprocedure('public.get_pvp_opponents_page(uuid,integer,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_pvp_opponents_page(uuid,integer,integer)')))<>'636f7e768a3a554ba2b4a7f02f4bf372' then raise exception 'FUNCTION_DRIFT get_pvp_opponents_page(uuid,integer,integer)'; end if;
if to_regprocedure('public.get_raid_battle_route_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_battle_route_v1(uuid)')))<>'eca1a99a2145ac014d48c20f3665ee2c' then raise exception 'FUNCTION_DRIFT get_raid_battle_route_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_rankings(uuid,integer,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_rankings(uuid,integer,integer)')))<>'67f56c075a0539c526b49b59054e27e6' then raise exception 'FUNCTION_DRIFT get_raid_rankings(uuid,integer,integer)'; end if;
if to_regprocedure('public.get_raid_rankings(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_rankings(uuid)')))<>'198b233a6ac618d5818029d6d67ffd02' then raise exception 'FUNCTION_DRIFT get_raid_rankings(uuid)'; end if;
if to_regprocedure('public.get_raid_room_battle_result_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_battle_result_v1(uuid)')))<>'5cdd2f59e8da4f9b3b61c1919482ff59' then raise exception 'FUNCTION_DRIFT get_raid_room_battle_result_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_battle_start_receipt_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_battle_start_receipt_v1(uuid)')))<>'7de2b6b5dd68b71c0ac6809d669c8b38' then raise exception 'FUNCTION_DRIFT get_raid_room_battle_start_receipt_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_briefing_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_briefing_v1(uuid)')))<>'30a7b66b02b5f44218bba5897fe82a94' then raise exception 'FUNCTION_DRIFT get_raid_room_briefing_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_clear_reward_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_clear_reward_v1(uuid)')))<>'c190d76e4b607d6abff9fe132cbc7a9a' then raise exception 'FUNCTION_DRIFT get_raid_room_clear_reward_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_participants_v1(uuid,integer,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_participants_v1(uuid,integer,integer)')))<>'a39135093bf37ad5a99f9d139096b818' then raise exception 'FUNCTION_DRIFT get_raid_room_participants_v1(uuid,integer,integer)'; end if;
if to_regprocedure('public.get_raid_room_rescue_reward_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_rescue_reward_v1(uuid)')))<>'617b44fbfdc899a55e146fdd2eb08dbf' then raise exception 'FUNCTION_DRIFT get_raid_room_rescue_reward_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_rescue_status_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_rescue_status_v1(uuid)')))<>'dfb9f6d2fb74a134a1181b6e7435a160' then raise exception 'FUNCTION_DRIFT get_raid_room_rescue_status_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_rescue_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_rescue_v1(uuid)')))<>'23bea9f29bb2a3b7d015abd457191b3c' then raise exception 'FUNCTION_DRIFT get_raid_room_rescue_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_room_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_room_v1(uuid)')))<>'483edc4a6ff97ecf2aab16ba953680e8' then raise exception 'FUNCTION_DRIFT get_raid_room_v1(uuid)'; end if;
if to_regprocedure('public.get_raid_season_rankings(integer,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.get_raid_season_rankings(integer,integer)')))<>'603e6abecc7c082498c04adbc821b003' then raise exception 'FUNCTION_DRIFT get_raid_season_rankings(integer,integer)'; end if;
if to_regprocedure('public.grant_canonical_raid_day_clear_reward(uuid,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.grant_canonical_raid_day_clear_reward(uuid,uuid)')))<>'b9a9d6cfaf6cc72399dcc27b1103f746' then raise exception 'FUNCTION_DRIFT grant_canonical_raid_day_clear_reward(uuid,uuid)'; end if;
if to_regprocedure('public.grant_canonical_raid_reward(uuid,uuid,text,text)') is null or md5(pg_get_functiondef(to_regprocedure('public.grant_canonical_raid_reward(uuid,uuid,text,text)')))<>'3558fab1b5c4304105daf033fcb00173' then raise exception 'FUNCTION_DRIFT grant_canonical_raid_reward(uuid,uuid,text,text)'; end if;
if to_regprocedure('public.grant_raid_completion_xp(text)') is null or md5(pg_get_functiondef(to_regprocedure('public.grant_raid_completion_xp(text)')))<>'af4d3ce78d3ea35c4bed07595b21e2ba' then raise exception 'FUNCTION_DRIFT grant_raid_completion_xp(text)'; end if;
if to_regprocedure('public.grant_raid_reward(uuid,uuid,integer,text)') is null or md5(pg_get_functiondef(to_regprocedure('public.grant_raid_reward(uuid,uuid,integer,text)')))<>'282e7584d134510f3a5118f8de597c75' then raise exception 'FUNCTION_DRIFT grant_raid_reward(uuid,uuid,integer,text)'; end if;
if to_regprocedure('public.join_raid_room_rescue_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.join_raid_room_rescue_v1(uuid)')))<>'2658f1bfc789edcf482063a0803da85a' then raise exception 'FUNCTION_DRIFT join_raid_room_rescue_v1(uuid)'; end if;
if to_regprocedure('public.list_raid_room_battle_recoveries_v1(integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.list_raid_room_battle_recoveries_v1(integer)')))<>'43c6dab5b37a94ac6a6f4ae6f953910d' then raise exception 'FUNCTION_DRIFT list_raid_room_battle_recoveries_v1(integer)'; end if;
if to_regprocedure('public.list_raid_rooms_v1(text,integer,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.list_raid_rooms_v1(text,integer,integer)')))<>'63e8cd67f327018fe0d6769503af4b03' then raise exception 'FUNCTION_DRIFT list_raid_rooms_v1(text,integer,integer)'; end if;
if to_regprocedure('public.on_raid_room_clear_reward_finalized_v1()') is null or md5(pg_get_functiondef(to_regprocedure('public.on_raid_room_clear_reward_finalized_v1()')))<>'3e949e0ee4fd6a51b70ac4c3b80a1497' then raise exception 'FUNCTION_DRIFT on_raid_room_clear_reward_finalized_v1()'; end if;
if to_regprocedure('public.on_raid_room_rescue_reward_finalized_v1()') is null or md5(pg_get_functiondef(to_regprocedure('public.on_raid_room_rescue_reward_finalized_v1()')))<>'48c709cc09e8a5ae215e9219143727c5' then raise exception 'FUNCTION_DRIFT on_raid_room_rescue_reward_finalized_v1()'; end if;
if to_regprocedure('public.raid_boss_defeat()') is null or md5(pg_get_functiondef(to_regprocedure('public.raid_boss_defeat()')))<>'5a7c2f185063303cdd712f6074a047e7' then raise exception 'FUNCTION_DRIFT raid_boss_defeat()'; end if;
if to_regprocedure('public.raid_room_can_read_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.raid_room_can_read_v1(uuid)')))<>'ed9422038f2bdc2886298edd9d310e33' then raise exception 'FUNCTION_DRIFT raid_room_can_read_v1(uuid)'; end if;
if to_regprocedure('public.raid_room_projection_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.raid_room_projection_v1(uuid)')))<>'0839c20e092587c1a2395d01b3ee29e9' then raise exception 'FUNCTION_DRIFT raid_room_projection_v1(uuid)'; end if;
if to_regprocedure('public.raid_season_reset()') is null or md5(pg_get_functiondef(to_regprocedure('public.raid_season_reset()')))<>'d3a814a6bf2a46eec5a916676285e693' then raise exception 'FUNCTION_DRIFT raid_season_reset()'; end if;
if to_regprocedure('public.record_raid_boss_damage_v2(uuid,text,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.record_raid_boss_damage_v2(uuid,text,integer)')))<>'aed48467e3910accde968188a0a8fce5' then raise exception 'FUNCTION_DRIFT record_raid_boss_damage_v2(uuid,text,integer)'; end if;
if to_regprocedure('public.record_raid_boss_damage(uuid,text,integer)') is null or md5(pg_get_functiondef(to_regprocedure('public.record_raid_boss_damage(uuid,text,integer)')))<>'7d8bb02940db32b284c745e474c2df30' then raise exception 'FUNCTION_DRIFT record_raid_boss_damage(uuid,text,integer)'; end if;
if to_regprocedure('public.register_raid_room_v1(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.register_raid_room_v1(uuid)')))<>'ce11001386767d0d11e51f4ee0a768ee' then raise exception 'FUNCTION_DRIFT register_raid_room_v1(uuid)'; end if;
if to_regprocedure('public.request_raid_room_rescue_v1(uuid,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.request_raid_room_rescue_v1(uuid,uuid)')))<>'1688fc2587f3a299a73ac7b0f6220e3a' then raise exception 'FUNCTION_DRIFT request_raid_room_rescue_v1(uuid,uuid)'; end if;
if to_regprocedure('public.respawn_cleared_raid_slot(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.respawn_cleared_raid_slot(uuid)')))<>'85d35269b885e53f60945c3669d4e5ed' then raise exception 'FUNCTION_DRIFT respawn_cleared_raid_slot(uuid)'; end if;
if to_regprocedure('public.rotate_daily_raids()') is null or md5(pg_get_functiondef(to_regprocedure('public.rotate_daily_raids()')))<>'7a00578d6d6671c7f52de5b87523876d' then raise exception 'FUNCTION_DRIFT rotate_daily_raids()'; end if;
if to_regprocedure('public.save_recommended_main_formation()') is null or md5(pg_get_functiondef(to_regprocedure('public.save_recommended_main_formation()')))<>'661294beb21b8c858e13ac09386ca521' then raise exception 'FUNCTION_DRIFT save_recommended_main_formation()'; end if;
if to_regprocedure('public.start_pvp_battle(uuid,text[],text)') is null or md5(pg_get_functiondef(to_regprocedure('public.start_pvp_battle(uuid,text[],text)')))<>'56157fe8200aa512a459b6fbd8333474' then raise exception 'FUNCTION_DRIFT start_pvp_battle(uuid,text[],text)'; end if;
if to_regprocedure('public.start_raid_battle(uuid,text[],text)') is null or md5(pg_get_functiondef(to_regprocedure('public.start_raid_battle(uuid,text[],text)')))<>'aac7cc20fd0bdb127716db3cbb0a949b' then raise exception 'FUNCTION_DRIFT start_raid_battle(uuid,text[],text)'; end if;
if to_regprocedure('public.start_raid_room_battle_v1(uuid,text[],text,uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.start_raid_room_battle_v1(uuid,text[],text,uuid)')))<>'5681fbadc02025793f5f683723d2b975' then raise exception 'FUNCTION_DRIFT start_raid_room_battle_v1(uuid,text[],text,uuid)'; end if;
if to_regprocedure('public.sync_and_evaluate_raid_timeout(uuid)') is null or md5(pg_get_functiondef(to_regprocedure('public.sync_and_evaluate_raid_timeout(uuid)')))<>'db263ff3e5eddae1bf468f328dffef44' then raise exception 'FUNCTION_DRIFT sync_and_evaluate_raid_timeout(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public._issue_raid_room_clear_rewards_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'OWNER_ACL_DRIFT _issue_raid_room_clear_rewards_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public._issue_raid_room_rescue_rewards_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'OWNER_ACL_DRIFT _issue_raid_room_rescue_rewards_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public._raid_room_add_member_v1(uuid,uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'OWNER_ACL_DRIFT _raid_room_add_member_v1(uuid,uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public._raid_room_clear_reward_progress_v1(uuid,uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'OWNER_ACL_DRIFT _raid_room_clear_reward_progress_v1(uuid,uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public._raid_room_power_gate_v1(text,bigint)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT _raid_room_power_gate_v1(text,bigint)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public._raid_room_register_v1(uuid,uuid,text)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'OWNER_ACL_DRIFT _raid_room_register_v1(uuid,uuid,text)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public._raid_room_rescue_gate_v1(text,boolean,bigint,bigint,boolean)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT _raid_room_rescue_gate_v1(text,boolean,bigint,bigint,boolean)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public._raid_room_rescue_reward_progress_v1(uuid,uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'OWNER_ACL_DRIFT _raid_room_rescue_reward_progress_v1(uuid,uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.acknowledge_raid_room_battle_recovery_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT acknowledge_raid_room_battle_recovery_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.admin_respawn_raid_boss(text,integer,text)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT admin_respawn_raid_boss(text,integer,text)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.calculate_user_total_power(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT calculate_user_total_power(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.cancel_raid_room_battle_request_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT cancel_raid_room_battle_request_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.canonical_pvp_rating_delta(integer,integer,text)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT canonical_pvp_rating_delta(integer,integer,text)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.canonical_raid_rotation_pair(date)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT canonical_raid_rotation_pair(date)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.complete_current_tutorial_formation()') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT complete_current_tutorial_formation()'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.consume_raid_attempt(uuid,text,integer)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT consume_raid_attempt(uuid,text,integer)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.create_raid_room_v1(text,text,uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT create_raid_room_v1(text,text,uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.finalize_expired_raid_instance(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT finalize_expired_raid_instance(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.finalize_expired_raid_room_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT finalize_expired_raid_room_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.finalize_expired_raid_rooms_v1(integer)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT finalize_expired_raid_rooms_v1(integer)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.finalize_raid_battle(uuid,jsonb)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT finalize_raid_battle(uuid,jsonb)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.finalize_raid_room_battle_v1(uuid,jsonb)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT finalize_raid_room_battle_v1(uuid,jsonb)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.finalize_raid_season_rewards(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT finalize_raid_season_rewards(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_active_raids()') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_active_raids()'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_current_raid_attempt_state()') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_current_raid_attempt_state()'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_current_raid_battle_rewards(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_current_raid_battle_rewards(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_my_raid_contribution_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_my_raid_contribution_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_pvp_opponents_page(uuid,integer,integer)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_pvp_opponents_page(uuid,integer,integer)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_raid_battle_route_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_raid_battle_route_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_raid_rankings(uuid,integer,integer)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_raid_rankings(uuid,integer,integer)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_raid_rankings(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_raid_rankings(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_raid_room_battle_result_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_raid_room_battle_result_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_raid_room_battle_start_receipt_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_raid_room_battle_start_receipt_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_raid_room_briefing_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_raid_room_briefing_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_raid_room_clear_reward_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_raid_room_clear_reward_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_raid_room_participants_v1(uuid,integer,integer)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_raid_room_participants_v1(uuid,integer,integer)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_raid_room_rescue_reward_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_raid_room_rescue_reward_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_raid_room_rescue_status_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_raid_room_rescue_status_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_raid_room_rescue_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_raid_room_rescue_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_raid_room_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_raid_room_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_raid_season_rankings(integer,integer)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT get_raid_season_rankings(integer,integer)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.grant_canonical_raid_day_clear_reward(uuid,uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT grant_canonical_raid_day_clear_reward(uuid,uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.grant_canonical_raid_reward(uuid,uuid,text,text)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT grant_canonical_raid_reward(uuid,uuid,text,text)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.grant_raid_completion_xp(text)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT grant_raid_completion_xp(text)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.grant_raid_reward(uuid,uuid,integer,text)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT grant_raid_reward(uuid,uuid,integer,text)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.join_raid_room_rescue_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT join_raid_room_rescue_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.list_raid_room_battle_recoveries_v1(integer)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT list_raid_room_battle_recoveries_v1(integer)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.list_raid_room_boss_choices_v1()') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT list_raid_room_boss_choices_v1()'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.list_raid_rooms_v1(text,integer,integer)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT list_raid_rooms_v1(text,integer,integer)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.on_raid_room_clear_reward_finalized_v1()') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'OWNER_ACL_DRIFT on_raid_room_clear_reward_finalized_v1()'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.on_raid_room_rescue_reward_finalized_v1()') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'OWNER_ACL_DRIFT on_raid_room_rescue_reward_finalized_v1()'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.raid_boss_defeat()') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT raid_boss_defeat()'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.raid_room_can_read_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres}') then raise exception 'OWNER_ACL_DRIFT raid_room_can_read_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.raid_room_projection_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT raid_room_projection_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.raid_season_reset()') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT raid_season_reset()'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.record_raid_boss_damage_v2(uuid,text,integer)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT record_raid_boss_damage_v2(uuid,text,integer)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.record_raid_boss_damage(uuid,text,integer)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT record_raid_boss_damage(uuid,text,integer)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.register_raid_room_v1(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT register_raid_room_v1(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.request_raid_room_rescue_v1(uuid,uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT request_raid_room_rescue_v1(uuid,uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.respawn_cleared_raid_slot(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT respawn_cleared_raid_slot(uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.rotate_daily_raids()') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT rotate_daily_raids()'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.save_recommended_main_formation()') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT save_recommended_main_formation()'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.start_pvp_battle(uuid,text[],text)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT start_pvp_battle(uuid,text[],text)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.start_raid_battle(uuid,text[],text)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT start_raid_battle(uuid,text[],text)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.start_raid_room_battle_v1(uuid,text[],text,uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,authenticated=X/postgres}') then raise exception 'OWNER_ACL_DRIFT start_raid_room_battle_v1(uuid,text[],text,uuid)'; end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.sync_and_evaluate_raid_timeout(uuid)') and pg_get_userbyid(proowner)='postgres' and proacl::text is not distinct from '{postgres=X/postgres,service_role=X/postgres}') then raise exception 'OWNER_ACL_DRIFT sync_and_evaluate_raid_timeout(uuid)'; end if;
if to_regprocedure('public.get_raid_top_v1()') is null or not has_function_privilege('authenticated','public.get_raid_top_v1()','EXECUTE') or has_function_privilege('anon','public.get_raid_top_v1()','EXECUTE') or exists(select 1 from pg_proc where oid='public.get_raid_top_v1()'::regprocedure and prosecdef) then raise exception 'WRAPPER_ACL get_raid_top_v1()'; end if;
if to_regprocedure('public.get_raid_room_display_v1(uuid)') is null or not has_function_privilege('authenticated','public.get_raid_room_display_v1(uuid)','EXECUTE') or has_function_privilege('anon','public.get_raid_room_display_v1(uuid)','EXECUTE') or exists(select 1 from pg_proc where oid='public.get_raid_room_display_v1(uuid)'::regprocedure and prosecdef) then raise exception 'WRAPPER_ACL get_raid_room_display_v1(uuid)'; end if;
if to_regprocedure('public.list_raid_room_cards_v1(text,integer)') is null or not has_function_privilege('authenticated','public.list_raid_room_cards_v1(text,integer)','EXECUTE') or has_function_privilege('anon','public.list_raid_room_cards_v1(text,integer)','EXECUTE') or exists(select 1 from pg_proc where oid='public.list_raid_room_cards_v1(text,integer)'::regprocedure and prosecdef) then raise exception 'WRAPPER_ACL list_raid_room_cards_v1(text,integer)'; end if;
if to_regprocedure('public.get_raid_rescue_cards_v1(uuid[])') is null or not has_function_privilege('authenticated','public.get_raid_rescue_cards_v1(uuid[])','EXECUTE') or has_function_privilege('anon','public.get_raid_rescue_cards_v1(uuid[])','EXECUTE') or exists(select 1 from pg_proc where oid='public.get_raid_rescue_cards_v1(uuid[])'::regprocedure and prosecdef) then raise exception 'WRAPPER_ACL get_raid_rescue_cards_v1(uuid[])'; end if;
if to_regprocedure('public.get_raid_enemy_info_v1(text,text)') is null or not has_function_privilege('authenticated','public.get_raid_enemy_info_v1(text,text)','EXECUTE') or has_function_privilege('anon','public.get_raid_enemy_info_v1(text,text)','EXECUTE') or exists(select 1 from pg_proc where oid='public.get_raid_enemy_info_v1(text,text)'::regprocedure and prosecdef) then raise exception 'WRAPPER_ACL get_raid_enemy_info_v1(text,text)'; end if;
if has_function_privilege('authenticated','private.raid_page_entry_v1(uuid,uuid)','EXECUTE') or has_function_privilege('anon','private.raid_page_entry_v1(uuid,uuid)','EXECUTE') or has_schema_privilege('anon','private','USAGE') then raise exception 'INTERNAL_HELPER_EXPOSURE';end if;
if exists((select * from raid_step6_data_before) except (select 'battle_replay_events' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."battle_replay_events" t
union all
select 'battle_replay_sessions' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."battle_replay_sessions" t
union all
select 'canonical_action_resource_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_action_resource_master" t
union all
select 'canonical_character_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_character_master" t
union all
select 'canonical_daily_activity_claims' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_daily_activity_claims" t
union all
select 'canonical_daily_ranking_reward_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_daily_ranking_reward_master" t
union all
select 'canonical_equipment_lb_slot_options' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_equipment_lb_slot_options" t
union all
select 'canonical_equipment_lb_steps' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_equipment_lb_steps" t
union all
select 'canonical_equipment_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_equipment_master" t
union all
select 'canonical_gameplay_master_versions' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_gameplay_master_versions" t
union all
select 'canonical_guild_donation_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_donation_master" t
union all
select 'canonical_guild_exp_source_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_exp_source_master" t
union all
select 'canonical_guild_progression_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_progression_master" t
union all
select 'canonical_guild_recruitment_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_recruitment_master" t
union all
select 'canonical_guild_role_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_role_master" t
union all
select 'canonical_item_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_item_master" t
union all
select 'canonical_master_freeze_versions' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_master_freeze_versions" t
union all
select 'canonical_preapply_compatibility_audit' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_preapply_compatibility_audit" t
union all
select 'canonical_pvp_production_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_pvp_production_master" t
union all
select 'canonical_pvp_ranking_rewards' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_pvp_ranking_rewards" t
union all
select 'canonical_quest_encounter_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_encounter_master" t
union all
select 'canonical_quest_enemy_pool_entries' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_enemy_pool_entries" t
union all
select 'canonical_quest_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_master" t
union all
select 'canonical_quest_resource_cost' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_resource_cost" t
union all
select 'canonical_quest_reward_pool_items' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_reward_pool_items" t
union all
select 'canonical_raid_boss_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_raid_boss_master" t
union all
select 'canonical_raid_production_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_raid_production_master" t
union all
select 'canonical_raid_reward_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_raid_reward_master" t
union all
select 'canonical_raid_variants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_raid_variants" t
union all
select 'canonical_reward_supply_sources' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_reward_supply_sources" t
union all
select 'canonical_skill_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_skill_master" t
union all
select 'canonical_user_level_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_user_level_master" t
union all
select 'presents' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."presents" t
union all
select 'raid_attempt_cost_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_attempt_cost_master" t
union all
select 'raid_boss_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_boss_master" t
union all
select 'raid_bosses' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_bosses" t
union all
select 'raid_clear_reward_claims' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_clear_reward_claims" t
union all
select 'raid_clear_reward_deliveries' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_clear_reward_deliveries" t
union all
select 'raid_completion_xp_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_completion_xp_grants" t
union all
select 'raid_damage_logs' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_damage_logs" t
union all
select 'raid_instance_user_progress' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_instance_user_progress" t
union all
select 'raid_legacy_settings' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_legacy_settings" t
union all
select 'raid_production_reward_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_production_reward_grants" t
union all
select 'raid_reward_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_reward_grants" t
union all
select 'raid_rewards_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_rewards_master" t
union all
select 'raid_room_battle_request_cancellations' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_battle_request_cancellations" t
union all
select 'raid_room_battle_settings' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_battle_settings" t
union all
select 'raid_room_battle_start_requests' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_battle_start_requests" t
union all
select 'raid_room_clear_reward_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_clear_reward_grants" t
union all
select 'raid_room_clear_reward_items' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_clear_reward_items" t
union all
select 'raid_room_clear_reward_rules' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_clear_reward_rules" t
union all
select 'raid_room_clear_rewards' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_clear_rewards" t
union all
select 'raid_room_creation_requests' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_creation_requests" t
union all
select 'raid_room_creation_settings' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_creation_settings" t
union all
select 'raid_room_difficulty_rules' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_difficulty_rules" t
union all
select 'raid_room_lifecycle_rules' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_lifecycle_rules" t
union all
select 'raid_room_members' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_members" t
union all
select 'raid_room_rescue_members' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_members" t
union all
select 'raid_room_rescue_publications' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_publications" t
union all
select 'raid_room_rescue_requests' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_requests" t
union all
select 'raid_room_rescue_reward_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_reward_grants" t
union all
select 'raid_room_rescue_reward_items' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_reward_items" t
union all
select 'raid_room_rescue_reward_rules' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_reward_rules" t
union all
select 'raid_room_rescue_rewards' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_rewards" t
union all
select 'raid_room_rescue_settings' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_settings" t
union all
select 'raid_rooms' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_rooms" t
union all
select 'ranking_raid_guild_season_snapshots' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."ranking_raid_guild_season_snapshots" t
union all
select 'ranking_raid_personal_season_snapshots' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."ranking_raid_personal_season_snapshots" t
union all
select 'user_characters' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."user_characters" t
union all
select 'user_equipments' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."user_equipments" t
union all
select 'user_main_formations' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."user_main_formations" t
union all
select 'user_raid_daily_attempts' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."user_raid_daily_attempts" t
union all
select 'users' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."users" t)) or exists((select 'battle_replay_events' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."battle_replay_events" t
union all
select 'battle_replay_sessions' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."battle_replay_sessions" t
union all
select 'canonical_action_resource_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_action_resource_master" t
union all
select 'canonical_character_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_character_master" t
union all
select 'canonical_daily_activity_claims' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_daily_activity_claims" t
union all
select 'canonical_daily_ranking_reward_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_daily_ranking_reward_master" t
union all
select 'canonical_equipment_lb_slot_options' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_equipment_lb_slot_options" t
union all
select 'canonical_equipment_lb_steps' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_equipment_lb_steps" t
union all
select 'canonical_equipment_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_equipment_master" t
union all
select 'canonical_gameplay_master_versions' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_gameplay_master_versions" t
union all
select 'canonical_guild_donation_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_donation_master" t
union all
select 'canonical_guild_exp_source_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_exp_source_master" t
union all
select 'canonical_guild_progression_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_progression_master" t
union all
select 'canonical_guild_recruitment_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_recruitment_master" t
union all
select 'canonical_guild_role_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_guild_role_master" t
union all
select 'canonical_item_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_item_master" t
union all
select 'canonical_master_freeze_versions' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_master_freeze_versions" t
union all
select 'canonical_preapply_compatibility_audit' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_preapply_compatibility_audit" t
union all
select 'canonical_pvp_production_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_pvp_production_master" t
union all
select 'canonical_pvp_ranking_rewards' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_pvp_ranking_rewards" t
union all
select 'canonical_quest_encounter_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_encounter_master" t
union all
select 'canonical_quest_enemy_pool_entries' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_enemy_pool_entries" t
union all
select 'canonical_quest_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_master" t
union all
select 'canonical_quest_resource_cost' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_resource_cost" t
union all
select 'canonical_quest_reward_pool_items' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_quest_reward_pool_items" t
union all
select 'canonical_raid_boss_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_raid_boss_master" t
union all
select 'canonical_raid_production_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_raid_production_master" t
union all
select 'canonical_raid_reward_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_raid_reward_master" t
union all
select 'canonical_raid_variants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_raid_variants" t
union all
select 'canonical_reward_supply_sources' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_reward_supply_sources" t
union all
select 'canonical_skill_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_skill_master" t
union all
select 'canonical_user_level_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."canonical_user_level_master" t
union all
select 'presents' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."presents" t
union all
select 'raid_attempt_cost_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_attempt_cost_master" t
union all
select 'raid_boss_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_boss_master" t
union all
select 'raid_bosses' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_bosses" t
union all
select 'raid_clear_reward_claims' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_clear_reward_claims" t
union all
select 'raid_clear_reward_deliveries' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_clear_reward_deliveries" t
union all
select 'raid_completion_xp_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_completion_xp_grants" t
union all
select 'raid_damage_logs' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_damage_logs" t
union all
select 'raid_instance_user_progress' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_instance_user_progress" t
union all
select 'raid_legacy_settings' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_legacy_settings" t
union all
select 'raid_production_reward_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_production_reward_grants" t
union all
select 'raid_reward_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_reward_grants" t
union all
select 'raid_rewards_master' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_rewards_master" t
union all
select 'raid_room_battle_request_cancellations' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_battle_request_cancellations" t
union all
select 'raid_room_battle_settings' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_battle_settings" t
union all
select 'raid_room_battle_start_requests' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_battle_start_requests" t
union all
select 'raid_room_clear_reward_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_clear_reward_grants" t
union all
select 'raid_room_clear_reward_items' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_clear_reward_items" t
union all
select 'raid_room_clear_reward_rules' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_clear_reward_rules" t
union all
select 'raid_room_clear_rewards' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_clear_rewards" t
union all
select 'raid_room_creation_requests' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_creation_requests" t
union all
select 'raid_room_creation_settings' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_creation_settings" t
union all
select 'raid_room_difficulty_rules' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_difficulty_rules" t
union all
select 'raid_room_lifecycle_rules' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_lifecycle_rules" t
union all
select 'raid_room_members' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_members" t
union all
select 'raid_room_rescue_members' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_members" t
union all
select 'raid_room_rescue_publications' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_publications" t
union all
select 'raid_room_rescue_requests' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_requests" t
union all
select 'raid_room_rescue_reward_grants' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_reward_grants" t
union all
select 'raid_room_rescue_reward_items' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_reward_items" t
union all
select 'raid_room_rescue_reward_rules' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_reward_rules" t
union all
select 'raid_room_rescue_rewards' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_rewards" t
union all
select 'raid_room_rescue_settings' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_room_rescue_settings" t
union all
select 'raid_rooms' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."raid_rooms" t
union all
select 'ranking_raid_guild_season_snapshots' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."ranking_raid_guild_season_snapshots" t
union all
select 'ranking_raid_personal_season_snapshots' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."ranking_raid_personal_season_snapshots" t
union all
select 'user_characters' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."user_characters" t
union all
select 'user_equipments' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."user_equipments" t
union all
select 'user_main_formations' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."user_main_formations" t
union all
select 'user_raid_daily_attempts' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."user_raid_daily_attempts" t
union all
select 'users' name,count(*)::bigint row_count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public."users" t) except (select * from raid_step6_data_before)) then raise exception 'PROTECTED_DATA_DRIFT'; end if;
if (select flags from raid_step6_controls_before) is distinct from (select jsonb_build_object('creation',(select jsonb_agg(to_jsonb(t)) from raid_room_creation_settings t),'battle',(select jsonb_agg(to_jsonb(t)) from raid_room_battle_settings t),'rescue',(select jsonb_agg(to_jsonb(t)) from raid_room_rescue_settings t))) or (select cron from raid_step6_controls_before) is distinct from (select md5(coalesce(string_agg(to_jsonb(j)::text,'' order by jobid),'')) from cron.job j) then raise exception 'CONTROL_DRIFT'; end if;
if not exists(select 1 from pg_class where oid='private.raid_daily_targets'::regclass and relrowsecurity) then raise exception 'DAILY_RLS_REQUIRED'; end if;
if exists(select 1 from private.raid_daily_targets) then raise exception 'UNEXPECTED_DAILY_WRITE'; end if;
if has_table_privilege('authenticated','private.raid_daily_targets','SELECT,INSERT,UPDATE,DELETE') or has_function_privilege('authenticated','private.raid_daily_targets_v1()','EXECUTE') then raise exception 'PRIVATE_AUTH_EXPOSURE'; end if;
end $post$;
insert into deployment_audit_raid_v1.applied_changes(project_ref,change_id,payload_sha256,source_commit,validation_commit,execution_id,operator_identity,approval_reference,baseline_sha256,postflight)
values('sufvuqdnqohpfzkwxohq','raid-preview-step6-four-sql-v1','cd7310f1ccc9b3a988fbd0fe8aed56e1015dbe4aa08b30ce5c3ca293e2e85298','2d2d2b1563e92f1471f9c86fa8a7cc59040ec726','2d2d2b1563e92f1471f9c86fa8a7cc59040ec726','c19b5615-aaed-4c29-a3cd-73a2a801729e','Codex parent','User authorized Raid Preview step6 fixed four SQL','da4780ead5dcbe8b6eea113b30ec49a37bcb3c713dc33e57629e5ec5f4b9c058','{"status":"PASS","sourceHashes":{"20260908175140_raid_top_daily_authority.sql":"36621aa30007457f5e190896ffed90e3a0631e10eafc4cd469007537cb5ca14d","20260908175143_raid_top_aggregate_api.sql":"34e1225b717b267760ebe90495203162630680fb52b67e9c08b0121d4b2d3d18","20260908181251_raid_room_display_projection.sql":"7944c2a068ea7ec78be6ad88823dbdc5aeac2ee0027a7000bc0003b8b7757e73","20260909023226_raid_remaining_pages_projection.sql":"14cb3052ffe7218730aab65640f0f484634d4cf43f8e4d56158dcc320b3a7ffb"},"checks":"protected-functions/data/controls/daily-RLS-and-ACL"}'::jsonb);
notify pgrst,'reload schema';
select change_id,execution_id,payload_sha256 from deployment_audit_raid_v1.applied_changes where change_id='raid-preview-step6-four-sql-v1';

begin; set local lock_timeout='2s'; set local statement_timeout='30s';
do $$ begin if exists(select 1 from deployment_audit_raid_v1.applied_changes where project_ref='sufvuqdnqohpfzkwxohq' and change_id='raid-preview-room-enable-v1') then raise exception 'ALREADY_APPLIED'; end if; end $$;
do $$ begin if exists(select 1 from raid_legacy_settings where enabled) then raise exception 'Legacy still enabled'; end if; end $$;
update raid_room_rescue_reward_rules set enabled=true;
update raid_room_clear_reward_rules set enabled=true;
update raid_room_creation_settings set enabled=true where singleton;
update raid_room_battle_settings set enabled=true where singleton;
update raid_room_rescue_settings set enabled=true where singleton;
do $$ begin if not exists(select 1 from raid_room_creation_settings where enabled) or not exists(select 1 from raid_room_battle_settings where enabled) or not exists(select 1 from raid_room_rescue_settings where enabled) or (select count(*) from raid_room_clear_reward_rules where enabled)<>4 or (select count(*) from raid_room_rescue_reward_rules where enabled)<>4 then raise exception 'Enable check failed'; end if; end $$;
insert into deployment_audit_raid_v1.applied_changes(project_ref,change_id,payload_sha256,source_commit,validation_commit,execution_id,operator_identity,approval_reference,baseline_sha256,postflight)
values('sufvuqdnqohpfzkwxohq','raid-preview-room-enable-v1','d292c2b1d9736959e89cd7f320912e2bb5f15578e31eff1d75941a62cd7900fd','375a0ad642a81e9db10a9379f03e5e5f77fb4562','99c534bb63a2659b5569d339b3ff51c49d398339','e0bfac1f-3258-4554-a976-2f46d4dcba9a','Codex','User authorized Preview connection and smoke test 2026-09-08','8cff488a10738d354240ff7ed958d303dbd15da907b29edee233aa7b9183bca5','{"status":"PASS","scope":"raid-preview-room-enable-v1"}');
select change_id,payload_sha256,transaction_id from deployment_audit_raid_v1.applied_changes where change_id='raid-preview-room-enable-v1';
commit;

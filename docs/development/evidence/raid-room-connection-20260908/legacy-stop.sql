begin; set local lock_timeout='2s'; set local statement_timeout='30s';
do $$ begin if exists(select 1 from deployment_audit_raid_v1.applied_changes where project_ref='sufvuqdnqohpfzkwxohq' and change_id='raid-preview-legacy-stop-v1') then raise exception 'ALREADY_APPLIED'; end if; end $$;
update public.raid_legacy_settings set enabled=false where singleton;
do $$ begin if not exists(select 1 from raid_legacy_settings where singleton and not enabled) then raise exception 'Legacy stop failed'; end if; end $$;
insert into deployment_audit_raid_v1.applied_changes(project_ref,change_id,payload_sha256,source_commit,validation_commit,execution_id,operator_identity,approval_reference,baseline_sha256,postflight)
values('sufvuqdnqohpfzkwxohq','raid-preview-legacy-stop-v1','872961981727fd2ceb9151069b82691054a72bb76582d86141a995badd77c8d8','375a0ad642a81e9db10a9379f03e5e5f77fb4562','99c534bb63a2659b5569d339b3ff51c49d398339','10ee99de-d7a6-461c-a19e-31d3dcc7074c','Codex','User authorized Preview connection and smoke test 2026-09-08','a4adfefa3aaa2a1a952036441c1af1d3fb784871e7fb4270332489c1596f4860','{"status":"PASS","scope":"raid-preview-legacy-stop-v1"}');
select change_id,payload_sha256,transaction_id from deployment_audit_raid_v1.applied_changes where change_id='raid-preview-legacy-stop-v1';
commit;

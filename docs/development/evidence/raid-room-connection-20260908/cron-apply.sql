begin; set local lock_timeout='2s'; set local statement_timeout='30s';
do $$ begin if exists(select 1 from deployment_audit_raid_v1.applied_changes where project_ref='sufvuqdnqohpfzkwxohq' and change_id='raid-preview-expiry-cron-v1') then raise exception 'ALREADY_APPLIED'; end if; end $$;
do $$ begin if exists(select 1 from cron.job where jobname='raid-room-expiry-minute') then raise exception 'Cron exists'; end if; perform cron.schedule('raid-room-expiry-minute','* * * * *','select public.finalize_expired_raid_rooms_v1(100);'); end $$;
do $$ begin if (select count(*) from cron.job where jobname='raid-room-expiry-minute' and active)<>1 then raise exception 'Cron missing'; end if; end $$;
insert into deployment_audit_raid_v1.applied_changes(project_ref,change_id,payload_sha256,source_commit,validation_commit,execution_id,operator_identity,approval_reference,baseline_sha256,postflight)
values('sufvuqdnqohpfzkwxohq','raid-preview-expiry-cron-v1','376ac1b2cd0a9c86671a435837ca530a6ad8974712cc717ddc43bdd615a499a2','375a0ad642a81e9db10a9379f03e5e5f77fb4562','99c534bb63a2659b5569d339b3ff51c49d398339','19b15129-2ef1-410e-b59c-d31f2ca3ce7b','Codex','User authorized Preview connection and smoke test 2026-09-08','3d8f05264bbf390e002158923445438a733aeb27ac9ec8b654c725a9ff461b20','{"status":"PASS","scope":"raid-preview-expiry-cron-v1"}');
select change_id,payload_sha256,transaction_id from deployment_audit_raid_v1.applied_changes where change_id='raid-preview-expiry-cron-v1';
commit;

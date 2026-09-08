-- EXECUTED ONLY IN AUTHORIZED PREVIEW WINDOW. QA current HP only; maximum HP, masters and authoritative results unchanged.
begin; set local lock_timeout='2s'; set local statement_timeout='30s';
do $$ begin if exists(select 1 from deployment_audit_raid_v1.applied_changes where change_id='raid-preview-qa-hp-acceptance-v1') then raise exception 'ALREADY_APPLIED'; end if; end $$;
do $qa$ declare n integer; v_other text; begin
perform 1 from public.raid_bosses where id='c127f1da-9a60-4919-b351-6a99412574d7' and status='ACTIVE' and outcome is null and current_hp=31988539 and max_hp=32000000 for update;
if not found then raise exception 'QA HP baseline mismatch'; end if;
if not exists(select 1 from public.raid_rooms where id='af908a71-b5c3-4a73-9ef8-e1ab2b9b62e3' and raid_boss_instance_id='c127f1da-9a60-4919-b351-6a99412574d7' and owner_user_id='fadc944c-0b15-472c-be4d-305c26d8163f') then raise exception 'Wrong QA Room'; end if;
if (select count(*) from public.raid_room_members where room_id='af908a71-b5c3-4a73-9ef8-e1ab2b9b62e3')<>3 or exists(select 1 from public.raid_room_members where room_id='af908a71-b5c3-4a73-9ef8-e1ab2b9b62e3' and user_id not in ('fadc944c-0b15-472c-be4d-305c26d8163f','25975265-f042-4dd1-8ffc-a12f8414a035','5c53fd8d-245b-49da-8ca6-b7afd6b7e6f0')) then raise exception 'Non-QA membership'; end if;
if exists(select 1 from public.raid_room_battle_start_requests q join public.battle_replay_sessions s on s.id=q.replay_session_id where q.room_id='af908a71-b5c3-4a73-9ef8-e1ab2b9b62e3' and s.finalization_status='PENDING') then raise exception 'Pending battle'; end if;
select md5(jsonb_agg(to_jsonb(b) order by b.id)::text) into v_other from public.raid_bosses b where id<>'c127f1da-9a60-4919-b351-6a99412574d7';
update public.raid_bosses set current_hp=25000 where id='c127f1da-9a60-4919-b351-6a99412574d7' and current_hp=31988539;
get diagnostics n=row_count; if n<>1 then raise exception 'Wrong changed row count'; end if;
if v_other is distinct from (select md5(jsonb_agg(to_jsonb(b) order by b.id)::text) from public.raid_bosses b where id<>'c127f1da-9a60-4919-b351-6a99412574d7') then raise exception 'Other boss changed'; end if;
end $qa$;
insert into deployment_audit_raid_v1.applied_changes(project_ref,change_id,payload_sha256,source_commit,validation_commit,execution_id,operator_identity,approval_reference,baseline_sha256,postflight) values('sufvuqdnqohpfzkwxohq','raid-preview-qa-hp-acceptance-v1','c675c4cdea6507bbf0a4b0530063ce8d09b5f76e375b0f5ef13c1d29f0ee3526','375a0ad642a81e9db10a9379f03e5e5f77fb4562','251dc03fcd9a1dcf9c9f871ff09223613788cadf','838bc48f-5950-40e3-8aff-964e402ebd05','Codex','User approved dedicated QA Room HP adjustment and legitimate clear 2026-09-08','e31890d6fbe1ba5fb40583e31684500cd31d86937c639100786b28688a08ed21','{"status":"PASS","beforeHp":31988539,"afterHp":25000,"maxHpUnchanged":32000000,"reason":"Allow rescue damage 16000 before legitimate QA clear"}');
select current_hp,max_hp,status,outcome from public.raid_bosses where id='c127f1da-9a60-4919-b351-6a99412574d7';
commit;

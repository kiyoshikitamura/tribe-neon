-- PREPARED ONLY. Parent runs after ordinary battles/ack establish all qualifications.
-- Set LOCAL raid.step6_expected_hp to freshly read exact current_hp inside this transaction.
-- Set LOCAL raid.step6_fixture_execution_id to a new UUID. Default is ROLLBACK.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
set local search_path=pg_catalog,public;
set local raid.step6_expected_hp='27972100';
set local raid.step6_fixture_execution_id='2c9f77d8-851c-49c4-b13c-a07e54f16a68';
create temp table step6_qa_fixture_evidence(before_boss jsonb,after_boss jsonb,execution_id uuid) on commit drop;
do $qa_fixture$
declare
 v_room uuid:='a6940cc4-12eb-4c64-ba80-af3430134e96';
 v_boss uuid:='2aec4aba-e56b-4e71-bbdf-f08071ec3fa4';
 v_host uuid:='fadc944c-0b15-472c-be4d-305c26d8163f';
 v_normal uuid:='25975265-f042-4dd1-8ffc-a12f8414a035';
 v_rescue uuid:='5c53fd8d-245b-49da-8ca6-b7afd6b7e6f0';
 v_user uuid;v_expected bigint;v_execution uuid;v_before jsonb;v_after jsonb;
 v_clear jsonb;v_rescue_progress jsonb;v_count integer;v_rules text;v_other_bosses text;v_master text;
begin
 if session_user<>'postgres' then raise exception 'ADMIN_REQUIRED';end if;
 v_expected:=nullif(current_setting('raid.step6_expected_hp',true),'')::bigint;
 v_execution:=nullif(current_setting('raid.step6_fixture_execution_id',true),'')::uuid;
 if v_expected is null or v_expected<=1 or v_execution is null then raise exception 'FRESH_EXPECTED_HP_AND_EXECUTION_ID_REQUIRED';end if;
 if not pg_try_advisory_xact_lock(20260909,6001) then raise exception 'QA_FIXTURE_BUSY';end if;
 if not exists(select 1 from deployment_audit_raid_v1.applied_changes where change_id='raid-preview-step6-four-sql-v1' and project_ref='sufvuqdnqohpfzkwxohq') then raise exception 'PREVIEW_LEDGER_REQUIRED';end if;
 perform id from public.users where id=any(array[v_host,v_normal,v_rescue]) order by id for update;
 select to_jsonb(b) into v_before from public.raid_bosses b where id=v_boss for update;
 if v_before is null then raise exception 'TARGET_BOSS_MISSING';end if;
 lock table public.raid_room_difficulty_rules,public.raid_room_clear_reward_rules,public.raid_room_clear_reward_items,public.raid_room_rescue_reward_rules,public.raid_room_rescue_reward_items,public.canonical_raid_variants in share mode;
 if not exists(select 1 from public.raid_rooms where id=v_room and raid_boss_instance_id=v_boss and owner_user_id=v_host and difficulty_id='beginner' and created_at='2026-09-09 05:15:50.362999+00') then raise exception 'TARGET_ROOM_DRIFT';end if;
 if v_before->>'status'<>'ACTIVE' or v_before->>'outcome' is not null or v_before->>'outcome_finalized_at' is not null
 or (v_before->>'current_hp')::bigint<>v_expected or (v_before->>'max_hp')::bigint<>28000000
 or v_before->>'raid_variant_id'<>'RAID_SHIBUYA_V1' or (v_before->>'expires_at')::timestamptz<>'2026-09-10 05:15:50.362999+00'
 or (v_before->>'expires_at')::timestamptz<=clock_timestamp() then raise exception 'TARGET_BOSS_DRIFT';end if;
 if (select count(*) from raid_room_members where room_id=v_room)<>3 then raise exception 'UNEXPECTED_MEMBER';end if;
 foreach v_user in array array[v_host,v_normal,v_rescue] loop
  if not exists(select 1 from raid_room_members where room_id=v_room and user_id=v_user) or not exists(select 1 from kpi_subjects s join kpi_account_classification_periods p using(subject_id) where s.source_user_id=v_user and p.classification in ('qa','test') and p.valid_from<=clock_timestamp() and (p.valid_to is null or p.valid_to>clock_timestamp())) then raise exception 'QA_MEMBERSHIP_REQUIRED';end if;
  v_clear:=public._raid_room_clear_reward_progress_v1(v_room,v_user);
  if coalesce((v_clear->>'finalizedBattles')::bigint,0)<1 or coalesce((v_clear->>'contributionDamage')::bigint,0)<=0 then raise exception 'ORDINARY_CLEAR_CONTRIBUTION_REQUIRED';end if;
 end loop;
 if not exists(select 1 from raid_room_rescue_members where room_id=v_room and user_id=v_rescue and rescue_id='4f939109-80c9-412d-a45d-4f577c64ccda') then raise exception 'ORIGINAL_RESCUE_MEMBERSHIP_REQUIRED';end if;
 v_rescue_progress:=public._raid_room_rescue_reward_progress_v1(v_room,v_rescue);
 if coalesce((v_rescue_progress->>'finalizedBattles')::bigint,0)<2 or coalesce((v_rescue_progress->>'contributionDamage')::bigint,0)<16000 then raise exception 'ORDINARY_RESCUE_PROGRESS_REQUIRED';end if;
 if exists(select 1 from raid_room_battle_start_requests s left join battle_replay_sessions b on b.id=s.replay_session_id where s.room_id=v_room and (b.finalization_status is distinct from 'FINALIZED' or s.recovery_acknowledged_at is null)) then raise exception 'PENDING_REPLAY_OR_ACK';end if;
 select md5(jsonb_build_object('difficulty',(select jsonb_agg(to_jsonb(x) order by difficulty) from raid_room_difficulty_rules x),'clear_rules',(select jsonb_agg(to_jsonb(x) order by difficulty) from raid_room_clear_reward_rules x),'clear_items',(select jsonb_agg(to_jsonb(x) order by difficulty,item_id) from raid_room_clear_reward_items x),'rescue_rules',(select jsonb_agg(to_jsonb(x) order by difficulty) from raid_room_rescue_reward_rules x),'rescue_items',(select jsonb_agg(to_jsonb(x) order by difficulty,item_id) from raid_room_rescue_reward_items x))::text) into v_rules;
 if v_rules<>'88c5a72e3c8dfcec75eb1a2cb1d0080a' then raise exception 'REWARD_RULE_DRIFT';end if;
 if not exists(select 1 from raid_rooms r join raid_bosses b on b.id=r.raid_boss_instance_id where r.id='3972a461-b45f-4b02-8142-75f294461ae3' and md5(to_jsonb(r)::text)='fcb843a1e0a947318806edc580044ae8' and md5(to_jsonb(b)::text)='a6b8e91f9b6bf9b33e2bbcc79aa3b96d') or not exists(select 1 from raid_rooms r join raid_bosses b on b.id=r.raid_boss_instance_id where r.id='af908a71-b5c3-4a73-9ef8-e1ab2b9b62e3' and md5(to_jsonb(r)::text)='14b2d1f2af459ea792f6e63e192c4264' and md5(to_jsonb(b)::text)='ab75df0b2de18080af1195730aa9b9f6') then raise exception 'PROTECTED_ROOM_DRIFT_NO_REPAIR';end if;
 select md5(coalesce(string_agg(to_jsonb(b)::text,'' order by id),'')) into v_other_bosses from raid_bosses b where id<>v_boss;
 select md5(coalesce(string_agg(to_jsonb(m)::text,'' order by raid_variant_id),'')) into v_master from canonical_raid_variants m;
 update public.raid_bosses set current_hp=1 where id=v_boss and current_hp=v_expected returning to_jsonb(raid_bosses) into v_after;
 get diagnostics v_count=row_count;
 if v_count<>1 or (v_before-'current_hp') is distinct from (v_after-'current_hp') then raise exception 'ONLY_ONE_HP_FIELD_ALLOWED';end if;
 if v_other_bosses is distinct from (select md5(coalesce(string_agg(to_jsonb(b)::text,'' order by id),'')) from raid_bosses b where id<>v_boss) or v_master is distinct from (select md5(coalesce(string_agg(to_jsonb(m)::text,'' order by raid_variant_id),'')) from canonical_raid_variants m) then raise exception 'OTHER_DATA_CHANGED';end if;
 insert into step6_qa_fixture_evidence values(v_before,v_after,v_execution);
end $qa_fixture$;
select * from step6_qa_fixture_evidence;
commit;

-- Appended to the candidate inside one transaction by the build script.
-- No live player is changed. Auth identities below are synthetic SQL fixtures;
-- this proves the DB contract, not Google's live OAuth flow or HTTP hook loading.
create temporary table replacement_test_evidence(test text primary key, passed boolean);
create function pg_temp.account_hash(p_uid uuid) returns text language plpgsql as $$
declare r record; v jsonb := '{}'::jsonb; part jsonb;
begin
  select jsonb_build_object('game',(select to_jsonb(u) from public.users u where id=p_uid),
    'auth',(select to_jsonb(u) from auth.users u where id=p_uid),
    'identities',(select jsonb_agg(to_jsonb(i) order by id) from auth.identities i where user_id=p_uid)) into v;
  for r in select distinct n.nspname,c.relname,a.attname from pg_constraint fk
    join pg_class c on c.oid=fk.conrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum=any(fk.conkey)
    where fk.contype='f' and fk.confrelid='public.users'::regclass
  loop
    execute format('select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from %I.%I t where %I=$1',r.nspname,r.relname,r.attname) into part using p_uid;
    v := v || jsonb_build_object(r.nspname||'.'||r.relname||'.'||r.attname,part);
  end loop;
  return md5(v::text);
end;
$$;
create temporary table replacement_real_before as
select id,pg_temp.account_hash(id) digest from public.users
where id in ('b9463c1d-8758-4b43-bfa9-8a1735767c73','ac8d2a50-c900-4302-b920-282a3c9eb260');

do $$
declare
 s uuid := '9f9f0000-0000-4000-8000-000000000001';
 d uuid := '9f9f0000-0000-4000-8000-000000000002';
 i uuid := '9f9f0000-0000-4000-8000-000000000003';
 cid uuid := '9f9f0000-0000-4000-8000-000000000004';
 before_source text; before_dest text; result jsonb; rejected boolean;
begin
 if exists(select 1 from auth.users where id in(s,d)) or exists(select 1 from public.users where id in(s,d)) then raise exception 'Fixture collision'; end if;
 insert into auth.users(id,aud,role,is_anonymous,created_at,updated_at) values
 (s,'authenticated','authenticated',true,now(),now()),(d,'authenticated','authenticated',false,now(),now());
 insert into auth.identities(user_id,provider,provider_id,identity_data) values
 (d,'google','qa-rollback-google-sub',jsonb_build_object('sub','qa-rollback-google-sub'));
 insert into public.users(id,username) values(s,'QA置換元'),(d,'QA置換先');
 insert into public.user_characters(id,user_id,character_id) select cid,d,character_id from public.canonical_character_master order by character_id limit 1;
 insert into public.user_main_formations(user_id,slot,user_character_id) values(d,1,cid);
 insert into public.user_items(user_id,item_id,quantity) values(d,'CHAR_EXP_S',3);
 insert into public.tutorial_progress(user_id,step_id) values(d,'COMPLETE') on conflict(user_id) do nothing;
 insert into public.preview_google_replacement_intents(id,source_user_id,destination_user_id,google_subject,current_username,existing_username,status,expires_at)
 values(i,s,d,'qa-rollback-google-sub','QA置換元','QA置換先','PREPARED',now()+interval '15 minutes');
 before_source:=pg_temp.account_hash(s); before_dest:=pg_temp.account_hash(d);
 -- Authenticated callers cannot invoke retirement. JWT check also defends an
 -- accidentally broadened function grant (service-only ACL checked separately).
 perform set_config('request.jwt.claims',jsonb_build_object('sub',s,'role','authenticated')::text,true);
 rejected:=false;
 begin perform public.retire_preview_google_game(i); exception when others then if sqlerrm='Service role required' then rejected:=true; else raise; end if; end;
 if not rejected or before_source<>pg_temp.account_hash(s) or before_dest<>pg_temp.account_hash(d) then raise exception 'service isolation FAIL'; end if;
 insert into replacement_test_evidence values('service_role_only',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 -- Unknown new FK references fail closed, including otherwise cascading data.
 create table public.qa_replacement_protected_fixture(user_id uuid references public.users(id) on delete cascade);
 insert into public.qa_replacement_protected_fixture values(d);
 rejected:=false;
 begin perform public.retire_preview_google_game(i); exception when others then if sqlerrm='Protected account history requires operations review' then rejected:=true; else raise; end if; end;
 if not rejected or (select status from public.preview_google_replacement_intents where id=i)<>'PREPARED' or not exists(select 1 from public.users where id=d) then raise exception 'unknown reference FAIL'; end if;
 drop table public.qa_replacement_protected_fixture;
 if before_source<>pg_temp.account_hash(s) or before_dest<>pg_temp.account_hash(d) then raise exception 'protected rollback changed players'; end if;
 insert into replacement_test_evidence values('unknown_reference_fail_closed_and_atomic',true);
 -- Real protected competitive history cannot be skipped merely because FK cascades.
 insert into public.pvp_defense_logs(user_id) values(d);
 rejected:=false;
 begin perform public.retire_preview_google_game(i); exception when others then if sqlerrm='Protected account history requires operations review' then rejected:=true; else raise; end if; end;
 if not rejected or (select status from public.preview_google_replacement_intents where id=i)<>'PREPARED' then raise exception 'competitive reference FAIL'; end if;
 delete from public.pvp_defense_logs where user_id=d;
 insert into replacement_test_evidence values('competitive_history_fail_closed',true);
 -- A failing delete trigger must roll DELETING back as well as the profile.
 create function pg_temp.refuse_fixture_delete() returns trigger language plpgsql as $guard$
 begin raise exception 'QA_DELETE_REFUSED'; end; $guard$;
 create trigger qa_refuse_fixture_delete before delete on public.users for each row when(old.id='9f9f0000-0000-4000-8000-000000000002') execute function pg_temp.refuse_fixture_delete();
 rejected:=false;
 begin perform public.retire_preview_google_game(i); exception when others then if sqlerrm='QA_DELETE_REFUSED' then rejected:=true; else raise; end if; end;
 if not rejected or (select status from public.preview_google_replacement_intents where id=i)<>'PREPARED' or before_dest<>pg_temp.account_hash(d) then raise exception 'delete failure atomicity FAIL'; end if;
 drop trigger qa_refuse_fixture_delete on public.users;
 insert into replacement_test_evidence values('deleting_and_profile_delete_atomic',true);
 result:=public.retire_preview_google_game(i);
 if result->>'status'<>'DELETING' or exists(select 1 from public.users where id=d) or exists(select 1 from public.user_main_formations where user_id=d) or exists(select 1 from public.user_characters where user_id=d) or exists(select 1 from public.tutorial_progress where user_id=d) then raise exception 'basic account retirement FAIL'; end if;
 if not exists(select 1 from auth.users where id=d) or not exists(select 1 from auth.identities where user_id=d) then raise exception 'SQL must not delete Auth'; end if;
 if before_source<>pg_temp.account_hash(s) then raise exception 'guest preservation FAIL'; end if;
 insert into replacement_test_evidence values('basic_references_cascade_and_guest_unchanged',true),('auth_deletion_deferred_to_supported_admin_api',true);
 result:=public.retire_preview_google_game(i);
 if result->>'status'<>'DELETING' then raise exception 'retry FAIL'; end if;
 insert into replacement_test_evidence values('retirement_retry_idempotent',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',d,'role','authenticated')::text,true);
 rejected:=false;
 begin perform public.reject_retired_google_account(); exception when sqlstate 'PT401' then rejected:=true; end;
 if not rejected then raise exception 'old token guard FAIL'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',s,'role','authenticated')::text,true);
 perform public.reject_retired_google_account();
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.reject_retired_google_account();
 insert into replacement_test_evidence values('old_uid_guard_and_source_service_pass',true);
 if has_function_privilege('authenticated','public.retire_preview_google_game(uuid)','EXECUTE') or has_function_privilege('anon','public.retire_preview_google_game(uuid)','EXECUTE') or has_table_privilege('authenticated','public.preview_google_replacement_intents','INSERT') then raise exception 'service ACL FAIL'; end if;
 insert into replacement_test_evidence values('ledger_and_retirement_acl',true);
 if (select count(*) from replacement_real_before)<>2 or exists(select 1 from replacement_real_before where digest<>pg_temp.account_hash(id)) then raise exception 'real players changed'; end if;
 insert into replacement_test_evidence values('both_real_players_all_referenced_data_unchanged',true);
end;
$$;
select jsonb_build_object('scope','Preview SQL rollback only; live Google/HTTP not tested','tests',(select jsonb_agg(to_jsonb(t) order by test) from replacement_test_evidence t),'all_pass',(select bool_and(passed) from replacement_test_evidence));
rollback;

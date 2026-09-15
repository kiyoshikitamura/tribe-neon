-- 新規作成済み3ユーザーだけをQA分類する後続工程用template。未実行。
-- psql -v host_user_id=... -v normal_user_id=... -v rescue_user_id=...
--      -v run_started_at=... -f 06-test-account-classification.psql
-- run_started_atは3件の新規Authを作る直前に保存したUTC時刻。既存IDを渡さない。

begin;
set local statement_timeout='10s';
set local lock_timeout='2s';
create temporary table raid_step2_test_manifest(role text primary key,user_id uuid unique,started_at timestamptz) on commit drop;
insert into raid_step2_test_manifest values
 ('host','fadc944c-0b15-472c-be4d-305c26d8163f'::uuid,'2026-09-08T10:22:54.545Z'::timestamptz),
 ('normal','25975265-f042-4dd1-8ffc-a12f8414a035'::uuid,'2026-09-08T10:22:54.545Z'::timestamptz),
 ('rescue','5c53fd8d-245b-49da-8ca6-b7afd6b7e6f0'::uuid,'2026-09-08T10:22:54.545Z'::timestamptz);
do $guard$
begin
 if (select count(*) from raid_step2_test_manifest m join auth.users a on a.id=m.user_id
     join public.users u on u.id=m.user_id join public.kpi_subjects s on s.source_user_id=u.id
     where a.created_at>=m.started_at and u.created_at>=m.started_at and s.registered_at>=m.started_at)<>3 then
   raise exception '新規3ユーザー・Game Start・KPI subjectの一致が必要';
 end if;
 if exists(select 1 from raid_step2_test_manifest m join public.kpi_subjects s on s.source_user_id=m.user_id
   join public.kpi_account_classification_periods p on p.subject_id=s.subject_id) then
   raise exception '分類履歴が既に存在。再実行せず内容を確認';
 end if;
end $guard$;
insert into public.kpi_account_classification_periods(subject_id,classification,valid_from,reason)
 select s.subject_id,'qa',s.registered_at,'Raid工程2専用fixture / 375a0ad / '||m.role
 from raid_step2_test_manifest m join public.kpi_subjects s on s.source_user_id=m.user_id;
select m.role,s.subject_id,public.kpi_is_subject_excluded(s.subject_id,s.registered_at) as excluded_from_start
 from raid_step2_test_manifest m join public.kpi_subjects s on s.source_user_id=m.user_id;
commit;
-- 保存は後続工程で上記ROLLBACKをCOMMITへ変更。既存KPI定義・Cron・raw factは保持。

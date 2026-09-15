-- 未適用候補。許可ユーザー行は投入しない。本番適用・本人ID登録は別承認。
begin;
create table public.operations_maintenance_testers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 reason text not null,
 check (expires_at > created_at and expires_at <= created_at + interval '24 hours')
);
alter table public.operations_maintenance_testers enable row level security;
revoke all on public.operations_maintenance_testers from public, anon, authenticated;
grant select on public.operations_maintenance_testers to authenticated;
grant all on public.operations_maintenance_testers to service_role;
create policy maintenance_tester_self_read on public.operations_maintenance_testers
 for select to authenticated using (user_id=(select auth.uid()) and expires_at>now());

create function public.is_operations_maintenance_tester() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.operations_maintenance_testers
 where user_id=auth.uid() and expires_at>now())
$$;
revoke all on function public.is_operations_maintenance_tester() from public,anon;
grant execute on function public.is_operations_maintenance_tester() to authenticated,service_role;

-- 既存関数全体を旧版で上書きせず、確認済みメンテナンス条件だけ変更。
do $$
declare target text; source text; old_condition text;
begin
 foreach target in array array['public.reject_mutation_during_maintenance()','public.assert_feature_mutation_allowed(text)'] loop
  source:=pg_get_functiondef(target::regprocedure);
  old_condition:='public.operations_feature_state(''MAINTENANCE'')=''MAINTENANCE''';
  if position(old_condition in source)=0 or position('is_operations_maintenance_tester' in source)>0 then
   raise exception 'MAINTENANCE_SOURCE_MISMATCH: %',target;
  end if;
  execute replace(source,old_condition,old_condition||' and not public.is_operations_maintenance_tester()');
 end loop;
end $$;
commit;

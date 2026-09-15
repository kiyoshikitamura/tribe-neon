-- Preview適用後。ユーザー資産・履歴へ書き込まず実RPCを検証。
begin;
set local statement_timeout='15s';
do $$
declare v_uid uuid;
begin
  select id into strict v_uid from public.users limit 1;
  perform set_config('request.jwt.claim.sub',v_uid::text,true);
  if exists(select 1 from public.get_recent_social_activity_feed(50)
    where activity_type in ('SSR_CHARACTER','SSR_SKILL','SSR_EQUIPMENT')) then
    raise exception 'SSR remains visible';
  end if;
  if exists(select 1 from pg_trigger where tgrelid='public.gacha_execution_history'::regclass
    and tgname='m9x_gacha_activity_trigger') then raise exception 'SSR generator remains'; end if;
end $$;
select 'PASS' as ssr_activity_hidden;
rollback;

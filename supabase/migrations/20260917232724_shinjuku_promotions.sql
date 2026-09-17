begin;
create table public.user_promotion_presentations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 promotion_id text not null check (promotion_id in ('beginner_pack','tribe_join')),
 period_key text not null,
 visit_id uuid not null,
 lease_until timestamptz not null,
 viewed_at timestamptz,
 action text check(action in ('primary_cta','later')),
 action_at timestamptz,
 unique(user_id,promotion_id,period_key)
);
create index user_promotion_presentations_visit on public.user_promotion_presentations(user_id,visit_id);
alter table public.user_promotion_presentations enable row level security;
revoke all on public.user_promotion_presentations from public,anon,authenticated;
grant select on public.user_promotion_presentations to authenticated;
grant all on public.user_promotion_presentations to service_role;
create policy promotion_owner_read on public.user_promotion_presentations for select to authenticated using(user_id=(select auth.uid()));

-- All mutation is performed here; clients cannot manufacture view history or another user's lease.
create function public.promotion_dialog(p_operation text,p_visit_id uuid,p_presentation_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.user_promotion_presentations; promo text; period text;
 now_at timestamptz:=clock_timestamp(); today text:=(clock_timestamp() at time zone 'Asia/Tokyo')::date::text;
begin
 if u is null or p_visit_id is null then raise exception 'AUTH_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('promotion:'||u::text,0));
 if p_operation='claim' then
  if not exists(select 1 from public.user_quest_first_clears where user_id=u and quest_id='q_shinjuku_3') then return null; end if;
  -- One visible dialog per visit, and one outstanding lease across devices.
  if exists(select 1 from public.user_promotion_presentations where user_id=u and
   ((visit_id=p_visit_id and viewed_at is not null) or (lease_until>now_at and (viewed_at is null or action is null)))) then return null; end if;
  if not exists(select 1 from public.user_shop_purchases where user_id=u and product_id='beginner_pack_01' and purchase_count>0)
   and not exists(select 1 from public.user_promotion_presentations where user_id=u and promotion_id='beginner_pack' and viewed_at is not null)
  then promo:='beginner_pack'; period:='once';
  elsif not exists(select 1 from public.guild_members where user_id=u)
   and not exists(select 1 from public.users where id=u and guild_id is not null)
   and not exists(select 1 from public.user_promotion_presentations where user_id=u and promotion_id='tribe_join' and period_key=today and viewed_at is not null)
  then promo:='tribe_join'; period:=today;
  else return null; end if;
  insert into public.user_promotion_presentations(user_id,promotion_id,period_key,visit_id,lease_until)
  values(u,promo,period,p_visit_id,now_at+interval '90 seconds')
  on conflict(user_id,promotion_id,period_key) do update set id=gen_random_uuid(),visit_id=excluded.visit_id,lease_until=excluded.lease_until
  where user_promotion_presentations.viewed_at is null returning * into r;
  if r.id is null then return null; end if;
  return jsonb_build_object('id',r.id,'promotion_id',r.promotion_id,'period_key',r.period_key);
 end if;
 select * into r from public.user_promotion_presentations where id=p_presentation_id and user_id=u and visit_id=p_visit_id for update;
 if not found then return jsonb_build_object('ok',false); end if;
 if p_operation='view' then
  if r.viewed_at is not null then return jsonb_build_object('ok',true); end if;
  if r.lease_until<=now_at or (r.promotion_id='tribe_join' and r.period_key<>today)
   or (r.promotion_id='beginner_pack' and exists(select 1 from public.user_shop_purchases where user_id=u and product_id='beginner_pack_01' and purchase_count>0))
   or (r.promotion_id='tribe_join' and (exists(select 1 from public.guild_members where user_id=u) or exists(select 1 from public.users where id=u and guild_id is not null)))
  then return jsonb_build_object('ok',false); end if;
  update public.user_promotion_presentations set viewed_at=now_at where id=r.id;
 elsif p_operation in ('primary_cta','later') then
  if r.action is null then update public.user_promotion_presentations set action=p_operation,action_at=now_at,lease_until=now_at where id=r.id; end if;
 elsif p_operation='renew' then
  if r.lease_until<=now_at or r.action is not null then return jsonb_build_object('ok',false); end if;
  update public.user_promotion_presentations set lease_until=now_at+interval '90 seconds' where id=r.id;
 elsif p_operation='release' then
  update public.user_promotion_presentations set lease_until=now_at where id=r.id;
 else raise exception 'INVALID_OPERATION'; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.promotion_dialog(text,uuid,uuid) from public,anon;
grant execute on function public.promotion_dialog(text,uuid,uuid) to authenticated;
comment on table public.user_promotion_presentations is 'Shinjuku promotions: viewed_at is impression; action/action_at are CTA/later; user_id and timestamps join to billing_orders and guild membership/creation history. Unviewed leases are not impressions.';
commit;

begin;
do $$
declare ids uuid[]; u uuid; g uuid; result jsonb; before_cash bigint; blocked boolean; i integer;
begin
 select array_agg(id) into ids from (select u.id from public.users u
 where u.guild_id is null and not exists(select 1 from public.guild_members where user_id=u.id)
 and not exists(select 1 from public.mission_reward_delivery_ledger where user_id=u.id)
 order by u.created_at desc limit 2) s;
 if cardinality(ids)<>2 then raise exception '2 isolated Preview fixture users required'; end if;
 for i in 1..2 loop
  u:=ids[i];
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  update public.users set level=5,cash=5000,last_guild_left_at=null where id=u;
  delete from public.user_funnel_milestones where user_id=u and milestone='guild_joined';
  delete from public.user_missions where user_id=u;
  perform public.get_beginner_mission_journey();
  insert into public.user_funnel_milestones(user_id,milestone,metadata) values(u,'post_tutorial_guild_view','{}') on conflict(user_id,milestone) do nothing;
  perform public.get_beginner_mission_journey();
  if exists(select 1 from public.user_missions where user_id=u and mission_id='MIS_N_P010' and status<>'PROGRESS') then raise exception 'view alone cleared TRIBE'; end if;
  if i=1 then
   result:=public.create_guild_v2(u,'QA'||substr(replace(gen_random_uuid()::text,'-',''),1,8),500);
   g:=(result->>'guild_id')::uuid;
  else perform public.join_guild(g); end if;
  if not exists(select 1 from public.user_missions where user_id=u and mission_id='MIS_N_P010' and status='CLEAR') then raise exception 'create/join did not clear TRIBE'; end if;
  -- 既存所属からの救済も、再加入を要求しない。
  update public.user_missions set status='PROGRESS',current_progress=0,progress_val=0 where user_id=u and mission_id='MIS_N_P010';
  perform public.get_beginner_mission_journey();
  if not exists(select 1 from public.user_missions where user_id=u and mission_id='MIS_N_P010' and status='CLEAR') then raise exception 'existing membership not recognized'; end if;
  select cash into before_cash from public.users where id=u;
  perform public.claim_mission_reward('MIS_N_P010');
  blocked:=false;
  begin perform public.claim_mission_reward('MIS_N_P010'); exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'duplicate claim accepted'; end if;
  if (select cash from public.users where id=u)<>before_cash+300 then raise exception 'wrong reward'; end if;
  if not exists(select 1 from public.mission_reward_delivery_ledger where user_id=u and mission_id='MIS_N_P010' and item_quantity=1 and cash_quantity=300 and delivery_status='DELIVERED') then raise exception 'wrong ticket reward'; end if;
 end loop;
end $$;
select 'PASS: actual create OR join, view excluded, existing member, single reward and retry' as result;
rollback;

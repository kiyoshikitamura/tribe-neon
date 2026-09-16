-- Explicit Preview QA only. All grants, progress and fixtures roll back.
begin;
set local statement_timeout='60s';
do $$
declare uid uuid:='6ea6c81c-e169-457f-9206-92ff85f1495e'; cid text; q record; pid uuid; r jsonb; r2 jsonb; bonus jsonb;
 cash_before bigint; cash_after bigint; xp_before bigint; delta integer; items_before jsonb; items_after jsonb;
begin
 if not public.quest_progression_enabled_v1(uid) then raise exception 'Explicit Preview QA missing';end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 update public.user_patrols set status='MIGRATED' where user_id=uid and status in('ONGOING','CLAIMABLE');
 delete from public.quest_progression_first_reward_receipts where user_id=uid;
 delete from public.gameplay_reward_delivery_ledger where user_id=uid and source_kind='QUEST_DROP' and source_key like 'progression:first:%';
 insert into public.user_quest_first_clears(user_id,quest_id) select uid,quest_id from public.canonical_quest_master where version='2026-08-30' on conflict do nothing;
 select character_id into strict cid from public.user_characters where user_id=uid order by created_at limit 1;
 for q in select * from public.canonical_quest_master where version='2026-08-30' order by quest_id loop
  update public.users set vitality=50 where id=uid;
  r:=public.start_patrol(q.quest_id,cid);pid:=(r->>'patrol_id')::uuid;
  if pid is null then raise exception 'start failed %',r;end if;
  if (select has_battle_event from public.user_patrols where id=pid) then raise exception 'repeat spawned boss';end if;
  if (select vitality from public.users where id=uid)<>50-q.progression_vitality_cost then raise exception 'wrong AP';end if;
  if abs((select extract(epoch from expires_at-started_at) from public.user_patrols where id=pid)-q.progression_duration_sec)>1 then raise exception 'wrong duration';end if;
  update public.user_patrols set expires_at=now()-interval '1second' where id=pid;
  select cash into cash_before from public.users where id=uid;
  r:=public.claim_patrol_rewards(pid);
  if (r->>'xp')::integer<>q.progression_user_exp or (r->>'base_cash')::integer<>q.progression_cash_reward then raise exception 'wrong base rewards %',q.quest_id;end if;
  if (select cash from public.users where id=uid)-cash_before<>(r->>'cash')::bigint then raise exception 'cash receipt mismatch';end if;
  bonus:=public._quest_raid_cash_xp_v2(pid);
  if (bonus->>'cash')::integer<>q.progression_cash_reward or (bonus->>'userXp')::integer<>floor(q.progression_user_exp*.5)::integer then raise exception 'raid bonus mismatch';end if;
  select cash into cash_before from public.users where id=uid;
  r2:=public._grant_quest_progression_first_reward_v1(uid,q.quest_id,pid);
  if (r2->>'cash')::integer<>0 or (r2->>'xp')::integer<>0 then raise exception 'unexpected extra first clear cash/xp';end if;
  if jsonb_array_length(r2->'items')<>(case when q.difficulty='HARD' then 5 else 3 end) then raise exception 'missing first reward icons';end if;
  select coalesce(jsonb_object_agg(item_id,quantity),'{}') into items_before from public.user_items where user_id=uid;
  perform public._grant_quest_progression_first_reward_v1(uid,q.quest_id,pid);
  perform public.claim_patrol_rewards(pid);
  select coalesce(jsonb_object_agg(item_id,quantity),'{}') into items_after from public.user_items where user_id=uid;
  if items_before is distinct from items_after or (select cash from public.users where id=uid)<>cash_before then raise exception 'duplicate grant';end if;
 end loop;
 if exists(select 1 from (values ('NORMAL_GACHA_TICKET_CHARACTER',7),('NORMAL_GACHA_TICKET_SKILL',7),('NORMAL_GACHA_TICKET_EQUIPMENT',7),('SPECIAL_TICKET_CHARACTER',15),('SPECIAL_TICKET_SKILL',15),('SPECIAL_TICKET_EQUIPMENT',15),('SKILL_MANUAL',38),('EQUIP_LB_PART',38)) expected(item_id,qty) left join (select item_id,sum(quantity) qty from public.gameplay_reward_delivery_ledger where user_id=uid and source_kind='QUEST_DROP' and source_key like 'progression:first:%' group by item_id) actual using(item_id) where actual.qty is distinct from expected.qty::bigint) then raise exception 'first clear total differs from approved master';end if;
end $$;
select 'PASS: 21 repeat grants/AP/time, base EXP, raid +50%, first-clear item totals, idempotency' result;
rollback;

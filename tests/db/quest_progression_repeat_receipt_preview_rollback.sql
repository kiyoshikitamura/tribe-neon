-- Fixed Preview QA only. Every fixture and grant is rolled back.
begin;
set local statement_timeout='30s';
do $$
declare uid uuid:='6ea6c81c-e169-457f-9206-92ff85f1495e'; cid text; pid uuid; start_receipt jsonb; r jsonb; saved jsonb; cash_before bigint; cash_after bigint; items_before jsonb; items_after jsonb;
begin
 if not public.quest_progression_enabled_v1(uid) then raise exception 'QA activation required';end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 update public.user_patrols set status='MIGRATED' where user_id=uid and status in('ONGOING','CLAIMABLE');
 insert into public.user_quest_first_clears(user_id,quest_id) values(uid,'q_shinjuku_1') on conflict do nothing;
 update public.users set vitality=50 where id=uid;
 select c.character_id into cid from public.user_characters c where c.user_id=uid order by c.created_at limit 1;
 start_receipt:=public.start_patrol('q_shinjuku_1',cid);pid:=(start_receipt->>'patrol_id')::uuid;
 update public.user_patrols set expires_at=now()-interval '1second',rewards_accrued='{}'::jsonb where id=pid;
 select cash into cash_before from public.users where id=uid;
 r:=public.claim_patrol_rewards(pid);
 select exploration_reward_receipt into saved from public.user_patrols where id=pid;
 select cash into cash_after from public.users where id=uid;
 if r->>'course_name' is null or r->>'cash' is distinct from saved->>'cash' or r->>'xp' is distinct from saved->>'xp' or r->'items' is distinct from saved->'items' then raise exception 'repeat response lost authoritative reward summary';end if;
 if cash_after-cash_before<>(saved->>'cash')::bigint then raise exception 'repeat actual grant differs from receipt';end if;
 select coalesce(jsonb_object_agg(item_id,quantity),'{}') into items_before from public.user_items where user_id=uid;
 r:=public.claim_patrol_rewards(pid);
 if r->>'already_claimed'<>'true' or r->>'cash' is distinct from saved->>'cash' or r->'items' is distinct from saved->'items' then raise exception 'repeat retry lost receipt';end if;
 -- Reproduce an old completed repeat with the malformed saved summary.
 update public.user_patrols set rewards_accrued=jsonb_build_object('status','success','patrol_id',pid) where id=pid;
 r:=public.claim_patrol_rewards(pid);
 if r->>'course_name' is null or r->>'cash' is distinct from saved->>'cash' or r->>'xp' is distinct from saved->>'xp' or r->'items' is distinct from saved->'items' then raise exception 'old completed repeat receipt not recovered';end if;
 select coalesce(jsonb_object_agg(item_id,quantity),'{}') into items_after from public.user_items where user_id=uid;
 if (select cash from public.users where id=uid)<>cash_after or items_before is distinct from items_after then raise exception 'repeat retry granted rewards twice';end if;
 raise notice 'PASS: repeat initial summary, completed retry, old malformed receipt recovery, no duplicate cash/items';
end $$;
rollback;

-- Repeat completions must return the authoritative exploration receipt, never {}.
begin;
create or replace function public.claim_patrol_rewards(p_patrol_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.user_patrols%rowtype; receipt jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 perform 1 from public.users where id=auth.uid() for update;
 select * into p from public.user_patrols where id=p_patrol_id and user_id=auth.uid() for update;
 if not found then raise exception 'patrol not found' using errcode='P0002';end if;
 if p.status not in('ONGOING','CLAIMABLE','COMPLETED') then raise exception 'inactive patrol' using errcode='23514';end if;
 if p.progression_kind='LEGACY' then return public.claim_patrol_rewards_pre_progression_v1(p_patrol_id);end if;
 if p.status='COMPLETED' then
  -- Repair the response for repeats completed by the earlier empty-summary path.
  -- This uses already granted receipts and never invokes the grant helper again.
  receipt:=case when p.progression_kind='REPEAT' then coalesce(p.exploration_reward_receipt,p.rewards_accrued)
   else coalesce(nullif(p.rewards_accrued,'{}'::jsonb),p.exploration_reward_receipt) end;
  return receipt||jsonb_build_object('status','success','patrol_id',p.id,'already_claimed',true);
 end if;
 receipt:=public._claim_quest_exploration_v1(auth.uid(),p.id);
 if p.progression_kind='FIRST_CLEAR' and p.battle_result is distinct from 'VICTORY' then
  return receipt||jsonb_build_object('status','success','patrol_id',p.id,'outcome',coalesce(p.battle_result,'BOSS_READY'),'retryable',true,'boss_ready',true);
 end if;
 -- FIRST_CLEAR/TUTORIAL can carry a combined victory receipt. REPEAT has only
 -- the exploration receipt; rewards_accrued starts as {}, which is not SQL NULL.
 if p.progression_kind<>'REPEAT' then receipt:=coalesce(nullif(p.rewards_accrued,'{}'::jsonb),receipt);end if;
 receipt:=receipt||jsonb_build_object('status','success','patrol_id',p.id);
 update public.user_patrols set status='COMPLETED',rewards_accrued=receipt where id=p.id;
 return receipt;
end $$;
commit;
notify pgrst,'reload schema';

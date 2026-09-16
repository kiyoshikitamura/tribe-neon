
-- 初回CASH・XP・アイテムを同一トランザクションで一度だけ付与する内部関数。
create table if not exists public.quest_progression_first_reward_receipts (
 user_id uuid not null references public.users(id) on delete cascade,
 quest_id text not null references public.quests(id),
 patrol_id uuid not null,
 reward jsonb not null default '{}'::jsonb,
 granted_at timestamptz not null default clock_timestamp(),
 primary key(user_id,quest_id)
);
alter table public.quest_progression_first_reward_receipts enable row level security;
revoke all on public.quest_progression_first_reward_receipts from public,anon,authenticated;
grant select on public.quest_progression_first_reward_receipts to authenticated;
grant all on public.quest_progression_first_reward_receipts to service_role;
drop policy if exists quest_progression_first_reward_own on public.quest_progression_first_reward_receipts;
create policy quest_progression_first_reward_own on public.quest_progression_first_reward_receipts for select to authenticated using(user_id=(select auth.uid()));

create or replace function public._grant_quest_progression_first_reward_v1(p_user_id uuid,p_quest_id text,p_patrol_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_q public.canonical_quest_master%rowtype; v_receipt jsonb; v_inserted boolean; v_item record;
 v_items jsonb:='[]'::jsonb; v_cash integer; v_xp integer; v_xp_result jsonb;
begin
 if p_user_id is null or (auth.uid() is not null and auth.uid()<>p_user_id) then raise exception 'Quest reward owner mismatch' using errcode='42501'; end if;
 if not exists(select 1 from public.user_quest_first_clears where user_id=p_user_id and quest_id=p_quest_id) then raise exception 'Quest first clear is not recorded'; end if;
 if not exists(select 1 from public.user_patrols where id=p_patrol_id and user_id=p_user_id and coalesce(course_id,quest_id)=p_quest_id) then raise exception 'Quest patrol owner mismatch'; end if;
 select * into strict v_q from public.canonical_quest_master where version='2026-08-30' and quest_id=p_quest_id and is_production_enabled;
 insert into public.quest_progression_first_reward_receipts(user_id,quest_id,patrol_id)
 values(p_user_id,p_quest_id,p_patrol_id) on conflict do nothing returning true into v_inserted;
 if not coalesce(v_inserted,false) then
  select reward into v_receipt from public.quest_progression_first_reward_receipts where user_id=p_user_id and quest_id=p_quest_id;
  return v_receipt;
 end if;
 v_cash:=coalesce(v_q.progression_first_clear_cash_reward,0); v_xp:=coalesce(v_q.progression_first_clear_user_exp,0);
 for v_item in select * from public.canonical_quest_reward_pool_items where version=v_q.version and reward_pool_id=v_q.progression_first_clear_reward_pool_id order by roll_index loop
  if floor(random()*10000)::integer<v_item.probability_bp then
   v_item.item_id:=public.resolve_canonical_reward_item(v_item.item_id);
   perform public._grant_gameplay_reward_v1(p_user_id,'QUEST_DROP','progression:first:'||p_quest_id||':'||v_item.roll_index,v_item.item_id,v_item.quantity);
   v_items:=v_items||jsonb_build_array(jsonb_build_object('item_id',v_item.item_id,'quantity',v_item.quantity));
  end if;
 end loop;
 if v_cash>0 then update public.users set cash=coalesce(cash,0)+v_cash where id=p_user_id; end if;
 if v_xp>0 then v_xp_result:=public.apply_user_xp(p_user_id,v_xp); end if;
 v_receipt:=jsonb_build_object('cash',v_cash,'xp',v_xp,'items',v_items,'first_clear',true,'xp_result',v_xp_result);
 update public.quest_progression_first_reward_receipts set reward=v_receipt where user_id=p_user_id and quest_id=p_quest_id;
 return v_receipt;
end $$;
revoke all on function public._grant_quest_progression_first_reward_v1(uuid,text,uuid) from public,anon,authenticated;

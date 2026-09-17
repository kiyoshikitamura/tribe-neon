-- Existing Production canonical dependency for Raid Room reward delivery.
-- Schema only: no reward rows, prices, currencies, or economy data are changed.
begin;
do $$ begin
  if to_regclass('public.gameplay_reward_delivery_ledger') is not null then
    raise exception 'gameplay_reward_delivery_ledger already exists; stop for drift review';
  end if;
end $$;
create table public.gameplay_reward_delivery_ledger (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  source_kind text not null,
  source_key text not null,
  item_id text not null,
  quantity integer not null,
  delivered_at timestamp with time zone default clock_timestamp() not null,
  constraint gameplay_reward_delivery_ledger_pkey primary key (id),
  constraint gameplay_reward_delivery_ledg_user_id_source_kind_source_ke_key unique (user_id, source_kind, source_key, item_id),
  constraint gameplay_reward_delivery_ledger_quantity_check check (quantity > 0),
  constraint gameplay_reward_delivery_ledger_source_kind_check check (source_kind = any (array['QUEST_DROP'::text, 'RAID_ROOM_CLEAR'::text, 'RAID_ROOM_RESCUE'::text, 'QUEST_RAID_ENCOUNTER'::text, 'LOGIN_BONUS'::text, 'RANKING_SEASON'::text])),
  constraint gameplay_reward_delivery_ledger_user_id_fkey foreign key (user_id) references public.users(id)
);
commit;

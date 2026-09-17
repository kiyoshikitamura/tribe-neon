-- Existing Production canonical dependency for Raid daily-clear bonus.
-- Copies only the four canonical rules; no Production ledger/history rows are copied.
begin;
do $$ begin
  if to_regclass('public.raid_daily_clear_bonus_rules') is not null
     or to_regclass('public.raid_daily_clear_bonus_ledger') is not null then
    raise exception 'Raid daily bonus dependency already exists; stop for drift review';
  end if;
end $$;
insert into public.raid_room_difficulty_rules (difficulty, minimum_power, rescue_min_battles, rescue_min_contribution_damage, rule_version) values
  ('beginner', null, 2, 60000, 1), ('intermediate', 160000, 2, 300000, 1),
  ('advanced', 200000, 3, 500000, 1), ('expert', 240000, 4, 750000, 1);
insert into public.raid_room_lifecycle_rules (difficulty, max_active_rooms, member_capacity, duration_hours) values
  ('beginner', 10, 20, 24), ('intermediate', 10, 20, 24), ('advanced', 10, 20, 24), ('expert', 5, 20, 24);
insert into public.raid_room_creation_settings (singleton, enabled) values (true, true);
insert into public.raid_room_battle_settings (singleton, enabled) values (true, true);
insert into public.raid_room_rescue_settings (singleton, enabled) values (true, true);
insert into public.raid_room_clear_reward_rules (difficulty, enabled, minimum_contribution_damage, rule_version, minimum_contribution_bp) values
  ('beginner', true, 0, 2, 0), ('intermediate', true, 0, 2, 0),
  ('advanced', true, 0, 2, 300), ('expert', true, 0, 2, 500);
insert into public.raid_room_clear_reward_items (difficulty, item_id, quantity) values
  ('beginner', 'SKILL_MANUAL', 1), ('intermediate', 'EQUIP_LB_PART', 1), ('intermediate', 'SKILL_MANUAL', 1),
  ('advanced', 'EQUIP_LB_PART', 2), ('advanced', 'SKILL_MANUAL', 2), ('expert', 'EQUIP_LB_PART', 3), ('expert', 'SKILL_MANUAL', 3);
insert into public.raid_room_rescue_reward_rules (difficulty, enabled, reward_version) values
  ('beginner', true, 1), ('intermediate', true, 1), ('advanced', true, 1), ('expert', true, 1);
insert into public.raid_room_rescue_reward_items (difficulty, item_id, quantity) values
  ('beginner', 'CHAR_EXP_S', 2), ('intermediate', 'CHAR_EXP_S', 3), ('advanced', 'CHAR_EXP_S', 5), ('expert', 'CHAR_EXP_S', 8);
insert into public.quest_raid_encounter_settings (singleton, enabled, version, probability_bp, guaranteed_after, personal_active_limit, allow_outside_daily, beginner_weight, intermediate_weight, advanced_weight)
  values (true, false, 2, 1000, 11, 1, true, 50, 35, 15);
create table public.raid_daily_clear_bonus_rules (
  difficulty text not null,
  chance_bp integer not null,
  items jsonb not null,
  constraint raid_daily_clear_bonus_rules_pkey primary key (difficulty),
  constraint raid_daily_clear_bonus_rules_chance_bp_check check (chance_bp >= 0 and chance_bp <= 10000),
  constraint raid_daily_clear_bonus_rules_items_check check (jsonb_typeof(items) = 'array'),
  constraint raid_daily_clear_bonus_rules_difficulty_fkey foreign key (difficulty) references public.raid_room_clear_reward_rules(difficulty)
);
create table public.raid_daily_clear_bonus_ledger (
  raid_day_key date not null,
  user_id uuid not null,
  difficulty text not null,
  source_instance_id uuid not null,
  source_room_id uuid not null,
  won boolean not null,
  items jsonb default '[]'::jsonb not null,
  issued_at timestamp with time zone default clock_timestamp() not null,
  constraint raid_daily_clear_bonus_ledger_pkey primary key (raid_day_key, user_id, difficulty),
  constraint raid_daily_clear_bonus_ledger_difficulty_fkey foreign key (difficulty) references public.raid_daily_clear_bonus_rules(difficulty),
  constraint raid_daily_clear_bonus_ledger_source_instance_id_fkey foreign key (source_instance_id) references public.raid_bosses(id),
  constraint raid_daily_clear_bonus_ledger_source_room_id_fkey foreign key (source_room_id) references public.raid_rooms(id),
  constraint raid_daily_clear_bonus_ledger_user_id_fkey foreign key (user_id) references public.users(id)
);
insert into public.raid_daily_clear_bonus_rules (difficulty, chance_bp, items) values
  ('beginner', 3000, '[{"itemId":"NORMAL_GACHA_TICKET_RANDOM","quantity":1}]'::jsonb),
  ('intermediate', 5000, '[{"itemId":"NORMAL_GACHA_TICKET_RANDOM","quantity":1}]'::jsonb),
  ('advanced', 10000, '[{"itemId":"SPECIAL_TICKET_RANDOM","quantity":1}]'::jsonb),
  ('expert', 10000, '[{"itemId":"SPECIAL_TICKET_CHARACTER","quantity":1},{"itemId":"SPECIAL_TICKET_SKILL","quantity":1},{"itemId":"SPECIAL_TICKET_EQUIPMENT","quantity":1}]'::jsonb);
alter table public.raid_daily_clear_bonus_rules enable row level security;
alter table public.raid_daily_clear_bonus_ledger enable row level security;
revoke all on table public.raid_daily_clear_bonus_rules, public.raid_daily_clear_bonus_ledger from public, anon, authenticated, service_role;
commit;

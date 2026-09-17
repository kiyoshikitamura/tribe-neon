-- Canonical Raid Room tables generated from Production READ ONLY catalog ktpolnkyyfkowxdmijww.
-- No existing Preview rows are deleted or updated.
begin;
do $$ begin if exists (select 1 from information_schema.tables where table_schema='public' and (table_name ilike 'raid_room%' or table_name ilike 'quest_raid_encounter%')) then raise exception 'Raid Room target table already exists; stop for drift review'; end if; end $$;
create table public."quest_raid_encounter_bonus_grants" (
  "room_id" uuid not null,
  "user_id" uuid not null,
  "issued_at" timestamp with time zone default now() not null,
  "rule_version" integer not null,
  "cash" bigint,
  "user_xp" integer
);
create table public."quest_raid_encounter_bonus_items" (
  "difficulty" text not null,
  "item_id" text not null,
  "quantity" integer not null
);
create table public."quest_raid_encounter_progress" (
  "user_id" uuid not null,
  "first_created" boolean default false not null,
  "misses" integer default 0 not null
);
create table public."quest_raid_encounter_settings" (
  "singleton" boolean default true not null,
  "enabled" boolean default false not null,
  "version" integer default 1 not null,
  "probability_bp" integer default 1000 not null,
  "guaranteed_after" integer default 11 not null,
  "personal_active_limit" integer default 1 not null,
  "allow_outside_daily" boolean default true not null,
  "beginner_weight" integer default 50 not null,
  "intermediate_weight" integer default 35 not null,
  "advanced_weight" integer default 15 not null
);
create table public."quest_raid_encounters" (
  "patrol_id" uuid not null,
  "user_id" uuid not null,
  "area_id" text not null,
  "status" text default 'PENDING'::text not null,
  "difficulty" text,
  "variant_id" text,
  "room_id" uuid,
  "rule_version" integer,
  "bonus_items" jsonb,
  "created_at" timestamp with time zone default now() not null,
  "acknowledged_at" timestamp with time zone,
  "reward_multiplier" integer default 1 not null,
  "bonus_cash" bigint,
  "bonus_user_xp" integer
);
create table public."raid_room_battle_request_cancellations" (
  "user_id" uuid not null,
  "request_id" uuid not null,
  "cancelled_at" timestamp with time zone default clock_timestamp() not null
);
create table public."raid_room_battle_settings" (
  "singleton" boolean default true not null,
  "enabled" boolean default false not null
);
create table public."raid_room_battle_start_requests" (
  "user_id" uuid not null,
  "request_id" uuid not null,
  "room_id" uuid not null,
  "character_ids" text[] not null,
  "tactic" text not null,
  "replay_session_id" uuid not null,
  "response" jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "recovery_acknowledged_at" timestamp with time zone
);
create table public."raid_room_clear_reward_grants" (
  "room_id" uuid not null,
  "user_id" uuid not null,
  "item_id" text not null,
  "quantity" integer not null,
  "present_id" uuid,
  "direct_delivery_id" uuid
);
create table public."raid_room_clear_reward_items" (
  "difficulty" text not null,
  "item_id" text not null,
  "quantity" integer not null
);
create table public."raid_room_clear_reward_rules" (
  "difficulty" text not null,
  "enabled" boolean default false not null,
  "minimum_contribution_damage" bigint,
  "rule_version" bigint default 1 not null,
  "minimum_contribution_bp" integer
);
create table public."raid_room_clear_rewards" (
  "room_id" uuid not null,
  "user_id" uuid not null,
  "rule_version" bigint not null,
  "finalized_battles" bigint not null,
  "contribution_damage" bigint not null,
  "clear_gate" jsonb not null,
  "issued_at" timestamp with time zone not null,
  "expires_at" timestamp with time zone not null
);
create table public."raid_room_combat_profiles" (
  "raid_variant_id" text not null,
  "difficulty_id" text not null,
  "max_hp" bigint not null,
  "profile" jsonb not null
);
create table public."raid_room_combat_snapshots" (
  "room_id" uuid not null,
  "profile" jsonb not null,
  "enemy_snapshot" jsonb not null
);
create table public."raid_room_creation_requests" (
  "user_id" uuid not null,
  "request_id" uuid not null,
  "difficulty_id" text not null,
  "raid_variant_id" text not null,
  "room_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);
create table public."raid_room_creation_settings" (
  "singleton" boolean default true not null,
  "enabled" boolean default false not null
);
create table public."raid_room_difficulty_rules" (
  "difficulty" text not null,
  "minimum_power" bigint,
  "rescue_min_battles" bigint,
  "rescue_min_contribution_damage" bigint,
  "rule_version" bigint default 1 not null
);
create table public."raid_room_lifecycle_rules" (
  "difficulty" text not null,
  "max_active_rooms" integer not null,
  "member_capacity" integer not null,
  "duration_hours" integer not null
);
create table public."raid_room_members" (
  "room_id" uuid not null,
  "user_id" uuid not null,
  "joined_at" timestamp with time zone default now() not null
);
create table public."raid_room_rescue_members" (
  "room_id" uuid not null,
  "user_id" uuid not null,
  "rescue_id" uuid not null,
  "joined_at" timestamp with time zone not null
);
create table public."raid_room_rescue_publications" (
  "id" uuid default gen_random_uuid() not null,
  "room_id" uuid not null,
  "requester_user_id" uuid not null,
  "request_id" uuid not null,
  "channel" text not null,
  "guild_id" uuid,
  "ordinal" integer not null,
  "created_at" timestamp with time zone default clock_timestamp() not null
);
create table public."raid_room_rescue_requests" (
  "user_id" uuid not null,
  "request_id" uuid not null,
  "room_id" uuid not null,
  "response" jsonb not null
);
create table public."raid_room_rescue_reward_grants" (
  "room_id" uuid not null,
  "user_id" uuid not null,
  "item_id" text not null,
  "quantity" integer not null,
  "present_id" uuid,
  "direct_delivery_id" uuid
);
create table public."raid_room_rescue_reward_items" (
  "difficulty" text not null,
  "item_id" text not null,
  "quantity" integer not null
);
create table public."raid_room_rescue_reward_rules" (
  "difficulty" text not null,
  "enabled" boolean default false not null,
  "reward_version" bigint default 1 not null
);
create table public."raid_room_rescue_rewards" (
  "room_id" uuid not null,
  "user_id" uuid not null,
  "rule_version" bigint not null,
  "reward_version" bigint not null,
  "finalized_battles" bigint not null,
  "contribution_damage" bigint not null,
  "rescue_gate" jsonb not null,
  "issued_at" timestamp with time zone not null,
  "expires_at" timestamp with time zone not null
);
create table public."raid_room_rescue_settings" (
  "singleton" boolean default true not null,
  "enabled" boolean default false not null
);
create table public."raid_rooms" (
  "id" uuid default gen_random_uuid() not null,
  "raid_boss_instance_id" uuid not null,
  "owner_user_id" uuid not null,
  "difficulty_id" text not null,
  "created_at" timestamp with time zone default now() not null
);
alter table public."quest_raid_encounter_bonus_grants" add constraint "quest_raid_encounter_bonus_grants_pkey" PRIMARY KEY (room_id, user_id);
alter table public."quest_raid_encounter_bonus_items" add constraint "quest_raid_encounter_bonus_items_difficulty_check" CHECK ((difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])));
alter table public."quest_raid_encounter_bonus_items" add constraint "quest_raid_encounter_bonus_items_item_id_check" CHECK ((length(btrim(item_id)) > 0));
alter table public."quest_raid_encounter_bonus_items" add constraint "quest_raid_encounter_bonus_items_pkey" PRIMARY KEY (difficulty, item_id);
alter table public."quest_raid_encounter_bonus_items" add constraint "quest_raid_encounter_bonus_items_quantity_check" CHECK ((quantity > 0));
alter table public."quest_raid_encounter_progress" add constraint "quest_raid_encounter_progress_misses_check" CHECK ((misses >= 0));
alter table public."quest_raid_encounter_progress" add constraint "quest_raid_encounter_progress_pkey" PRIMARY KEY (user_id);
alter table public."quest_raid_encounter_settings" add constraint "quest_raid_encounter_settings_advanced_weight_check" CHECK ((advanced_weight >= 0));
alter table public."quest_raid_encounter_settings" add constraint "quest_raid_encounter_settings_beginner_weight_check" CHECK ((beginner_weight >= 0));
alter table public."quest_raid_encounter_settings" add constraint "quest_raid_encounter_settings_check" CHECK ((((beginner_weight + intermediate_weight) + advanced_weight) > 0));
alter table public."quest_raid_encounter_settings" add constraint "quest_raid_encounter_settings_guaranteed_after_check" CHECK ((guaranteed_after > 0));
alter table public."quest_raid_encounter_settings" add constraint "quest_raid_encounter_settings_intermediate_weight_check" CHECK ((intermediate_weight >= 0));
alter table public."quest_raid_encounter_settings" add constraint "quest_raid_encounter_settings_personal_active_limit_check" CHECK ((personal_active_limit > 0));
alter table public."quest_raid_encounter_settings" add constraint "quest_raid_encounter_settings_pkey" PRIMARY KEY (singleton);
alter table public."quest_raid_encounter_settings" add constraint "quest_raid_encounter_settings_probability_bp_check" CHECK (((probability_bp >= 0) AND (probability_bp <= 10000)));
alter table public."quest_raid_encounter_settings" add constraint "quest_raid_encounter_settings_singleton_check" CHECK (singleton);
alter table public."quest_raid_encounter_settings" add constraint "quest_raid_encounter_settings_version_check" CHECK ((version > 0));
alter table public."quest_raid_encounters" add constraint "quest_raid_encounters_bonus_cash_check" CHECK ((bonus_cash >= 0));
alter table public."quest_raid_encounters" add constraint "quest_raid_encounters_bonus_user_xp_check" CHECK ((bonus_user_xp >= 0));
alter table public."quest_raid_encounters" add constraint "quest_raid_encounters_check" CHECK (((status = 'CREATED'::text) = (room_id IS NOT NULL)));
alter table public."quest_raid_encounters" add constraint "quest_raid_encounters_difficulty_check" CHECK ((difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])));
alter table public."quest_raid_encounters" add constraint "quest_raid_encounters_pkey" PRIMARY KEY (patrol_id);
alter table public."quest_raid_encounters" add constraint "quest_raid_encounters_reward_multiplier_check" CHECK ((reward_multiplier = ANY (ARRAY[1, 2])));
alter table public."quest_raid_encounters" add constraint "quest_raid_encounters_room_id_key" UNIQUE (room_id);
alter table public."quest_raid_encounters" add constraint "quest_raid_encounters_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'NO_ENCOUNTER'::text, 'DRAWN'::text, 'CREATED'::text])));
alter table public."raid_room_battle_request_cancellations" add constraint "raid_room_battle_request_cancellations_pkey" PRIMARY KEY (user_id, request_id);
alter table public."raid_room_battle_settings" add constraint "raid_room_battle_settings_pkey" PRIMARY KEY (singleton);
alter table public."raid_room_battle_settings" add constraint "raid_room_battle_settings_singleton_check" CHECK (singleton);
alter table public."raid_room_battle_start_requests" add constraint "raid_room_battle_start_requests_pkey" PRIMARY KEY (user_id, request_id);
alter table public."raid_room_clear_reward_grants" add constraint "raid_clear_delivery_exactly_one" CHECK ((num_nonnulls(present_id, direct_delivery_id) = 1));
alter table public."raid_room_clear_reward_grants" add constraint "raid_room_clear_reward_grants_direct_delivery_id_key" UNIQUE (direct_delivery_id);
alter table public."raid_room_clear_reward_grants" add constraint "raid_room_clear_reward_grants_pkey" PRIMARY KEY (room_id, user_id, item_id);
alter table public."raid_room_clear_reward_grants" add constraint "raid_room_clear_reward_grants_present_id_key" UNIQUE (present_id);
alter table public."raid_room_clear_reward_grants" add constraint "raid_room_clear_reward_grants_quantity_check" CHECK ((quantity > 0));
alter table public."raid_room_clear_reward_items" add constraint "raid_room_clear_reward_items_item_id_check" CHECK ((length(btrim(item_id)) > 0));
alter table public."raid_room_clear_reward_items" add constraint "raid_room_clear_reward_items_pkey" PRIMARY KEY (difficulty, item_id);
alter table public."raid_room_clear_reward_items" add constraint "raid_room_clear_reward_items_quantity_check" CHECK ((quantity > 0));
alter table public."raid_room_clear_reward_rules" add constraint "raid_room_clear_reward_rules_minimum_contribution_bp_check" CHECK (((minimum_contribution_bp >= 0) AND (minimum_contribution_bp <= 10000)));
alter table public."raid_room_clear_reward_rules" add constraint "raid_room_clear_reward_rules_minimum_contribution_damage_check" CHECK ((minimum_contribution_damage >= 0));
alter table public."raid_room_clear_reward_rules" add constraint "raid_room_clear_reward_rules_pkey" PRIMARY KEY (difficulty);
alter table public."raid_room_clear_reward_rules" add constraint "raid_room_clear_reward_rules_rule_version_check" CHECK ((rule_version > 0));
alter table public."raid_room_clear_rewards" add constraint "raid_room_clear_rewards_check" CHECK ((expires_at = (issued_at + '30 days'::interval)));
alter table public."raid_room_clear_rewards" add constraint "raid_room_clear_rewards_pkey" PRIMARY KEY (room_id, user_id);
alter table public."raid_room_combat_profiles" add constraint "raid_room_combat_profiles_check" CHECK ((((profile ->> 'raidVariantId'::text) = raid_variant_id) AND ((profile ->> 'difficultyId'::text) = difficulty_id)));
alter table public."raid_room_combat_profiles" add constraint "raid_room_combat_profiles_check1" CHECK ((((profile ->> 'maxHp'::text))::bigint = max_hp));
alter table public."raid_room_combat_profiles" add constraint "raid_room_combat_profiles_difficulty_id_check" CHECK ((difficulty_id = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text, 'expert'::text])));
alter table public."raid_room_combat_profiles" add constraint "raid_room_combat_profiles_max_hp_check" CHECK ((max_hp > 0));
alter table public."raid_room_combat_profiles" add constraint "raid_room_combat_profiles_pkey" PRIMARY KEY (raid_variant_id, difficulty_id);
alter table public."raid_room_combat_profiles" add constraint "raid_room_combat_profiles_profile_check" CHECK (((jsonb_typeof((profile -> 'members'::text)) = 'array'::text) AND (jsonb_array_length((profile -> 'members'::text)) = 5)));
alter table public."raid_room_combat_snapshots" add constraint "raid_room_combat_snapshots_enemy_snapshot_check" CHECK ((jsonb_array_length(enemy_snapshot) = 5));
alter table public."raid_room_combat_snapshots" add constraint "raid_room_combat_snapshots_pkey" PRIMARY KEY (room_id);
alter table public."raid_room_creation_requests" add constraint "raid_room_creation_requests_pkey" PRIMARY KEY (user_id, request_id);
alter table public."raid_room_creation_settings" add constraint "raid_room_creation_settings_pkey" PRIMARY KEY (singleton);
alter table public."raid_room_creation_settings" add constraint "raid_room_creation_settings_singleton_check" CHECK (singleton);
alter table public."raid_room_difficulty_rules" add constraint "raid_room_difficulty_power_valid" CHECK ((((difficulty = 'beginner'::text) AND (minimum_power IS NULL)) OR ((difficulty <> 'beginner'::text) AND (minimum_power IS NOT NULL) AND (minimum_power >= 0))));
alter table public."raid_room_difficulty_rules" add constraint "raid_room_difficulty_rules_difficulty_check" CHECK ((difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text, 'expert'::text])));
alter table public."raid_room_difficulty_rules" add constraint "raid_room_difficulty_rules_pkey" PRIMARY KEY (difficulty);
alter table public."raid_room_difficulty_rules" add constraint "raid_room_difficulty_rules_rescue_min_battles_check" CHECK ((rescue_min_battles >= 0));
alter table public."raid_room_difficulty_rules" add constraint "raid_room_difficulty_rules_rescue_min_contribution_damage_check" CHECK ((rescue_min_contribution_damage >= 0));
alter table public."raid_room_difficulty_rules" add constraint "raid_room_difficulty_rules_rule_version_check" CHECK ((rule_version > 0));
alter table public."raid_room_lifecycle_rules" add constraint "raid_room_lifecycle_rules_difficulty_check" CHECK ((difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text, 'expert'::text])));
alter table public."raid_room_lifecycle_rules" add constraint "raid_room_lifecycle_rules_duration_hours_check" CHECK ((duration_hours > 0));
alter table public."raid_room_lifecycle_rules" add constraint "raid_room_lifecycle_rules_max_active_rooms_check" CHECK ((max_active_rooms > 0));
alter table public."raid_room_lifecycle_rules" add constraint "raid_room_lifecycle_rules_member_capacity_check" CHECK ((member_capacity > 0));
alter table public."raid_room_lifecycle_rules" add constraint "raid_room_lifecycle_rules_pkey" PRIMARY KEY (difficulty);
alter table public."raid_room_members" add constraint "raid_room_members_pkey" PRIMARY KEY (room_id, user_id);
alter table public."raid_room_rescue_members" add constraint "raid_room_rescue_members_pkey" PRIMARY KEY (room_id, user_id);
alter table public."raid_room_rescue_publications" add constraint "raid_room_rescue_publications_channel_check" CHECK ((channel = ANY (ARRAY['ACTIVITY'::text, 'GUILD'::text])));
alter table public."raid_room_rescue_publications" add constraint "raid_room_rescue_publications_check" CHECK ((((channel = 'ACTIVITY'::text) AND (guild_id IS NULL)) OR ((channel = 'GUILD'::text) AND (guild_id IS NOT NULL))));
alter table public."raid_room_rescue_publications" add constraint "raid_room_rescue_publications_ordinal_check" CHECK (((ordinal >= 1) AND (ordinal <= 3)));
alter table public."raid_room_rescue_publications" add constraint "raid_room_rescue_publications_pkey" PRIMARY KEY (id);
alter table public."raid_room_rescue_publications" add constraint "raid_room_rescue_publications_requester_user_id_request_id__key" UNIQUE (requester_user_id, request_id, channel);
alter table public."raid_room_rescue_publications" add constraint "raid_room_rescue_publications_room_id_channel_ordinal_key" UNIQUE (room_id, channel, ordinal);
alter table public."raid_room_rescue_requests" add constraint "raid_room_rescue_requests_pkey" PRIMARY KEY (user_id, request_id);
alter table public."raid_room_rescue_reward_grants" add constraint "raid_rescue_delivery_exactly_one" CHECK ((num_nonnulls(present_id, direct_delivery_id) = 1));
alter table public."raid_room_rescue_reward_grants" add constraint "raid_room_rescue_reward_grants_direct_delivery_id_key" UNIQUE (direct_delivery_id);
alter table public."raid_room_rescue_reward_grants" add constraint "raid_room_rescue_reward_grants_pkey" PRIMARY KEY (room_id, user_id, item_id);
alter table public."raid_room_rescue_reward_grants" add constraint "raid_room_rescue_reward_grants_present_id_key" UNIQUE (present_id);
alter table public."raid_room_rescue_reward_grants" add constraint "raid_room_rescue_reward_grants_quantity_check" CHECK ((quantity > 0));
alter table public."raid_room_rescue_reward_items" add constraint "raid_room_rescue_reward_items_item_id_check" CHECK ((length(btrim(item_id)) > 0));
alter table public."raid_room_rescue_reward_items" add constraint "raid_room_rescue_reward_items_pkey" PRIMARY KEY (difficulty, item_id);
alter table public."raid_room_rescue_reward_items" add constraint "raid_room_rescue_reward_items_quantity_check" CHECK ((quantity > 0));
alter table public."raid_room_rescue_reward_rules" add constraint "raid_room_rescue_reward_rules_pkey" PRIMARY KEY (difficulty);
alter table public."raid_room_rescue_reward_rules" add constraint "raid_room_rescue_reward_rules_reward_version_check" CHECK ((reward_version > 0));
alter table public."raid_room_rescue_rewards" add constraint "raid_room_rescue_rewards_check" CHECK ((expires_at = (issued_at + '30 days'::interval)));
alter table public."raid_room_rescue_rewards" add constraint "raid_room_rescue_rewards_pkey" PRIMARY KEY (room_id, user_id);
alter table public."raid_room_rescue_settings" add constraint "raid_room_rescue_settings_pkey" PRIMARY KEY (singleton);
alter table public."raid_room_rescue_settings" add constraint "raid_room_rescue_settings_singleton_check" CHECK (singleton);
alter table public."raid_rooms" add constraint "raid_rooms_difficulty_id_check" CHECK ((difficulty_id = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text, 'expert'::text])));
alter table public."raid_rooms" add constraint "raid_rooms_pkey" PRIMARY KEY (id);
alter table public."raid_rooms" add constraint "raid_rooms_raid_boss_instance_id_key" UNIQUE (raid_boss_instance_id);
alter table public."quest_raid_encounter_bonus_grants" add constraint "quest_raid_encounter_bonus_grants_room_id_fkey" FOREIGN KEY (room_id) REFERENCES raid_rooms(id);
alter table public."quest_raid_encounter_bonus_grants" add constraint "quest_raid_encounter_bonus_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
alter table public."quest_raid_encounter_progress" add constraint "quest_raid_encounter_progress_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
alter table public."quest_raid_encounters" add constraint "quest_raid_encounters_patrol_id_fkey" FOREIGN KEY (patrol_id) REFERENCES user_patrols(id);
alter table public."quest_raid_encounters" add constraint "quest_raid_encounters_room_id_fkey" FOREIGN KEY (room_id) REFERENCES raid_rooms(id);
alter table public."quest_raid_encounters" add constraint "quest_raid_encounters_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
alter table public."raid_room_battle_request_cancellations" add constraint "raid_room_battle_request_cancellations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
alter table public."raid_room_battle_start_requests" add constraint "raid_room_battle_start_requests_replay_session_id_fkey" FOREIGN KEY (replay_session_id) REFERENCES battle_replay_sessions(id);
alter table public."raid_room_battle_start_requests" add constraint "raid_room_battle_start_requests_room_id_fkey" FOREIGN KEY (room_id) REFERENCES raid_rooms(id);
alter table public."raid_room_battle_start_requests" add constraint "raid_room_battle_start_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
alter table public."raid_room_clear_reward_grants" add constraint "raid_room_clear_reward_grants_direct_delivery_id_fkey" FOREIGN KEY (direct_delivery_id) REFERENCES gameplay_reward_delivery_ledger(id);
alter table public."raid_room_clear_reward_grants" add constraint "raid_room_clear_reward_grants_present_id_fkey" FOREIGN KEY (present_id) REFERENCES presents(id);
alter table public."raid_room_clear_reward_grants" add constraint "raid_room_clear_reward_grants_room_id_user_id_fkey" FOREIGN KEY (room_id, user_id) REFERENCES raid_room_clear_rewards(room_id, user_id);
alter table public."raid_room_clear_reward_items" add constraint "raid_room_clear_reward_items_difficulty_fkey" FOREIGN KEY (difficulty) REFERENCES raid_room_clear_reward_rules(difficulty);
alter table public."raid_room_clear_reward_rules" add constraint "raid_room_clear_reward_rules_difficulty_fkey" FOREIGN KEY (difficulty) REFERENCES raid_room_difficulty_rules(difficulty);
alter table public."raid_room_clear_rewards" add constraint "raid_room_clear_rewards_room_id_user_id_fkey" FOREIGN KEY (room_id, user_id) REFERENCES raid_room_members(room_id, user_id);
alter table public."raid_room_combat_profiles" add constraint "raid_room_combat_profiles_raid_variant_id_fkey" FOREIGN KEY (raid_variant_id) REFERENCES canonical_raid_variants(raid_variant_id);
alter table public."raid_room_combat_snapshots" add constraint "raid_room_combat_snapshots_room_id_fkey" FOREIGN KEY (room_id) REFERENCES raid_rooms(id);
alter table public."raid_room_creation_requests" add constraint "raid_room_creation_requests_room_id_fkey" FOREIGN KEY (room_id) REFERENCES raid_rooms(id);
alter table public."raid_room_creation_requests" add constraint "raid_room_creation_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
alter table public."raid_room_members" add constraint "raid_room_members_room_id_fkey" FOREIGN KEY (room_id) REFERENCES raid_rooms(id);
alter table public."raid_room_members" add constraint "raid_room_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
alter table public."raid_room_rescue_members" add constraint "raid_room_rescue_members_rescue_id_fkey" FOREIGN KEY (rescue_id) REFERENCES raid_room_rescue_publications(id);
alter table public."raid_room_rescue_members" add constraint "raid_room_rescue_members_room_id_user_id_fkey" FOREIGN KEY (room_id, user_id) REFERENCES raid_room_members(room_id, user_id);
alter table public."raid_room_rescue_publications" add constraint "raid_room_rescue_publications_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES guilds(id);
alter table public."raid_room_rescue_publications" add constraint "raid_room_rescue_publications_requester_user_id_fkey" FOREIGN KEY (requester_user_id) REFERENCES users(id);
alter table public."raid_room_rescue_publications" add constraint "raid_room_rescue_publications_room_id_fkey" FOREIGN KEY (room_id) REFERENCES raid_rooms(id);
alter table public."raid_room_rescue_requests" add constraint "raid_room_rescue_requests_room_id_fkey" FOREIGN KEY (room_id) REFERENCES raid_rooms(id);
alter table public."raid_room_rescue_requests" add constraint "raid_room_rescue_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);
alter table public."raid_room_rescue_reward_grants" add constraint "raid_room_rescue_reward_grants_direct_delivery_id_fkey" FOREIGN KEY (direct_delivery_id) REFERENCES gameplay_reward_delivery_ledger(id);
alter table public."raid_room_rescue_reward_grants" add constraint "raid_room_rescue_reward_grants_present_id_fkey" FOREIGN KEY (present_id) REFERENCES presents(id);
alter table public."raid_room_rescue_reward_grants" add constraint "raid_room_rescue_reward_grants_room_id_user_id_fkey" FOREIGN KEY (room_id, user_id) REFERENCES raid_room_rescue_rewards(room_id, user_id);
alter table public."raid_room_rescue_reward_items" add constraint "raid_room_rescue_reward_items_difficulty_fkey" FOREIGN KEY (difficulty) REFERENCES raid_room_rescue_reward_rules(difficulty);
alter table public."raid_room_rescue_reward_rules" add constraint "raid_room_rescue_reward_rules_difficulty_fkey" FOREIGN KEY (difficulty) REFERENCES raid_room_difficulty_rules(difficulty);
alter table public."raid_room_rescue_rewards" add constraint "raid_room_rescue_rewards_room_id_user_id_fkey" FOREIGN KEY (room_id, user_id) REFERENCES raid_room_rescue_members(room_id, user_id);
alter table public."raid_rooms" add constraint "raid_rooms_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES users(id);
alter table public."raid_rooms" add constraint "raid_rooms_raid_boss_instance_id_fkey" FOREIGN KEY (raid_boss_instance_id) REFERENCES raid_bosses(id);
CREATE INDEX quest_raid_encounters_owner ON public.quest_raid_encounters USING btree (user_id, created_at);
CREATE INDEX raid_room_battle_unacknowledged_idx ON public.raid_room_battle_start_requests USING btree (user_id, created_at, request_id) WHERE (recovery_acknowledged_at IS NULL);
CREATE INDEX raid_room_members_user_idx ON public.raid_room_members USING btree (user_id, room_id);
CREATE INDEX raid_rooms_owner_created_idx ON public.raid_rooms USING btree (owner_user_id, created_at DESC, id);
alter table public."quest_raid_encounter_bonus_grants" enable row level security;
revoke all on table public."quest_raid_encounter_bonus_grants" from public, anon, authenticated, service_role;
alter table public."quest_raid_encounter_bonus_items" enable row level security;
revoke all on table public."quest_raid_encounter_bonus_items" from public, anon, authenticated, service_role;
alter table public."quest_raid_encounter_progress" enable row level security;
revoke all on table public."quest_raid_encounter_progress" from public, anon, authenticated, service_role;
alter table public."quest_raid_encounter_settings" enable row level security;
revoke all on table public."quest_raid_encounter_settings" from public, anon, authenticated, service_role;
alter table public."quest_raid_encounters" enable row level security;
revoke all on table public."quest_raid_encounters" from public, anon, authenticated, service_role;
alter table public."raid_room_battle_request_cancellations" enable row level security;
revoke all on table public."raid_room_battle_request_cancellations" from public, anon, authenticated, service_role;
alter table public."raid_room_battle_settings" enable row level security;
revoke all on table public."raid_room_battle_settings" from public, anon, authenticated, service_role;
alter table public."raid_room_battle_start_requests" enable row level security;
revoke all on table public."raid_room_battle_start_requests" from public, anon, authenticated, service_role;
alter table public."raid_room_clear_reward_grants" enable row level security;
revoke all on table public."raid_room_clear_reward_grants" from public, anon, authenticated, service_role;
alter table public."raid_room_clear_reward_items" enable row level security;
revoke all on table public."raid_room_clear_reward_items" from public, anon, authenticated, service_role;
alter table public."raid_room_clear_reward_rules" enable row level security;
revoke all on table public."raid_room_clear_reward_rules" from public, anon, authenticated, service_role;
alter table public."raid_room_clear_rewards" enable row level security;
revoke all on table public."raid_room_clear_rewards" from public, anon, authenticated, service_role;
alter table public."raid_room_combat_profiles" enable row level security;
revoke all on table public."raid_room_combat_profiles" from public, anon, authenticated, service_role;
alter table public."raid_room_combat_snapshots" enable row level security;
revoke all on table public."raid_room_combat_snapshots" from public, anon, authenticated, service_role;
alter table public."raid_room_creation_requests" enable row level security;
revoke all on table public."raid_room_creation_requests" from public, anon, authenticated, service_role;
alter table public."raid_room_creation_settings" enable row level security;
revoke all on table public."raid_room_creation_settings" from public, anon, authenticated, service_role;
alter table public."raid_room_difficulty_rules" enable row level security;
revoke all on table public."raid_room_difficulty_rules" from public, anon, authenticated, service_role;
alter table public."raid_room_lifecycle_rules" enable row level security;
revoke all on table public."raid_room_lifecycle_rules" from public, anon, authenticated, service_role;
alter table public."raid_room_members" enable row level security;
revoke all on table public."raid_room_members" from public, anon, authenticated, service_role;
alter table public."raid_room_rescue_members" enable row level security;
revoke all on table public."raid_room_rescue_members" from public, anon, authenticated, service_role;
alter table public."raid_room_rescue_publications" enable row level security;
revoke all on table public."raid_room_rescue_publications" from public, anon, authenticated, service_role;
alter table public."raid_room_rescue_requests" enable row level security;
revoke all on table public."raid_room_rescue_requests" from public, anon, authenticated, service_role;
alter table public."raid_room_rescue_reward_grants" enable row level security;
revoke all on table public."raid_room_rescue_reward_grants" from public, anon, authenticated, service_role;
alter table public."raid_room_rescue_reward_items" enable row level security;
revoke all on table public."raid_room_rescue_reward_items" from public, anon, authenticated, service_role;
alter table public."raid_room_rescue_reward_rules" enable row level security;
revoke all on table public."raid_room_rescue_reward_rules" from public, anon, authenticated, service_role;
alter table public."raid_room_rescue_rewards" enable row level security;
revoke all on table public."raid_room_rescue_rewards" from public, anon, authenticated, service_role;
alter table public."raid_room_rescue_settings" enable row level security;
revoke all on table public."raid_room_rescue_settings" from public, anon, authenticated, service_role;
alter table public."raid_rooms" enable row level security;
revoke all on table public."raid_rooms" from public, anon, authenticated, service_role;
commit;

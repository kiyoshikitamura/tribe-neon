-- Confirmed item rewards; unresolved honor IDs and membership rejoin policy remain explicit.
-- No Season activation, grant, schedule or Production write runs during migration.
begin;
create table public.monthly_power_reward_master (
 reward_version text not null, ranking_type text not null check(ranking_type in ('POWER','GUILD_POWER')),
 rank_min integer not null, rank_max integer not null, honor_label text not null, items jsonb not null,
 primary key(reward_version,ranking_type,rank_min), check(rank_min>0 and rank_max>=rank_min), check(jsonb_typeof(items)='array')
);
create table public.monthly_power_season_runs (
 season_id uuid primary key references public.ranking_seasons(id), reward_version text not null default '20260914',
 eligibility_policy text check(eligibility_policy in ('CONTINUOUS_JST_DAY1')),
 snapshotted_at timestamptz, granted_at timestamptz
);
create table public.monthly_power_entity_snapshots (
 season_id uuid not null references public.monthly_power_season_runs(season_id), entity_id uuid not null,
 score bigint not null,rank_position integer not null,primary key(season_id,entity_id)
);
create table public.monthly_power_member_snapshots (
 season_id uuid not null references public.monthly_power_season_runs(season_id),guild_id uuid not null,user_id uuid not null,
 joined_at timestamptz, continuous_season_days integer, membership_history jsonb not null,
 primary key(season_id,guild_id,user_id)
);
-- Snapshot contains actual unresolved honor descriptions, not invented cosmetic IDs.
create table public.monthly_power_honor_requirements (
 season_id uuid not null references public.monthly_power_season_runs(season_id),entity_id uuid not null,
 rank_position integer not null,honor_label text not null,primary key(season_id,entity_id)
);
insert into public.monthly_power_reward_master values('20260914','POWER',1,1,'Season Champion称号＋専用Badge','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 4}, {"item_id": "SPECIAL_TICKET_SKILL", "quantity": 2}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 2}, {"item_id": "AWAKENING_BOOK", "quantity": 2}, {"item_id": "SKILL_MANUAL", "quantity": 4}, {"item_id": "EQUIP_LB_PART", "quantity": 4}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','POWER',2,3,'TOP3称号＋専用Badge','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 2}, {"item_id": "SPECIAL_TICKET_SKILL", "quantity": 2}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 2}, {"item_id": "AWAKENING_BOOK", "quantity": 2}, {"item_id": "SKILL_MANUAL", "quantity": 3}, {"item_id": "EQUIP_LB_PART", "quantity": 3}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','POWER',4,10,'TOP10称号＋Badge','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 2}, {"item_id": "SPECIAL_TICKET_SKILL", "quantity": 1}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 1}, {"item_id": "AWAKENING_BOOK", "quantity": 1}, {"item_id": "SKILL_MANUAL", "quantity": 3}, {"item_id": "EQUIP_LB_PART", "quantity": 3}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','POWER',11,30,'TOP30 Badge','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 1}, {"item_id": "SPECIAL_TICKET_SKILL", "quantity": 1}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 1}, {"item_id": "SKILL_MANUAL", "quantity": 2}, {"item_id": "EQUIP_LB_PART", "quantity": 2}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','POWER',31,100,'TOP100 Badge','[{"item_id": "NORMAL_GACHA_TICKET_CHARACTER", "quantity": 2}, {"item_id": "CHAR_EXP_L", "quantity": 3}, {"item_id": "EQUIP_EXP_L", "quantity": 3}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','GUILD_POWER',1,1,'Champion限定Emblem＋Decoration＋Champion表示','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 2}, {"item_id": "SPECIAL_TICKET_SKILL", "quantity": 1}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 1}, {"item_id": "AWAKENING_BOOK", "quantity": 2}, {"item_id": "SKILL_MANUAL", "quantity": 3}, {"item_id": "EQUIP_LB_PART", "quantity": 3}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','GUILD_POWER',2,3,'TOP3限定Emblem＋Decoration','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 1}, {"item_id": "SPECIAL_TICKET_SKILL", "quantity": 1}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 1}, {"item_id": "AWAKENING_BOOK", "quantity": 1}, {"item_id": "SKILL_MANUAL", "quantity": 2}, {"item_id": "EQUIP_LB_PART", "quantity": 2}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','GUILD_POWER',4,10,'TOP10 Decoration＋Badge','[{"item_id": "SPECIAL_TICKET_CHARACTER", "quantity": 1}, {"item_id": "SPECIAL_TICKET_EQUIPMENT", "quantity": 1}, {"item_id": "SKILL_MANUAL", "quantity": 2}, {"item_id": "EQUIP_LB_PART", "quantity": 2}]'::jsonb);
insert into public.monthly_power_reward_master values('20260914','GUILD_POWER',11,20,'TOP20 Badge','[{"item_id": "NORMAL_GACHA_TICKET_CHARACTER", "quantity": 2}, {"item_id": "NORMAL_GACHA_TICKET_SKILL", "quantity": 1}, {"item_id": "NORMAL_GACHA_TICKET_EQUIPMENT", "quantity": 1}, {"item_id": "CHAR_EXP_L", "quantity": 2}, {"item_id": "EQUIP_EXP_L", "quantity": 2}]'::jsonb);

DO $$ begin
 if exists(select 1 from public.monthly_power_reward_master m cross join lateral jsonb_array_elements(m.items) i
 where not exists(select 1 from public.canonical_item_master c where c.item_id=i->>'item_id')) then
 raise exception 'Season reward item master missing';end if;
end $$;
create function public.monthly_power_continuous_jst_days(p_joined timestamptz,p_start timestamptz,p_end timestamptz)
returns integer language sql immutable set search_path='' as $$
 select case when p_joined is null then null when greatest(p_joined,p_start)>=p_end then 0
 else greatest(0,((p_end-interval '1 microsecond') at time zone 'Asia/Tokyo')::date
 -(greatest(p_joined,p_start) at time zone 'Asia/Tokyo')::date+1) end
$$;
create function public.monthly_power_live_rankings_v1(p_type text)
returns table(entity_id uuid,score bigint,rank_position integer)
language sql stable security definer set search_path='' as $$
 select r.user_id,r.total_power::bigint,dense_rank() over(order by r.total_power desc,r.updated_at asc)::integer
 from public.user_power_rankings r join public.users u on u.id=r.user_id where p_type='POWER'
 union all
 select g.guild_id,g.score,dense_rank() over(order by g.score desc,g.guild_id)::integer from (
 select m.guild_id,sum(p.total_power)::bigint score
 from public.guild_members m join public.guilds guild on guild.id=m.guild_id
 join public.users u on u.id=m.user_id join public.user_power_rankings p on p.user_id=m.user_id
 where p_type='GUILD_POWER' group by m.guild_id) g
$$;
create function public.reject_monthly_power_snapshot_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op<>'INSERT' or exists(select 1 from public.monthly_power_season_runs r where r.season_id=new.season_id and r.snapshotted_at is not null) then
 raise exception 'Monthly Season snapshot is immutable' using errcode='55000';end if;
 return new;
end $$;
create function public.snapshot_monthly_power_season_v1(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.ranking_seasons%rowtype;r public.monthly_power_season_runs%rowtype;
begin
 select * into strict s from public.ranking_seasons where id=p_season_id for update;
 select * into strict r from public.monthly_power_season_runs where season_id=s.id for update;
 if s.ranking_type not in ('POWER','GUILD_POWER') then raise exception 'Unsupported monthly ranking category';end if;
 if r.snapshotted_at is not null then return jsonb_build_object('status','SNAPSHOT_READY','season_id',s.id);end if;
 if s.status not in ('ACTIVE','FINALIZING') or clock_timestamp()<s.ends_at then raise exception 'Season not ready to snapshot';end if;
 perform pg_advisory_xact_lock(hashtextextended('monthly-power:'||s.id,0));
 insert into public.monthly_power_entity_snapshots select s.id,l.* from public.monthly_power_live_rankings_v1(s.ranking_type) l;
 if s.ranking_type='GUILD_POWER' then
 insert into public.monthly_power_member_snapshots
 select s.id,m.guild_id,m.user_id,m.joined_at,public.monthly_power_continuous_jst_days(m.joined_at,s.starts_at,s.ends_at),
 coalesce((select jsonb_agg(jsonb_build_object('joined_at',p.joined_at,'left_at',p.left_at,'source_membership_id',p.source_membership_id) order by p.joined_at)
 from public.kpi_guild_membership_periods p join public.kpi_subjects k on k.subject_id=p.subject_id
 where k.source_user_id=m.user_id and p.guild_id=m.guild_id and p.joined_at<s.ends_at and coalesce(p.left_at,s.ends_at)>s.starts_at),'[]'::jsonb)
 from public.guild_members m join public.monthly_power_entity_snapshots e on e.season_id=s.id and e.entity_id=m.guild_id;
 end if;
 insert into public.monthly_power_honor_requirements
 select s.id,e.entity_id,e.rank_position,m.honor_label from public.monthly_power_entity_snapshots e
 join public.monthly_power_reward_master m on m.reward_version=r.reward_version and m.ranking_type=s.ranking_type and e.rank_position between m.rank_min and m.rank_max
 where e.season_id=s.id;
 update public.monthly_power_season_runs set snapshotted_at=clock_timestamp() where season_id=s.id;
 return jsonb_build_object('status','SNAPSHOT_READY','season_id',s.id);
end $$;
create function public.guard_monthly_power_season_cutoff()
returns trigger language plpgsql security definer set search_path='' as $$
declare s record;
begin
 for s in select season.* from public.ranking_seasons season join public.monthly_power_season_runs r on r.season_id=season.id
 where r.snapshotted_at is null and season.status='ACTIVE' and season.starts_at<=clock_timestamp() order by season.id
 loop
 if clock_timestamp()>=s.ends_at then perform public.snapshot_monthly_power_season_v1(s.id);
 else
 perform 1 from public.ranking_seasons where id=s.id for share;
 perform pg_advisory_xact_lock_shared(hashtextextended('monthly-power:'||s.id,0));
 end if;
 end loop;
 return null;
end $$;
-- Internal item tranche is independently testable. Do not expose to service/client while honor/policy remain undecided.
create function public.grant_monthly_power_items_v1(p_season_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare s public.ranking_seasons%rowtype;r public.monthly_power_season_runs%rowtype;x record;i jsonb;n integer:=0;
begin
 select * into strict s from public.ranking_seasons where id=p_season_id for update;
 select * into strict r from public.monthly_power_season_runs where season_id=s.id for update;
 if r.snapshotted_at is null then raise exception 'Immutable snapshot required';end if;
 if s.ranking_type='GUILD_POWER' and r.eligibility_policy is distinct from 'CONTINUOUS_JST_DAY1' then raise exception 'Guild membership policy not approved';end if;
 for x in
 select e.entity_id,e.entity_id user_id,e.rank_position,m.items from public.monthly_power_entity_snapshots e
 join public.monthly_power_reward_master m on m.reward_version=r.reward_version and m.ranking_type=s.ranking_type and e.rank_position between m.rank_min and m.rank_max
 where e.season_id=s.id and s.ranking_type='POWER'
 union all
 select e.entity_id,ms.user_id,e.rank_position,m.items from public.monthly_power_entity_snapshots e
 join public.monthly_power_member_snapshots ms on ms.season_id=e.season_id and ms.guild_id=e.entity_id
 join public.monthly_power_reward_master m on m.reward_version=r.reward_version and m.ranking_type=s.ranking_type and e.rank_position between m.rank_min and m.rank_max
 where e.season_id=s.id and s.ranking_type='GUILD_POWER' and ms.continuous_season_days>=7
 loop
 for i in select value from jsonb_array_elements(x.items) loop
 insert into public.ranking_season_reward_grants(season_id,ranking_category,recipient_user_id,ranked_entity_id,rank_position,reward_key,master_reward_id,resolved_item_id,quantity)
 values(s.id,s.ranking_type,x.user_id,x.entity_id,x.rank_position,i->>'item_id','MONTHLY_POWER:'||r.reward_version||':'||(i->>'item_id'),i->>'item_id',(i->>'quantity')::integer)
 on conflict do nothing;
 if found then perform public.grant_present_payload(x.user_id,i->>'item_id',(i->>'quantity')::integer);n:=n+1;end if;
 end loop;
 insert into public.ranking_reward_notifications(recipient_user_id,period_kind,period_key) values(x.user_id,'SEASON',s.id::text) on conflict do nothing;
 end loop;
 return n;
end $$;
-- Complete reward release is deliberately not faked with missing cosmetic IDs.
create function public.finalize_monthly_power_season_rewards_v1(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.snapshot_monthly_power_season_v1(p_season_id);
 return jsonb_build_object('season_id',p_season_id,'status','SNAPSHOT_READY_REWARD_BINDINGS_REQUIRED',
 'items_granted',false,'cosmetics_status','UNRESOLVED_MASTER_BINDINGS');
end $$;
create function public.get_monthly_power_season_rewards_v1(p_ranking_type text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.ranking_seasons%rowtype;r public.monthly_power_season_runs%rowtype;uid uuid:=auth.uid();gid uuid;joined timestamptz;rank_value integer;day_count integer;tiers jsonb;items jsonb;policy_status text;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_ranking_type not in ('POWER','GUILD_POWER') then raise exception 'Invalid ranking type';end if;
 select season.* into s from public.ranking_seasons season join public.monthly_power_season_runs run on run.season_id=season.id
 where season.ranking_type=p_ranking_type order by season.starts_at desc limit 1;
 select * into r from public.monthly_power_season_runs where season_id=s.id;
 select coalesce(jsonb_agg(jsonb_build_object('rank_min',rank_min,'rank_max',rank_max,'honor_label',honor_label,'items',m.items) order by rank_min),'[]'::jsonb)
 into tiers from public.monthly_power_reward_master m where reward_version=coalesce(r.reward_version,'20260914') and ranking_type=p_ranking_type;
 if p_ranking_type='GUILD_POWER' then
 if r.snapshotted_at is not null then
 select guild_id,joined_at,continuous_season_days into gid,joined,day_count from public.monthly_power_member_snapshots where season_id=s.id and user_id=uid;
 else select guild_id,joined_at into gid,joined from public.guild_members where user_id=uid;
 day_count:=public.monthly_power_continuous_jst_days(joined,s.starts_at,least(clock_timestamp()+interval '1 microsecond',s.ends_at));end if;
 end if;
 if s.id is not null then
 if r.snapshotted_at is not null then select rank_position into rank_value from public.monthly_power_entity_snapshots where season_id=s.id and entity_id=case when p_ranking_type='POWER' then uid else gid end;
 elsif clock_timestamp()>=s.starts_at and clock_timestamp()<s.ends_at then
 select rank_position into rank_value from public.monthly_power_live_rankings_v1(p_ranking_type) where entity_id=case when p_ranking_type='POWER' then uid else gid end;end if;
 end if;
 select m.items into items from public.monthly_power_reward_master m where reward_version=coalesce(r.reward_version,'20260914') and ranking_type=p_ranking_type and rank_value between rank_min and rank_max;
 policy_status:=case when p_ranking_type='POWER' then 'NOT_APPLICABLE' when gid is null then 'NOT_MEMBER' when r.eligibility_policy is null then 'MEMBERSHIP_POLICY_PENDING' else 'CONTINUOUS_JST_DAY1' end;
 return jsonb_build_object('season',case when s.id is null then null else to_jsonb(s) end,'tiers',tiers,'current_rank',rank_value,'planned_items',coalesce(items,'[]'::jsonb),
 'eligibility',jsonb_build_object('joined_at',joined,'season_days',day_count,'eligible',case when p_ranking_type='POWER' then true when r.eligibility_policy is null then null else coalesce(day_count>=7,false) end,'status',policy_status),
 'cosmetics_status','UNRESOLVED_MASTER_BINDINGS','finalized',r.snapshotted_at is not null);
end $$;
-- Existing receipt parser/acknowledgement already reads this ledger and explicit ITEM kind.
DO $$begin
 if (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.ranking_season_reward_grants'::regclass and conname='ranking_season_reward_grants_ranking_category_check') is distinct from
 $expected$CHECK ((ranking_category = ANY (ARRAY['PVP'::text, 'RAID_PERSONAL'::text, 'RAID_GUILD'::text])))$expected$ then
 raise exception 'Season ledger category constraint drift';end if;
end $$;
alter table public.ranking_season_reward_grants drop constraint ranking_season_reward_grants_ranking_category_check;
alter table public.ranking_season_reward_grants add constraint ranking_season_reward_grants_category_check check(ranking_category in ('PVP','RAID_PERSONAL','RAID_GUILD','POWER','GUILD_POWER'));
DO $$declare t text;begin
 foreach t in array array['monthly_power_reward_master','monthly_power_season_runs','monthly_power_entity_snapshots','monthly_power_member_snapshots','monthly_power_honor_requirements'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['monthly_power_entity_snapshots','monthly_power_member_snapshots','monthly_power_honor_requirements'] loop
 execute format('create trigger monthly_power_snapshot_immutable before insert or update or delete on public.%I for each row execute function public.reject_monthly_power_snapshot_mutation()',t);
 end loop;
 foreach t in array array['users','guild_members','guilds','ranking_guild_exclusions','user_main_formations','user_characters','user_equipments','user_skills','user_power_rankings','character_growth_patterns','character_awakening_master','character_battle_master','equipment_battle_master','canonical_character_master','canonical_equipment_master','canonical_character_growth_assignments','canonical_character_growth_exponents'] loop
 if to_regclass('public.'||t) is not null then
 execute format('create trigger monthly_power_cutoff_guard before insert or update or delete on public.%I for each statement execute function public.guard_monthly_power_season_cutoff()',t);
 end if;
 end loop;
end $$;
revoke all on function public.monthly_power_continuous_jst_days(timestamptz,timestamptz,timestamptz),public.monthly_power_live_rankings_v1(text),public.reject_monthly_power_snapshot_mutation(),public.snapshot_monthly_power_season_v1(uuid),public.guard_monthly_power_season_cutoff(),public.grant_monthly_power_items_v1(uuid),public.finalize_monthly_power_season_rewards_v1(uuid),public.get_monthly_power_season_rewards_v1(text) from public,anon,authenticated;
revoke all on function public.grant_monthly_power_items_v1(uuid) from service_role;
-- Item tranche deliberately remains owner-only while complete reward binding is unresolved.
grant execute on function public.snapshot_monthly_power_season_v1(uuid),public.finalize_monthly_power_season_rewards_v1(uuid) to service_role;
grant execute on function public.get_monthly_power_season_rewards_v1(text) to authenticated;
notify pgrst,'reload schema';
commit;

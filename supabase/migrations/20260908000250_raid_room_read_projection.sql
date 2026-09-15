begin;

-- 参照経路だけを準備する。生成・公開・参加・報酬ルールの確定や既存Instanceの割当は行わない。
create table public.raid_rooms (
  id uuid primary key default gen_random_uuid(),
  raid_boss_instance_id uuid not null unique references public.raid_bosses(id),
  owner_user_id uuid not null references public.users(id),
  difficulty_id text not null check (difficulty_id in ('beginner','intermediate','advanced','expert')),
  created_at timestamptz not null default now()
);
create table public.raid_room_members (
  room_id uuid not null references public.raid_rooms(id),
  user_id uuid not null references public.users(id),
  joined_at timestamptz not null default now(),
  primary key(room_id,user_id)
);
alter table public.raid_room_members enable row level security;
revoke all on table public.raid_room_members from public, anon, authenticated;
create index raid_room_members_user_idx on public.raid_room_members(user_id,room_id);
create index raid_rooms_owner_created_idx on public.raid_rooms(owner_user_id, created_at desc, id);
alter table public.raid_rooms enable row level security;
-- default-deny RLS。未確定の公開方針をテーブルSELECT権限で迂回できない。
revoke all on table public.raid_rooms from public, anon, authenticated;

create function public.raid_room_can_read_v1(p_room_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.raid_rooms r where r.id = p_room_id
    and (r.owner_user_id = auth.uid() or exists (
      select 1 from public.raid_room_members m where m.room_id=r.id and m.user_id=auth.uid()
    ) or exists (
      select 1 from public.raid_instance_user_progress p
      where p.raid_boss_instance_id = r.raid_boss_instance_id
        and p.user_id = auth.uid() and p.finalized_battles > 0
    ))
  )
$$;
revoke all on function public.raid_room_can_read_v1(uuid) from public, anon, authenticated;

-- 内部専用のDTO生成。取得時に既存rotate/finalizeを呼ばない。
create function public.raid_room_projection_v1(p_room_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'roomId',r.id,'difficultyId',r.difficulty_id,
    'owner',jsonb_build_object('status','available','value',jsonb_build_object(
      'userId',u.id,'name',u.username,'leaderIconUrl',jsonb_build_object('status','unknown'))),
    'state',case when b.status='ACTIVE' and b.current_hp=0 then jsonb_build_object('status','unknown')
      when b.status='ACTIVE' and b.expires_at<=now() then jsonb_build_object('status','available','value','expired')
      when b.status in ('ACTIVE','CLEARED','EXPIRED')
      then jsonb_build_object('status','available','value',lower(b.status))
      else jsonb_build_object('status','unknown') end,
    'createdAt',jsonb_build_object('status','available','value',r.created_at),
    'expiresAt',jsonb_build_object('status','available','value',b.expires_at),
    'endedAt',jsonb_build_object('status','available','value',b.outcome_finalized_at),
    'hp',case when b.current_hp is not null and b.max_hp is not null
      then jsonb_build_object('status','available','value',jsonb_build_object('current',b.current_hp,'max',b.max_hp))
      else jsonb_build_object('status','unknown') end,
    'participantCount',jsonb_build_object('status','available','value',(
      select count(*) from (
        select r.owner_user_id as user_id
        union select m.user_id from public.raid_room_members m where m.room_id=r.id
        union select p.user_id from public.raid_instance_user_progress p
          where p.raid_boss_instance_id=r.raid_boss_instance_id and p.finalized_battles>0
      ) participants)),
    'serverEligibility',jsonb_build_object('status','unknown')
  ) from public.raid_rooms r join public.raid_bosses b on b.id = r.raid_boss_instance_id
    join public.users u on u.id = r.owner_user_id
  where r.id = p_room_id
$$;
revoke all on function public.raid_room_projection_v1(uuid) from public, anon, authenticated;

create function public.list_raid_rooms_v1(
  p_difficulty_id text default null, p_limit integer default 20, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_items jsonb; v_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 or p_offset > 1000000
    or (p_difficulty_id is not null and p_difficulty_id not in ('beginner','intermediate','advanced','expert')) then
    raise exception 'invalid pagination or difficulty' using errcode='22023';
  end if;
  with page as (
    select r.id,r.created_at from public.raid_rooms r
    where (p_difficulty_id is null or r.difficulty_id=p_difficulty_id)
      and public.raid_room_can_read_v1(r.id)
    order by r.created_at desc,r.id limit p_limit + 1 offset p_offset
  ), numbered as (select *,row_number() over(order by created_at desc,id) n from page)
  select coalesce(jsonb_agg(public.raid_room_projection_v1(id) order by created_at desc,id)
    filter(where n <= p_limit),'[]'::jsonb),count(*) into v_items,v_count from numbered;
  return jsonb_build_object('rooms',v_items,'nextOffset',case when v_count > p_limit then p_offset+p_limit else null end);
end $$;

create function public.get_raid_room_v1(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.raid_room_can_read_v1(p_room_id) then
    raise exception 'room unavailable' using errcode='P0002';
  end if;
  return public.raid_room_projection_v1(p_room_id);
end $$;

create function public.get_raid_room_participants_v1(
  p_room_id uuid,p_limit integer default 20,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_items jsonb; v_count integer; v_instance uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.raid_room_can_read_v1(p_room_id) then
    raise exception 'room unavailable' using errcode='P0002';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'invalid pagination' using errcode='22023';
  end if;
  select raid_boss_instance_id into v_instance from public.raid_rooms where id=p_room_id;
  with members as (
    select owner_user_id as user_id from public.raid_rooms where id=p_room_id
    union select user_id from public.raid_room_members where room_id=p_room_id
    union select user_id from public.raid_instance_user_progress
      where raid_boss_instance_id=v_instance and finalized_battles>0
  ), page as (
    select m.user_id,coalesce(p.finalized_battles,0) finalized_battles
    from members m left join public.raid_instance_user_progress p
      on p.raid_boss_instance_id=v_instance and p.user_id=m.user_id
    order by m.user_id limit p_limit+1 offset p_offset
  ), numbered as (select *,row_number() over(order by user_id) n from page), projected as (
    select p.n,p.user_id,jsonb_build_object(
      'roomId',p_room_id,
      'player',jsonb_build_object('userId',u.id,'name',u.username,'leaderIconUrl',jsonb_build_object('status','unknown')),
      'currentGuild',case when membership.guild_id is not null and current_guild.id is null
        then jsonb_build_object('status','unknown')
        else jsonb_build_object('status','available','value',case when current_guild.id is null then null
          else jsonb_build_object('guildId',current_guild.id,'name',current_guild.name) end) end,
      'battleGuildSnapshot',case when latest.id is null or (latest.guild_id is not null and battle_guild.id is null)
        then jsonb_build_object('status','unknown')
        else jsonb_build_object('status','available','value',case when latest.guild_id is null then null
          else jsonb_build_object('guildId',latest.guild_id,'name',battle_guild.name) end) end,
      'finalizedBattles',jsonb_build_object('status','available','value',p.finalized_battles),
      'rawDamage',case when damage.log_count=0 then jsonb_build_object('status','unknown')
        else jsonb_build_object('status','available','value',damage.raw_damage) end,
      'appliedDamage',case when damage.log_count=0 then jsonb_build_object('status','unknown')
        else jsonb_build_object('status','available','value',damage.applied_damage) end
    ) dto
    from numbered p join public.users u on u.id=p.user_id
    left join public.guild_members membership on membership.user_id=p.user_id
    left join public.guilds current_guild on current_guild.id=membership.guild_id
    left join lateral (
      select l.id,l.guild_id from public.raid_damage_logs l
      where l.raid_boss_instance_id=v_instance and l.user_id=p.user_id
      order by l.created_at desc,l.id desc limit 1
    ) latest on true
    left join public.guilds battle_guild on battle_guild.id=latest.guild_id
    left join lateral (
      select count(*) log_count,sum(l.raw_damage) raw_damage,sum(l.applied_damage) applied_damage
      from public.raid_damage_logs l where l.raid_boss_instance_id=v_instance and l.user_id=p.user_id
    ) damage on true
  ) select coalesce(jsonb_agg(dto order by user_id) filter(where n<=p_limit),'[]'::jsonb),count(*)
    into v_items,v_count from projected;
  return jsonb_build_object('participants',v_items,'nextOffset',case when v_count>p_limit then p_offset+p_limit else null end);
end $$;

revoke all on function public.list_raid_rooms_v1(text,integer,integer) from public,anon,authenticated;
revoke all on function public.get_raid_room_v1(uuid) from public,anon,authenticated;
revoke all on function public.get_raid_room_participants_v1(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.list_raid_rooms_v1(text,integer,integer) to authenticated;
grant execute on function public.get_raid_room_v1(uuid) to authenticated;
grant execute on function public.get_raid_room_participants_v1(uuid,integer,integer) to authenticated;

commit;

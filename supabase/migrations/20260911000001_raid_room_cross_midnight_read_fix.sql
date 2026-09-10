begin;

-- P0: Raid Room lifetime is independent from the JST Daily Target rotation.
-- Keep historical owner/member/participant reads intact, but never make an
-- ACTIVE Room unreadable merely because rotation_date is yesterday.
create or replace function public.raid_room_can_read_v1(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.raid_rooms r
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
    where r.id = p_room_id
      and (
        (
          b.status = 'ACTIVE'
          and b.current_hp > 0
          and b.expires_at > statement_timestamp()
          and b.outcome_finalized_at is null
          and (
            b.raid_day_key like 'DAILY:%'
            or r.owner_user_id = auth.uid()
            or exists (
              select 1 from public.raid_room_members m
              where m.room_id = r.id and m.user_id = auth.uid()
            )
            or exists (
              select 1 from public.raid_instance_user_progress p
              where p.raid_boss_instance_id = r.raid_boss_instance_id
                and p.user_id = auth.uid() and p.finalized_battles > 0
            )
            or exists (
              select 1
              from public.raid_room_rescue_publications rp
              where rp.room_id = r.id
                and (
                  rp.channel = 'ACTIVITY'
                  or (
                    rp.channel = 'GUILD'
                    and exists (
                      select 1 from public.guild_members gm
                      where gm.user_id = auth.uid() and gm.guild_id = rp.guild_id
                    )
                  )
                )
            )
          )
        )
        or r.owner_user_id = auth.uid()
        or exists (
          select 1 from public.raid_room_members m
          where m.room_id = r.id and m.user_id = auth.uid()
        )
        or exists (
          select 1 from public.raid_instance_user_progress p
          where p.raid_boss_instance_id = r.raid_boss_instance_id
            and p.user_id = auth.uid() and p.finalized_battles > 0
        )
      )
  );
$$;

revoke all on function public.raid_room_can_read_v1(uuid) from public, anon, authenticated, service_role;

commit;
notify pgrst, 'reload schema';

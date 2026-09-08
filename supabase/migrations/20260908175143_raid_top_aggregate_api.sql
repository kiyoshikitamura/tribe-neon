begin;
-- Raid top step 2: authenticated bounded top projection.
-- 依存: Bの日次正本 private.raid_daily_targets_v1() を先に定義する。
-- 行の公開範囲を内部関数で限定するため、元テーブルのRLS/GRANTは変更しない。
create or replace function private.raid_top_snapshot_v1() returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_daily jsonb;
  v_result jsonb;
begin
  if v_uid is null or not exists(select 1 from public.users where id = v_uid) then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- 日次の遅延確定以外に書込を発生させない。失敗は例外のまま返す。
  v_daily := private.raid_daily_targets_v1();
  -- 日次ロック待機中の期限到達も反映する。
  v_now := clock_timestamp();
  with
  participating_page as materialized (
    select r.id, r.created_at
    from public.raid_rooms r
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
    where b.status = 'ACTIVE' and b.current_hp > 0 and b.expires_at > v_now
      and b.outcome_finalized_at is null
      and (r.owner_user_id = v_uid or exists (
        select 1 from public.raid_room_members m where m.room_id = r.id and m.user_id = v_uid
      ))
    order by r.created_at desc, r.id desc limit 20
  ),
  visible_rescues as (
    select p.*, row_number() over (
      partition by p.room_id order by p.created_at desc, p.id desc
    ) as publication_number
    from public.raid_room_rescue_publications p
    join public.raid_rooms r on r.id = p.room_id
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
    where b.status = 'ACTIVE' and b.current_hp > 0 and b.expires_at > v_now
      and b.outcome_finalized_at is null
      -- get_raid_room_rescue_v1 と同じ現在所属判定。移籍前Guildを認めない。
      and (p.channel = 'ACTIVITY' or (p.channel = 'GUILD' and exists (
        select 1 from public.guild_members gm
        where gm.user_id = v_uid and gm.guild_id = p.guild_id
      )))
  ),
  rescue_page as materialized (
    select * from visible_rescues where publication_number = 1
    order by created_at desc, id desc limit 20
  ),
  selected_ids as materialized (
    select id from participating_page union select room_id from rescue_page
  ),
  selected_rooms as materialized (
    select r.*, b.raid_variant_id, b.max_hp, b.current_hp, b.expires_at, b.outcome_finalized_at
    from selected_ids s join public.raid_rooms r on r.id = s.id
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
  ),
  registered as materialized (
    -- 登録参加人数。オンライン数や戦績ログ件数ではない。主催者を重複排除する。
    select r.id as room_id, r.owner_user_id as user_id from selected_rooms r
    union
    select m.room_id, m.user_id from public.raid_room_members m
    join selected_ids s on s.id = m.room_id
  ),
  member_numbers as materialized (
    select m.*, count(*) over(partition by m.room_id) as registered_count,
      row_number() over(partition by m.room_id order by (m.user_id = r.owner_user_id) desc, m.user_id) as face_number
    from registered m join selected_rooms r on r.id = m.room_id
  ),
  profile_ids as materialized (
    select owner_user_id as user_id from selected_rooms
    union select user_id from member_numbers where face_number <= 5
  ),
  profiles as materialized (
    select u.id, jsonb_build_object(
      'userId', u.id, 'name', u.username,
      'leaderIconUrl', jsonb_build_object('status', 'unknown'),
      -- 画像URLはクライアントの現行キャラクターマスターで解決する。
      -- avatar_urlは任意プロフィール画像であり、リーダーの代用にしない。
      'leaderCharacterId', jsonb_build_object('status', 'available', 'value', u.favorite_character_id)
    ) as dto
    from profile_ids p join public.users u on u.id = p.user_id
  ),
  member_summaries as (
    select m.room_id, max(m.registered_count) as registered_count,
      jsonb_agg(p.dto order by m.face_number) filter(where m.face_number <= 5) as faces
    from member_numbers m join profiles p on p.id = m.user_id
    where m.face_number <= 5
    group by m.room_id
  ),
  projected as materialized (
    select r.id, jsonb_build_object(
      'room', jsonb_build_object(
        'roomId', r.id, 'difficultyId', r.difficulty_id,
        'owner', jsonb_build_object('status', 'available', 'value', owner.dto),
        'state', jsonb_build_object('status', 'available', 'value', 'active'),
        'createdAt', jsonb_build_object('status', 'available', 'value', r.created_at),
        'expiresAt', jsonb_build_object('status', 'available', 'value', r.expires_at),
        'endedAt', jsonb_build_object('status', 'available', 'value', r.outcome_finalized_at),
        'hp', case when r.max_hp is not null and r.current_hp is not null then
          jsonb_build_object('status', 'available', 'value', jsonb_build_object('current', r.current_hp, 'max', r.max_hp))
          else jsonb_build_object('status', 'unknown') end,
        'participantCount', jsonb_build_object('status', 'available', 'value', members.registered_count),
        'serverEligibility', jsonb_build_object('status', 'unknown')
      ),
      'enemy', case when r.raid_variant_id is null then jsonb_build_object('status', 'unknown')
        else jsonb_build_object('status', 'available', 'value', jsonb_build_object('variantId', r.raid_variant_id)) end,
      'ownerGuild', case when gm.guild_id is not null and g.id is null then jsonb_build_object('status', 'unknown')
        else jsonb_build_object('status', 'available', 'value', case when g.id is null then null
          else jsonb_build_object('guildId', g.id, 'name', g.name) end) end,
      'participants', jsonb_build_object('status', 'available', 'value', coalesce(members.faces, '[]'::jsonb)),
      'membership', jsonb_build_object('status', 'available', 'value', case
        when r.owner_user_id = v_uid then 'owner'
        when rescue_member.user_id is not null then 'rescue'
        when my_member.user_id is not null then 'member'
        else 'not_joined' end),
      'rescue', jsonb_build_object('status', 'unknown')
    ) as dto
    from selected_rooms r
    join profiles owner on owner.id = r.owner_user_id
    join member_summaries members on members.room_id = r.id
    left join public.guild_members gm on gm.user_id = r.owner_user_id
    left join public.guilds g on g.id = gm.guild_id
    left join public.raid_room_members my_member on my_member.room_id = r.id and my_member.user_id = v_uid
    left join public.raid_room_rescue_members rescue_member on rescue_member.room_id = r.id and rescue_member.user_id = v_uid
  )
  select jsonb_build_object(
    'participating', jsonb_build_object('status', 'ready', 'data', coalesce((
      select jsonb_agg(p.dto order by page.created_at desc, page.id desc)
      from participating_page page join projected p on p.id = page.id
    ), '[]'::jsonb)),
    'rescues', jsonb_build_object('status', 'ready', 'data', coalesce((
      select jsonb_agg(p.dto || jsonb_build_object('rescue', jsonb_build_object('status', 'available', 'value',
        jsonb_build_object('rescueId', page.id,
          'source', case page.channel when 'ACTIVITY' then 'activity' else 'guild_chat' end,
          'scope', page.channel, 'guildId', page.guild_id)
      )) order by page.created_at desc, page.id desc)
      from rescue_page page join projected p on p.id = page.room_id
    ), '[]'::jsonb)),
    'dailyTargets', jsonb_build_object('status', 'ready', 'data', v_daily)
  ) into v_result;
  return v_result;
end;
$$;

-- privileged implementationを非公開schemaへ置き、公開入口は権限を昇格しない。
create or replace function public.get_raid_top_v1() returns jsonb
language sql volatile security invoker set search_path = pg_catalog
as $$ select private.raid_top_snapshot_v1() $$;

revoke all on function private.raid_top_snapshot_v1() from public, anon, authenticated, service_role;
revoke all on function public.get_raid_top_v1() from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.raid_top_snapshot_v1() to authenticated;
grant execute on function public.get_raid_top_v1() to authenticated;
comment on function public.get_raid_top_v1() is '本人の開催中参戦・閲覧可能救援を各20件、登録参加者の公開名/リーダーを5件まで一括投影。日次2エリア正本を共有。';
commit;

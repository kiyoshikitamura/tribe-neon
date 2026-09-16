-- Activity only: daily battle standings follow get_public_pvp_rankings(true).
-- The current leader is seeded silently; no historical announcement is fabricated.
alter table public.social_activity_feed drop constraint social_activity_feed_activity_type_check;
alter table public.social_activity_feed add constraint social_activity_feed_activity_type_check
check(activity_type in ('SSR_CHARACTER','SSR_SKILL','SSR_EQUIPMENT','POWER_RANK_1',
'PVP_DAILY_RANK_1','GUILD_CREATED','RAID_HELP_REQUEST','RAID_BOSS_DEFEATED'));

create or replace function public.on_daily_pvp_leader_activity()
returns trigger language plpgsql security definer set search_path=public
as $function$
declare
  v_day date := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
  v_key text;
  v_leader uuid;
  v_previous uuid;
  v_wins integer;
  v_name text;
begin
  if new.activity_date <> v_day or new.wins <= 0 then return new; end if;
  if tg_op='UPDATE' then
    if new.wins is not distinct from old.wins then return new; end if;
  end if;
  if coalesce(current_setting('tribe_neon.ranking_reconcile',true),'')='on' then return new; end if;
  v_key := 'PVP_DAILY_RANK_1:' || v_day::text;
  -- Serialize announcements across concurrent winners, including the first win of a day.
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select daily.user_id,daily.wins,player.username into v_leader,v_wins,v_name
  from public.pvp_daily_wins daily
  join public.pvp_ranks rank on rank.user_id=daily.user_id
  join public.users player on player.id=daily.user_id
  where daily.activity_date=v_day and daily.wins>0
  order by daily.wins desc,daily.user_id
  limit 1;
  if v_leader is null then return new; end if;
  select subject_user_id into v_previous from public.social_activity_projection_state
  where projection_key=v_key for update;
  if v_previous is not distinct from v_leader then return new; end if;
  insert into public.social_activity_projection_state(projection_key,subject_user_id,updated_at)
  values(v_key,v_leader,clock_timestamp())
  on conflict(projection_key) do update set
    subject_user_id=excluded.subject_user_id,updated_at=excluded.updated_at;
  insert into public.social_activity_feed(activity_type,actor_user_id,actor_display_name,display_payload,created_at)
  values('PVP_DAILY_RANK_1',v_leader,coalesce(v_name,'PLAYER'),
    jsonb_build_object('ranking_day_key',v_day,'wins',v_wins),clock_timestamp());
  return new;
end;
$function$;
revoke all on function public.on_daily_pvp_leader_activity() from public,anon,authenticated;

create trigger daily_pvp_leader_activity
after insert or update of wins on public.pvp_daily_wins
for each row execute function public.on_daily_pvp_leader_activity();

insert into public.social_activity_projection_state(projection_key,subject_user_id)
select 'PVP_DAILY_RANK_1:'||daily.activity_date::text,daily.user_id
from public.pvp_daily_wins daily
join public.pvp_ranks rank on rank.user_id=daily.user_id
join public.users player on player.id=daily.user_id
where daily.activity_date=(clock_timestamp() at time zone 'Asia/Tokyo')::date and daily.wins>0
order by daily.wins desc,daily.user_id limit 1
on conflict(projection_key) do nothing;

CREATE OR REPLACE FUNCTION public.get_recent_social_activity_feed(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, activity_type text, actor_user_id uuid, actor_display_name text, guild_id uuid, object_master_id text, display_payload jsonb, permanent boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  return query
  select feed.id,feed.activity_type,feed.actor_user_id,feed.actor_display_name,
    feed.guild_id,feed.object_master_id,feed.display_payload,feed.permanent,feed.created_at
  from public.social_activity_feed feed
  where feed.created_at>=statement_timestamp()-interval '24 hours'
    and feed.created_at<=statement_timestamp()
    and feed.activity_type in (
      
      'SSR_CHARACTER','POWER_RANK_1','PVP_DAILY_RANK_1','GUILD_CREATED','RAID_HELP_REQUEST','RAID_BOSS_DEFEATED'
    )
    and exists(
      select 1 from public.users actor
      where actor.id=feed.actor_user_id
        and actor.favorite_character_id is not null
    )
    and not exists(
      select 1
      from public.kpi_subjects subject
      join public.kpi_account_classification_periods classification
        on classification.subject_id=subject.subject_id
      where subject.source_user_id=feed.actor_user_id
        and classification.classification in ('qa','test')
        and classification.valid_from<=feed.created_at
        and (classification.valid_to is null or feed.created_at<classification.valid_to)
    )
  order by feed.created_at desc,feed.id desc
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$function$

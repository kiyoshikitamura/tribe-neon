alter table public.social_activity_feed drop constraint social_activity_feed_activity_type_check;
alter table public.social_activity_feed add constraint social_activity_feed_activity_type_check check(activity_type in ('SSR_CHARACTER','SSR_SKILL','SSR_EQUIPMENT','POWER_RANK_1','PVP_DAILY_RANK_1','GUILD_CREATED','RAID_HELP_REQUEST','RAID_BOSS_DEFEATED','SYSTEM_NEWS'));
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
    and ( (feed.activity_type='SYSTEM_NEWS' and feed.actor_user_id is null and exists(select 1 from public.news n where n.id::text=feed.display_payload->>'news_id' and n.is_published and n.start_at<=statement_timestamp() and (n.end_at is null or n.end_at>statement_timestamp()))) or (feed.activity_type in (
      
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
  )) order by feed.created_at desc,feed.id desc
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$function$
;

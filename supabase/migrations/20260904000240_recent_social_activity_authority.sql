-- Limit the My Page activity projection to the latest rolling 24 hours.
begin;

do $$
begin
  if to_regclass('public.social_activity_feed') is null then
    raise exception 'social activity feed prerequisite is missing';
  end if;
end;
$$;

create index if not exists social_activity_feed_recent_idx
  on public.social_activity_feed(created_at desc, id desc);

create or replace function public.get_recent_social_activity_feed(p_limit integer default 20)
returns table(
  id uuid,
  activity_type text,
  actor_user_id uuid,
  actor_display_name text,
  guild_id uuid,
  object_master_id text,
  display_payload jsonb,
  permanent boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  select
    feed.id,
    feed.activity_type,
    feed.actor_user_id,
    feed.actor_display_name,
    feed.guild_id,
    feed.object_master_id,
    feed.display_payload,
    feed.permanent,
    feed.created_at
  from public.social_activity_feed feed
  where feed.created_at >= statement_timestamp() - interval '24 hours'
    and feed.created_at <= statement_timestamp()
  order by feed.created_at desc, feed.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

-- The client must use the bounded projection rather than reading an unbounded
-- history directly from the table.
revoke select on table public.social_activity_feed from anon, authenticated;
revoke all on function public.get_recent_social_activity_feed(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_recent_social_activity_feed(integer)
  to authenticated;

commit;
notify pgrst, 'reload schema';

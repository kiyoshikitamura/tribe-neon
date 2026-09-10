-- Restore SSR acquisition Activity publication without changing Tutorial or Raid state.
begin;

do $$
begin
  if to_regclass('public.gacha_execution_history') is null
    or to_regclass('public.social_activity_feed') is null
    or to_regprocedure('public.get_recent_social_activity_feed(integer)') is null then
    raise exception 'SSR Activity prerequisites are missing';
  end if;
end;
$$;

create or replace function public.on_m9x_gacha_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_name text;
begin
  if new.status<>'COMPLETED' or new.result_payload is null or old.status='COMPLETED' then return new; end if;
  select username into v_name from public.users where id=new.user_id;
  for v_result in select value from jsonb_array_elements(coalesce(new.result_payload->'results','[]'::jsonb))
  loop
    if v_result->>'rarity'='SSR' then
      insert into public.social_activity_feed(
        activity_type,actor_user_id,actor_display_name,object_master_id,display_payload
      ) values(
        case v_result->>'type'
          when 'SKILL' then 'SSR_SKILL'
          when 'EQUIPMENT' then 'SSR_EQUIPMENT'
          else 'SSR_CHARACTER'
        end,
        new.user_id,coalesce(v_name,'PLAYER'),
        coalesce(v_result->>'character_id',v_result->>'item_id'),
        jsonb_build_object('rarity','SSR','outcome',v_result->>'outcome')
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists m9x_gacha_activity_trigger on public.gacha_execution_history;
create trigger m9x_gacha_activity_trigger
after update of status on public.gacha_execution_history
for each row execute function public.on_m9x_gacha_activity();

create or replace function public.get_recent_social_activity_feed(p_limit integer default 20)
returns table(
  id uuid,activity_type text,actor_user_id uuid,actor_display_name text,
  guild_id uuid,object_master_id text,display_payload jsonb,
  permanent boolean,created_at timestamptz
)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  return query
  select feed.id,feed.activity_type,feed.actor_user_id,feed.actor_display_name,
    feed.guild_id,feed.object_master_id,feed.display_payload,feed.permanent,feed.created_at
  from public.social_activity_feed feed
  where feed.created_at>=statement_timestamp()-interval '24 hours'
    and feed.created_at<=statement_timestamp()
    and feed.activity_type in (
      'SSR_CHARACTER','SSR_SKILL','SSR_EQUIPMENT',
      'POWER_RANK_1','GUILD_CREATED','RAID_HELP_REQUEST','RAID_BOSS_DEFEATED'
    )
    and exists(select 1 from public.users actor where actor.id=feed.actor_user_id)
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
$$;

revoke all on function public.on_m9x_gacha_activity() from public,anon,authenticated,service_role;
revoke all on function public.get_recent_social_activity_feed(integer) from public,anon,authenticated,service_role;
grant execute on function public.get_recent_social_activity_feed(integer) to authenticated;

commit;
notify pgrst,'reload schema';

-- Ranking reward presentation contract and one-time Home notification ledger.
-- Daily ranking rewards deliberately remain data-driven: the canonical master
-- currently contains only season rewards, so this migration does not invent
-- any daily reward values.
begin;

create table if not exists public.ranking_reward_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  period_kind text not null check (period_kind in ('DAILY','SEASON')),
  period_key text not null,
  awarded_at timestamptz not null default clock_timestamp(),
  acknowledged_at timestamptz,
  unique (recipient_user_id,period_kind,period_key)
);

create index if not exists ranking_reward_notifications_pending_idx
  on public.ranking_reward_notifications(recipient_user_id,awarded_at,id)
  where acknowledged_at is null;

alter table public.ranking_reward_notifications enable row level security;
revoke all on public.ranking_reward_notifications from public,anon,authenticated;
grant all on public.ranking_reward_notifications to service_role;

create or replace function public.get_public_ranking_reward_master()
returns jsonb language sql stable security definer set search_path=public as $$
  select public.canonical_ranking_reward_payload()
$$;

create or replace function public.grant_canonical_ranking_season_reward(
  p_season_id uuid,
  p_category text,
  p_recipient_user_id uuid,
  p_ranked_entity_id uuid,
  p_rank_position integer
) returns integer
language plpgsql security definer set search_path=public as $$
declare
  v_entry record;
  v_reward_id text;
  v_item_id text;
  v_quantity integer;
  v_reward_key text;
  v_granted integer := 0;
  v_message text;
  v_present_id uuid;
begin
  if p_category not in ('PVP','RAID_PERSONAL','RAID_GUILD') then
    raise exception 'unsupported ranking reward category' using errcode='22023';
  end if;
  v_message := case p_category
    when 'PVP' then 'PvPシーズンランキング報酬'
    when 'RAID_PERSONAL' then 'レイド個人ランキング報酬'
    else 'レイドギルドランキング報酬'
  end;

  for v_entry in
    select entry.value,entry.ordinality
    from jsonb_array_elements(public.canonical_ranking_reward_payload()#>array['progression',p_category])
      with ordinality entry(value,ordinality)
    where p_rank_position between (entry.value->>0)::integer and (entry.value->>1)::integer
  loop
    v_reward_id := v_entry.value->>2;
    v_quantity := (v_entry.value->>3)::integer;
    v_reward_key := concat_ws(':',v_entry.value->>0,v_entry.value->>1,v_reward_id,v_entry.ordinality);
    v_item_id := public.resolve_canonical_reward_item(v_reward_id);

    insert into public.ranking_season_reward_grants(
      season_id,ranking_category,recipient_user_id,ranked_entity_id,rank_position,
      reward_key,master_reward_id,resolved_item_id,quantity
    ) values (
      p_season_id,p_category,p_recipient_user_id,p_ranked_entity_id,p_rank_position,
      v_reward_key,v_reward_id,v_item_id,v_quantity
    ) on conflict do nothing;

    if found then
      insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
      values(p_recipient_user_id,v_item_id,v_quantity,v_message,'UNCLAIMED',clock_timestamp()+interval '30 days')
      returning id into v_present_id;
      update public.ranking_season_reward_grants set present_id=v_present_id
      where season_id=p_season_id and ranking_category=p_category
        and recipient_user_id=p_recipient_user_id and reward_key=v_reward_key;

      -- One notification per user and season. Personal and guild Raid rewards
      -- are therefore shown in the same Home dialog. A later genuinely new
      -- grant for the same season reopens an already acknowledged notification.
      insert into public.ranking_reward_notifications(
        recipient_user_id,period_kind,period_key,awarded_at,acknowledged_at
      ) values (
        p_recipient_user_id,'SEASON',p_season_id::text,clock_timestamp(),null
      ) on conflict(recipient_user_id,period_kind,period_key) do update set
        awarded_at=excluded.awarded_at,acknowledged_at=null;
      v_granted := v_granted + 1;
    end if;
  end loop;
  return v_granted;
end;
$$;

create or replace function public.get_my_pending_ranking_reward_notification()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_uid uuid := auth.uid();
  v_notification_ids jsonb;
  v_grants jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;

  select jsonb_agg(notification.id order by notification.awarded_at,notification.id)
  into v_notification_ids
  from public.ranking_reward_notifications notification
  where notification.recipient_user_id=v_uid and notification.acknowledged_at is null;
  if v_notification_ids is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'period_kind',notification.period_kind,
    'period_key',notification.period_key,
    'ranking_category',grant_row.ranking_category,
    'rank_position',grant_row.rank_position,
    'item_id',grant_row.resolved_item_id,
    'quantity',grant_row.quantity,
    'granted_at',grant_row.granted_at
  ) order by notification.awarded_at,notification.id,grant_row.ranking_category,
    grant_row.rank_position,grant_row.reward_key),'[]'::jsonb)
  into v_grants
  from public.ranking_reward_notifications notification
  join public.ranking_season_reward_grants grant_row
    on notification.period_kind='SEASON'
   and grant_row.season_id::text=notification.period_key
   and grant_row.recipient_user_id=notification.recipient_user_id
  where notification.recipient_user_id=v_uid and notification.acknowledged_at is null;

  return jsonb_build_object(
    'notification_ids',v_notification_ids,
    'grants',v_grants
  );
end;
$$;

create or replace function public.acknowledge_ranking_reward_notifications(
  p_notification_ids uuid[]
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid := auth.uid();
  v_acknowledged integer := 0;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if coalesce(cardinality(p_notification_ids),0)=0 then
    return jsonb_build_object('acknowledged',0);
  end if;

  update public.ranking_reward_notifications notification
  set acknowledged_at=clock_timestamp()
  where notification.recipient_user_id=v_uid
    and notification.id=any(p_notification_ids)
    and notification.acknowledged_at is null;
  get diagnostics v_acknowledged=row_count;
  return jsonb_build_object('acknowledged',v_acknowledged);
end;
$$;

revoke all on function public.get_public_ranking_reward_master(),
  public.get_my_pending_ranking_reward_notification(),
  public.acknowledge_ranking_reward_notifications(uuid[]),
  public.grant_canonical_ranking_season_reward(uuid,text,uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.get_public_ranking_reward_master(),
  public.get_my_pending_ranking_reward_notification(),
  public.acknowledge_ranking_reward_notifications(uuid[])
  to authenticated;
grant execute on function public.grant_canonical_ranking_season_reward(uuid,text,uuid,uuid,integer)
  to service_role;

commit;
notify pgrst,'reload schema';

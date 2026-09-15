-- Preview専用。20260915063809として適用済み。再適用・Production適用禁止。
-- prepareは認証証明をAPIで検証する。トークン/メールアドレスは保存しない。
-- 削除先Auth UIDへのFKを設けない（削除後の再試行証跡を維持）。
begin;
create table public.preview_google_replacement_intents (
  id uuid primary key default gen_random_uuid(),
  source_user_id uuid not null,
  destination_user_id uuid not null,
  google_subject text not null,
  current_username text not null,
  existing_username text not null,
  status text not null check (status in ('PREPARED','DELETING','RELEASED','COMPLETED','CANCELLED')),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (source_user_id <> destination_user_id)
);
create unique index preview_google_replacement_active_source
  on public.preview_google_replacement_intents(source_user_id)
  where status in ('PREPARED','DELETING','RELEASED');
create unique index preview_google_replacement_active_destination
  on public.preview_google_replacement_intents(destination_user_id)
  where status in ('PREPARED','DELETING','RELEASED');
create index preview_google_replacement_retired_destination
  on public.preview_google_replacement_intents(destination_user_id)
  where status in ('DELETING','RELEASED','COMPLETED');
alter table public.preview_google_replacement_intents enable row level security;
revoke all on public.preview_google_replacement_intents from public, anon, authenticated;
grant select, insert, update on public.preview_google_replacement_intents to service_role;
comment on table public.preview_google_replacement_intents is
  'Preview Googleデータ置き換え証跡。既存データの不可逆削除はAPI confirm二次確認のみ。';


-- Reject old access tokens before any PostgREST read/write/RPC. The existing
-- hook must be empty: never silently replace another request guard.
create function public.reject_retired_google_account()
returns void language plpgsql security definer set search_path = pg_catalog, public, auth
as $$
begin
  if auth.jwt()->>'role' = 'service_role' then return; end if;
  if exists (select 1 from public.preview_google_replacement_intents
    where destination_user_id = auth.uid() and status in ('DELETING','RELEASED','COMPLETED')) then
    raise sqlstate 'PT401' using message = 'This game account has been replaced';
  end if;
end;
$$;
revoke all on function public.reject_retired_google_account() from public;
grant execute on function public.reject_retired_google_account() to anon, authenticated, service_role;

do $$
declare v_setting text;
begin
  select substring(setting from length('pgrst.db_pre_request=') + 1) into v_setting
  from pg_roles r cross join lateral unnest(r.rolconfig) setting
  where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%';
  if coalesce(v_setting,'') not in ('','public.reject_retired_google_account') then
    raise exception 'Existing PostgREST pre-request hook must be reviewed';
  end if;
  if exists (select 1 from pg_db_role_setting s cross join lateral unnest(s.setconfig) setting
    where setting like 'pgrst.db_pre_request=%') then
    raise exception 'Database-specific pre-request configuration must be reviewed';
  end if;
  alter role authenticator set pgrst.db_pre_request='public.reject_retired_google_account';
end;
$$;

create function public.retire_preview_google_game(p_intent_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth
as $$
declare
  v_intent public.preview_google_replacement_intents%rowtype;
  v_constraint record;
  v_has_history boolean;
  -- Schema-qualified allowlist of personal state/cache and onboarding receipts.
  -- Competitive/social/financial ledgers deliberately remain protected even
  -- when they have ON DELETE CASCADE. Unknown future references fail closed.
  v_safe_tables text[] := array[
    'public.user_characters','public.user_skills','public.user_equipments','public.user_items',
    'public.user_account_auth_methods','public.user_main_formations','public.presents',
    'public.user_patrols','public.user_missions','public.user_avatars','public.user_avatar_parts',
    'public.user_cosmetics','public.equipped_cosmetics','public.user_profile_decorations',
    'public.user_titles','public.tutorial_progress','public.user_power_rankings',
    'public.pvp_defense_decks','public.gvg_defense_decks','public.user_daily_gacha_claims',
    'public.gacha_execution_history','public.user_gacha_pity_points','public.user_login_bonuses',
    'public.user_lifetime_onboarding_grants','public.user_funnel_milestones','public.client_funnel_events',
    'public.mission_event_dialog_views','public.mission_event_telemetry',
    'public.chat_read_states','public.bbs_read_states','public.story_sessions',
    'private.initial_equipment_receipts'
  ];
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Service role required'; end if;
  if not exists (select 1 from pg_roles r cross join lateral unnest(r.rolconfig) setting
    where r.rolname='authenticator' and setting='pgrst.db_pre_request=public.reject_retired_google_account') then
    raise exception 'Old-token rejection guard is not configured';
  end if;
  select * into strict v_intent from public.preview_google_replacement_intents where id=p_intent_id for update;
  if v_intent.status <> 'PREPARED' then return to_jsonb(v_intent); end if;
  if v_intent.expires_at <= clock_timestamp() then raise exception 'Intent expired'; end if;
  perform 1 from auth.users where id=v_intent.source_user_id and is_anonymous is true for update;
  if not found then raise exception 'Original guest unavailable'; end if;
  if exists(select 1 from auth.identities where user_id=v_intent.source_user_id) then raise exception 'Source already linked'; end if;
  perform 1 from auth.users where id=v_intent.destination_user_id and is_anonymous is false for update;
  if not found then raise exception 'Google account unavailable'; end if;
  if (select count(*) from auth.identities where user_id=v_intent.destination_user_id) <> 1
    or not exists(select 1 from auth.identities where user_id=v_intent.destination_user_id
      and provider='google' and provider_id=v_intent.google_subject) then raise exception 'Google identity changed'; end if;
  perform 1 from public.users where id=v_intent.source_user_id for update;
  if not found then raise exception 'Original game unavailable'; end if;
  perform 1 from public.users where id=v_intent.destination_user_id and username=v_intent.existing_username for update;
  if not found then raise exception 'Existing game changed'; end if;
  -- Conservative eligibility: only basic inventory/decks are eligible. Any
  -- financial, social, ranking, event or unfamiliar reference needs operations.
  for v_constraint in
    select n.nspname, c.relname, a.attname
    from pg_constraint fk join pg_class c on c.oid=fk.conrelid
      join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attnum=any(fk.conkey)
    where fk.contype='f' and fk.confrelid='public.users'::regclass
      and not (n.nspname||'.'||c.relname=any(v_safe_tables))
  loop
    execute format('select exists(select 1 from %I.%I where %I=$1)', v_constraint.nspname,v_constraint.relname,v_constraint.attname)
      into v_has_history using v_intent.destination_user_id;
    if v_has_history then raise exception 'Protected account history requires operations review'; end if;
  end loop;
  if exists(select 1 from storage.objects where owner_id=v_intent.destination_user_id::text) then
    raise exception 'Storage-owned account requires operations review';
  end if;
  -- Transactional: if any delete trigger/FK refuses, neither retirement nor
  -- old-token rejection is committed; Auth still exists and remains linked.
  update public.preview_google_replacement_intents set status='DELETING',updated_at=clock_timestamp()
    where id=p_intent_id returning * into v_intent;
  delete from public.users where id=v_intent.destination_user_id;
  return to_jsonb(v_intent);
end;
$$;
revoke all on function public.retire_preview_google_game(uuid) from public, anon, authenticated;
grant execute on function public.retire_preview_google_game(uuid) to service_role;
commit;
notify pgrst, 'reload schema';
notify pgrst, 'reload config';

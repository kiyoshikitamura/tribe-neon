-- Pre-open Guild Battle preparation missions.
-- Extends the existing mission authority without changing DAILY/NORMAL semantics.
begin;

do $$
begin
  if to_regclass('public.missions') is null
    or to_regclass('public.user_missions') is null
    or to_regclass('public.mission_reward_delivery_ledger') is null
    or to_regprocedure('public.grant_present_payload(uuid,text,integer)') is null
    or to_regprocedure('public.calculate_user_total_power(uuid)') is null then
    raise exception 'GVG preparation mission prerequisites are missing';
  end if;
end;
$$;

create table if not exists public.mission_events (
  id text primary key,
  display_name text not null,
  start_at timestamptz not null,
  progress_end_at timestamptz not null,
  claim_deadline timestamptz,
  time_zone text not null default 'Asia/Tokyo',
  banner_image_url text,
  banner_title text,
  banner_subtitle text,
  banner_cta_label text,
  dialog_image_url text,
  dialog_body text,
  primary_cta_label text,
  secondary_cta_label text,
  is_enabled boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (start_at < progress_end_at)
);

alter table public.missions
  add column if not exists event_id text references public.mission_events(id);

alter table public.missions drop constraint if exists missions_category_check;
alter table public.missions
  add constraint missions_category_check check (category in ('DAILY', 'NORMAL', 'SPECIAL'));

create index if not exists missions_event_order_idx
  on public.missions(event_id, display_order) where event_id is not null;

create table if not exists public.mission_reward_components (
  mission_id text not null references public.missions(id) on delete cascade,
  reward_order smallint not null check (reward_order between 1 and 20),
  item_id text not null,
  quantity integer not null check (quantity > 0),
  primary key (mission_id, reward_order),
  unique (mission_id, item_id)
);

create table if not exists public.mission_event_dialog_views (
  user_id uuid not null references public.users(id) on delete cascade,
  event_id text not null references public.mission_events(id) on delete cascade,
  jst_date date not null,
  viewed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, event_id, jst_date)
);

create table if not exists public.mission_event_telemetry (
  id bigint generated always as identity primary key,
  event_id text not null references public.mission_events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  event_name text not null,
  mission_id text references public.missions(id),
  jst_date date not null,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp()
);

create index if not exists mission_event_telemetry_lookup_idx
  on public.mission_event_telemetry(event_id, user_id, event_name, occurred_at);

create table if not exists public.mission_reward_delivery_items (
  delivery_ledger_id uuid not null references public.mission_reward_delivery_ledger(id) on delete cascade,
  reward_order smallint not null,
  item_id text not null,
  quantity integer not null check (quantity > 0),
  delivered_at timestamptz not null default clock_timestamp(),
  primary key (delivery_ledger_id, reward_order)
);

alter table public.mission_events enable row level security;
alter table public.mission_reward_components enable row level security;
alter table public.mission_event_dialog_views enable row level security;
alter table public.mission_event_telemetry enable row level security;
alter table public.mission_reward_delivery_items enable row level security;

drop policy if exists mission_events_authenticated_read on public.mission_events;
create policy mission_events_authenticated_read on public.mission_events
  for select to authenticated using (true);
drop policy if exists mission_reward_components_authenticated_read on public.mission_reward_components;
create policy mission_reward_components_authenticated_read on public.mission_reward_components
  for select to authenticated using (true);
drop policy if exists mission_event_dialog_views_owner_read on public.mission_event_dialog_views;
create policy mission_event_dialog_views_owner_read on public.mission_event_dialog_views
  for select to authenticated using (user_id = auth.uid());
drop policy if exists mission_event_telemetry_owner_read on public.mission_event_telemetry;
create policy mission_event_telemetry_owner_read on public.mission_event_telemetry
  for select to authenticated using (user_id = auth.uid());
drop policy if exists mission_reward_delivery_items_owner_read on public.mission_reward_delivery_items;
create policy mission_reward_delivery_items_owner_read on public.mission_reward_delivery_items
  for select to authenticated using (
    exists (
      select 1 from public.mission_reward_delivery_ledger ledger
      where ledger.id = delivery_ledger_id and ledger.user_id = auth.uid()
    )
  );

insert into public.mission_events (
  id, display_name, start_at, progress_end_at, claim_deadline, time_zone,
  banner_image_url, banner_title, banner_subtitle, banner_cta_label,
  dialog_image_url, dialog_body, primary_cta_label, secondary_cta_label, is_enabled
) values (
  'GVG_PREP_20260904', 'ギルドバトル準備ミッション',
  '2026-09-04 00:00:00 Asia/Tokyo'::timestamptz,
  '2026-09-08 00:00:00 Asia/Tokyo'::timestamptz,
  null, 'Asia/Tokyo', null,
  'ギルドバトル開幕に備えよ', '準備ミッション開催中', 'ミッションを見る', null,
  E'正式オープンに備えて戦力を強化しよう！\nミッションを達成して報酬を獲得！',
  '準備ミッションを見る', 'あとで', true
)
on conflict (id) do update set
  display_name = excluded.display_name,
  start_at = excluded.start_at,
  progress_end_at = excluded.progress_end_at,
  claim_deadline = excluded.claim_deadline,
  time_zone = excluded.time_zone,
  banner_title = excluded.banner_title,
  banner_subtitle = excluded.banner_subtitle,
  banner_cta_label = excluded.banner_cta_label,
  dialog_body = excluded.dialog_body,
  primary_cta_label = excluded.primary_cta_label,
  secondary_cta_label = excluded.secondary_cta_label,
  is_enabled = excluded.is_enabled,
  updated_at = clock_timestamp();

insert into public.missions (
  id, category, display_group, trigger_type, title, desc_text, description,
  target_value, condition_params, reward_item_id, reward_qty, reward_quantity,
  cash_reward, prerequisite_mission_id, next_mission_id, display_order,
  repeat_rule, claim_rule, preopen, is_enabled, is_repeatable, is_provisional, event_id
)
select x.id, 'SPECIAL', x.display_group, x.trigger_type, x.title, x.description, x.description,
  x.target_value, x.condition_params, x.reward_item_id, x.reward_quantity, x.reward_quantity,
  x.cash_reward, null, null, x.display_order, 'EVENT_ONCE', 'EXACTLY_ONCE', true, true, false, false,
  'GVG_PREP_20260904'
from jsonb_to_recordset($missions$[
 {"id":"GVG_PREP_01","display_group":"GROWTH","trigger_type":"CHARACTER_LEVEL_TOTAL_INCREASE","title":"キャラクターを強化しよう","description":"開催期間中にキャラクターレベルを合計10上昇","target_value":10,"condition_params":{"cta_tab":"character","cta_label":"キャラ強化へ"},"reward_item_id":"SKILL_MANUAL","reward_quantity":2,"cash_reward":300,"display_order":10},
 {"id":"GVG_PREP_02","display_group":"GROWTH","trigger_type":"SKILL_LEVEL_TOTAL_INCREASE","title":"スキルを強化しよう","description":"開催期間中にスキルレベルを合計5上昇","target_value":5,"condition_params":{"cta_tab":"character","cta_label":"スキル強化へ"},"reward_item_id":"EQUIP_EXP_L","reward_quantity":2,"cash_reward":300,"display_order":20},
 {"id":"GVG_PREP_03","display_group":"GROWTH","trigger_type":"EQUIPMENT_LEVEL_TOTAL_INCREASE","title":"装備を強化しよう","description":"開催期間中に装備レベルを合計5上昇","target_value":5,"condition_params":{"cta_tab":"character","cta_label":"装備強化へ"},"reward_item_id":"CHAR_EXP_L","reward_quantity":2,"cash_reward":400,"display_order":30},
 {"id":"GVG_PREP_04","display_group":"GROWTH","trigger_type":"MAIN_DECK_TOTAL_POWER_AT_LEAST","title":"総合力12万を達成しよう","description":"メインデッキ5体の総合力120,000以上","target_value":120000,"condition_params":{"cta_tab":"character","cta_label":"編成へ"},"reward_item_id":"CHAR_EXP_L","reward_quantity":2,"cash_reward":0,"display_order":40},
 {"id":"GVG_PREP_05","display_group":"GROWTH","trigger_type":"MAIN_DECK_TOTAL_POWER_AT_LEAST","title":"総合力13万5千を達成しよう","description":"メインデッキ5体の総合力135,000以上","target_value":135000,"condition_params":{"cta_tab":"character","cta_label":"編成へ"},"reward_item_id":"SKILL_MANUAL","reward_quantity":2,"cash_reward":0,"display_order":50},
 {"id":"GVG_PREP_06","display_group":"GROWTH","trigger_type":"MAIN_DECK_TOTAL_POWER_AT_LEAST","title":"総合力15万を達成しよう","description":"メインデッキ5体の総合力150,000以上","target_value":150000,"condition_params":{"cta_tab":"character","cta_label":"編成へ"},"reward_item_id":"AWAKENING_BOOK","reward_quantity":1,"cash_reward":0,"display_order":60},
 {"id":"GVG_PREP_07","display_group":"PROGRESS","trigger_type":"QUEST_CLEAR_COUNT","title":"クエストを進めよう","description":"開催期間中にクエストを累計5回クリア","target_value":5,"condition_params":{"cta_tab":"patrol","cta_label":"クエストへ","shared_counter":"QUEST_CLEAR_COUNT"},"reward_item_id":"ENERGY_DRINK","reward_quantity":2,"cash_reward":0,"display_order":70},
 {"id":"GVG_PREP_08","display_group":"PROGRESS","trigger_type":"QUEST_CLEAR_COUNT","title":"さらにクエストを進めよう","description":"開催期間中にクエストを累計10回クリア","target_value":10,"condition_params":{"cta_tab":"patrol","cta_label":"クエストへ","shared_counter":"QUEST_CLEAR_COUNT"},"reward_item_id":"CHAR_EXP_L","reward_quantity":2,"cash_reward":0,"display_order":80},
 {"id":"GVG_PREP_09","display_group":"BATTLE","trigger_type":"PVP_FINALIZED_BATTLE_COUNT","title":"バトルに参加しよう","description":"開催期間中にバトル結果を累計3回確定","target_value":3,"condition_params":{"cta_tab":"pvp","cta_label":"バトルへ"},"reward_item_id":"PVP_POINT_TICKET","reward_quantity":2,"cash_reward":0,"display_order":90},
 {"id":"GVG_PREP_10","display_group":"BATTLE","trigger_type":"RAID_FINALIZED_BATTLE_COUNT","title":"レイドに参加しよう","description":"開催期間中にレイド結果を累計3回確定","target_value":3,"condition_params":{"cta_tab":"raid","cta_label":"レイドへ"},"reward_item_id":"RAID_POINT_TICKET","reward_quantity":2,"cash_reward":0,"display_order":100},
 {"id":"GVG_PREP_11","display_group":"GUILD","trigger_type":"GUILD_CHAT_MESSAGE_COUNT","title":"ギルドで仲間に挨拶しよう","description":"開催期間中にギルドチャットで1回発言","target_value":1,"condition_params":{"cta_action":"guild_chat","cta_label":"ギルドチャットへ"},"reward_item_id":"SKILL_MANUAL","reward_quantity":1,"cash_reward":0,"display_order":110},
 {"id":"GVG_PREP_12","display_group":"PROGRESS","trigger_type":"RANKING_PAGE_SUCCESSFUL_VIEW_COUNT","title":"ランキングに参加して報酬を受け取ろう","description":"開催期間中にランキングページを1回正常表示","target_value":1,"condition_params":{"cta_tab":"ranking","cta_label":"ランキングへ"},"reward_item_id":"CHAR_EXP_L","reward_quantity":1,"cash_reward":0,"display_order":120},
 {"id":"GVG_PREP_COMPLETE","display_group":"COMPLETE","trigger_type":"GVG_PREP_REQUIRED_MISSIONS_COMPLETED","title":"すべての準備ミッションを達成しよう","description":"本ミッションを除く準備ミッション12件をすべて達成","target_value":12,"condition_params":{"required_count":12,"completion_message":"ギルドバトル開幕の準備完了！\n9月8日の正式オープンを待とう！"},"reward_item_id":"SPECIAL_TICKET_CHARACTER","reward_quantity":1,"cash_reward":0,"display_order":130}
]$missions$::jsonb) x(
  id text, display_group text, trigger_type text, title text, description text,
  target_value integer, condition_params jsonb, reward_item_id text,
  reward_quantity integer, cash_reward integer, display_order integer
)
on conflict (id) do update set
  category = excluded.category, display_group = excluded.display_group,
  trigger_type = excluded.trigger_type, title = excluded.title,
  desc_text = excluded.desc_text, description = excluded.description,
  target_value = excluded.target_value, condition_params = excluded.condition_params,
  reward_item_id = excluded.reward_item_id, reward_qty = excluded.reward_qty,
  reward_quantity = excluded.reward_quantity, cash_reward = excluded.cash_reward,
  prerequisite_mission_id = null, next_mission_id = null,
  display_order = excluded.display_order, repeat_rule = excluded.repeat_rule,
  claim_rule = excluded.claim_rule, preopen = true, is_enabled = true,
  is_repeatable = false, is_provisional = false, event_id = excluded.event_id;

delete from public.mission_reward_components
where mission_id in (select id from public.missions where event_id = 'GVG_PREP_20260904');

insert into public.mission_reward_components(mission_id, reward_order, item_id, quantity)
values
 ('GVG_PREP_01',1,'SKILL_MANUAL',2),
 ('GVG_PREP_02',1,'EQUIP_EXP_L',2),
 ('GVG_PREP_03',1,'CHAR_EXP_L',2),
 ('GVG_PREP_04',1,'CHAR_EXP_L',2),('GVG_PREP_04',2,'EQUIP_EXP_L',1),
 ('GVG_PREP_05',1,'SKILL_MANUAL',2),('GVG_PREP_05',2,'EQUIP_LB_PART',2),
 ('GVG_PREP_06',1,'AWAKENING_BOOK',1),('GVG_PREP_06',2,'SPECIAL_TICKET_SKILL',1),
 ('GVG_PREP_07',1,'ENERGY_DRINK',2),
 ('GVG_PREP_08',1,'CHAR_EXP_L',2),('GVG_PREP_08',2,'EQUIP_EXP_L',1),
 ('GVG_PREP_09',1,'PVP_POINT_TICKET',2),('GVG_PREP_09',2,'SKILL_MANUAL',1),
 ('GVG_PREP_10',1,'RAID_POINT_TICKET',2),('GVG_PREP_10',2,'EQUIP_LB_PART',2),
 ('GVG_PREP_11',1,'SKILL_MANUAL',1),('GVG_PREP_11',2,'EQUIP_LB_PART',2),
 ('GVG_PREP_12',1,'CHAR_EXP_L',1),('GVG_PREP_12',2,'EQUIP_EXP_L',1),
 ('GVG_PREP_COMPLETE',1,'SPECIAL_TICKET_CHARACTER',1),
 ('GVG_PREP_COMPLETE',2,'SPECIAL_TICKET_EQUIPMENT',1),
 ('GVG_PREP_COMPLETE',3,'SKILL_MANUAL',2),
 ('GVG_PREP_COMPLETE',4,'EQUIP_LB_PART',2);

create or replace function public.refresh_special_event_completion(
  p_user_id uuid,
  p_event_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed integer;
  v_complete_target integer;
begin
  select count(*)::integer into v_completed
  from public.user_missions um
  join public.missions m on m.id = um.mission_id
  where um.user_id = p_user_id
    and m.event_id = p_event_id
    and m.trigger_type <> 'GVG_PREP_REQUIRED_MISSIONS_COMPLETED'
    and um.status in ('CLEAR', 'CLAIMED');

  select target_value into v_complete_target
  from public.missions
  where event_id = p_event_id
    and trigger_type = 'GVG_PREP_REQUIRED_MISSIONS_COMPLETED'
    and is_enabled;

  if v_complete_target is not null and v_completed >= v_complete_target then
    update public.user_missions um
    set current_progress = v_complete_target,
        progress_val = v_complete_target,
        status = case when um.status = 'CLAIMED' then 'CLAIMED' else 'CLEAR' end,
        updated_at = clock_timestamp()
    from public.missions m
    where um.user_id = p_user_id
      and um.mission_id = m.id
      and m.event_id = p_event_id
      and m.trigger_type = 'GVG_PREP_REQUIRED_MISSIONS_COMPLETED'
      and um.status = 'PROGRESS';
  end if;
end;
$$;

create or replace function public.ensure_active_special_missions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_power bigint;
begin
  if p_user_id is null or not exists (select 1 from public.users where id = p_user_id) then
    return;
  end if;

  for v_event in
    select * from public.mission_events event
    where event.is_enabled
      and clock_timestamp() >= event.start_at
      and clock_timestamp() < event.progress_end_at
  loop
    insert into public.user_missions(user_id, mission_id, current_progress, progress_val, status, cycle_date)
    select p_user_id, mission.id, 0, 0, 'PROGRESS', null
    from public.missions mission
    where mission.is_enabled and mission.category = 'SPECIAL' and mission.event_id = v_event.id
    on conflict(user_id, mission_id) do nothing;

    v_power := public.calculate_user_total_power(p_user_id);
    update public.user_missions um
    set current_progress = least(m.target_value, least(v_power, 2147483647)::integer),
        progress_val = least(m.target_value, least(v_power, 2147483647)::integer),
        status = case when v_power >= m.target_value then 'CLEAR' else um.status end,
        updated_at = clock_timestamp()
    from public.missions m
    where um.user_id = p_user_id
      and um.mission_id = m.id
      and m.event_id = v_event.id
      and m.trigger_type = 'MAIN_DECK_TOTAL_POWER_AT_LEAST'
      and um.status = 'PROGRESS';

    perform public.refresh_special_event_completion(p_user_id, v_event.id);
  end loop;
end;
$$;

create or replace function public.evaluate_mission_progress(
  p_user_id uuid,
  p_trigger_type text,
  p_progress_increment integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_types text[];
  v_event record;
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'Mission progress owner mismatch' using errcode = '42501';
  end if;
  if p_trigger_type is null or btrim(p_trigger_type) = ''
    or p_progress_increment not between 1 and 1000 then
    raise exception 'Invalid mission progress event' using errcode = '22023';
  end if;

  perform public.ensure_active_special_missions(p_user_id);

  v_types := case p_trigger_type
    when 'GACHA_PULL' then array['NORMAL_FREE_GACHA_PULL_COUNT']
    when 'CHAR_LEVEL_UP' then array['CHARACTER_ENHANCE_COUNT','CHARACTER_LEVEL_AT_LEAST','CHARACTER_LEVEL_TOTAL_INCREASE']
    when 'GEAR_UPGRADE' then array['EQUIPMENT_ENHANCE_COUNT','EQUIPMENT_LEVEL_AT_LEAST','EQUIPMENT_LEVEL_TOTAL_INCREASE']
    when 'GEAR_LIMIT_BREAK' then array['EQUIPMENT_LIMIT_BREAK_COUNT']
    when 'SKILL_LIMIT_BREAK' then array['SKILL_ENHANCE_COUNT','SKILL_LEVEL_AT_LEAST','SKILL_LEVEL_TOTAL_INCREASE']
    when 'PATROL_CLEAR' then array['QUEST_COMPLETE_COUNT','QUEST_CLEAR_COUNT']
    when 'PVP_FINALIZED' then array['PVP_FINALIZED_BATTLE_COUNT']
    when 'PVP_BATTLE_COUNT' then array['PVP_FINALIZED_BATTLE_COUNT']
    when 'PVP_WIN' then array['PVP_WIN_COUNT']
    when 'RAID_FINALIZED' then array['RAID_FINALIZED_BATTLE_COUNT']
    when 'RAID_CLEAR_ELIGIBLE' then array['RAID_CLEAR_ELIGIBLE_COUNT']
    when 'GUILD_JOIN' then array['GUILD_JOIN_COUNT']
    when 'GUILD_ACTIVITY' then array['GUILD_ACTIVITY_COUNT']
    when 'GUILD_CHAT' then array['GUILD_ACTIVITY_COUNT','GUILD_CHAT_MESSAGE_COUNT']
    when 'GVG_FINALIZED' then array['GVG_FINALIZED_BATTLE_COUNT']
    when 'GVG_WIN' then array['GVG_WIN_COUNT']
    else array[p_trigger_type]
  end;

  update public.user_missions um
  set current_progress = least(m.target_value, um.current_progress + p_progress_increment),
      progress_val = least(m.target_value, um.current_progress + p_progress_increment),
      status = case when um.current_progress + p_progress_increment >= m.target_value then 'CLEAR' else 'PROGRESS' end,
      updated_at = clock_timestamp()
  from public.missions m
  left join public.mission_events event on event.id = m.event_id
  where um.user_id = p_user_id
    and um.mission_id = m.id
    and m.is_enabled
    and m.trigger_type = any(v_types)
    and m.trigger_type <> 'GVG_PREP_REQUIRED_MISSIONS_COMPLETED'
    and um.status = 'PROGRESS'
    and (
      m.category <> 'SPECIAL'
      or (
        event.is_enabled
        and clock_timestamp() >= event.start_at
        and clock_timestamp() < event.progress_end_at
      )
    );

  -- Re-evaluate canonical main-deck power after authoritative growth events.
  perform public.ensure_active_special_missions(p_user_id);
  for v_event in select id from public.mission_events where is_enabled loop
    perform public.refresh_special_event_completion(p_user_id, v_event.id);
  end loop;
end;
$$;

create or replace function public.on_special_mission_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mission public.missions%rowtype;
begin
  if old.status is not distinct from new.status or new.status <> 'CLEAR' then
    return new;
  end if;
  select * into v_mission from public.missions where id = new.mission_id;
  if not found or v_mission.category <> 'SPECIAL' or v_mission.event_id is null then
    return new;
  end if;

  insert into public.mission_event_telemetry(
    event_id, user_id, event_name, mission_id, jst_date, source, metadata
  ) values (
    v_mission.event_id, new.user_id,
    case when v_mission.trigger_type = 'GVG_PREP_REQUIRED_MISSIONS_COMPLETED'
      then 'complete_achieved' else 'mission_achieved' end,
    new.mission_id, (clock_timestamp() at time zone 'Asia/Tokyo')::date,
    'server_authority', jsonb_build_object('progress', new.current_progress)
  );

  if v_mission.trigger_type <> 'GVG_PREP_REQUIRED_MISSIONS_COMPLETED' then
    perform public.refresh_special_event_completion(new.user_id, v_mission.event_id);
  end if;
  return new;
end;
$$;

drop trigger if exists special_mission_status_change_trigger on public.user_missions;
create trigger special_mission_status_change_trigger
after update of status on public.user_missions
for each row execute function public.on_special_mission_status_change();

create or replace function public.on_main_formation_special_mission_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_active_special_missions(coalesce(new.user_id, old.user_id));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists main_formation_special_mission_change_trigger on public.user_main_formations;
create trigger main_formation_special_mission_change_trigger
after insert or update or delete on public.user_main_formations
for each row execute function public.on_main_formation_special_mission_change();

create or replace function public.on_ranking_successful_view_special_mission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_name = 'ranking_viewed' then
    perform public.evaluate_mission_progress(new.user_id, 'RANKING_PAGE_SUCCESSFUL_VIEW_COUNT', 1);
  end if;
  return new;
end;
$$;

drop trigger if exists ranking_successful_view_special_mission_trigger on public.client_funnel_events;
create trigger ranking_successful_view_special_mission_trigger
after insert on public.client_funnel_events
for each row execute function public.on_ranking_successful_view_special_mission();

create or replace function public.sync_current_missions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cycle_date date := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
  v_rescue record;
  v_rescued integer := 0;
begin
  if v_user_id is null or not exists (select 1 from public.users where id = v_user_id) then
    raise exception 'Player authentication required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':missions', 0));

  for v_rescue in
    select um.mission_id, m.title, m.reward_item_id, m.reward_quantity
    from public.user_missions um join public.missions m on m.id = um.mission_id
    where um.user_id = v_user_id and m.category = 'DAILY'
      and um.cycle_date is distinct from v_cycle_date and um.status = 'CLEAR'
    for update of um
  loop
    insert into public.presents(user_id,item_id,quantity,message,status,sent_at,expire_at)
    values(v_user_id,v_rescue.reward_item_id,v_rescue.reward_quantity,
      'デイリーミッション未受取補填: ' || v_rescue.title,
      'UNCLAIMED',clock_timestamp(),clock_timestamp()+interval '24 hours');
    v_rescued := v_rescued + 1;
  end loop;

  update public.user_missions um
  set current_progress=0,progress_val=0,status='PROGRESS',claimed_at=null,
      cycle_date=v_cycle_date,updated_at=clock_timestamp()
  from public.missions m
  where um.user_id=v_user_id and um.mission_id=m.id and m.category='DAILY'
    and um.cycle_date is distinct from v_cycle_date;

  insert into public.user_missions(user_id,mission_id,current_progress,progress_val,status,cycle_date)
  select v_user_id,m.id,0,0,'PROGRESS',case when m.category='DAILY' then v_cycle_date else null end
  from public.missions m
  where m.is_enabled and (
    m.category='DAILY' or (
      m.category='NORMAL' and (
        m.prerequisite_mission_id is null or exists(
          select 1 from public.user_missions prerequisite
          where prerequisite.user_id=v_user_id
            and prerequisite.mission_id=m.prerequisite_mission_id
            and prerequisite.status='CLAIMED'
        )
      )
    )
  )
  on conflict(user_id,mission_id) do nothing;

  update public.user_missions um
  set current_progress=m.target_value,progress_val=m.target_value,status='CLEAR',updated_at=clock_timestamp()
  from public.missions m
  where um.user_id=v_user_id and um.mission_id=m.id and m.category='DAILY'
    and m.trigger_type='DAILY_LOGIN' and um.cycle_date=v_cycle_date and um.status='PROGRESS';

  perform public.ensure_active_special_missions(v_user_id);
  return jsonb_build_object('cycle_date',v_cycle_date,'rescued_count',v_rescued);
end;
$$;

create or replace function public.grant_mission_reward_bundle(
  p_delivery_ledger_id uuid,
  p_user_id uuid,
  p_mission_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_component record;
  v_mission public.missions%rowtype;
  v_item_id text;
  v_rewards jsonb := '[]'::jsonb;
  v_has_components boolean;
  v_order smallint := 0;
begin
  select * into strict v_mission from public.missions where id = p_mission_id;
  select exists(select 1 from public.mission_reward_components where mission_id=p_mission_id)
    into v_has_components;

  if v_has_components then
    for v_component in
      select reward_order,item_id,quantity from public.mission_reward_components
      where mission_id=p_mission_id order by reward_order
    loop
      v_item_id := public.resolve_canonical_reward_item(v_component.item_id);
      insert into public.mission_reward_delivery_items(delivery_ledger_id,reward_order,item_id,quantity)
      values(p_delivery_ledger_id,v_component.reward_order,v_item_id,v_component.quantity);
      perform public.grant_present_payload(p_user_id,v_item_id,v_component.quantity);
      v_rewards := v_rewards || jsonb_build_array(jsonb_build_object(
        'item_id',v_item_id,'quantity',v_component.quantity
      ));
      v_order := greatest(v_order,v_component.reward_order);
    end loop;
  else
    -- The caller resolves legacy random rewards once into the delivery ledger.
    -- Reuse that value so the audit row and actual direct grant cannot diverge.
    select resolved_item_id into v_item_id
    from public.mission_reward_delivery_ledger where id=p_delivery_ledger_id;
    if coalesce(v_item_id,'')<>'' and coalesce(v_mission.reward_quantity,0)>0 then
      v_order := 1;
      insert into public.mission_reward_delivery_items(delivery_ledger_id,reward_order,item_id,quantity)
      values(p_delivery_ledger_id,v_order,v_item_id,v_mission.reward_quantity);
      perform public.grant_present_payload(p_user_id,v_item_id,v_mission.reward_quantity);
      v_rewards := v_rewards || jsonb_build_array(jsonb_build_object(
        'item_id',v_item_id,'quantity',v_mission.reward_quantity
      ));
    end if;
  end if;

  if coalesce(v_mission.cash_reward,0)>0 then
    v_order := v_order + 1;
    insert into public.mission_reward_delivery_items(delivery_ledger_id,reward_order,item_id,quantity)
    values(p_delivery_ledger_id,v_order,'CASH',v_mission.cash_reward);
    perform public.grant_present_payload(p_user_id,'CASH',v_mission.cash_reward);
    v_rewards := v_rewards || jsonb_build_array(jsonb_build_object(
      'item_id','CASH','quantity',v_mission.cash_reward
    ));
  end if;
  return v_rewards;
end;
$$;

create or replace function public.claim_mission_reward(p_mission_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mission public.missions%rowtype;
  v_progress public.user_missions%rowtype;
  v_claim_key text;
  v_ledger_id uuid;
  v_rewards jsonb;
begin
  if v_uid is null or p_mission_id is null then
    raise exception 'Player authentication required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text||':missions',0));
  perform public.sync_current_missions();
  select * into v_progress from public.user_missions
    where user_id=v_uid and mission_id=p_mission_id for update;
  if not found or v_progress.status<>'CLEAR' then
    raise exception 'Mission reward is not claimable' using errcode='23514';
  end if;
  select * into strict v_mission from public.missions where id=p_mission_id and is_enabled;
  v_claim_key := concat_ws(':',v_uid::text,p_mission_id,coalesce(v_progress.cycle_date::text,'ONCE'));
  insert into public.mission_reward_delivery_ledger(
    claim_key,user_mission_id,user_id,mission_id,cycle_date,resolved_item_id,
    item_quantity,cash_quantity,delivery_status
  ) values (
    v_claim_key,v_progress.id,v_uid,p_mission_id,v_progress.cycle_date,
    public.resolve_canonical_reward_item(v_mission.reward_item_id),v_mission.reward_quantity,
    greatest(coalesce(v_mission.cash_reward,0),0),'PENDING'
  ) returning id into v_ledger_id;
  v_rewards := public.grant_mission_reward_bundle(v_ledger_id,v_uid,p_mission_id);
  update public.user_missions set status='CLAIMED',claimed_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=v_progress.id;
  insert into public.user_missions(user_id,mission_id,current_progress,progress_val,status)
  select v_uid,next.id,0,0,'PROGRESS' from public.missions next
  where next.is_enabled and next.category='NORMAL' and next.prerequisite_mission_id=p_mission_id
  on conflict(user_id,mission_id) do nothing;
  update public.mission_reward_delivery_ledger set delivery_status='DELIVERED',delivered_at=clock_timestamp()
    where id=v_ledger_id;
  if v_mission.event_id is not null then
    insert into public.mission_event_telemetry(event_id,user_id,event_name,mission_id,jst_date,source)
    values(v_mission.event_id,v_uid,
      case when v_mission.trigger_type='GVG_PREP_REQUIRED_MISSIONS_COMPLETED'
        then 'complete_reward_claimed' else 'mission_reward_claimed' end,
      p_mission_id,(clock_timestamp() at time zone 'Asia/Tokyo')::date,'individual_claim');
  end if;
  return jsonb_build_object('claimed',true,'mission_id',p_mission_id,'delivery','DIRECT','rewards',v_rewards);
end;
$$;

create or replace function public.claim_all_mission_rewards(p_mission_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_entry record;
  v_count integer := 0;
  v_claim_key text;
  v_ledger_id uuid;
  v_entry_rewards jsonb;
  v_rewards jsonb := '[]'::jsonb;
begin
  if v_uid is null or p_mission_ids is null or cardinality(p_mission_ids) not between 1 and 100 then
    raise exception 'Invalid mission claim request' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text||':missions',0));
  perform public.sync_current_missions();
  for v_entry in
    select um.id user_mission_id,um.cycle_date,um.mission_id,m.*
    from public.user_missions um join public.missions m on m.id=um.mission_id and m.is_enabled
    where um.user_id=v_uid and um.status='CLEAR'
      and um.mission_id in(select distinct unnest(p_mission_ids))
    order by m.display_order,um.mission_id for update of um
  loop
    v_claim_key:=concat_ws(':',v_uid::text,v_entry.mission_id,coalesce(v_entry.cycle_date::text,'ONCE'));
    insert into public.mission_reward_delivery_ledger(
      claim_key,user_mission_id,user_id,mission_id,cycle_date,resolved_item_id,
      item_quantity,cash_quantity,delivery_status
    ) values (
      v_claim_key,v_entry.user_mission_id,v_uid,v_entry.mission_id,v_entry.cycle_date,
      public.resolve_canonical_reward_item(v_entry.reward_item_id),v_entry.reward_quantity,
      greatest(coalesce(v_entry.cash_reward,0),0),'PENDING'
    ) returning id into v_ledger_id;
    v_entry_rewards:=public.grant_mission_reward_bundle(v_ledger_id,v_uid,v_entry.mission_id);
    select coalesce(jsonb_agg(value||jsonb_build_object('mission_id',v_entry.mission_id)),'[]'::jsonb)
      into v_entry_rewards from jsonb_array_elements(v_entry_rewards) item(value);
    v_rewards:=v_rewards||v_entry_rewards;
    update public.user_missions set status='CLAIMED',claimed_at=clock_timestamp(),updated_at=clock_timestamp()
      where id=v_entry.user_mission_id;
    insert into public.user_missions(user_id,mission_id,current_progress,progress_val,status)
    select v_uid,next.id,0,0,'PROGRESS' from public.missions next
    where next.is_enabled and next.category='NORMAL' and next.prerequisite_mission_id=v_entry.mission_id
    on conflict(user_id,mission_id) do nothing;
    update public.mission_reward_delivery_ledger set delivery_status='DELIVERED',delivered_at=clock_timestamp()
      where id=v_ledger_id;
    if v_entry.event_id is not null then
      insert into public.mission_event_telemetry(event_id,user_id,event_name,mission_id,jst_date,source)
      values(v_entry.event_id,v_uid,
        case when v_entry.trigger_type='GVG_PREP_REQUIRED_MISSIONS_COMPLETED'
          then 'complete_reward_claimed' else 'mission_reward_claimed' end,
        v_entry.mission_id,(clock_timestamp() at time zone 'Asia/Tokyo')::date,'bulk_claim');
    end if;
    v_count:=v_count+1;
  end loop;
  if exists(select 1 from public.missions where id=any(p_mission_ids) and event_id is not null) then
    insert into public.mission_event_telemetry(event_id,user_id,event_name,jst_date,source,metadata)
    values('GVG_PREP_20260904',v_uid,'bulk_claim',(clock_timestamp() at time zone 'Asia/Tokyo')::date,
      'bulk_claim',jsonb_build_object('claimed_count',v_count));
  end if;
  return jsonb_build_object('claimed_count',v_count,'delivery','DIRECT','rewards',v_rewards);
end;
$$;

create or replace function public.get_active_mission_events()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid:=auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id',event.id,'display_name',event.display_name,'start_at',event.start_at,
    'progress_end_at',event.progress_end_at,'claim_deadline',event.claim_deadline,
    'banner_image_url',event.banner_image_url,'banner_title',event.banner_title,
    'banner_subtitle',event.banner_subtitle,'banner_cta_label',event.banner_cta_label,
    'progress_open',clock_timestamp()>=event.start_at and clock_timestamp()<event.progress_end_at,
    'is_progress_active',clock_timestamp()>=event.start_at and clock_timestamp()<event.progress_end_at,
    'has_claimable_rewards',exists(
      select 1 from public.user_missions um join public.missions m on m.id=um.mission_id
      where um.user_id=v_uid and m.event_id=event.id and um.status='CLEAR'
    )
  ) order by event.start_at),'[]'::jsonb) into v_result
  from public.mission_events event
  where event.is_enabled and (
    (clock_timestamp()>=event.start_at and clock_timestamp()<event.progress_end_at)
    or exists(
      select 1 from public.user_missions um join public.missions m on m.id=um.mission_id
      where um.user_id=v_uid and m.event_id=event.id and um.status='CLEAR'
    )
  );
  return v_result;
end;
$$;

create or replace function public.get_pending_mission_event_dialog()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid:=auth.uid();
  v_today date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  select jsonb_build_object(
    'event_id',event.id,'jst_date',v_today,'display_name',event.display_name,
    'dialog_image_url',event.dialog_image_url,'dialog_body',event.dialog_body,
    'primary_cta_label',event.primary_cta_label,'secondary_cta_label',event.secondary_cta_label
  ) into v_result
  from public.mission_events event
  where event.is_enabled and clock_timestamp()>=event.start_at and clock_timestamp()<event.progress_end_at
    and not exists(select 1 from public.mission_event_dialog_views views
      where views.user_id=v_uid and views.event_id=event.id and views.jst_date=v_today)
  order by event.start_at limit 1;
  return v_result;
end;
$$;

create or replace function public.mark_mission_event_dialog_viewed(p_event_id text,p_jst_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid:=auth.uid();
  v_today date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date;
  v_inserted boolean;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_jst_date is distinct from v_today or not exists(
    select 1 from public.mission_events event where event.id=p_event_id and event.is_enabled
      and clock_timestamp()>=event.start_at and clock_timestamp()<event.progress_end_at
  ) then raise exception 'event dialog is not currently presentable' using errcode='23514'; end if;
  insert into public.mission_event_dialog_views(user_id,event_id,jst_date)
  values(v_uid,p_event_id,p_jst_date) on conflict do nothing returning true into v_inserted;
  if coalesce(v_inserted,false) then
    insert into public.mission_event_telemetry(event_id,user_id,event_name,jst_date,source)
    values(p_event_id,v_uid,'dialog_presented',v_today,'login_dialog_queue');
  end if;
  return coalesce(v_inserted,false);
end;
$$;

create or replace function public.record_mission_event_telemetry(
  p_event_id text,
  p_event_name text,
  p_source text default null,
  p_mission_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_event_name not in (
    'dialog_primary_cta','dialog_later','banner_impression','banner_click','special_tab_view'
  ) then raise exception 'mission event telemetry is not allowlisted' using errcode='22023'; end if;
  if pg_column_size(coalesce(p_metadata,'{}'::jsonb))>4096 then
    raise exception 'event metadata is too large' using errcode='22023';
  end if;
  if not exists(select 1 from public.mission_events where id=p_event_id and is_enabled) then
    raise exception 'mission event not found' using errcode='23503';
  end if;
  if p_mission_id is not null and not exists(
    select 1 from public.missions where id=p_mission_id and event_id=p_event_id
  ) then raise exception 'mission does not belong to event' using errcode='23503'; end if;
  insert into public.mission_event_telemetry(
    event_id,user_id,event_name,mission_id,jst_date,source,metadata
  ) values (
    p_event_id,v_uid,p_event_name,p_mission_id,
    (clock_timestamp() at time zone 'Asia/Tokyo')::date,left(p_source,64),coalesce(p_metadata,'{}'::jsonb)
  );
end;
$$;

insert into public.canonical_master_freeze_versions(domain,version,payload,is_production_enabled)
values('MISSION_EVENT','2026-09-03',jsonb_build_object(
  'event_id','GVG_PREP_20260904','progress_start_jst','2026-09-04 00:00:00',
  'progress_end_jst','2026-09-08 00:00:00','claim_deadline',null,
  'mission_count',13,'required_mission_count',12,'source','M6_GvGPrepMission_Rewards'
),true)
on conflict(domain,version) do update set payload=excluded.payload,is_production_enabled=true;

revoke all on public.mission_events,public.mission_reward_components,
  public.mission_event_dialog_views,public.mission_event_telemetry,
  public.mission_reward_delivery_items from public,anon,authenticated;
grant select on public.mission_events,public.mission_reward_components,
  public.mission_event_dialog_views,public.mission_event_telemetry,
  public.mission_reward_delivery_items to authenticated;
grant all on public.mission_events,public.mission_reward_components,
  public.mission_event_dialog_views,public.mission_event_telemetry,
  public.mission_reward_delivery_items to service_role;

revoke all on function public.refresh_special_event_completion(uuid,text) from public,anon,authenticated;
revoke all on function public.ensure_active_special_missions(uuid) from public,anon,authenticated;
revoke all on function public.grant_mission_reward_bundle(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.on_special_mission_status_change() from public,anon,authenticated;
revoke all on function public.on_main_formation_special_mission_change() from public,anon,authenticated;
revoke all on function public.on_ranking_successful_view_special_mission() from public,anon,authenticated;
revoke all on function public.evaluate_mission_progress(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.sync_current_missions() from public,anon;
revoke all on function public.claim_mission_reward(text) from public,anon;
revoke all on function public.claim_all_mission_rewards(text[]) from public,anon;
revoke all on function public.get_active_mission_events() from public,anon;
revoke all on function public.get_pending_mission_event_dialog() from public,anon;
revoke all on function public.mark_mission_event_dialog_viewed(text,date) from public,anon;
revoke all on function public.record_mission_event_telemetry(text,text,text,text,jsonb) from public,anon;
grant execute on function public.sync_current_missions() to authenticated,service_role;
grant execute on function public.claim_mission_reward(text) to authenticated;
grant execute on function public.claim_all_mission_rewards(text[]) to authenticated;
grant execute on function public.get_active_mission_events() to authenticated;
grant execute on function public.get_pending_mission_event_dialog() to authenticated;
grant execute on function public.mark_mission_event_dialog_viewed(text,date) to authenticated;
grant execute on function public.record_mission_event_telemetry(text,text,text,text,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;

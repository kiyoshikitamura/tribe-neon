-- 新進行の案内。既存ユーザーには入口ロックを再適用しない。
begin;
create table if not exists private.quest_progression_rollout_config (
  singleton boolean primary key default true check(singleton),
  new_users_enabled boolean not null default false
);
insert into private.quest_progression_rollout_config(singleton) values(true) on conflict do nothing;
revoke all on private.quest_progression_rollout_config from public,anon,authenticated;

create table if not exists public.quest_progression_guides (
  user_id uuid primary key references public.users(id) on delete cascade,
  step text not null check(step in ('QUEST_ENTRY','PLAY','GACHA','LOADOUT','RETRY','DONE')),
  seen_story_towns text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.quest_progression_guides enable row level security;
revoke all on public.quest_progression_guides from public,anon,authenticated;

create or replace function private.seed_quest_progression_guide()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.progression_version='2026-09-16' then
    insert into public.quest_progression_guides(user_id,step)
    values(new.user_id,case when new.migration_key='registration:2026-09-16' then 'QUEST_ENTRY' else 'PLAY' end)
    on conflict(user_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists seed_quest_progression_guide on public.quest_progression_user_versions;
create trigger seed_quest_progression_guide after insert on public.quest_progression_user_versions
for each row execute function private.seed_quest_progression_guide();
insert into public.quest_progression_guides(user_id,step)
select user_id,case when migration_key='registration:2026-09-16' then 'QUEST_ENTRY' else 'PLAY' end
from public.quest_progression_user_versions where progression_version='2026-09-16' on conflict do nothing;

create or replace function private.activate_new_quest_progression()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from private.quest_progression_rollout_config where singleton and new_users_enabled) then
    insert into public.quest_progression_user_versions(user_id,progression_version,migration_key)
    values(new.id,'2026-09-16','registration:2026-09-16') on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists activate_new_quest_progression on public.users;
create trigger activate_new_quest_progression after insert on public.users
for each row execute function private.activate_new_quest_progression();

create or replace function private.quest_first_defeat_guide()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.progression_kind='FIRST_CLEAR' and new.battle_result='DEFEAT'
    and exists(select 1 from public.quest_progression_user_versions where user_id=new.user_id and progression_version='2026-09-16') then
    update public.quest_progression_guides set step='GACHA',updated_at=now()
    where user_id=new.user_id and step in ('QUEST_ENTRY','PLAY');
  end if;
  return new;
end $$;
drop trigger if exists quest_first_defeat_guide on public.user_patrols;
create trigger quest_first_defeat_guide after update of battle_result on public.user_patrols
for each row execute function private.quest_first_defeat_guide();

create or replace function public.get_quest_progression_guide()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.quest_progression_user_versions where user_id=v_user and progression_version='2026-09-16') then return null; end if;
  select jsonb_build_object('step',step,'seen_story_towns',seen_story_towns) into v_result
  from public.quest_progression_guides where user_id=v_user;
  return v_result;
end $$;

create or replace function public.advance_quest_progression_guide(p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_step text;
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.quest_progression_user_versions where user_id=v_user and progression_version='2026-09-16') then raise exception 'quest progression inactive'; end if;
  select step into v_step from public.quest_progression_guides where user_id=v_user for update;
  if p_action='ENTER_QUEST' and v_step='QUEST_ENTRY' then v_step:='PLAY';
  elsif p_action='OPEN_LOADOUT' and v_step='GACHA' then v_step:='LOADOUT';
  elsif p_action='APPLY_LOADOUT' and v_step='LOADOUT' then
    begin
      perform public.apply_recommended_main_loadout();
    exception when check_violation then
      -- 所持ゼロでも有料購入を要求しない。既存の装着関数で所持分だけ装着する。
      -- 編成不整合など別の制約違反は隠さない。
      if sqlerrm <> 'Main Formation requires at least one Skill and one Equipment' then raise; end if;
      perform private.apply_recommended_main_skills_v1(v_user);
      perform private.apply_recommended_main_equipment_v1(v_user);
      perform public.refresh_user_power_projection(v_user);
    end;
    v_step:='RETRY';
  elsif p_action='RETURN_QUEST' and v_step='RETRY' then v_step:='DONE';
  elsif p_action not in ('ENTER_QUEST','OPEN_LOADOUT','APPLY_LOADOUT','RETURN_QUEST') then raise exception 'unknown guide action';
  end if;
  update public.quest_progression_guides set step=v_step,updated_at=now() where user_id=v_user;
  return public.get_quest_progression_guide();
end $$;

create or replace function public.mark_quest_story_seen(p_town text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_town not in ('shinjuku','shibuya','ikebukuro','roppongi','akihabara','kawasaki','yokohama') then raise exception 'unknown town'; end if;
  if not exists(select 1 from public.quest_progression_user_versions where user_id=v_user and progression_version='2026-09-16') then raise exception 'quest progression inactive'; end if;
  update public.quest_progression_guides set seen_story_towns=array_append(seen_story_towns,p_town),updated_at=now()
  where user_id=v_user and not(p_town=any(seen_story_towns));
  return public.get_quest_progression_guide();
end $$;
revoke all on function private.seed_quest_progression_guide() from public,anon,authenticated;
revoke all on function private.activate_new_quest_progression() from public,anon,authenticated;
revoke all on function private.quest_first_defeat_guide() from public,anon,authenticated;
revoke all on function public.get_quest_progression_guide() from public,anon;
revoke all on function public.advance_quest_progression_guide(text) from public,anon;
revoke all on function public.mark_quest_story_seen(text) from public,anon;
grant execute on function public.get_quest_progression_guide() to authenticated;
grant execute on function public.advance_quest_progression_guide(text) to authenticated;
grant execute on function public.mark_quest_story_seen(text) to authenticated;
commit;

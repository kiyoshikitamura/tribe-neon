-- Preview候補。適用前に既存停止ユーザー数・現行関数との差分を確認する。
begin;
do $$ begin
  if md5(pg_get_functiondef('public.on_short_tutorial_character_setup_eligible()'::regprocedure)) <> 'b2b67309c17203f00806b34c7c88e970'
    or md5(pg_get_functiondef('public.on_post_tutorial_quest_complete()'::regprocedure)) <> '07b6a71c6d93fef3dfa8cda5a58f6755' then
    raise exception 'Guide function changed; review before applying';
  end if;
end $$;

create or replace function public.on_short_tutorial_character_setup_eligible()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.step_id='COMPLETE' and old.step_id in ('TUTORIAL_BATTLE','RULE_GUIDE') then
    insert into public.user_funnel_milestones(user_id,milestone,metadata)
    values(new.user_id,'character_setup_dialog_eligible',jsonb_build_object('flow','post_tutorial_setup','completed_from',old.step_id))
    on conflict(user_id,milestone) do nothing;
  end if;
  return new;
end;
$$;

-- 完了済みかつCharacter案内で止まるユーザーだけを復帰。育成・参加の実績は作らない。
-- 既に装備済み、案内消費済み、Missionへ引継ぎ済みのユーザーは再開しない。
insert into public.user_funnel_milestones(user_id,milestone,metadata)
select p.user_id,'character_setup_dialog_eligible',jsonb_build_object('source','guide_recovery_20260912')
from public.tutorial_progress p
where p.step_id in ('COMPLETE','AUTHENTICATION')
  and not exists(select 1 from public.user_funnel_milestones m where m.user_id=p.user_id
    and m.milestone in ('character_setup_dialog_eligible','character_setup_dialog_consumed','first_main_loadout','activation_mission_handoff'))
on conflict(user_id,milestone) do nothing;

-- Guildページ接触を加入・Raid参加実績から分離する。
create or replace function public.record_post_tutorial_guild_view()
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.tutorial_progress where user_id=v_user and step_id in ('COMPLETE','AUTHENTICATION')) then
    return false;
  end if;
  insert into public.user_funnel_milestones(user_id,milestone,metadata)
  values(v_user,'post_tutorial_guild_view',jsonb_build_object('source','guild','meaning','page_contact'))
  on conflict(user_id,milestone) do nothing;
  return true;
end;
$$;
revoke all on function public.record_post_tutorial_guild_view() from public,anon;
grant execute on function public.record_post_tutorial_guild_view() to authenticated;

-- 認証済みか匿名かでQuestの実績判定を分岐させない。
create or replace function public.on_post_tutorial_quest_complete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='COMPLETED' or new.status<>'COMPLETED' then return new; end if;
  if not exists(select 1 from public.tutorial_progress where user_id=new.user_id
    and step_id in ('AUTHENTICATION','COMPLETE'))
    or not exists(select 1 from public.user_funnel_milestones where user_id=new.user_id
      and milestone in ('first_main_loadout','character_setup_dialog_consumed')) then return new; end if;
  perform public.record_post_tutorial_guide_milestone(new.user_id,'post_tutorial_quest',jsonb_build_object('source','quest_claim','patrolId',new.id));
  return new;
end;
$$;

revoke all on function public.on_short_tutorial_character_setup_eligible() from public,anon,authenticated;
revoke all on function public.on_post_tutorial_quest_complete() from public,anon,authenticated;

commit;

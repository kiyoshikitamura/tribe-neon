begin;
-- User approved new honor IDs and continuous membership only. No live Season activation or grant.
alter table public.monthly_power_season_runs alter column eligibility_policy set default 'CONTINUOUS_JST_DAY1';
update public.monthly_power_season_runs set eligibility_policy='CONTINUOUS_JST_DAY1' where eligibility_policy is null and granted_at is null;
create table public.monthly_power_honor_bindings (
 reward_version text not null,ranking_type text not null,rank_min integer not null,cosmetic_id text not null references public.cosmetic_master(id),
 primary key(reward_version,ranking_type,rank_min,cosmetic_id),
 foreign key(reward_version,ranking_type,rank_min) references public.monthly_power_reward_master(reward_version,ranking_type,rank_min));
create table public.monthly_power_honor_grants (
 season_id uuid not null references public.monthly_power_season_runs(season_id),entity_id uuid not null,
 cosmetic_id text not null references public.cosmetic_master(id),rank_position integer not null,
 granted_at timestamptz not null default clock_timestamp(),primary key(season_id,entity_id,cosmetic_id));
create table public.monthly_power_honor_recipients (
 season_id uuid not null,entity_id uuid not null,cosmetic_id text not null,recipient_user_id uuid not null references public.users(id),
 primary key(season_id,entity_id,cosmetic_id,recipient_user_id),
 foreign key(season_id,entity_id,cosmetic_id) references public.monthly_power_honor_grants(season_id,entity_id,cosmetic_id));
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_champion_profile_title_20260914','USER','PROFILE_TITLE','EPIC','個人総合力 Season Champion 称号','SEASON','MONTHLY_POWER:20260914','{"grade": "champion", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',1,'season_power_champion_profile_title_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_champion_profile_badge_20260914','USER','PROFILE_BADGE','EPIC','個人総合力 Season Champion Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "champion", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',1,'season_power_champion_profile_badge_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_top3_profile_title_20260914','USER','PROFILE_TITLE','EPIC','個人総合力 TOP3 称号','SEASON','MONTHLY_POWER:20260914','{"grade": "top3", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',2,'season_power_top3_profile_title_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_top3_profile_badge_20260914','USER','PROFILE_BADGE','EPIC','個人総合力 TOP3 Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "top3", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',2,'season_power_top3_profile_badge_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_top10_profile_title_20260914','USER','PROFILE_TITLE','EPIC','個人総合力 TOP10 称号','SEASON','MONTHLY_POWER:20260914','{"grade": "top10", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',4,'season_power_top10_profile_title_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_top10_profile_badge_20260914','USER','PROFILE_BADGE','EPIC','個人総合力 TOP10 Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "top10", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',4,'season_power_top10_profile_badge_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_top30_profile_badge_20260914','USER','PROFILE_BADGE','EPIC','個人総合力 TOP30 Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "top30", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',11,'season_power_top30_profile_badge_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_power_top100_profile_badge_20260914','USER','PROFILE_BADGE','EPIC','個人総合力 TOP100 Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "top100", "ranking_type": "POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','POWER',31,'season_power_top100_profile_badge_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_champion_guild_emblem_20260914','GUILD','GUILD_EMBLEM','EPIC','Guild総合力 Season Champion Emblem','SEASON','MONTHLY_POWER:20260914','{"grade": "champion", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',1,'season_guild_power_champion_guild_emblem_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_champion_guild_base_background_20260914','GUILD','GUILD_BASE_BACKGROUND','EPIC','Guild総合力 Season Champion Decoration','SEASON','MONTHLY_POWER:20260914','{"grade": "champion", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',1,'season_guild_power_champion_guild_base_background_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_champion_guild_title_20260914','GUILD','GUILD_TITLE','EPIC','Guild総合力 Season Champion','SEASON','MONTHLY_POWER:20260914','{"grade": "champion", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',1,'season_guild_power_champion_guild_title_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_top3_guild_emblem_20260914','GUILD','GUILD_EMBLEM','EPIC','Guild総合力 TOP3 Emblem','SEASON','MONTHLY_POWER:20260914','{"grade": "top3", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',2,'season_guild_power_top3_guild_emblem_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_top3_guild_base_background_20260914','GUILD','GUILD_BASE_BACKGROUND','EPIC','Guild総合力 TOP3 Decoration','SEASON','MONTHLY_POWER:20260914','{"grade": "top3", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',2,'season_guild_power_top3_guild_base_background_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_top10_guild_base_background_20260914','GUILD','GUILD_BASE_BACKGROUND','EPIC','Guild総合力 TOP10 Decoration','SEASON','MONTHLY_POWER:20260914','{"grade": "top10", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',4,'season_guild_power_top10_guild_base_background_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_top10_guild_badge_20260914','GUILD','GUILD_BADGE','EPIC','Guild総合力 TOP10 Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "top10", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',4,'season_guild_power_top10_guild_badge_20260914');
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,source_type,source_reference,metadata) values('season_guild_power_top20_guild_badge_20260914','GUILD','GUILD_BADGE','EPIC','Guild総合力 TOP20 Badge','SEASON','MONTHLY_POWER:20260914','{"grade": "top20", "ranking_type": "GUILD_POWER", "season_reward_version": "20260914", "presentation": "TEXT_HONOR"}'::jsonb);
insert into public.monthly_power_honor_bindings values('20260914','GUILD_POWER',11,'season_guild_power_top20_guild_badge_20260914');

update public.cosmetic_master set asset_key='/guild-emblems/guild_event_rank1_base.png',preview_key='/guild-emblems/guild_event_rank1_base.png' where source_reference='MONTHLY_POWER:20260914' and slot='GUILD_EMBLEM';
update public.cosmetic_master set asset_key='/guild-emblems/guild_standard_01.svg',preview_key='/guild-emblems/guild_standard_01.svg' where id='season_guild_power_top3_guild_emblem_20260914';
insert into public.title_master(id,name,source_type,source_key) select id,display_name,'EVENT','MONTHLY_POWER:20260914' from public.cosmetic_master where id like 'season_power_%' and slot='PROFILE_TITLE';
create or replace function public.finalize_monthly_power_season_rewards_v1(p_season_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.ranking_seasons%rowtype;r public.monthly_power_season_runs%rowtype;x record;u record;ni integer;nh integer:=0;
begin
 select * into strict s from public.ranking_seasons where id=p_season_id for update;
 select * into strict r from public.monthly_power_season_runs where season_id=s.id for update;
 if r.granted_at is not null then return jsonb_build_object('season_id',s.id,'status','CLOSED','items_granted',0,'honors_granted',0,'retry',true);end if;
 if exists(select 1 from public.monthly_power_reward_master m where m.reward_version=r.reward_version and m.ranking_type=s.ranking_type and not exists(
 select 1 from public.monthly_power_honor_bindings b join public.cosmetic_master c on c.id=b.cosmetic_id and c.active where b.reward_version=m.reward_version and b.ranking_type=m.ranking_type and b.rank_min=m.rank_min)) then raise exception 'Season honor binding missing';end if;
 if r.reward_version<>'20260914' or exists(
 select 1 from (values ('POWER',1,'season_power_champion_profile_title_20260914'),('POWER',1,'season_power_champion_profile_badge_20260914'),('POWER',2,'season_power_top3_profile_title_20260914'),('POWER',2,'season_power_top3_profile_badge_20260914'),('POWER',4,'season_power_top10_profile_title_20260914'),('POWER',4,'season_power_top10_profile_badge_20260914'),('POWER',11,'season_power_top30_profile_badge_20260914'),('POWER',31,'season_power_top100_profile_badge_20260914'),('GUILD_POWER',1,'season_guild_power_champion_guild_emblem_20260914'),('GUILD_POWER',1,'season_guild_power_champion_guild_base_background_20260914'),('GUILD_POWER',1,'season_guild_power_champion_guild_title_20260914'),('GUILD_POWER',2,'season_guild_power_top3_guild_emblem_20260914'),('GUILD_POWER',2,'season_guild_power_top3_guild_base_background_20260914'),('GUILD_POWER',4,'season_guild_power_top10_guild_base_background_20260914'),('GUILD_POWER',4,'season_guild_power_top10_guild_badge_20260914'),('GUILD_POWER',11,'season_guild_power_top20_guild_badge_20260914')) expected(category,rank_min,id)
 full join (select b.ranking_type,b.rank_min,b.cosmetic_id from public.monthly_power_honor_bindings b join public.cosmetic_master c on c.id=b.cosmetic_id and c.active where b.reward_version=r.reward_version) actual
 on actual.ranking_type=expected.category and actual.rank_min=expected.rank_min and actual.cosmetic_id=expected.id
 where (coalesce(expected.category,actual.ranking_type)=s.ranking_type) and (expected.id is null or actual.cosmetic_id is null)) then raise exception 'Season honor exact binding mismatch';end if;
 perform public.snapshot_monthly_power_season_v1(s.id);
 ni:=public.grant_monthly_power_items_v1(s.id);
 for x in select e.entity_id,e.rank_position,b.cosmetic_id,c.owner_scope from public.monthly_power_entity_snapshots e
 join public.monthly_power_reward_master m on m.reward_version=r.reward_version and m.ranking_type=s.ranking_type and e.rank_position between m.rank_min and m.rank_max
 join public.monthly_power_honor_bindings b on b.reward_version=m.reward_version and b.ranking_type=m.ranking_type and b.rank_min=m.rank_min
 join public.cosmetic_master c on c.id=b.cosmetic_id and c.active where e.season_id=s.id
 loop
 insert into public.monthly_power_honor_grants(season_id,entity_id,cosmetic_id,rank_position) values(s.id,x.entity_id,x.cosmetic_id,x.rank_position) on conflict do nothing;
 if found then
 if x.owner_scope='USER' and s.ranking_type='POWER' then
 insert into public.user_cosmetics(user_id,cosmetic_id,source_type,source_reference) values(x.entity_id,x.cosmetic_id,'SEASON',s.id::text) on conflict do nothing;
 elsif x.owner_scope='GUILD' and s.ranking_type='GUILD_POWER' then
 insert into public.guild_cosmetics(guild_id,cosmetic_id,source_type,source_reference) values(x.entity_id,x.cosmetic_id,'SEASON',s.id::text) on conflict do nothing;
 else raise exception 'Season honor scope mismatch';end if;
 if exists(select 1 from public.title_master where id=x.cosmetic_id) then insert into public.user_titles(user_id,title_id) values(x.entity_id,x.cosmetic_id) on conflict do nothing;end if;
 nh:=nh+1;
 end if;
 -- Guild honors belong to the Guild; all end-members see the receipt, independent of seven-day ITEM eligibility.
 for u in select x.entity_id user_id where s.ranking_type='POWER' union all
 select ms.user_id from public.monthly_power_member_snapshots ms where ms.season_id=s.id and ms.guild_id=x.entity_id and s.ranking_type='GUILD_POWER'
 loop
 insert into public.monthly_power_honor_recipients values(s.id,x.entity_id,x.cosmetic_id,u.user_id) on conflict do nothing;
 if found then insert into public.ranking_reward_notifications(recipient_user_id,period_kind,period_key) values(u.user_id,'SEASON',s.id::text)
 on conflict(recipient_user_id,period_kind,period_key) do update set acknowledged_at=null,awarded_at=clock_timestamp();end if;
 end loop;
 end loop;
 update public.monthly_power_season_runs set granted_at=clock_timestamp() where season_id=s.id;
 update public.ranking_seasons set status='CLOSED',updated_at=clock_timestamp() where id=s.id;
 return jsonb_build_object('season_id',s.id,'status','CLOSED','items_granted',ni,'honors_granted',nh,'retry',false);
end $$;
-- Definition-only runner: no cron schedule, no Season creation or activation.
create function public.finalize_due_monthly_power_seasons_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare s record;results jsonb:='[]';begin
 for s in select season.id from public.ranking_seasons season join public.monthly_power_season_runs r on r.season_id=season.id
 where season.status in ('ACTIVE','FINALIZING') and season.ends_at<=clock_timestamp() and r.granted_at is null order by season.ends_at,season.id
 loop results:=results||jsonb_build_array(public.finalize_monthly_power_season_rewards_v1(s.id));end loop;return results;end $$;
DO $$begin if md5(pg_get_functiondef('public.get_my_pending_ranking_reward_notification()'::regprocedure))<>'ab1deffe5443077a151eea404d616a1b' then raise exception 'Notification authority drift';end if;end $$;
create or replace function public.get_my_pending_ranking_reward_notification()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_notification_ids jsonb; v_grants jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  select jsonb_agg(notification.id order by notification.awarded_at,notification.id)
  into v_notification_ids from public.ranking_reward_notifications notification
  where notification.recipient_user_id=v_uid and notification.acknowledged_at is null;
  if v_notification_ids is null then return null; end if;
  with grant_rows as (
    select notification.awarded_at notification_at,notification.period_kind,notification.period_key,
      season.ranking_category,season.rank_position,season.resolved_item_id item_id,
      season.quantity,season.granted_at,season.reward_key ordering_key,
      'ITEM'::text reward_kind,null::text display_name
    from public.ranking_reward_notifications notification
    join public.ranking_season_reward_grants season
      on notification.period_kind='SEASON' and season.season_id::text=notification.period_key
      and season.recipient_user_id=notification.recipient_user_id
    where notification.recipient_user_id=v_uid and notification.acknowledged_at is null
    union all
    select notification.awarded_at,notification.period_kind,notification.period_key,
      award.ranking_type,award.rank_position,item.item_id,item.quantity,item.granted_at,item.item_id,
      'ITEM'::text,null::text
    from public.ranking_reward_notifications notification
    join public.ranking_daily_reward_awards award
      on notification.period_kind='DAILY' and award.ranking_day_key::text=notification.period_key
      and award.recipient_user_id=notification.recipient_user_id
    join public.ranking_daily_reward_item_grants item on item.award_id=award.id
    where notification.recipient_user_id=v_uid and notification.acknowledged_at is null
    union all
    select notification.awarded_at,notification.period_kind,notification.period_key,
      'GUILD_POWER',grant_row.rank_position,grant_row.cosmetic_id,1,
      grant_row.granted_at,grant_row.cosmetic_id,'GUILD_COSMETIC',cosmetic.display_name
    from public.ranking_reward_notifications notification
    join public.ranking_guild_power_reward_recipients recipient
      on notification.period_kind='SEASON' and recipient.season_id::text=notification.period_key
      and recipient.recipient_user_id=notification.recipient_user_id
    join public.ranking_guild_power_reward_grants grant_row
      on grant_row.season_id=recipient.season_id and grant_row.guild_id=recipient.guild_id
    join public.cosmetic_master cosmetic on cosmetic.id=grant_row.cosmetic_id
    where notification.recipient_user_id=v_uid and notification.acknowledged_at is null
    union all
    select n.awarded_at,n.period_kind,n.period_key,s.ranking_type,g.rank_position,g.cosmetic_id,1,g.granted_at,g.cosmetic_id,'COSMETIC',c.display_name
    from public.ranking_reward_notifications n
    join public.monthly_power_honor_recipients rr on rr.recipient_user_id=n.recipient_user_id and n.period_kind='SEASON' and rr.season_id::text=n.period_key
    join public.monthly_power_honor_grants g on g.season_id=rr.season_id and g.entity_id=rr.entity_id and g.cosmetic_id=rr.cosmetic_id
    join public.ranking_seasons s on s.id=g.season_id join public.cosmetic_master c on c.id=g.cosmetic_id
    where n.recipient_user_id=v_uid and n.acknowledged_at is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'period_kind',grant_row.period_kind,'period_key',grant_row.period_key,
    'ranking_category',grant_row.ranking_category,'rank_position',grant_row.rank_position,
    'item_id',grant_row.item_id,'quantity',grant_row.quantity,'granted_at',grant_row.granted_at,
    'reward_kind',grant_row.reward_kind,'display_name',grant_row.display_name
  ) order by grant_row.notification_at,grant_row.ranking_category,
    grant_row.rank_position,grant_row.ordering_key),'[]'::jsonb)
  into v_grants from grant_rows grant_row;
  return jsonb_build_object('notification_ids',v_notification_ids,'grants',v_grants);
end;
$$;
create or replace function public.get_monthly_power_season_rewards_v1(p_ranking_type text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.ranking_seasons%rowtype;r public.monthly_power_season_runs%rowtype;uid uuid:=auth.uid();gid uuid;joined timestamptz;rank_value integer;day_count integer;tiers jsonb;items jsonb;policy_status text;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_ranking_type not in ('POWER','GUILD_POWER') then raise exception 'Invalid ranking type';end if;
 select season.* into s from public.ranking_seasons season join public.monthly_power_season_runs run on run.season_id=season.id
 where season.ranking_type=p_ranking_type order by season.starts_at desc limit 1;
 select * into r from public.monthly_power_season_runs where season_id=s.id;
 select coalesce(jsonb_agg(jsonb_build_object('rank_min',rank_min,'rank_max',rank_max,'honor_label',honor_label,'items',m.items) order by rank_min),'[]'::jsonb)
 into tiers from public.monthly_power_reward_master m where reward_version=coalesce(r.reward_version,'20260914') and ranking_type=p_ranking_type;
 if p_ranking_type='GUILD_POWER' then
 if r.snapshotted_at is not null then
 select guild_id,joined_at,continuous_season_days into gid,joined,day_count from public.monthly_power_member_snapshots where season_id=s.id and user_id=uid;
 else select guild_id,joined_at into gid,joined from public.guild_members where user_id=uid;
 day_count:=public.monthly_power_continuous_jst_days(joined,s.starts_at,least(clock_timestamp()+interval '1 microsecond',s.ends_at));end if;
 end if;
 if s.id is not null then
 if r.snapshotted_at is not null then select rank_position into rank_value from public.monthly_power_entity_snapshots where season_id=s.id and entity_id=case when p_ranking_type='POWER' then uid else gid end;
 elsif clock_timestamp()>=s.starts_at and clock_timestamp()<s.ends_at then
 select rank_position into rank_value from public.monthly_power_live_rankings_v1(p_ranking_type) where entity_id=case when p_ranking_type='POWER' then uid else gid end;end if;
 end if;
 select m.items into items from public.monthly_power_reward_master m where reward_version=coalesce(r.reward_version,'20260914') and ranking_type=p_ranking_type and rank_value between rank_min and rank_max;
 policy_status:=case when p_ranking_type='POWER' then 'NOT_APPLICABLE' when gid is null then 'NOT_MEMBER' when r.eligibility_policy is null then 'MEMBERSHIP_POLICY_PENDING' else 'CONTINUOUS_JST_DAY1' end;
 return jsonb_build_object('season',case when s.id is null then null else to_jsonb(s) end,'tiers',tiers,'current_rank',rank_value,'planned_items',coalesce(items,'[]'::jsonb),
 'eligibility',jsonb_build_object('joined_at',joined,'season_days',day_count,'eligible',case when p_ranking_type='POWER' then true when r.eligibility_policy is null then null else coalesce(day_count>=7,false) end,'status',policy_status),
 'cosmetics_status','BOUND','finalized',r.snapshotted_at is not null);
end $$;
DO $$declare t text;begin foreach t in array array['monthly_power_honor_bindings','monthly_power_honor_grants','monthly_power_honor_recipients'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;end $$;
revoke all on function public.finalize_due_monthly_power_seasons_v1() from public,anon,authenticated;
grant execute on function public.finalize_due_monthly_power_seasons_v1() to service_role;
create function public.get_equipped_season_honors(p_owner_scope text,p_owner_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_owner_scope not in ('USER','GUILD') then raise exception 'Invalid scope';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('slot',a.slot,'cosmetic_id',a.cosmetic_id,'display_name',c.display_name,'metadata',c.metadata)),'[]'::jsonb)
 from (select e.slot,e.cosmetic_id from public.equipped_cosmetics e where p_owner_scope='USER' and e.user_id=p_owner_id and e.slot<>'PROFILE_TITLE'
 union all select 'PROFILE_TITLE',u.title_equipped from public.users u where p_owner_scope='USER' and u.id=p_owner_id
 union all select e.slot,e.cosmetic_id from public.guild_equipped_cosmetics e where p_owner_scope='GUILD' and e.guild_id=p_owner_id) a
 join public.cosmetic_master c on c.id=a.cosmetic_id and c.active and c.source_reference='MONTHLY_POWER:20260914' and c.owner_scope=p_owner_scope);
end $$;
revoke all on function public.get_equipped_season_honors(text,uuid) from public,anon;
grant execute on function public.get_equipped_season_honors(text,uuid) to authenticated;

notify pgrst,'reload schema';
commit;

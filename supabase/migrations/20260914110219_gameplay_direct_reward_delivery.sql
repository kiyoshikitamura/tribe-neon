-- 通常Gameplayのみ直接付与。課金・補填Presentおよび旧未受取Presentは保持。
-- 20260914072512 Room Mission hook適用後。既存関数の配送箇所だけを一致確認して変更。
begin;
create table public.gameplay_reward_delivery_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id),
 source_kind text not null check(source_kind in ('QUEST_DROP','RAID_ROOM_CLEAR','RAID_ROOM_RESCUE','QUEST_RAID_ENCOUNTER','LOGIN_BONUS','RANKING_SEASON')),
 source_key text not null,
 item_id text not null,
 quantity integer not null check(quantity>0),
 delivered_at timestamptz not null default clock_timestamp(),
 unique(user_id,source_kind,source_key,item_id)
);
alter table public.gameplay_reward_delivery_ledger enable row level security;
revoke all on public.gameplay_reward_delivery_ledger from public,anon,authenticated;
-- 内部呼出専用。所有者を検証する既存RPC/Room finalizerの権限・資格判定を維持。
create function public._grant_gameplay_reward_v1(p_user uuid,p_source text,p_key text,p_item text,p_quantity integer)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_saved public.gameplay_reward_delivery_ledger%rowtype; v_item text;
begin
 if p_user is null or p_key is null or p_key='' or p_item is null or p_quantity is null or p_quantity<=0 then
  raise exception 'Invalid gameplay reward';
 end if;
 v_item:=public.resolve_canonical_reward_item(p_item);
 insert into public.gameplay_reward_delivery_ledger(user_id,source_kind,source_key,item_id,quantity)
 values(p_user,p_source,p_key,v_item,p_quantity) on conflict do nothing returning id into v_id;
 if v_id is null then
  select * into strict v_saved from public.gameplay_reward_delivery_ledger
   where user_id=p_user and source_kind=p_source and source_key=p_key and item_id=v_item;
  if v_saved.quantity<>p_quantity then raise exception 'Gameplay reward replay mismatch';end if;
  return v_saved.id;
 end if;
 -- 既存の資産付与Authorityを再利用。失敗はledgerを含む呼出全体をrollback。
 perform public.grant_present_payload(p_user,v_item,p_quantity);
 return v_id;
end $$;
revoke all on function public._grant_gameplay_reward_v1(uuid,text,text,text,integer) from public,anon,authenticated,service_role;
alter table public.raid_room_clear_reward_grants alter column present_id drop not null;
alter table public.raid_room_clear_reward_grants add column direct_delivery_id uuid unique references public.gameplay_reward_delivery_ledger(id);
alter table public.raid_room_clear_reward_grants add constraint raid_clear_delivery_exactly_one check(num_nonnulls(present_id,direct_delivery_id)=1);
alter table public.raid_room_rescue_reward_grants alter column present_id drop not null;
alter table public.raid_room_rescue_reward_grants add column direct_delivery_id uuid unique references public.gameplay_reward_delivery_ledger(id);
alter table public.raid_room_rescue_reward_grants add constraint raid_rescue_delivery_exactly_one check(num_nonnulls(present_id,direct_delivery_id)=1);

DO $patch$
declare v_definition text; v_anchor text := $anchor$     insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
     values(v_uid,v_item.item_id,v_item.quantity,'クエストドロップ: '||v_patrol.display_name,'UNCLAIMED',now()+interval '24 hours');$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.claim_patrol_rewards(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.claim_patrol_rewards(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$     perform public._grant_gameplay_reward_v1(v_uid,'QUEST_DROP',p_patrol_id::text||':'||v_item.roll_index::text,v_item.item_id,v_item.quantity);$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$   insert into public.presents(user_id,item_id,quantity,message,status,created_at,expire_at,source_kind,source_key,source_metadata)
   values(v_member.user_id,v_item.item_id,v_item.quantity,'レイド討伐報酬','UNCLAIMED',v_issued,v_issued+interval '30 days',
    'RAID_ROOM_CLEAR',p_room_id::text||':'||v_item.item_id,
    jsonb_build_object('roomId',p_room_id,'rewardMultiplier',coalesce((select reward_multiplier from public.quest_raid_encounters where room_id=p_room_id),1),'ruleVersion',(v_progress->'clearGate'->>'ruleVersion')::bigint))
   returning id into v_present;
   insert into public.raid_room_clear_reward_grants values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,v_present);$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public._issue_raid_room_clear_rewards_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public._issue_raid_room_clear_rewards_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$   v_present:=public._grant_gameplay_reward_v1(v_member.user_id,'RAID_ROOM_CLEAR',p_room_id::text,v_item.item_id,v_item.quantity);
   insert into public.raid_room_clear_reward_grants(room_id,user_id,item_id,quantity,present_id,direct_delivery_id)
   values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,null,v_present);$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'presentId',g.present_id,'presentStatus',p.status,'claimedAt',p.claimed_at,'expiresAt',p.expire_at)$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_raid_room_clear_reward_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_raid_room_clear_reward_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'presentId',g.present_id,'delivery',case when g.direct_delivery_id is not null then 'DIRECT' else 'PRESENT' end,'presentStatus',p.status,'claimedAt',coalesce(d.delivered_at,p.claimed_at),'expiresAt',p.expire_at)$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$from public.raid_room_clear_reward_grants g join public.presents p on p.id=g.present_id and p.user_id=g.user_id$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_raid_room_clear_reward_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_raid_room_clear_reward_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$from public.raid_room_clear_reward_grants g left join public.presents p on p.id=g.present_id and p.user_id=g.user_id left join public.gameplay_reward_delivery_ledger d on d.id=g.direct_delivery_id and d.user_id=g.user_id$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'expiresAt',v_saved.expires_at,'items',v_items$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_raid_room_clear_reward_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_raid_room_clear_reward_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'expiresAt',case when exists(select 1 from public.raid_room_clear_reward_grants where room_id=p_room_id and user_id=v_uid and present_id is not null) then v_saved.expires_at else null end,'items',v_items$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$   insert into public.presents(user_id,item_id,quantity,message,status,created_at,expire_at,source_kind,source_key,source_metadata)
   values(v_member.user_id,v_item.item_id,v_item.quantity,'レイド救援成功報酬','UNCLAIMED',v_issued,v_issued+interval '30 days',
    'RAID_ROOM_RESCUE',p_room_id::text||':'||v_item.item_id,
    jsonb_build_object('roomId',p_room_id,'rewardMultiplier',coalesce((select reward_multiplier from public.quest_raid_encounters where room_id=p_room_id),1),'ruleVersion',(v_progress->'rescueGate'->>'ruleVersion')::bigint,'rewardVersion',v_rule.reward_version))
   returning id into v_present;
   insert into public.raid_room_rescue_reward_grants values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,v_present);$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public._issue_raid_room_rescue_rewards_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public._issue_raid_room_rescue_rewards_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$   v_present:=public._grant_gameplay_reward_v1(v_member.user_id,'RAID_ROOM_RESCUE',p_room_id::text,v_item.item_id,v_item.quantity);
   insert into public.raid_room_rescue_reward_grants(room_id,user_id,item_id,quantity,present_id,direct_delivery_id)
   values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,null,v_present);$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'presentId',g.present_id,'presentStatus',p.status,'claimedAt',p.claimed_at,'expiresAt',p.expire_at)$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_raid_room_rescue_reward_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_raid_room_rescue_reward_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'presentId',g.present_id,'delivery',case when g.direct_delivery_id is not null then 'DIRECT' else 'PRESENT' end,'presentStatus',p.status,'claimedAt',coalesce(d.delivered_at,p.claimed_at),'expiresAt',p.expire_at)$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$from public.raid_room_rescue_reward_grants g join public.presents p on p.id=g.present_id and p.user_id=g.user_id$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_raid_room_rescue_reward_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_raid_room_rescue_reward_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$from public.raid_room_rescue_reward_grants g left join public.presents p on p.id=g.present_id and p.user_id=g.user_id left join public.gameplay_reward_delivery_ledger d on d.id=g.direct_delivery_id and d.user_id=g.user_id$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'expiresAt',v_saved.expires_at,'items',v_items$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_raid_room_rescue_reward_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_raid_room_rescue_reward_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'expiresAt',case when exists(select 1 from public.raid_room_rescue_reward_grants where room_id=p_room_id and user_id=v_uid and present_id is not null) then v_saved.expires_at else null end,'items',v_items$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$  insert into public.presents(user_id,item_id,quantity,message,status,created_at,expire_at,source_kind,source_key,source_metadata)
  values(new.user_id,item->>'itemId',(item->>'quantity')::integer,'強敵発見ボーナス','UNCLAIMED',now(),now()+interval '30 days','QUEST_RAID_ENCOUNTER',new.room_id::text||':'||(item->>'itemId'),jsonb_build_object('roomId',new.room_id,'ruleVersion',e.rule_version));$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.issue_quest_raid_encounter_bonus_v1()'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.issue_quest_raid_encounter_bonus_v1()';
 end if;
 execute replace(v_definition,v_anchor,$replacement$  perform public._grant_gameplay_reward_v1(new.user_id,'QUEST_RAID_ENCOUNTER',new.room_id::text,item->>'itemId',(item->>'quantity')::integer);$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'issued',exists(select 1 from public.quest_raid_encounter_bonus_grants$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.get_quest_raid_bonus_v1(uuid)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.get_quest_raid_bonus_v1(uuid)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'delivery',case when exists(select 1 from public.gameplay_reward_delivery_ledger where source_kind='QUEST_RAID_ENCOUNTER' and source_key=p_room_id::text and user_id=auth.uid()) then 'DIRECT' else 'PRESENT' end,'issued',exists(select 1 from public.quest_raid_encounter_bonus_grants$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$  INSERT INTO public.presents (
    user_id, item_id, quantity, message, status, sent_at, expire_at
  ) VALUES (
    v_user_id,
    v_reward.item_id,
    v_reward.quantity,
    'ログインボーナス: ' || v_reward.item_name,
    'UNCLAIMED',
    v_now,
    v_now + interval '30 days'
  );$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.process_login_bonus()'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.process_login_bonus()';
 end if;
 execute replace(v_definition,v_anchor,$replacement$  PERFORM public._grant_gameplay_reward_v1(v_user_id,'LOGIN_BONUS',v_today_jst::text,v_reward.item_id,v_reward.quantity);$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'claimed', true,$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.process_login_bonus()'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.process_login_bonus()';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'delivery', 'DIRECT',
    'claimed', true,$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$'claimed', false,$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.process_login_bonus()'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.process_login_bonus()';
 end if;
 execute replace(v_definition,v_anchor,$replacement$'delivery', case when exists(select 1 from public.gameplay_reward_delivery_ledger where user_id=v_user_id and source_kind='LOGIN_BONUS' and source_key=v_today_jst::text) then 'DIRECT' else 'PRESENT' end,
      'claimed', false,$replacement$);
end $patch$;

DO $patch$
declare v_definition text; v_anchor text := $anchor$      insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
      values(p_recipient_user_id,v_item_id,v_quantity,v_message,'UNCLAIMED',clock_timestamp()+interval '30 days')
      returning id into v_present_id;
      update public.ranking_season_reward_grants set present_id=v_present_id
      where season_id=p_season_id and ranking_category=p_category
        and recipient_user_id=p_recipient_user_id and reward_key=v_reward_key;$anchor$;
begin
 v_definition:=replace(pg_get_functiondef('public.grant_canonical_ranking_season_reward(uuid,text,uuid,uuid,integer)'::regprocedure),chr(13),'');
 if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
  raise exception 'Gameplay delivery source drift: public.grant_canonical_ranking_season_reward(uuid,text,uuid,uuid,integer)';
 end if;
 execute replace(v_definition,v_anchor,$replacement$      perform public._grant_gameplay_reward_v1(p_recipient_user_id,'RANKING_SEASON',p_season_id::text||':'||p_category||':'||v_reward_key,v_item_id,v_quantity);$replacement$);
end $patch$;

notify pgrst,'reload schema';
commit;

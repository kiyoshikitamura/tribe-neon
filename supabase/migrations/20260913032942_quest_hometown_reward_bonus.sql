-- 地元一致: spec_ui_quest_map.md §2。派遣担当1名のcanonical LUKを開始時に固定。
alter table public.user_patrols add column hometown_bonus_snapshot jsonb;

create or replace function public.quest_town_key(p_value text)
returns text language sql immutable set search_path=public as $$
 select case lower(btrim(p_value))
 when '新宿' then 'shinjuku' when 'shinjuku' then 'shinjuku'
 when '渋谷' then 'shibuya' when 'shibuya' then 'shibuya'
 when '池袋' then 'ikebukuro' when 'ikebukuro' then 'ikebukuro'
 when '六本木' then 'roppongi' when 'roppongi' then 'roppongi'
 when '秋葉原' then 'akihabara' when 'akihabara' then 'akihabara'
 when '川崎' then 'kawasaki' when 'kawasaki' then 'kawasaki'
 when '横浜' then 'yokohama' when 'yokohama' then 'yokohama' end
$$;

-- 内部専用。クライアントのLUK/地元/金額は受け取らない。
create or replace function public.quest_hometown_snapshot(p_user uuid,p_character text,p_course text)
returns jsonb language plpgsql stable set search_path=public as $$
declare v record; v_match boolean; v_luk integer;
begin
 select c.character_id,c.level,c.awakening_level,m.hometown,q.town_id,s.luk into v
 from public.user_characters c
 join public.canonical_character_master m on m.version='2026-08-21' and m.character_id=c.character_id
 cross join lateral public.canonical_character_stats(c.character_id,c.level,c.awakening_level) s
 join public.canonical_quest_master q on q.version='2026-08-30' and q.quest_id=p_course
 where c.user_id=p_user and (c.character_id=p_character or c.id::text=p_character)
 order by (c.id::text=p_character) desc,c.id limit 1;
 if not found then raise exception 'hometown snapshot source missing' using errcode='23503'; end if;
 v_match:=coalesce(public.quest_town_key(v.hometown)=public.quest_town_key(v.town_id),false);
 v_luk:=greatest(v.luk,0);
 return jsonb_build_object('version',1,'character_id',v.character_id,'level',v.level,'awakening',v.awakening_level,
 'town',public.quest_town_key(v.town_id),'matched',v_match,'luk',v_luk,
 'cash',case when v_match then v_luk::bigint*10 else 0 end,
 'drop_bonus_bp',case when v_match then least(v_luk::bigint*10,10000) else 0 end);
end $$;
revoke all on function public.quest_hometown_snapshot(uuid,text,text) from public,anon,authenticated;

create or replace function public.on_quest_hometown_snapshot()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 new.hometown_bonus_snapshot:=public.quest_hometown_snapshot(new.user_id,new.character_id,coalesce(new.course_id,new.quest_id));
 return new;
end $$;
revoke all on function public.on_quest_hometown_snapshot() from public,anon,authenticated;
create trigger quest_hometown_snapshot before insert on public.user_patrols
for each row execute function public.on_quest_hometown_snapshot();

-- 未受取の既存派遣だけ適用時点の能力で固定。受取済み報酬の追配・変更なし。
update public.user_patrols p set hometown_bonus_snapshot=
 public.quest_hometown_snapshot(p.user_id,p.character_id,coalesce(p.course_id,p.quest_id))
 where p.status<>'COMPLETED' and p.hometown_bonus_snapshot is null;

CREATE OR REPLACE FUNCTION public.claim_patrol_rewards(p_patrol_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_uid uuid:=auth.uid();
 v_patrol record;
 v_first boolean:=false;
 v_item record;
 v_items jsonb:='[]';
 v_xp jsonb;
 v_total_xp integer;
 v_cash bigint;
 v_bonus jsonb;
 v_bonus_cash bigint;
 v_drop_bp integer;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 select patrol.*,quest.display_name,quest.user_exp,quest.reward_pool_id,quest.cash_reward
 into v_patrol
 from public.user_patrols patrol
 join public.canonical_quest_master quest
   on quest.version='2026-08-30'
  and quest.quest_id=coalesce(patrol.course_id,patrol.quest_id)
  and quest.is_production_enabled
 where patrol.id=p_patrol_id and patrol.user_id=v_uid
 for update of patrol;
 if not found then raise exception 'patrol not found' using errcode='P0002'; end if;
 if v_patrol.status='COMPLETED' then raise exception 'patrol rewards already claimed' using errcode='23505'; end if;
 if v_patrol.status<>'CLAIMABLE' and v_patrol.expires_at>now() then raise exception 'patrol is not complete' using errcode='23514'; end if;
 if v_patrol.has_battle_event and not coalesce(v_patrol.battle_resolved,false) then raise exception 'patrol battle must be resolved before claiming rewards' using errcode='23514'; end if;
 insert into public.user_quest_first_clears(user_id,quest_id)
 values(v_uid,coalesce(v_patrol.course_id,v_patrol.quest_id))
 on conflict do nothing returning true into v_first;
 v_first:=coalesce(v_first,false);
 v_total_xp:=v_patrol.user_exp;
 v_bonus:=v_patrol.hometown_bonus_snapshot;
 if v_bonus is null then raise exception 'hometown snapshot missing' using errcode='23514'; end if;
 v_bonus_cash:=(v_bonus->>'cash')::bigint;
 v_drop_bp:=(v_bonus->>'drop_bonus_bp')::integer;
 v_cash:=coalesce(v_patrol.cash_reward,0)::bigint+v_bonus_cash;
 for v_item in
   select * from public.canonical_quest_reward_pool_items item
   where item.version='2026-08-30' and item.reward_pool_id=v_patrol.reward_pool_id
   order by item.roll_index
 loop
   if v_item.probability_bp>0 and floor(random()*10000)::integer<least(10000,v_item.probability_bp+v_drop_bp) then
     v_item.item_id:=public.resolve_canonical_reward_item(v_item.item_id);
     insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
     values(v_uid,v_item.item_id,v_item.quantity,'クエストドロップ: '||v_patrol.display_name,'UNCLAIMED',now()+interval '24 hours');
     v_items:=v_items||jsonb_build_array(jsonb_build_object('item_id',v_item.item_id,'quantity',v_item.quantity));
   end if;
 end loop;
 if v_cash>0 then
   update public.users set cash=cash+v_cash where id=v_uid;
 end if;
 v_xp:=public.apply_user_xp(v_uid,v_total_xp);
 update public.user_patrols
 set status='COMPLETED',
     rewards_accrued=jsonb_build_object('course_name',v_patrol.display_name,'cash',v_cash,'base_cash',v_patrol.cash_reward,'hometown_bonus_applied',(v_bonus->>'matched')::boolean,'hometown_bonus_cash',v_bonus_cash,'hometown_drop_bonus_bp',v_drop_bp,'xp',v_total_xp,'items',v_items,'first_clear',v_first)
 where id=p_patrol_id;
 perform public.evaluate_mission_progress(v_uid,'PATROL_CLEAR',1);
 return jsonb_build_object('status','success','patrol_id',p_patrol_id,'course_name',v_patrol.display_name,'cash',v_cash,'base_cash',v_patrol.cash_reward,'hometown_bonus_applied',(v_bonus->>'matched')::boolean,'hometown_bonus_cash',v_bonus_cash,'hometown_drop_bonus_bp',v_drop_bp,'xp',v_total_xp,'items',v_items,'first_clear',v_first,'level',v_xp->'level','current_xp',v_xp->'xp','leveled_up',v_xp->'leveled_up');
end $function$
;
CREATE OR REPLACE FUNCTION public.start_patrol(p_course_id text, p_character_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid(); v_character text; v_q record; v_id uuid; v_active integer; v_vitality integer;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 select * into v_q from public.canonical_quest_master where version='2026-08-30' and quest_id=p_course_id and is_production_enabled;
 if not found then raise exception 'quest not found' using errcode='23503'; end if;
 if not public.canonical_quest_is_unlocked(v_uid,p_course_id) then raise exception 'quest is locked' using errcode='23514'; end if;
 select owned.character_id into v_character from public.user_characters owned where owned.user_id=v_uid and(owned.id::text=p_character_id or owned.character_id=p_character_id) order by(owned.id::text=p_character_id)desc limit 1;
 if v_character is null then raise exception 'character is not owned' using errcode='23503'; end if;
 perform 1 from public.users where id=v_uid for update;
 select count(*) into v_active from public.user_patrols where user_id=v_uid and status<>'COMPLETED'; if v_active>=5 then raise exception 'all dispatch slots are occupied' using errcode='23514'; end if;
 if exists(select 1 from public.user_patrols where user_id=v_uid and character_id=v_character and status<>'COMPLETED') then raise exception 'character is already dispatched' using errcode='23505'; end if;
 perform public.sync_and_recover_vitality_and_pvp_points(v_uid); select vitality into v_vitality from public.users where id=v_uid for update;
 if coalesce(v_vitality,0)<v_q.vitality_cost then raise exception 'insufficient vitality' using errcode='23514'; end if;
 insert into public.user_patrols(user_id,course_id,character_id,started_at,expires_at,status,has_battle_event,battle_resolved) values(v_uid,p_course_id,v_character,now(),now()+v_q.duration_sec*interval '1 second','ONGOING',true,false) returning id into v_id;
 update public.users set vitality=vitality-v_q.vitality_cost,vitality_last_recovered_at=case when vitality>=100 then now() else vitality_last_recovered_at end where id=v_uid;
 return jsonb_build_object('status','success','hometown_bonus_snapshot',(select hometown_bonus_snapshot from public.user_patrols where id=v_id),'patrol_id',v_id,'has_battle',true,'duration_seconds',v_q.duration_sec,'cost_vitality',v_q.vitality_cost,'remaining_vitality',v_vitality-v_q.vitality_cost);
end $function$
;

-- Activity text enrichment only. No gacha draw/grant or Raid event count changes.
create or replace function public.get_recent_social_activity_feed(p_limit integer default 20)
returns table(id uuid,activity_type text,actor_user_id uuid,actor_display_name text,guild_id uuid,object_master_id text,display_payload jsonb,permanent boolean,created_at timestamptz)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 return query select feed.id,feed.activity_type,feed.actor_user_id,feed.actor_display_name,feed.guild_id,feed.object_master_id,feed.display_payload,feed.permanent,feed.created_at
 from public.social_activity_feed feed
 where feed.created_at>=statement_timestamp()-interval '24 hours' and feed.created_at<=statement_timestamp()
 and ((feed.activity_type='SYSTEM_NEWS' and feed.actor_user_id is null and exists(select 1 from public.news n where n.id::text=feed.display_payload->>'news_id' and n.is_published and n.start_at<=statement_timestamp() and (n.end_at is null or n.end_at>statement_timestamp())))
 or (feed.activity_type in ('SSR_CHARACTER','SSR_SKILL','SSR_EQUIPMENT','POWER_RANK_1','PVP_DAILY_RANK_1','GUILD_CREATED','RAID_HELP_REQUEST','RAID_BOSS_DEFEATED')
 and exists(select 1 from public.users actor where actor.id=feed.actor_user_id and actor.favorite_character_id is not null)
 and not exists(select 1 from public.kpi_subjects subject join public.kpi_account_classification_periods classification on classification.subject_id=subject.subject_id where subject.source_user_id=feed.actor_user_id and classification.classification in ('qa','test') and classification.valid_from<=feed.created_at and (classification.valid_to is null or feed.created_at<classification.valid_to))))
 order by feed.created_at desc,feed.id desc limit greatest(1,least(coalesce(p_limit,20),50));
end
$function$;

create or replace function public.on_m9x_gacha_activity()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_result jsonb;v_name text;v_item_name text;v_type text;v_item_id text;
begin
 if new.status<>'COMPLETED' or new.result_payload is null or old.status='COMPLETED' then return new; end if;
 select username into v_name from public.users where id=new.user_id;
 for v_result in select value from jsonb_array_elements(coalesce(new.result_payload->'results','[]'::jsonb)) loop
  if v_result->>'rarity'='SSR' then
   v_type:=case v_result->>'type' when 'SKILL' then 'SSR_SKILL' when 'EQUIPMENT' then 'SSR_EQUIPMENT' else 'SSR_CHARACTER' end;
   v_item_id:=coalesce(v_result->>'character_id',v_result->>'item_id');v_item_name:=null;
   if v_type='SSR_CHARACTER' then select display_name into v_item_name from public.canonical_character_master where version='2026-08-21' and character_id=v_item_id limit 1;
   elsif v_type='SSR_SKILL' then select display_name into v_item_name from public.canonical_skill_master where version='2026-08-21' and skill_id=v_item_id limit 1;
   else select display_name into v_item_name from public.canonical_equipment_master where version='2026-08-21' and equipment_id=v_item_id limit 1; end if;
   insert into public.social_activity_feed(activity_type,actor_user_id,actor_display_name,object_master_id,display_payload)
   values(v_type,new.user_id,coalesce(v_name,'PLAYER'),v_item_id,jsonb_strip_nulls(jsonb_build_object('rarity','SSR','outcome',v_result->>'outcome','item_name',v_item_name)));
  end if;
 end loop;
 return new;
end
$function$;

create or replace function public.on_raid_boss_defeated_activity()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_room public.raid_rooms%rowtype;v_owner_name text;v_boss_name text;
begin
 if old.status='CLEARED' or new.status<>'CLEARED' or coalesce(new.current_hp,0)<>0 then return new; end if;
 select * into v_room from public.raid_rooms where raid_boss_instance_id=new.id;if not found then return new;end if;
 select username into v_owner_name from public.users where id=v_room.owner_user_id;
 select raid_name into v_boss_name from public.canonical_raid_variants where raid_variant_id=new.raid_variant_id and is_production_enabled limit 1;
 insert into public.social_activity_feed(activity_type,actor_user_id,actor_display_name,object_master_id,display_payload)
 values('RAID_BOSS_DEFEATED',v_room.owner_user_id,coalesce(v_owner_name,'プレイヤー'),new.id::text,
 jsonb_build_object('room_id',v_room.id,'boss_name',v_boss_name,'raid_owner_name',coalesce(v_owner_name,'プレイヤー'),'difficulty_id',v_room.difficulty_id))
 on conflict do nothing;return new;
end
$function$;

-- Backfill only rows whose canonical source is unambiguous. No repost/notification is emitted.
update public.social_activity_feed f set display_payload=f.display_payload||jsonb_build_object('item_name',c.display_name)
from public.canonical_character_master c where f.activity_type='SSR_CHARACTER' and c.version='2026-08-21' and c.character_id=f.object_master_id and not (f.display_payload?'item_name');
update public.social_activity_feed f set display_payload=f.display_payload||jsonb_build_object('item_name',s.display_name)
from public.canonical_skill_master s where f.activity_type='SSR_SKILL' and s.version='2026-08-21' and s.skill_id=f.object_master_id and not (f.display_payload?'item_name');
update public.social_activity_feed f set display_payload=f.display_payload||jsonb_build_object('item_name',e.display_name)
from public.canonical_equipment_master e where f.activity_type='SSR_EQUIPMENT' and e.version='2026-08-21' and e.equipment_id=f.object_master_id and not (f.display_payload?'item_name');
update public.social_activity_feed f set display_payload=f.display_payload||jsonb_build_object('difficulty_id',r.difficulty_id)
from public.raid_rooms r where f.activity_type='RAID_BOSS_DEFEATED' and coalesce(f.display_payload->>'room_id',f.display_payload->>'roomId')=r.id::text and not (f.display_payload?'difficulty_id');

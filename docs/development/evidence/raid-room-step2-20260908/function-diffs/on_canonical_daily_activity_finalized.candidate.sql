create or replace function public.on_canonical_daily_activity_finalized() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_day date:=(new.finalized_at at time zone 'Asia/Tokyo')::date; v_count integer; v_consumed integer; v_key text;
begin
 if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED' then return new; end if;
 if new.battle_mode='PVP' then
  v_key:='PVP_BATTLE:'||new.id::text;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,'[{"itemId":"CHAR_EXP_S","quantity":1}]',now()) on conflict do nothing;
  if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'CHAR_EXP_S',1,'PvPバトル報酬','UNCLAIMED',now()+interval '30 days'); end if;
  select count(*) into v_count from public.battle_replay_sessions where requester_user_id=new.requester_user_id and battle_mode='PVP' and finalization_status='FINALIZED' and (finalized_at at time zone 'Asia/Tokyo')::date=v_day;
  if v_count>=3 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'PVP_DAILY_3',new.id,'[{"itemId":"SKILL_MANUAL","quantity":1},{"itemId":"CASH","quantity":40}]',now()) on conflict do nothing;
   if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'SKILL_MANUAL',1,'PvPデイリー報酬','UNCLAIMED',now()+interval '30 days'),(new.requester_user_id,'CASH',40,'PvPデイリー報酬','UNCLAIMED',now()+interval '30 days'); end if;
  end if;
 elsif new.battle_mode='RAID' then
  if exists(select 1 from public.raid_rooms where raid_boss_instance_id=new.source_reference_id) then return new; end if;
  v_key:='RAID_BATTLE:'||new.id::text;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,'[{"itemId":"EQUIP_EXP_S","quantity":1}]',now()) on conflict do nothing;
  if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'EQUIP_EXP_S',1,'レイドバトル報酬','UNCLAIMED',now()+interval '30 days'); end if;
  select count(*) into v_count from public.battle_replay_sessions where requester_user_id=new.requester_user_id and battle_mode='RAID' and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=battle_replay_sessions.source_reference_id) and finalization_status='FINALIZED' and (finalized_at at time zone 'Asia/Tokyo')::date=v_day;
  if v_count>=3 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_DAILY_3',new.id,'[{"itemId":"CHAR_EXP_M","quantity":1},{"itemId":"CASH","quantity":40}]',now()) on conflict do nothing;
   if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'CHAR_EXP_M',1,'レイドデイリー報酬','UNCLAIMED',now()+interval '30 days'),(new.requester_user_id,'CASH',40,'レイドデイリー報酬','UNCLAIMED',now()+interval '30 days'); end if;
  end if;
  select coalesce(sum(progress.raid_points_consumed),0) into v_consumed from public.raid_instance_user_progress progress join public.raid_bosses boss on boss.id=progress.raid_boss_instance_id where progress.user_id=new.requester_user_id and boss.raid_day_key=v_day::text and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id);
  if v_consumed>=5 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_POINTS_5',new.id,'[{"itemId":"EQUIP_LB_PART","quantity":1}]',now()) on conflict do nothing;
   if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(new.requester_user_id,'EQUIP_LB_PART',1,'レイド参加報酬','UNCLAIMED',now()+interval '30 days'); end if;
  end if;
 end if;
 return new;
end $$;
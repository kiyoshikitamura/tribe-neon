CREATE OR REPLACE FUNCTION public.capture_daily_ranking_participation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_type text; v_day date;
begin
  if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED' then return new; end if;
  v_type:=case new.battle_mode when 'PVP' then 'PVP' when 'RAID' then 'RAID_PERSONAL' end;
  if v_type is null or new.finalized_at is null then return new; end if;
  v_day:=(new.finalized_at at time zone 'Asia/Tokyo')::date;
  insert into public.ranking_daily_participation(
    ranking_day_key,ranking_type,user_id,finalized_count,first_finalized_at,last_finalized_at
  ) values(v_day,v_type,new.requester_user_id,1,new.finalized_at,new.finalized_at)
  on conflict(ranking_day_key,ranking_type,user_id) do update set
    finalized_count=public.ranking_daily_participation.finalized_count+1,
    first_finalized_at=least(public.ranking_daily_participation.first_finalized_at,excluded.first_finalized_at),
    last_finalized_at=greatest(public.ranking_daily_participation.last_finalized_at,excluded.last_finalized_at);
  return new;
end;
$function$
;
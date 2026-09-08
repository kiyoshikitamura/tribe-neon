CREATE OR REPLACE FUNCTION public.grant_canonical_raid_reward(p_instance uuid, p_user uuid, p_type text, p_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare row record; granted integer:=0;
begin for row in select * from public.canonical_raid_reward_master where version='2026-08-22' and reward_type=p_type and reward_key=p_key loop
 insert into public.raid_production_reward_grants values(p_instance,p_user,p_type,p_key,row.item_id,row.quantity,now()) on conflict do nothing;
 if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(p_user,row.item_id,row.quantity,'レイド報酬','UNCLAIMED',now()+interval '30 days'); granted:=granted+1; end if;
 end loop; return granted; end $function$
;
create or replace function public.grant_canonical_raid_reward(p_instance uuid,p_user uuid,p_type text,p_key text) returns integer language plpgsql security definer set search_path=public as $$
declare row record; granted integer:=0;
begin
 if p_type in ('PERSONAL_RANK','GUILD_RANK') then return 0; end if;
 perform 1 from public.raid_bosses where id=p_instance for update;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance) then return 0; end if;
 for row in select * from public.canonical_raid_reward_master where version='2026-08-22' and reward_type=p_type and reward_key=p_key loop
 insert into public.raid_production_reward_grants values(p_instance,p_user,p_type,p_key,row.item_id,row.quantity,now()) on conflict do nothing;
 if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(p_user,row.item_id,row.quantity,'レイド報酬','UNCLAIMED',now()+interval '30 days'); granted:=granted+1; end if;
 end loop; return granted; end $$;
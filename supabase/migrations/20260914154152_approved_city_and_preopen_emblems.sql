-- Approved 2026-09-14: new cosmetic IDs; preserve existing standard IDs and ownership.
-- No season finalization or reward/ownership grant.
begin;
set local lock_timeout='3s';
do $guard$
begin
 if exists(select 1 from public.cosmetic_master where id='guild_preopen_2026_rank_1' and slot<>'GUILD_EMBLEM') and (
   exists(select 1 from public.guild_cosmetics where cosmetic_id='guild_preopen_2026_rank_1') or
   exists(select 1 from public.guild_equipped_cosmetics where cosmetic_id='guild_preopen_2026_rank_1')) then
   raise exception 'PREOPEN_PLACEHOLDER_ALREADY_ISSUED';
 end if;
 if exists(select 1 from public.cosmetic_master where id='guild_preopen_2026_rank_1'
   and (owner_scope<>'GUILD' or source_reference is distinct from 'PREOPEN_GUILD_POWER_2026'
    or slot not in ('GUILD_DECORATION','GUILD_EMBLEM'))) then
   raise exception 'PREOPEN_PLACEHOLDER_AUTHORITY_DRIFT';
 end if;
end $guard$;
insert into public.cosmetic_master(id,owner_scope,slot,display_name,asset_key,source_type,metadata)
select id,'GUILD','GUILD_EMBLEM',city||'の紋章','/guild-emblems/'||id||'.png','SYSTEM',
 jsonb_build_object('standard',true,'default',false,'sort_order',sort_order,'city',city,'asset_status','APPROVED')
from (values
 ('guild_standard_01_shinjuku','新宿',9),('guild_standard_02_shibuya','渋谷',10),
 ('guild_standard_03_ikebukuro','池袋',11),('guild_standard_04_roppongi','六本木',12),
 ('guild_standard_05_akihabara','秋葉原',13),('guild_standard_06_kawasaki','川崎',14),
 ('guild_standard_07_yokohama','横浜',15)
) cities(id,city,sort_order)
on conflict(id) do nothing;
do $city_guard$
begin
 if (select count(*) from public.cosmetic_master where id in (
 'guild_standard_01_shinjuku','guild_standard_02_shibuya','guild_standard_03_ikebukuro',
 'guild_standard_04_roppongi','guild_standard_05_akihabara','guild_standard_06_kawasaki','guild_standard_07_yokohama')
 and owner_scope='GUILD' and slot='GUILD_EMBLEM' and active
 and asset_key='/guild-emblems/'||id||'.png' and metadata @> '{"standard":true}')<>7 then
  raise exception 'CITY_EMBLEM_ID_AUTHORITY_DRIFT';
 end if;
end $city_guard$;
insert into public.cosmetic_master(id,owner_scope,slot,rarity,display_name,asset_key,source_type,source_reference,metadata)
values('guild_preopen_2026_rank_1','GUILD','GUILD_EMBLEM','EVENT',
 'プレオープン第1位限定ギルド紋章','/guild-emblems/guild_event_rank1_base.png','RANKING','PREOPEN_GUILD_POWER_2026',
 '{"standard":false,"effect":"NONE","competitive_advantage":false,"asset_status":"APPROVED"}')
on conflict(id) do update set slot=excluded.slot,display_name=excluded.display_name,asset_key=excluded.asset_key,
 metadata=public.cosmetic_master.metadata||excluded.metadata;
notify pgrst,'reload schema';
commit;

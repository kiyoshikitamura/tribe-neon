begin;
set transaction read only;
set local statement_timeout='30s';
set local lock_timeout='5s';

select clock_timestamp() as captured_at,
       gacha_id, rarity, count(*) as item_count, sum(weight) as weight_sum
from public.gacha_items_master
where gacha_id in ('CHAR_NORMAL','CHAR_SPECIAL','SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')
group by gacha_id, rarity
order by gacha_id, array_position(array['N','R','SR','SSR'],rarity);

select gacha_id, rarity, weight
from public.gacha_rarity_rates
where gacha_id in ('CHAR_NORMAL','CHAR_SPECIAL','SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')
order by gacha_id, array_position(array['N','R','SR','SSR'],rarity);

select pool.gacha_id,pool.item_id,pool.rarity as pool_rarity,
       master.rarity as canonical_rarity
from public.gacha_items_master pool
left join public.canonical_equipment_master master
  on master.version='2026-08-21' and master.equipment_id=pool.item_id
where pool.gacha_id in ('EQUIP_NORMAL','EQUIP_SPECIAL')
  and (master.equipment_id is null or pool.rarity<>master.rarity)
order by pool.gacha_id,pool.item_id;

rollback;

begin;
set transaction read only;
set local statement_timeout='30s';

-- A reachable rarity bucket must always have at least one draw candidate.
select rates.gacha_id,rates.rarity,count(pool.id) as candidates
from public.gacha_rarity_rates rates
left join public.gacha_items_master pool
  on pool.gacha_id=rates.gacha_id and pool.rarity=rates.rarity
where rates.gacha_id in ('CHAR_NORMAL','CHAR_SPECIAL','SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')
group by rates.gacha_id,rates.rarity
having count(pool.id)=0;

-- Skill and Equipment pools must resolve to Canonical and share its rarity.
with resolved as (
  select pool.gacha_id,pool.item_id,pool.rarity,
         case when pool.item_type='SKILL' then skill.skill_id else equipment.equipment_id end canonical_id,
         case when pool.item_type='SKILL' then skill.rarity else equipment.rarity end canonical_rarity
  from public.gacha_items_master pool
  left join public.canonical_skill_master skill
    on pool.item_type='SKILL' and skill.version='2026-08-21' and skill.skill_id=pool.item_id
  left join public.canonical_equipment_master equipment
    on pool.item_type='EQUIPMENT' and equipment.version='2026-08-21' and equipment.equipment_id=pool.item_id
  where pool.gacha_id in ('SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')
)
select * from resolved where canonical_id is null or rarity<>canonical_rarity;

-- Character Special keeps five N candidates in a separate unreachable bucket.
select count(*) as character_special_n_rate_zero_rows
from public.gacha_items_master
where gacha_id='CHAR_SPECIAL' and rarity='N';

rollback;

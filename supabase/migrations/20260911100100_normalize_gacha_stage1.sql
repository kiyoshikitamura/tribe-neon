-- GAME03 Stage 1 gacha normalization.
-- Authority: GAME03_第1段階_ガチャ正常化_修正対応表_2026-09-11.md
-- Scope is deliberately limited to gacha_items_master. Rates, canonical
-- masters, item rarity, user assets, functions, and feature states are held.

begin;

do $$
declare
  v_actual jsonb;
  v_expected constant jsonb := jsonb_build_object(
    'CHAR_NORMAL',  jsonb_build_object('N',10,'R',17,'SR',16,'SSR',7),
    'CHAR_SPECIAL', jsonb_build_object('N',5,'R',17,'SR',16,'SSR',10),
    'SKILL_NORMAL', jsonb_build_object('N',10,'R',10,'SR',15),
    'SKILL_SPECIAL',jsonb_build_object('R',10,'SR',15,'SSR',15),
    'EQUIP_NORMAL', jsonb_build_object('N',34,'R',46,'SR',61),
    'EQUIP_SPECIAL',jsonb_build_object('R',46,'SR',61,'SSR',12)
  );
begin
  select jsonb_object_agg(gacha_id, rarity_counts order by gacha_id)
  into v_actual
  from (
    select gacha_id, jsonb_object_agg(rarity, item_count order by
      array_position(array['N','R','SR','SSR'], rarity)) as rarity_counts
    from (
      select gacha_id, rarity, count(*)::integer as item_count
      from public.gacha_items_master
      where gacha_id in ('CHAR_NORMAL','CHAR_SPECIAL','SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')
      group by gacha_id, rarity
    ) counts
    group by gacha_id
  ) grouped;

  if v_actual is distinct from v_expected then
    raise exception 'GACHA_STAGE1_POOL_DRIFT expected %, actual %', v_expected, v_actual;
  end if;

  if exists (
    select 1
    from public.gacha_rarity_rates
    where gacha_id in ('CHAR_NORMAL','CHAR_SPECIAL','SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')
      and (gacha_id, rarity, weight) not in (
      ('CHAR_NORMAL','N',60),('CHAR_NORMAL','R',30),('CHAR_NORMAL','SR',9),('CHAR_NORMAL','SSR',1),
      ('CHAR_SPECIAL','R',70),('CHAR_SPECIAL','SR',27),('CHAR_SPECIAL','SSR',3),
      ('SKILL_NORMAL','N',50),('SKILL_NORMAL','R',30),('SKILL_NORMAL','SR',17),('SKILL_NORMAL','SSR',3),
      ('SKILL_SPECIAL','R',60),('SKILL_SPECIAL','SR',35),('SKILL_SPECIAL','SSR',5),
      ('EQUIP_NORMAL','N',45),('EQUIP_NORMAL','R',30),('EQUIP_NORMAL','SR',20),('EQUIP_NORMAL','SSR',5),
      ('EQUIP_SPECIAL','R',55),('EQUIP_SPECIAL','SR',38),('EQUIP_SPECIAL','SSR',7)
    )
  ) or (select count(*) from public.gacha_rarity_rates where gacha_id in
    ('CHAR_NORMAL','CHAR_SPECIAL','SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')) <> 21 then
    raise exception 'GACHA_STAGE1_RATE_DRIFT';
  end if;

  if (select count(*) from public.canonical_skill_master
      where version='2026-08-21' and skill_id between 'SKILL_036' and 'SKILL_050'
        and rarity='SSR' and exclusive_character_id is null) <> 15 then
    raise exception 'GACHA_STAGE1_SKILL_CANONICAL_DRIFT';
  end if;
end $$;

insert into public.gacha_items_master
  (id, gacha_id, item_type, item_id, rarity, weight, is_pickup)
select
  'SKILL_NORMAL:' || skill_id,
  'SKILL_NORMAL',
  'SKILL',
  skill_id,
  rarity,
  1,
  false
from public.canonical_skill_master
where version='2026-08-21'
  and skill_id between 'SKILL_036' and 'SKILL_050'
  and rarity='SSR'
  and exclusive_character_id is null;

update public.gacha_items_master pool
set rarity = master.rarity
from public.canonical_equipment_master master
where master.version='2026-08-21'
  and pool.gacha_id='EQUIP_NORMAL'
  and pool.item_type='EQUIPMENT'
  and pool.item_id=master.equipment_id
  and pool.item_id in (
    'WEAPON_009','WEAPON_010',
    'ACCESSORY_011','HEAD_005','LEGS_005',
    'ACCESSORY_026','BODY_014','BODY_015','HEAD_011','LEGS_011',
    'ACCESSORY_042','ACCESSORY_043','ACCESSORY_044','ACCESSORY_045','WEAPON_041','WEAPON_042'
  );

update public.gacha_items_master pool
set rarity = master.rarity
from public.canonical_equipment_master master
where master.version='2026-08-21'
  and pool.gacha_id='EQUIP_SPECIAL'
  and pool.item_type='EQUIPMENT'
  and pool.item_id=master.equipment_id
  and pool.item_id in (
    'ACCESSORY_026','BODY_014','BODY_015','HEAD_011','LEGS_011',
    'ACCESSORY_042','ACCESSORY_043','ACCESSORY_044','ACCESSORY_045','WEAPON_041','WEAPON_042',
    'BODY_023','BODY_024','HEAD_017','LEGS_017'
  );

delete from public.gacha_items_master
where gacha_id='EQUIP_SPECIAL'
  and item_type='EQUIPMENT'
  and item_id in ('ACCESSORY_011','HEAD_005','LEGS_005','ACCESSORY_051','LEGS_021');

do $$
begin
  if (select count(*) from public.gacha_items_master
      where gacha_id='SKILL_NORMAL' and rarity='SSR' and item_id between 'SKILL_036' and 'SKILL_050') <> 15 then
    raise exception 'GACHA_STAGE1_SKILL_RESULT_MISMATCH';
  end if;

  if exists (
    select 1
    from public.gacha_items_master pool
    left join public.canonical_skill_master skill
      on pool.item_type='SKILL' and skill.version='2026-08-21' and skill.skill_id=pool.item_id
    left join public.canonical_equipment_master equipment
      on pool.item_type='EQUIPMENT' and equipment.version='2026-08-21' and equipment.equipment_id=pool.item_id
    where pool.gacha_id in ('SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')
      and (
        (pool.item_type='SKILL' and (skill.skill_id is null or pool.rarity<>skill.rarity)) or
        (pool.item_type='EQUIPMENT' and (equipment.equipment_id is null or pool.rarity<>equipment.rarity))
      )
  ) then
    raise exception 'GACHA_STAGE1_POST_CANONICAL_MISMATCH';
  end if;

  if exists (
    select 1
    from public.gacha_rarity_rates rates
    left join public.gacha_items_master pool
      on pool.gacha_id=rates.gacha_id and pool.rarity=rates.rarity
    where rates.gacha_id in ('CHAR_NORMAL','CHAR_SPECIAL','SKILL_NORMAL','SKILL_SPECIAL','EQUIP_NORMAL','EQUIP_SPECIAL')
    group by rates.gacha_id,rates.rarity
    having count(pool.id)=0
  ) then
    raise exception 'GACHA_STAGE1_REACHABLE_BUCKET_EMPTY';
  end if;
end $$;

commit;

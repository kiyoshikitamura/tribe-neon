-- Conditional recovery for GAME03 Stage 1 gacha normalization.
-- Do not run when the fault is outside the candidate pool. Correctly granted
-- user assets are intentionally retained. Run only after taking a fresh pool
-- snapshot and confirming that the Stage 1 rows are still the active state.

begin;

delete from public.gacha_items_master
where gacha_id='SKILL_NORMAL'
  and item_type='SKILL'
  and item_id between 'SKILL_036' and 'SKILL_050';

update public.gacha_items_master set rarity='N'
where gacha_id='EQUIP_NORMAL' and item_id in ('WEAPON_009','WEAPON_010');
update public.gacha_items_master set rarity='R'
where gacha_id='EQUIP_NORMAL' and item_id in ('ACCESSORY_011','HEAD_005','LEGS_005');
update public.gacha_items_master set rarity='SR'
where gacha_id='EQUIP_NORMAL' and item_id in (
  'ACCESSORY_026','BODY_014','BODY_015','HEAD_011','LEGS_011',
  'ACCESSORY_042','ACCESSORY_043','ACCESSORY_044','ACCESSORY_045','WEAPON_041','WEAPON_042'
);

update public.gacha_items_master set rarity='SR'
where gacha_id='EQUIP_SPECIAL' and item_id in (
  'ACCESSORY_026','BODY_014','BODY_015','HEAD_011','LEGS_011',
  'ACCESSORY_042','ACCESSORY_043','ACCESSORY_044','ACCESSORY_045','WEAPON_041','WEAPON_042'
);
update public.gacha_items_master set rarity='SSR'
where gacha_id='EQUIP_SPECIAL' and item_id in ('BODY_023','BODY_024','HEAD_017','LEGS_017');

insert into public.gacha_items_master(id,gacha_id,item_type,item_id,rarity,weight,is_pickup)
values
  ('EQUIP_SPECIAL:ACCESSORY_011','EQUIP_SPECIAL','EQUIPMENT','ACCESSORY_011','R',1,false),
  ('EQUIP_SPECIAL:HEAD_005','EQUIP_SPECIAL','EQUIPMENT','HEAD_005','R',1,false),
  ('EQUIP_SPECIAL:LEGS_005','EQUIP_SPECIAL','EQUIPMENT','LEGS_005','R',1,false),
  ('EQUIP_SPECIAL:ACCESSORY_051','EQUIP_SPECIAL','EQUIPMENT','ACCESSORY_051','SSR',1,false),
  ('EQUIP_SPECIAL:LEGS_021','EQUIP_SPECIAL','EQUIPMENT','LEGS_021','SSR',1,false)
on conflict (id) do update
set rarity=excluded.rarity, weight=excluded.weight, is_pickup=excluded.is_pickup;

commit;

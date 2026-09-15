-- Run ONLY on Preview sufvuqdnqohpfzkwxohq inside BEGIN; always ROLLBACK.
-- Migration 20260915053404 is already applied. Do not reload/reapply definitions.
-- Harness uses the confirmed QA account and rolls back every inventory/guide change.
do $$
declare
  v_user uuid := 'ac8d2a50-c900-4302-b920-282a3c9eb260';
  v_character uuid; v_other uuid; v_equipment uuid; v_slot integer;
  v_master record; v_result jsonb; v_checked integer:=0;
begin
  if not exists(select 1 from public.users where id=v_user and username='ぶっちんぷりぷり') then
    raise exception 'Confirmed Preview QA user missing';
  end if;
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  for v_master in select * from public.canonical_equipment_master
    where version='2026-08-21' and exclusive_character_id is not null
  loop
    select id into strict v_character from public.user_characters where user_id=v_user and character_id=v_master.exclusive_character_id limit 1;
    select id into strict v_equipment from public.user_equipments where user_id=v_user and coalesce(nullif(equipment_id,''),equipment_master_id)=v_master.equipment_id limit 1;
    select id into strict v_other from public.user_characters where user_id=v_user and character_id<>v_master.exclusive_character_id limit 1;
    v_slot:=case v_master.category when 'WEAPON' then 0 when 'HEAD' then 2 when 'BODY' then 3 when 'LEGS' then 4 else 5 end;
    update public.user_equipments set equipped_character_id=null,slot_index=null where id=v_equipment;
    perform public.set_character_equipment(v_character,v_equipment,v_slot);
    perform public.set_character_equipment_bulk(v_character,array[v_equipment],array[v_slot]);
    if not exists(select 1 from public.user_equipments where id=v_equipment and equipped_character_id=v_character::text and slot_index=v_slot) then raise exception 'Canonical exclusive assignment failed'; end if;
    begin
      perform public.set_character_equipment_bulk(v_other,array[v_equipment],array[v_slot]);
      raise exception 'Wrong character unexpectedly accepted';
    exception when insufficient_privilege then null;
    end;
    v_checked:=v_checked+1;
  end loop;
  if v_checked<>10 then raise exception 'Expected 10 canonical exclusive equipment'; end if;
  perform public.save_recommended_main_formation();
  v_result:=public.apply_recommended_main_loadout();
  if (v_result->>'skillCount')::integer<1 or (v_result->>'equipmentCount')::integer<1 then raise exception 'Main loadout failed'; end if;
  -- This fixture is confined to rollback. Existing one-time state is restored.
  insert into public.user_funnel_milestones(user_id,milestone,metadata)
  values(v_user,'character_setup_dialog_eligible','{}') on conflict do nothing;
  delete from public.user_funnel_milestones where user_id=v_user and milestone='character_setup_dialog_consumed';
  v_result:=public.complete_character_setup_dialog('AUTO_SETUP');
  if (v_result->>'skillCount')::integer<1 then raise exception 'Guide did not assign skills'; end if;
  v_result:=public.complete_character_setup_dialog('AUTO_SETUP');
  if v_result->>'status'<>'already_consumed' then raise exception 'Guide duplicate not idempotent'; end if;
  raise notice 'PASS: 10 exclusive gear single/bulk, wrong-owner rejection, main loadout, guide skills, duplicate guide';
end;
$$;
rollback;

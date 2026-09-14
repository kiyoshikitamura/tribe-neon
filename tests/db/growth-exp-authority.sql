begin;
-- Run AFTER candidate migration inside a transaction, then ROLLBACK.
do $test$
declare
 u uuid:='32ee6a62-e820-4252-88ce-43be69eb6e4e'; c uuid; e uuid;
 r jsonb; q jsonb; replay jsonb; reqid uuid; before_cash bigint; before_qty integer; before_rows bigint;
begin
 perform set_config('request.jwt.claim.sub',u::text,true);
 select id into c from public.user_characters where user_id=u order by id limit 1;
 select id into e from public.user_equipments where user_id=u order by id limit 1;
 if c is null or e is null then raise exception 'QA fixture ownership missing'; end if;
 update public.users set cash=1000000 where id=u;
 insert into public.user_items(user_id,item_id,quantity)
 select u,x,1000 from unnest(array['CHAR_EXP_S','CHAR_EXP_M','CHAR_EXP_L','EQUIP_EXP_S','EQUIP_EXP_M','EQUIP_EXP_L']) x
 on conflict(user_id,item_id) do update set quantity=excluded.quantity;
 update public.user_characters set level=1,xp=0,awakening_level=0 where id=c;
 update public.user_equipments set level=1,xp=0,plus_val=0 where id=e;
 q:=public.quote_growth_exp('CHARACTER',c,'{"CHAR_EXP_S":1,"CHAR_EXP_M":1,"CHAR_EXP_L":1}');
 if (q->>'level')::int<>18 or (q->>'xp')::bigint<>100 or (q->>'cash_spent')::bigint<>1700 then
  raise exception 'character mixed quote failed: %',q;
 end if;
 reqid:=gen_random_uuid();
 r:=public.level_up_character_exp(c,'{"CHAR_EXP_S":1,"CHAR_EXP_M":1,"CHAR_EXP_L":1}',reqid);
 if r-'request_id'<>q then raise exception 'quote/mutate mismatch'; end if;
 select cash into before_cash from public.users where id=u;
 replay:=public.level_up_character_exp(c,'{"CHAR_EXP_S":1,"CHAR_EXP_M":1,"CHAR_EXP_L":1}',reqid);
 if replay<>r or (select cash from public.users where id=u)<>before_cash then raise exception 'retry not idempotent'; end if;
 begin
  perform public.level_up_character_exp(c,'{"CHAR_EXP_S":2}',reqid);
  raise exception 'different retry payload accepted';
 exception when invalid_parameter_value then null; end;
 r:=public.level_up_equipment_exp(e,'{"EQUIP_EXP_S":1,"EQUIP_EXP_M":1,"EQUIP_EXP_L":1}',gen_random_uuid());
 if (r->>'level')::int<>28 or (r->>'xp')::bigint<>50 or (r->>'cash_spent')::bigint<>1350 then
  raise exception 'equipment mixed growth failed: %',r;
 end if;
 -- Intermediate cap accepts and stores EXP. An unlock consumes the same stored EXP.
 update public.user_characters set level=50,xp=0,awakening_level=0 where id=c;
 r:=public.level_up_character_exp(c,'{"CHAR_EXP_L":1}',gen_random_uuid());
 if (r->>'level')::int<>50 or (r->>'xp')::bigint<>2000 or (r->>'cash_spent')::bigint<>0 then raise exception 'intermediate cap failed'; end if;
 update public.user_characters set awakening_level=1 where id=c;
 r:=public.level_up_character_exp(c,'{}',gen_random_uuid());
 if (r->>'level')::int<>52 or (r->>'xp')::bigint<>0 or (r->>'cash_spent')::bigint<>200 then raise exception 'stored EXP after awakening failed'; end if;
 update public.user_equipments set level=50,xp=0,plus_val=0 where id=e;
 r:=public.level_up_equipment_exp(e,'{"EQUIP_EXP_L":1}',gen_random_uuid());
 if (r->>'level')::int<>50 or (r->>'xp')::bigint<>2500 or (r->>'cash_spent')::bigint<>0 then raise exception 'equipment intermediate cap failed'; end if;
 update public.user_equipments set plus_val=1 where id=e;
 r:=public.level_up_equipment_exp(e,'{}',gen_random_uuid());
 if (r->>'level')::int<>53 or (r->>'xp')::bigint<>550 or (r->>'cash_spent')::bigint<>150 then raise exception 'stored EXP after LB failed'; end if;
 -- Only one EXP needed: allow full L item and preserve final overflow.
 update public.user_equipments set level=99,xp=2249,plus_val=5 where id=e;
 r:=public.level_up_equipment_exp(e,'{"EQUIP_EXP_L":1}',gen_random_uuid());
 if (r->>'level')::int<>100 or (r->>'xp')::bigint<>2499 or r->>'next_required_exp' is not null then raise exception 'final overflow failed'; end if;
 begin
  perform public.level_up_equipment_exp(e,'{"EQUIP_EXP_S":1}',gen_random_uuid());
  raise exception 'final cap allowed material';
 exception when check_violation then null; end;
 begin
  perform public.level_up_equipment_exp(e,'{}',gen_random_uuid());
  raise exception 'final cap allowed empty application';
 exception when check_violation then null; end;
 -- CASH failure rolls back ledger and every material and target change.
 update public.user_characters set level=1,xp=0,awakening_level=0 where id=c;
 update public.users set cash=0 where id=u;
 select quantity into before_qty from public.user_items where user_id=u and item_id='CHAR_EXP_L';
 select count(*) into before_rows from public.growth_exp_execution_history where user_id=u;
 begin
  perform public.level_up_character_exp(c,'{"CHAR_EXP_L":1}',gen_random_uuid());
  raise exception 'cash shortage accepted';
 exception when check_violation then null; end;
 if (select quantity from public.user_items where user_id=u and item_id='CHAR_EXP_L')<>before_qty
  or (select level from public.user_characters where id=c)<>1
  or (select xp from public.user_characters where id=c)<>0
  or (select count(*) from public.growth_exp_execution_history where user_id=u)<>before_rows then raise exception 'cash failure not atomic'; end if;
 update public.users set cash=1000000 where id=u;
 begin
  perform public.level_up_character_exp(c,'{"CHAR_EXP_S":1,"CHAR_EXP_L":10000}',gen_random_uuid());
  raise exception 'material shortage accepted';
 exception when check_violation then null; end;
 if (select quantity from public.user_items where user_id=u and item_id='CHAR_EXP_L')<>before_qty
  or (select level from public.user_characters where id=c)<>1 then raise exception 'material failure not atomic'; end if;
 begin
  perform public.level_up_character_exp(c,'{"EQUIP_EXP_L":1}',gen_random_uuid());
  raise exception 'cross-category accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.level_up_character_exp(gen_random_uuid(),'{"CHAR_EXP_S":1}',gen_random_uuid());
  raise exception 'unowned accepted';
 exception when no_data_found then null; end;
 r:=public.level_up_character(c,'CHAR_EXP_M',1);
 if (r->>'level')::int<>6 or (r->>'xp')::bigint<>0 then raise exception 'legacy wrapper does not use effectValue'; end if;
end
$test$;
select jsonb_build_object('status','PASS','checks',array[
 'master totals','mixed S/M/L','quote parity','retry ledger','changed retry rejected',
 'intermediate cap retains EXP','awakening/LB applies stored EXP','final overflow retained',
 'final cap rejects input','cash atomic rollback','material atomic rollback','ownership','category','legacy wrapper']) as growth_exp_verification;

do $mission$
declare
 u uuid:='32ee6a62-e820-4252-88ce-43be69eb6e4e'; c uuid; e uuid; r jsonb; req uuid;
begin
 perform set_config('request.jwt.claim.sub',u::text,true);
 select id into c from public.user_characters where user_id=u order by id limit 1;
 select id into e from public.user_equipments where user_id=u order by id limit 1;
 update public.users set cash=1000000 where id=u;
 insert into public.user_items(user_id,item_id,quantity) values(u,'CHAR_EXP_S',100),(u,'EQUIP_EXP_S',100)
 on conflict(user_id,item_id) do update set quantity=excluded.quantity;
 update public.user_characters set level=1,xp=0,awakening_level=0 where id=c;
 update public.user_equipments set level=1,xp=0,plus_val=0 where id=e;
 perform public.ensure_active_special_missions(u);
 if (select count(*) from public.user_missions where user_id=u and mission_id in ('GVG_PREP_01','GVG_PREP_03'))<>2 then raise exception 'Live mission fixtures missing'; end if;
 update public.user_missions set current_progress=0,progress_val=0,status='PROGRESS',claimed_at=null
 where user_id=u and mission_id in ('GVG_PREP_01','GVG_PREP_03');
 req:=gen_random_uuid();
 r:=public.level_up_character_exp(c,'{"CHAR_EXP_S":2}',req);
 if (r->>'levels_gained')::int<>2 or (select current_progress from public.user_missions where user_id=u and mission_id='GVG_PREP_01')<>2 then raise exception 'Character mission actual level delta mismatch'; end if;
 perform public.level_up_character_exp(c,'{"CHAR_EXP_S":2}',req);
 if (select current_progress from public.user_missions where user_id=u and mission_id='GVG_PREP_01')<>2 then raise exception 'Character retry duplicated mission'; end if;
 req:=gen_random_uuid();
 r:=public.level_up_equipment_exp(e,'{"EQUIP_EXP_S":1}',req);
 if (r->>'levels_gained')::int<>2 or (select current_progress from public.user_missions where user_id=u and mission_id='GVG_PREP_03')<>2 then raise exception 'Equipment mission actual level delta mismatch'; end if;
 perform public.level_up_equipment_exp(e,'{"EQUIP_EXP_S":1}',req);
 if (select current_progress from public.user_missions where user_id=u and mission_id='GVG_PREP_03')<>2 then raise exception 'Equipment retry duplicated mission'; end if;
 update public.user_characters set level=50,xp=0,awakening_level=0 where id=c;
 perform public.level_up_character_exp(c,'{"CHAR_EXP_S":1}',gen_random_uuid());
 if (select current_progress from public.user_missions where user_id=u and mission_id='GVG_PREP_01')<>2 then raise exception 'Banked XP advanced mission without levelup'; end if;
end $mission$;
select 'PASS: existing data fingerprint / initial xp0 / actual character+equipment Mission delta / retry Mission idempotence / banked XP no Mission' as supplemental_verification;

rollback;

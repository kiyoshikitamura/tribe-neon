\set ON_ERROR_STOP on
begin;

insert into public.users(id,username,current_base_id,level,xp,cash,neon_diamonds,diamonds,vitality,pvp_points,raid_points,favorite_character_id)
values
 ('10000000-0000-4000-8000-000000000001','free','osaka',7,321,99999,777,9,12,1,0,'char_ageha_01'),
 ('10000000-0000-4000-8000-000000000002','paid','osaka',7,0,1,1,0,100,5,5,null),
 ('10000000-0000-4000-8000-000000000003','roll','osaka',7,0,1,1,0,100,5,5,null),
 ('10000000-0000-4000-8000-000000000004','shop','osaka',7,0,1,1,0,100,5,5,null),
 ('10000000-0000-4000-8000-000000000005','pass','osaka',7,0,1,1,0,100,5,5,null),
 ('10000000-0000-4000-8000-000000000006','guild','osaka',7,0,1,1,0,100,5,5,null),
 ('10000000-0000-4000-8000-000000000007','patrol','osaka',7,0,1,1,0,100,5,5,null),
 ('10000000-0000-4000-8000-000000000008','battle','osaka',7,0,1,1,0,100,5,5,null);

insert into public.tutorial_progress(user_id,step_id,completed_at) values
 ('10000000-0000-4000-8000-000000000001','COMPLETE',now()),
 ('10000000-0000-4000-8000-000000000002','COMPLETE',now()),
 ('10000000-0000-4000-8000-000000000003','COMPLETE',now()),
 ('10000000-0000-4000-8000-000000000004','COMPLETE',now()),
 ('10000000-0000-4000-8000-000000000005','COMPLETE',now()),
 ('10000000-0000-4000-8000-000000000006','COMPLETE',now()),
 ('10000000-0000-4000-8000-000000000007','COMPLETE',now()),
 ('10000000-0000-4000-8000-000000000008','COMPLETE',now());

insert into public.user_lifetime_onboarding_grants(user_id,canonical_payload,source,canonical_master_version)
select id,jsonb_build_object(
  'gacha_results',jsonb_build_array(
    jsonb_build_object('character_id','char_gou_01','rarity','N','tutorial_slot',1),
    jsonb_build_object('character_id','char_kenji_01','rarity','N','tutorial_slot',2),
    jsonb_build_object('character_id','char_masato_01','rarity','N','tutorial_slot',3),
    jsonb_build_object('character_id','char_naoto_01','rarity','N','tutorial_slot',4),
    jsonb_build_object('character_id','char_sawat_01','rarity','N','tutorial_slot',5),
    jsonb_build_object('character_id','char_shun_01','rarity','N','tutorial_slot',6),
    jsonb_build_object('character_id','char_souta_01','rarity','N','tutorial_slot',7),
    jsonb_build_object('character_id','char_tatsuya_01','rarity','N','tutorial_slot',8),
    jsonb_build_object('character_id','char_aoi_01','rarity','R','tutorial_slot',9),
    jsonb_build_object('character_id','char_ageha_01','rarity','SSR','tutorial_slot',10)
  ),
  'guaranteed_ssr','char_ageha_01','growth_target_character','char_ageha_01',
  'growth_target_level',7,'starter_skill','SKILL_001',
  'formation_character_ids',jsonb_build_array('char_ageha_01','char_gou_01','char_kenji_01','char_masato_01','char_naoto_01'),
  'formation_order',jsonb_build_array(1,2,3,4,5),'leader_character','char_ageha_01'
),'DB_TEST','2026-08-21'
from public.users where id in (
 '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',
 '10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000006',
 '10000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000008'
);

insert into public.user_characters(id,user_id,character_id,level,awakening_level) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','char_ageha_01',7,0),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','char_ageha_01',7,0);
insert into public.user_skills(user_id,skill_card_id,plus_val) values('10000000-0000-4000-8000-000000000001','SKILL_001',0);
insert into public.user_items(user_id,item_id,quantity) values('10000000-0000-4000-8000-000000000001','AWAKENING_BOOK',3);
insert into public.user_missions(user_id,mission_id,current_progress,status) values
 ('10000000-0000-4000-8000-000000000001','ob_daily_login_01',1,'CLAIMED'),
 ('10000000-0000-4000-8000-000000000001','ob_daily_patrol_01',3,'PROGRESS');
insert into public.gacha_execution_history(user_id,request_id,gacha_id,payment_source,pull_count,cost_amount,pity_before,pity_after,status,result_payload,completed_at)
values('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','CHAR_NORMAL','free',10,0,0,0,'COMPLETED','{"tutorial":true,"results":[]}'::jsonb,now());
insert into public.direct_messages(sender_id,recipient_id,message)
values('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','preserve');
insert into public.payment_transactions(user_id,product_id,amount,status)
values('10000000-0000-4000-8000-000000000002','paid-test',100,'COMPLETED');
insert into public.user_shop_purchases(user_id,product_id) values('10000000-0000-4000-8000-000000000004','shop-test');
insert into public.user_monthly_passes(user_id,purchased_at,expires_at,is_active)
values('10000000-0000-4000-8000-000000000005',now(),now()+interval '30 days',true);
insert into public.guilds(id,name,leader_id) values('50000000-0000-4000-8000-000000000006','連合検証','10000000-0000-4000-8000-000000000006');
insert into public.user_patrols(user_id,character_id,status,expires_at)
values('10000000-0000-4000-8000-000000000007','char_ageha_01','ONGOING',now()+interval '1 hour');
insert into public.battle_replay_sessions(requester_user_id,battle_mode,status,tactic_id,random_seed,player_snapshot,enemy_snapshot,finalization_status)
values('10000000-0000-4000-8000-000000000008','PVP','PENDING','ATTACK_PRIORITY',1,'[]'::jsonb,'[]'::jsonb,'PENDING');

do $$ begin
  if public.current_gameplay_reset_eligibility('10000000-0000-4000-8000-000000000004')->>'reason'<>'PAYMENT' then raise exception 'shop purchase was not denied'; end if;
  if public.current_gameplay_reset_eligibility('10000000-0000-4000-8000-000000000005')->>'reason'<>'PAYMENT' then raise exception 'monthly pass was not denied'; end if;
  if public.current_gameplay_reset_eligibility('10000000-0000-4000-8000-000000000006')->>'reason'<>'GUILD' then raise exception 'guild master was not denied'; end if;
  if public.current_gameplay_reset_eligibility('10000000-0000-4000-8000-000000000007')->>'reason'<>'ACTIVE_GAMEPLAY' then raise exception 'active patrol was not denied'; end if;
  if public.current_gameplay_reset_eligibility('10000000-0000-4000-8000-000000000008')->>'reason'<>'ACTIVE_GAMEPLAY' then raise exception 'pending battle was not denied'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (public.check_current_gameplay_reset_eligibility()->>'reason')<>'PAYMENT' then raise exception 'paid account was not denied'; end if;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
  if not (public.check_current_gameplay_reset_eligibility()->>'eligible')::boolean then raise exception 'free account was not eligible'; end if;
  if (public.reset_current_gameplay('40000000-0000-4000-8000-000000000001',true)->>'status')<>'success' then raise exception 'reset failed'; end if;
  if (public.reset_current_gameplay('40000000-0000-4000-8000-000000000001',true)->>'status')<>'success' then raise exception 'idempotent replay failed'; end if;
end $$;
reset role;

do $$ begin
  if exists(select 1 from public.user_characters where user_id='10000000-0000-4000-8000-000000000001') then raise exception 'characters survived reset'; end if;
  if exists(select 1 from public.user_skills where user_id='10000000-0000-4000-8000-000000000001') then raise exception 'skills survived reset'; end if;
  if exists(select 1 from public.user_items where user_id='10000000-0000-4000-8000-000000000001') then raise exception 'items survived reset'; end if;
  if not exists(select 1 from public.user_lifetime_onboarding_grants where user_id='10000000-0000-4000-8000-000000000001') then raise exception 'lifetime grant was deleted'; end if;
  if not exists(select 1 from public.gacha_execution_history where user_id='10000000-0000-4000-8000-000000000001') then raise exception 'gacha history was deleted'; end if;
  if not exists(select 1 from public.direct_messages where sender_id='10000000-0000-4000-8000-000000000001') then raise exception 'social history was deleted'; end if;
  if not exists(select 1 from public.user_missions where user_id='10000000-0000-4000-8000-000000000001' and status='CLAIMED') then raise exception 'claimed mission was deleted'; end if;
  if exists(select 1 from public.user_missions where user_id='10000000-0000-4000-8000-000000000001' and status='PROGRESS' and current_progress<>0) then raise exception 'mission progress was not reset'; end if;
  if not exists(select 1 from public.tutorial_progress where user_id='10000000-0000-4000-8000-000000000001' and step_id='WORLD_INTRO') then raise exception 'tutorial was not reset'; end if;
  if not exists(select 1 from public.users where id='10000000-0000-4000-8000-000000000001' and username='free' and level=1 and xp=0 and cash=2600 and neon_diamonds=200 and diamonds=0 and vitality=100 and pvp_points=5 and raid_points=5 and current_base_id='shinjuku' and favorite_character_id is null) then raise exception 'fresh defaults or identity mismatch'; end if;
end $$;

update public.tutorial_progress set step_id='FREE_GACHA' where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.execute_tutorial_character_gacha('30000000-0000-4000-8000-000000000099');
reset role;
do $$ declare v_expected text[]; v_actual text[];
begin
  select array_agg(value->>'character_id' order by (value->>'tutorial_slot')::integer) into v_expected
  from public.user_lifetime_onboarding_grants ledger cross join lateral jsonb_array_elements(ledger.canonical_payload->'gacha_results') value
  where ledger.user_id='10000000-0000-4000-8000-000000000001';
  select array_agg(value->>'character_id' order by (value->>'tutorial_slot')::integer) into v_actual
  from public.gacha_execution_history history cross join lateral jsonb_array_elements(history.result_payload->'results') value
  where history.user_id='10000000-0000-4000-8000-000000000001' and history.request_id='30000000-0000-4000-8000-000000000099';
  if v_actual is distinct from v_expected then raise exception 'lifetime tutorial result changed after reset'; end if;
end $$;
update public.user_characters set level=7
  where user_id='10000000-0000-4000-8000-000000000001' and character_id='char_ageha_01';
select public.record_funnel_milestone('10000000-0000-4000-8000-000000000001','first_growth','{"source":"reset-test"}'::jsonb);
update public.tutorial_progress set step_id='AUTO_FORMATION' where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.complete_current_tutorial_formation();
reset role;
do $$ declare v_expected text[]; v_actual text[]; v_skill text; v_leader text;
begin
  select array_agg(value order by ordinality) into v_expected
  from public.user_lifetime_onboarding_grants ledger
  cross join lateral jsonb_array_elements_text(ledger.canonical_payload->'formation_character_ids') with ordinality selected(value,ordinality)
  where ledger.user_id='10000000-0000-4000-8000-000000000001';
  select array_agg(owned.character_id order by formation.slot) into v_actual
  from public.user_main_formations formation join public.user_characters owned on owned.id=formation.user_character_id
  where formation.user_id='10000000-0000-4000-8000-000000000001';
  select favorite_character_id into v_leader from public.users where id='10000000-0000-4000-8000-000000000001';
  select skill_card_id into v_skill from public.user_skills where user_id='10000000-0000-4000-8000-000000000001' and equipped_character_id is not null limit 1;
  if v_actual is distinct from v_expected then raise exception 'lifetime formation changed after reset'; end if;
  if v_leader<>'char_ageha_01' or v_skill<>'SKILL_001' then raise exception 'lifetime leader or starter skill changed after reset'; end if;
end $$;

-- A forced error after the RPC proves that all reset mutations participate in
-- the caller transaction and roll back together.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ begin
  begin
    perform public.reset_current_gameplay('40000000-0000-4000-8000-000000000003',true);
    raise exception 'forced rollback';
  exception when others then
    if sqlerrm<>'forced rollback' then raise; end if;
  end;
  if not exists(select 1 from public.user_characters where user_id='10000000-0000-4000-8000-000000000003') then raise exception 'forced failure did not roll back'; end if;
end $$;
reset role;

rollback;

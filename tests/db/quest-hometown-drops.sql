begin;
set local statement_timeout='30s';
do $$
declare u uuid; c uuid; q text; pool text; first_roll integer; p uuid; j jsonb; seed double precision; roll integer; i integer; found_seed boolean:=false;
begin
 select uc.user_id,uc.id into u,c from user_characters uc join canonical_character_master m on m.version='2026-08-21' and m.character_id=uc.character_id where m.display_name='レイジ' and exists(select 1 from auth.users identity where identity.id=uc.user_id) and exists(select 1 from users profile where profile.id=uc.user_id) and exists(select 1 from user_patrols active where active.user_id=uc.user_id) limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 update user_patrols set status='COMPLETED' where user_id=u and status<>'COMPLETED';
 update user_characters set level=1,awakening_level=0 where id=c;
 select quest_id,reward_pool_id into q,pool from canonical_quest_master where version='2026-08-30' and public.quest_town_key(town_id)='shinjuku' and difficulty='EASY' limit 1;
 select min(roll_index) into first_roll from canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id=pool;
 -- 1%なら落ちず、地元の+2ポイントにより落ちる乱数を固定。
 for i in 0..10000 loop
   seed:=i/10000.0; perform setseed(seed); roll:=floor(random()*10000)::integer;
   if roll>=200 and roll<300 then found_seed:=true; exit; end if;
 end loop;
 if not found_seed then raise exception 'seed unavailable'; end if;
 update canonical_quest_reward_pool_items set probability_bp=case when roll_index=first_roll then 100 else 0 end where version='2026-08-30' and reward_pool_id=pool;
 update users set vitality=100 where id=u;
 j:=public.start_patrol(q,c::text); p:=(j->>'patrol_id')::uuid;
 update user_patrols set expires_at=now()-interval '1 second',status='CLAIMABLE',battle_resolved=true,battle_result='VICTORY' where id=p;
 perform setseed(seed); j:=public.claim_patrol_rewards(p);
 if jsonb_array_length(j->'items')<>1 then raise exception 'drop bonus not applied or zero-probability pool enabled: %',j; end if;
 -- 確定ドロップは100%上限、数量は不変。残り0%は排出しない。
 update canonical_quest_reward_pool_items set probability_bp=10000 where version='2026-08-30' and reward_pool_id=pool and roll_index=first_roll;
 update users set vitality=100 where id=u;
 j:=public.start_patrol(q,c::text); p:=(j->>'patrol_id')::uuid;
 update user_patrols set expires_at=now()-interval '1 second',status='CLAIMABLE',battle_resolved=true,battle_result='VICTORY' where id=p;
 j:=public.claim_patrol_rewards(p);
 if jsonb_array_length(j->'items')<>1 or (j#>>'{items,0,quantity}')::integer<>(select quantity from canonical_quest_reward_pool_items where version='2026-08-30' and reward_pool_id=pool and roll_index=first_roll) then raise exception 'guaranteed quantity changed'; end if;
end $$;
select 'PASS: seeded bonus-only drop, zero-probability exclusion, guaranteed quantity preserved' result;
rollback;

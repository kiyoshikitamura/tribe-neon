-- Preview-only verification. All fixture balances, progression and mission effects rollback.
begin;
set local statement_timeout='30s';
DO $$
declare u uuid; chars uuid[]; equips uuid[]; skills uuid[]; target uuid; result jsonb; oldcash bigint; oldqty integer;
begin
 select id into u from public.users x where
 (select count(*) from public.user_characters c where c.user_id=x.id and coalesce(c.awakening_level,0)<5)>=2 and
 (select count(*) from public.user_equipments e where e.user_id=x.id and coalesce(e.plus_val,0)<9)>=2 and
 (select count(*) from public.user_skills s where s.user_id=x.id and coalesce(s.plus_val,0)<10)>=2 limit 1;
 if u is null then raise exception 'No eligible fixture user';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 select array_agg(id) into chars from (select id from public.user_characters where user_id=u and coalesce(awakening_level,0)<5 order by id limit 2) t;
 select array_agg(id) into equips from (select id from public.user_equipments where user_id=u and coalesce(plus_val,0)<9 order by id limit 2) t;
 select array_agg(id) into skills from (select id from public.user_skills where user_id=u and coalesce(plus_val,0)<10 order by id limit 2) t;
 insert into public.user_items(user_id,item_id,quantity) select u,item,100 from unnest(array['AWAKENING_BOOK','EQUIP_LB_PART','SKILL_MANUAL']) item on conflict(user_id,item_id) do update set quantity=100;
 foreach target in array chars loop
 result:=public.awaken_character(target);
 if result->>'status'<>'success' or (result->>'consumed_quantity')::int<>1 then raise exception 'Awakening target failed';end if;
 end loop;
 if (select quantity from public.user_items where user_id=u and item_id='AWAKENING_BOOK')<>98 then raise exception 'Awakening material count';end if;
 update public.users set cash=0 where id=u;
 foreach target in array equips loop
 select plus_val into oldqty from public.user_equipments where id=target;
 result:=public.limit_break_equipment(target,true,null);
 if (result->>'plus_val')::int<>coalesce(oldqty,0)+1 then raise exception 'Equipment target failed';end if;
 end loop;
 if (select cash from public.users where id=u)<>0 then raise exception 'Equipment charged cash';end if;
 update public.users set cash=100000 where id=u;
 foreach target in array skills loop
 select coalesce(plus_val,0) into oldqty from public.user_skills where id=target;
 select cash into oldcash from public.users where id=u;
 result:=public.limit_break_skill(target,true,null);
 if (result->>'plus_val')::int<>oldqty+1 or (select cash from public.users where id=u)<>oldcash-(oldqty+1)*1000 then raise exception 'Skill target or cash failed';end if;
 end loop;
 if (select quantity from public.user_items where user_id=u and item_id='SKILL_MANUAL')<>98 then raise exception 'Skill material count';end if;
 update public.users set cash=0 where id=u;
 select quantity into oldqty from public.user_items where user_id=u and item_id='SKILL_MANUAL';
 begin perform public.limit_break_skill(skills[1],true,null);raise exception 'Missing cash accepted';exception when sqlstate '23514' then null;end;
 if (select quantity from public.user_items where user_id=u and item_id='SKILL_MANUAL')<>oldqty then raise exception 'Failure consumed material';end if;
end $$;
select 'PASS: awakening A/B, equipment A/B with cash0, skill A/B, atomic insufficient cash' as result;
rollback;

-- Preview-only acceptance: uses Test1 inside a rolled-back transaction.
begin;
do $test$
declare u uuid; g text; args uuid; first jsonb; replay jsonb; other jsonb; result jsonb; reward record; points integer; before_points integer; before_dia bigint; rejected boolean;
begin
 select id into strict u from public.users where username='テスト1';
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 update public.users set neon_diamonds=100000 where id=u;
 insert into public.user_items(user_id,item_id,quantity) values (u,'SPECIAL_TICKET_CHARACTER',100),(u,'SPECIAL_TICKET_SKILL',100),(u,'SPECIAL_TICKET_EQUIPMENT',100)
 on conflict(user_id,item_id) do update set quantity=100;
 foreach g in array array['CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL'] loop
  select current_points into before_points from public.user_gacha_pity_points where user_id=u and pity_master_id='pity_banner:'||g;
  select jsonb_agg(to_jsonb(p) order by pity_master_id) into other from public.user_gacha_pity_points p where user_id=u and pity_master_id<>'pity_banner:'||g;
  args:=gen_random_uuid();
  if g like 'CHAR_%' then first:=public.execute_character_gacha(u,g,10,'ticket',args,null); else first:=public.execute_asset_gacha(u,g,10,'ticket',args,null); end if;
  if jsonb_array_length(first->'results')<>10 then raise exception 'Wrong draw count'; end if;
  select current_points into points from public.user_gacha_pity_points where user_id=u and pity_master_id='pity_banner:'||g;
  if points<>before_points+10 then raise exception 'Wrong point delta'; end if;
  if other is distinct from (select jsonb_agg(to_jsonb(p) order by pity_master_id) from public.user_gacha_pity_points p where user_id=u and pity_master_id<>'pity_banner:'||g) then raise exception 'Cross-banner mutation'; end if;
  if g like 'CHAR_%' then replay:=public.execute_character_gacha(u,g,10,'ticket',args); else replay:=public.execute_asset_gacha(u,g,10,'ticket',args); end if;
  if replay<>first or (select current_points from public.user_gacha_pity_points where user_id=u and pity_master_id='pity_banner:'||g)<>points then raise exception 'Replay mutation'; end if;
  select neon_diamonds into before_dia from public.users where id=u;
  if g like 'CHAR_%' then result:=public.execute_character_gacha(u,g,10,'diamonds',gen_random_uuid(),null); else result:=public.execute_asset_gacha(u,g,10,'diamonds',gen_random_uuid(),null); end if;
  if (select neon_diamonds from public.users where id=u)<>before_dia-(case when g like 'CHAR_%' then 3000 else 2000 end) then raise exception 'Wrong diamond debit'; end if;
  update public.user_gacha_pity_points set current_points=100 where user_id=u and pity_master_id='pity_banner:'||g;
  select item_type,item_id into strict reward from public.gacha_items_master where gacha_id=g and rarity='SSR' order by item_id limit 1;
  args:=gen_random_uuid();
  result:=public.exchange_special_gacha_reward(g,reward.item_type,reward.item_id,args);
  if (result->>'current_points')::integer<>0 then raise exception 'Wrong exchange debit'; end if;
  if public.exchange_special_gacha_reward(g,reward.item_type,reward.item_id,args)<>result then raise exception 'Exchange replay mismatch'; end if;
  rejected:=false;
  begin perform public.exchange_special_gacha_reward(g,reward.item_type,reward.item_id,gen_random_uuid()); exception when others then if sqlerrm like '%insufficient pity%' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'Insufficient points accepted'; end if;
  rejected:=false;
  begin perform public.exchange_special_gacha_reward(case when g='SKILL_SPECIAL' then 'EQUIP_SPECIAL' else 'SKILL_SPECIAL' end,reward.item_type,reward.item_id,gen_random_uuid()); exception when others then if sqlerrm like '%invalid pity reward%' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'Cross-banner exchange accepted'; end if;
 end loop;
end $test$;
select 'PASS: four-banner migration, ticket/diamond 10-pull, isolated accrual, draw replay, SSR exchange/replay, insufficient and foreign reward rejection; ROLLBACK' as result;
rollback;

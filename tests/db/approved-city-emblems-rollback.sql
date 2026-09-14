-- Run after loading approved_city_and_preopen_emblems migration in the SAME
-- transaction with its trailing COMMIT removed. This test always rolls back.
do $test$
declare g uuid; u uuid; available jsonb; denied boolean:=false; city record;
begin
 select gm.guild_id,gm.user_id into g,u from public.guild_members gm join public.guilds gg on gg.id=gm.guild_id where gm.role in ('MASTER','SUB_MASTER') and not gg.is_disbanded limit 1;
 if g is null then raise exception 'TEST_NEEDS_GUILD_LEADER'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 available:=public.list_guild_emblems(g);
 if (select count(*) from jsonb_array_elements(available) x where x->>'id' ~ '^guild_standard_')<>15 then raise exception 'STANDARD_COUNT'; end if;
 if exists(select 1 from jsonb_array_elements(available) x where x->>'id'='guild_preopen_2026_rank_1') then raise exception 'UNOWNED_RANK1_VISIBLE'; end if;
 begin perform public.set_guild_emblem(g,'guild_preopen_2026_rank_1'); exception when sqlstate '22023' then denied:=true; end;
 if not denied then raise exception 'UNOWNED_RANK1_EQUIPPABLE'; end if;
 for city in select id,asset_key from cosmetic_master where id ~ '^guild_standard_[0-9]{2}_' loop
  perform public.set_guild_emblem(g,city.id);
  if public.get_guild_emblems(array[g])->0->>'asset_path' is distinct from city.asset_key then raise exception 'CITY_RENDER_PATH'; end if;
 end loop;
 insert into public.guild_cosmetics(guild_id,cosmetic_id,source_type) values(g,'guild_preopen_2026_rank_1','TEST_ROLLBACK');
 perform public.set_guild_emblem(g,'guild_preopen_2026_rank_1');
 if public.get_guild_emblems(array[g])->0->>'asset_path' is distinct from '/guild-emblems/guild_event_rank1_base.png' then raise exception 'OWNED_RANK1_PATH'; end if;
end $test$;
select 'PASS: 15 standards, 7 city render paths, rank1 ownership gate and owned rendering; transaction rolled back' result;
rollback;

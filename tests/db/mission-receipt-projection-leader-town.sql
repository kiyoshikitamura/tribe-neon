begin;
set local statement_timeout='30s';
do $$
declare u uuid; m text; j jsonb; before_cash bigint; after_cash bigint; c text; town text; manual text; ids text[]; t timestamptz;
begin
 select p.id into u from public.users p join auth.users a on a.id=p.id
 where exists(select 1 from public.user_main_formations f where f.user_id=p.id)
 and exists(select 1 from public.user_missions um where um.user_id=p.id and um.status='CLEAR') limit 1;
 if u is null then raise exception 'populated Preview fixture required'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform public.get_beginner_mission_journey();
 select um.mission_id into m from public.user_missions um join public.missions master on master.id=um.mission_id
 where um.user_id=u and um.status='CLEAR' and master.is_enabled and master.category='NORMAL' limit 1;
 if m is null then raise exception 'normal reward fixture required'; end if;
 select cash into before_cash from public.users where id=u;
 t:=clock_timestamp(); j:=public.claim_mission_reward(m);
 if j#>>'{mission_state,owner}'<>u::text or (j#>>'{mission_state,cash}')::bigint<>(select cash from public.users where id=u) then raise exception 'wallet projection mismatch'; end if;
 if not exists(select 1 from jsonb_array_elements(j#>'{mission_state,missions}') entry where entry->>'mission_id'=m and entry->>'status'='CLAIMED') then raise exception 'claim state missing'; end if;
 if j#>'{mission_state,items}' is distinct from public.get_current_mission_reward_state()->'items' then raise exception 'inventory projection mismatch'; end if;
 select cash into after_cash from public.users where id=u;
 begin perform public.claim_mission_reward(m); raise exception 'duplicate accepted'; exception when check_violation then null; end;
 if (select cash from public.users where id=u)<>after_cash then raise exception 'duplicate cash'; end if;
 j:=public.claim_all_mission_rewards(array[m]);
 if (j->>'claimed_count')::integer<>0 or jsonb_array_length(j->'rewards')<>0 then raise exception 'bulk duplicated'; end if;
 if j#>>'{mission_state,owner}'<>u::text then raise exception 'bulk projection missing'; end if;
 -- 未受取一覧を一括受取し、その場のprojectionと実DBを照合。
 select array_agg(um.mission_id) into ids from public.user_missions um join public.missions master on master.id=um.mission_id where um.user_id=u and um.status='CLEAR' and master.is_enabled and master.category='NORMAL';
 if cardinality(ids)>0 then
 j:=public.claim_all_mission_rewards(ids);
 if (j#>>'{mission_state,cash}')::bigint<>(select cash from public.users where id=u) then raise exception 'bulk wallet mismatch'; end if;
 end if;
 -- 編成済みの異なるリーダーへ。保存と拠点変更が同じ操作で成立。
 select uc.character_id,public.quest_town_key(cm.hometown) into c,town
 from public.user_main_formations f join public.user_characters uc on uc.id=f.user_character_id
 join public.canonical_character_master cm on cm.version='2026-08-21' and cm.character_id=uc.character_id
 where f.user_id=u and uc.character_id is distinct from (select favorite_character_id from public.users where id=u) limit 1;
 if c is null then raise exception 'second leader fixture required'; end if;
 j:=public.set_main_formation_leader(c);
 if (select current_base_id from public.users where id=u)<>town then raise exception 'leader town not saved'; end if;
 manual:=case when town='shinjuku' then 'shibuya' else 'shinjuku' end;
 perform public.move_current_user_base(manual);
 perform public.set_main_formation_leader(c);
 if (select current_base_id from public.users where id=u)<>manual then raise exception 'same leader overwrote manual move'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.get_current_mission_reward_state(); raise exception 'anonymous accepted'; exception when insufficient_privilege then null; end;
end $$;
select 'PASS: single/bulk same-transaction reward projection, double grant rejected, leader hometown saved, manual move preserved, auth required' result;
rollback;

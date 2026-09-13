-- Preview実DB。既存fixtureの操作はすべてROLLBACK。Battle解決はfixtureで設定する。
begin;
set local statement_timeout='30s';
do $$
declare
 u uuid; c record; q text; other_q text; p uuid; j jsonb; snap jsonb;
 before_cash bigint; after_cash bigint; presents_before integer; total_before integer;
 expected integer; base integer; n integer:=0; town text;
begin
 foreach town in array array['新宿','渋谷','池袋','六本木','秋葉原','川崎','横浜'] loop
   if public.quest_town_key(town) is null or public.quest_town_key(upper(public.quest_town_key(town)))<>public.quest_town_key(town) then raise exception 'town normalization'; end if;
 end loop;
 if public.quest_town_key(null) is not null or public.quest_town_key('unknown') is not null then raise exception 'unknown town'; end if;
 select user_id into u from user_characters owned join canonical_character_master m on m.character_id=owned.character_id and m.version='2026-08-21'
 where m.display_name in ('レイジ','アゲハ') group by user_id having count(distinct m.display_name)=2 limit 1;
 if u is null then raise exception 'Preview fixture with Reiji and Ageha required'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 update user_patrols set status='COMPLETED' where user_id=u and status<>'COMPLETED';
 for c in select uc.id,uc.character_id,m.hometown,m.lv1_luk from user_characters uc join canonical_character_master m on m.version='2026-08-21' and m.character_id=uc.character_id where uc.user_id=u and m.display_name in ('レイジ','アゲハ') loop
   update user_characters set level=1,awakening_level=0 where id=c.id;
   update users set vitality=100 where id=u;
   select quest_id,cash_reward into q,base from canonical_quest_master where version='2026-08-30' and difficulty='EASY' and public.quest_town_key(town_id)=public.quest_town_key(c.hometown) and is_production_enabled limit 1;
   j:=public.start_patrol(q,c.id::text); p:=(j->>'patrol_id')::uuid; snap:=j->'hometown_bonus_snapshot'; expected:=c.lv1_luk*10;
   if (snap->>'cash')::integer<>expected or not (snap->>'matched')::boolean or (snap->>'drop_bonus_bp')::integer<>c.lv1_luk*10 then raise exception 'dispatch snapshot mismatch %',snap; end if;
   begin perform public.start_patrol(q,c.id::text); raise exception 'duplicate dispatch accepted'; exception when unique_violation then null; end;
   begin perform public.claim_patrol_rewards(p); raise exception 'early claim accepted'; exception when check_violation then null; end;
   update user_characters set level=100,awakening_level=5 where id=c.id;
   if (select hometown_bonus_snapshot from user_patrols where id=p)<>snap then raise exception 'snapshot drift'; end if;
   update user_patrols set expires_at=now()-interval '1 second' where id=p;
   begin perform public.claim_patrol_rewards(p); raise exception 'unresolved battle accepted'; exception when check_violation then null; end;
   -- 別所有者の報酬取得は拒否される。
   perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
   begin perform public.claim_patrol_rewards(p); raise exception 'foreign claim accepted'; exception when no_data_found then null; end;
   perform set_config('request.jwt.claim.sub',u::text,true);
   update user_patrols set battle_resolved=true,battle_result='VICTORY',status='CLAIMABLE' where id=p;
   select cash into before_cash from users where id=u;
   j:=public.claim_patrol_rewards(p);
   select cash into after_cash from users where id=u;
   if after_cash-before_cash<>base+expected or (j->>'cash')::bigint<>base+expected or (j->>'hometown_bonus_cash')::integer<>expected then raise exception 'cash not granted exactly: %',j; end if;
   if (select rewards_accrued->>'cash' from user_patrols where id=p)::bigint<>base+expected then raise exception 'receipt mismatch'; end if;
   select count(*) into presents_before from presents where user_id=u;
   begin perform public.claim_patrol_rewards(p); raise exception 'duplicate claim accepted'; exception when unique_violation then null; end;
   if (select cash from users where id=u)<>after_cash or (select count(*) from presents where user_id=u)<>presents_before then raise exception 'duplicate reward changed assets'; end if;
   -- 不一致: 同じ担当を別の街へ派遣。育成後でもボーナス0。
   select quest_id,cash_reward into other_q,base from canonical_quest_master where version='2026-08-30' and difficulty='EASY' and public.quest_town_key(town_id)<>public.quest_town_key(c.hometown) and is_production_enabled limit 1;
   update users set vitality=100 where id=u;
   j:=public.start_patrol(other_q,c.id::text); p:=(j->>'patrol_id')::uuid;
   if (j#>>'{hometown_bonus_snapshot,matched}')::boolean or (j#>>'{hometown_bonus_snapshot,cash}')::integer<>0 then raise exception 'unmatched bonus'; end if;
   update user_patrols set expires_at=now()-interval '1 second',battle_resolved=true,battle_result='VICTORY',status='CLAIMABLE' where id=p;
   select cash into before_cash from users where id=u;
   j:=public.claim_patrol_rewards(p);
   if (select cash from users where id=u)-before_cash<>base or (j->>'hometown_bonus_cash')::integer<>0 then raise exception 'unmatched cash changed'; end if;
   n:=n+1;
 end loop;
 if n<>2 then raise exception 'both characters not tested'; end if;
end $$;
select 'PASS: 7town normalization, Reiji/Ageha matched and unmatched grants, frozen LUK, early/unresolved/foreign/duplicate claim rejection, duplicate dispatch' result;
rollback;

-- Preview専用: sufvuqdnqohpfzkwxohq。指定QAのみ、一切の変更はROLLBACK。
begin;
set local statement_timeout='20s';
select set_config('request.jwt.claim.sub','6ea6c81c-e169-457f-9206-92ff85f1495e',true);
do $test$
declare
 v_user constant uuid:='6ea6c81c-e169-457f-9206-92ff85f1495e';
 v_result jsonb; v_patrol uuid; v_character text; v_skill uuid; v_equipment uuid;
begin
 if auth.uid() is distinct from v_user then raise exception 'QA identity mismatch'; end if;
 if not exists(select 1 from public.quest_progression_user_versions where user_id=v_user and progression_version='2026-09-16') then raise exception 'QA progression inactive'; end if;
 if (select count(*) from public.user_main_formations where user_id=v_user)<>5 then raise exception 'QA needs five Main Formation members'; end if;
 update public.quest_progression_guides set step='QUEST_ENTRY',seen_story_towns='{}' where user_id=v_user;
 v_result:=public.advance_quest_progression_guide('ENTER_QUEST');
 if v_result->>'step'<>'PLAY' then raise exception 'entry failed'; end if;
 v_result:=public.advance_quest_progression_guide('ENTER_QUEST');
 if v_result->>'step'<>'PLAY' then raise exception 'entry replay failed'; end if;
 select character_id into strict v_character from public.user_characters where user_id=v_user order by id limit 1;
 insert into public.user_patrols(user_id,course_id,quest_id,character_id,expires_at,progression_kind)
 values(v_user,'q_shinjuku_1','q_shinjuku_1',v_character,now()-interval '1 minute','FIRST_CLEAR') returning id into v_patrol;
 update public.user_patrols set battle_result='DEFEAT',battle_resolved=true where id=v_patrol;
 v_result:=public.get_quest_progression_guide();
 if v_result->>'step'<>'GACHA' then raise exception 'first defeat did not start guide'; end if;
 v_result:=public.advance_quest_progression_guide('OPEN_LOADOUT');
 if v_result->>'step'<>'LOADOUT' then raise exception 'loadout navigation failed'; end if;
 v_result:=public.get_quest_progression_guide();
 if v_result->>'step'<>'LOADOUT' then raise exception 'resume failed'; end if;
 v_result:=public.advance_quest_progression_guide('ENTER_QUEST');
 if v_result->>'step'<>'LOADOUT' then raise exception 'stale action rewound progress'; end if;
 -- 装備所持がある通常系（付与はテストtransaction内のみ）。
 insert into public.user_skills(user_id,skill_card_id,plus_val) values(v_user,'SKILL_001',0) returning id into v_skill;
 insert into public.user_equipments(user_id,equipment_id,level,plus_val) values(v_user,'WEAPON_001',1,0) returning id into v_equipment;
 v_result:=public.advance_quest_progression_guide('APPLY_LOADOUT');
 if v_result->>'step'<>'RETRY' then raise exception 'normal loadout did not advance'; end if;
 if not exists(select 1 from public.user_skills where id=v_skill and equipped_character_id is not null)
 or not exists(select 1 from public.user_equipments where id=v_equipment and equipped_character_id is not null) then raise exception 'assets not equipped'; end if;
 v_result:=public.advance_quest_progression_guide('RETURN_QUEST');
 if v_result->>'step'<>'DONE' then raise exception 'return failed'; end if;
 update public.user_patrols set battle_result='DEFEAT' where id=v_patrol;
 v_result:=public.get_quest_progression_guide();
 if v_result->>'step'<>'DONE' then raise exception 'later defeat repeated guide'; end if;
 v_result:=public.advance_quest_progression_guide('APPLY_LOADOUT');
 if v_result->>'step'<>'DONE' then raise exception 'replayed loadout rewound guide'; end if;
 -- 無料ガチャ消化済み・所持資産ゼロを想定。購入やガチャ実行は条件でない。
 delete from public.user_skills where user_id=v_user;
 delete from public.user_equipments where user_id=v_user;
 update public.quest_progression_guides set step='LOADOUT' where user_id=v_user;
 v_result:=public.advance_quest_progression_guide('APPLY_LOADOUT');
 if v_result->>'step'<>'RETRY' then raise exception 'empty inventory trapped guide'; end if;
 v_result:=public.advance_quest_progression_guide('RETURN_QUEST');
 if v_result->>'step'<>'DONE' then raise exception 'empty inventory return failed'; end if;
 if exists(select 1 from public.user_skills where user_id=v_user) or exists(select 1 from public.user_equipments where user_id=v_user) then raise exception 'fallback fabricated assets'; end if;
 perform public.mark_quest_story_seen('shinjuku');
 v_result:=public.mark_quest_story_seen('shinjuku');
 if (select count(*) from jsonb_array_elements_text(v_result->'seen_story_towns') t where t='shinjuku')<>1 then raise exception 'story duplicate'; end if;
end $test$;
select 'PASS: entry, defeat, guide resume, owned loadout, empty inventory, retry return, replay, story dedupe; QA only; rolled back' as result;
rollback;

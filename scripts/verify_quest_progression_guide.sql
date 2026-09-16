-- Preview DB、認証QA userをJWT subjectへセットしたtransaction内で実行。
-- 既存ユーザーを対象にしない。テスト後はROLLBACKする。
-- 入口と中断再開、再送時に段階が巻き戻らないことを検証。
do $$
declare v_user uuid:=auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'QA JWT subject required'; end if;
  if not exists(select 1 from public.quest_progression_user_versions where user_id=v_user and progression_version='2026-09-16') then raise exception 'QA must be activated'; end if;
  update public.quest_progression_guides set step='QUEST_ENTRY' where user_id=v_user;
  v_result:=public.advance_quest_progression_guide('ENTER_QUEST');
  if v_result->>'step'<>'PLAY' then raise exception 'entry failed'; end if;
  v_result:=public.advance_quest_progression_guide('ENTER_QUEST');
  if v_result->>'step'<>'PLAY' then raise exception 'entry replay failed'; end if;
  update public.quest_progression_guides set step='GACHA' where user_id=v_user;
  v_result:=public.advance_quest_progression_guide('OPEN_LOADOUT');
  if v_result->>'step'<>'LOADOUT' then raise exception 'loadout navigation failed'; end if;
  v_result:=public.get_quest_progression_guide();
  if v_result->>'step'<>'LOADOUT' then raise exception 'resume failed'; end if;
  v_result:=public.advance_quest_progression_guide('ENTER_QUEST');
  if v_result->>'step'<>'LOADOUT' then raise exception 'stale action rewound progress'; end if;
  perform public.mark_quest_story_seen('shinjuku');
  v_result:=public.mark_quest_story_seen('shinjuku');
  if (select count(*) from jsonb_array_elements_text(v_result->'seen_story_towns') t where t='shinjuku')<>1 then raise exception 'story replay duplicate'; end if;
end $$;

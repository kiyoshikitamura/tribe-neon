-- QAデータは全てROLLBACK。migration適用候補と同じtransactionでも実行できる。
begin;
do $$
declare v_uid uuid; v_j jsonb; v_j2 jsonb; v_count bigint; v_cash bigint; v_result jsonb; v_blocked boolean:=false;
begin
  select u.id into v_uid from public.users u
    where not exists(select 1 from public.mission_reward_delivery_ledger l where l.user_id=u.id)
    order by u.created_at desc limit 1;
  if v_uid is null then raise exception 'Preview fixture user required'; end if;
  perform set_config('request.jwt.claim.sub',v_uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
  -- 一般ユーザーの既存テストFixtureをtransaction内に限定して上書き。
  delete from public.user_funnel_milestones where user_id=v_uid;
  update public.user_skills set equipped_character_id=null,slot_index=null where user_id=v_uid;
  update public.user_equipments set equipped_character_id=null,slot_index=null where user_id=v_uid;
  delete from public.user_missions where user_id=v_uid;
  v_j:=public.get_beginner_mission_journey();
  if (v_j#>>'{facts,character}')::boolean then raise exception 'mere ownership must not establish equipment experience'; end if;
  if not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='MIS_N_P002' and status='PROGRESS')
    or not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='MIS_N_P003' and status='PROGRESS') then
    raise exception 'equipment missions must unlock without predecessor claims';
  end if;
  insert into public.user_funnel_milestones(user_id,milestone,metadata) values
    (v_uid,'first_main_loadout','{"skillCount":3,"equipmentCount":15}'),
    (v_uid,'first_free_skill_ten_pull','{}'),(v_uid,'first_free_equipment_ten_pull','{}'),
    (v_uid,'first_pvp','{}'),(v_uid,'post_tutorial_guild_view','{}');
  -- Tutorial経験でQuestを通過。post_tutorial_questがなくても既達成を認識する。
  update public.user_missions set status='CLEAR',current_progress=1,progress_val=1
    where user_id=v_uid and mission_id='MIS_N_P004';
  v_j:=public.get_beginner_mission_journey();
  if not ((v_j->'facts') @> '{"free_skill":true,"free_equipment":true,"character":true,"quest":true,"pvp":true,"guild":true,"raid":false}') then
    raise exception 'authoritative facts projection failed: %',v_j->'facts';
  end if;
  if exists(select 1 from public.user_missions where user_id=v_uid and mission_id in ('MIS_N_P002','MIS_N_P003') and status<>'CLEAR') then
    raise exception 'loadout experience did not clear existing equipment rewards';
  end if;
  -- 前段未受取でも受取でき、既存ledgerで二重付与なし。
  select cash into v_cash from public.users where id=v_uid;
  v_result:=public.claim_mission_reward('MIS_N_P002');
  if not (v_result->>'claimed')::boolean then raise exception 'equipment claim failed'; end if;
  begin perform public.claim_mission_reward('MIS_N_P002'); exception when check_violation then v_blocked:=true; end;
  if not v_blocked then raise exception 'duplicate reward not rejected'; end if;
  if (select cash from public.users where id=v_uid)<>v_cash+100 then raise exception 'cash reward quantity changed'; end if;
  -- 日次再生成後も経験、受取済み、未受取を別々に保持。
  update public.user_missions set cycle_date=((clock_timestamp() at time zone 'Asia/Tokyo')::date-1)
    where user_id=v_uid and mission_id='MIS_D_001';
  v_j2:=public.get_beginner_mission_journey();
  if v_j2->'facts'<>v_j->'facts' then raise exception 'daily rollover removed experience'; end if;
  if not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='MIS_N_P002' and status='CLAIMED') then raise exception 'claimed status lost'; end if;
  -- 未開催をserver確認し、Guild閲覧だけで終端へ。Raid参加/報酬は作らない。
  update public.raid_legacy_settings set enabled=false where singleton;
  perform public.complete_activation_mission_handoff();
  v_j:=public.get_beginner_mission_journey();
  if not (v_j->>'reflow_completed')::boolean or (v_j#>>'{facts,raid}')::boolean then raise exception 'reflow or waiting raid fact invalid'; end if;
  if exists(select 1 from public.user_funnel_milestones where user_id=v_uid and milestone='first_raid') then raise exception 'fake raid participation recorded'; end if;
  if exists(select 1 from public.user_missions where user_id=v_uid and mission_id='MIS_N_P008' and status<>'PROGRESS') then raise exception 'unavailable raid granted achievement'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  v_blocked:=false;
  begin perform public.get_beginner_mission_journey(); exception when insufficient_privilege then v_blocked:=true; end;
  if not v_blocked then raise exception 'unauthenticated snapshot allowed'; end if;
  raise notice 'PASS: unlock, no mere ownership, lifetime facts, claim/retry, rollover, reflow, raid waiting, auth';
end $$;
select 'PASS: beginner mission authority, claim/retry, rollover, reflow and raid waiting' as result;
rollback;

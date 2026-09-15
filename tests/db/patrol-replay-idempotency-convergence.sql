\set ON_ERROR_STOP on
begin;

insert into public.users(id,username)
values
 ('11000000-0000-4000-8000-000000000001','patrol'),
 ('11000000-0000-4000-8000-000000000002','patrol_other');

insert into public.user_characters(id,user_id,character_id,level) values
 ('12000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','char_ageha_01',7),
 ('12000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','char_gou_01',1),
 ('12000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001','char_kenji_01',1),
 ('12000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000001','char_masato_01',1),
 ('12000000-0000-4000-8000-000000000005','11000000-0000-4000-8000-000000000001','char_naoto_01',1);

insert into public.pvp_defense_decks(
  user_id,character_1_id,character_2_id,character_3_id,character_4_id,character_5_id
) values(
  '11000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000003',
  '12000000-0000-4000-8000-000000000004',
  '12000000-0000-4000-8000-000000000005'
);

insert into public.user_patrols(
  id,user_id,course_id,quest_id,character_id,status,has_battle_event,battle_resolved,expires_at,encounter_snapshot
) values(
  '13000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'q_shinjuku_1','q_shinjuku_1','char_ageha_01','ONGOING',true,false,now()+interval '1 minute',null
),(
  '13000000-0000-4000-8000-000000000002',
  '11000000-0000-4000-8000-000000000001',
  'q_shinjuku_1','q_shinjuku_1','char_ageha_01','ONGOING',true,false,now()-interval '1 second',
  null
),(
  '13000000-0000-4000-8000-000000000003',
  '11000000-0000-4000-8000-000000000001',
  'q_shinjuku_1','q_shinjuku_1','char_ageha_01','ONGOING',true,false,now()+interval '1 minute',
  null
),(
  '13000000-0000-4000-8000-000000000004',
  '11000000-0000-4000-8000-000000000002',
  'q_shinjuku_1','q_shinjuku_1','char_ageha_01','ONGOING',true,false,now()-interval '1 second',
  null
);

-- The canonical snapshot trigger intentionally owns INSERT. Override only after it
-- has run so this regression can assert the RPC returns the frozen row payload.
update public.user_patrols
set encounter_snapshot = case id
  when '13000000-0000-4000-8000-000000000002' then '{"encounterId":"natural-completion","members":[{"id":"enemy-1","level":5}]}'::jsonb
  when '13000000-0000-4000-8000-000000000003' then '{"encounterId":"early-completion","members":[{"id":"enemy-1","level":5}]}'::jsonb
  when '13000000-0000-4000-8000-000000000004' then '{"encounterId":"foreign-completion","members":[{"id":"enemy-1","level":5}]}'::jsonb
  else encounter_snapshot
end
where id in (
  '13000000-0000-4000-8000-000000000002',
  '13000000-0000-4000-8000-000000000003',
  '13000000-0000-4000-8000-000000000004'
);

insert into public.tutorial_progress(user_id,step_id)
values('11000000-0000-4000-8000-000000000001','FREE_INSTANT');

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);

do $$
declare
  v_completion jsonb;
  v_encounter jsonb;
  v_first jsonb;
  v_retry jsonb;
  v_resolved_retry jsonb;
  v_count integer;
  v_duplicate_rejected boolean:=false;
  v_early_rejected boolean:=false;
  v_foreign_rejected boolean:=false;
begin
  v_encounter:=public.get_patrol_battle_enemy('13000000-0000-4000-8000-000000000002');
  if v_encounter->>'id'<>'natural-completion' then
    raise exception 'natural completion was not authorized';
  end if;
  if v_encounter->'enemy_data'->'members'->0->>'id'<>'enemy-1' then
    raise exception 'enemy_data did not preserve encounter snapshot';
  end if;

  begin
    perform public.get_patrol_battle_enemy('13000000-0000-4000-8000-000000000003');
  exception when sqlstate 'P0002' then
    v_early_rejected:=true;
  end;
  if not v_early_rejected then
    raise exception 'early natural completion was authorized';
  end if;

  begin
    perform public.get_patrol_battle_enemy('13000000-0000-4000-8000-000000000004');
  exception when sqlstate 'P0002' then
    v_foreign_rejected:=true;
  end;
  if not v_foreign_rejected then
    raise exception 'another user''s natural completion was authorized';
  end if;

  v_completion:=public.complete_patrol_instantly(
    '11000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    'FREE_TUTORIAL'
  );
  if v_completion->>'tutorial_step'<>'TUTORIAL_BATTLE'
     or (select step_id from public.tutorial_progress where user_id='11000000-0000-4000-8000-000000000001')<>'TUTORIAL_BATTLE'
     or (select status from public.user_patrols where id='13000000-0000-4000-8000-000000000001')<>'CLAIMABLE' then
    raise exception 'instant completion did not authorize the tutorial encounter';
  end if;

  v_encounter:=public.get_patrol_battle_enemy('13000000-0000-4000-8000-000000000001');
  if v_encounter->>'quest_id'<>'q_shinjuku_1' then
    raise exception 'tutorial encounter authority was not reachable';
  end if;

  begin
    perform public.complete_patrol_instantly(
      '11000000-0000-4000-8000-000000000001',
      '13000000-0000-4000-8000-000000000001',
      'FREE_TUTORIAL'
    );
  exception when check_violation then
    v_duplicate_rejected:=true;
  end;
  if not v_duplicate_rejected then
    raise exception 'duplicate instant completion was not rejected';
  end if;
  if exists(select 1 from public.presents where user_id='11000000-0000-4000-8000-000000000001') then
    raise exception 'instant completion granted a reward before battle finalization';
  end if;

  v_first:=public.create_patrol_battle_replay(
    '13000000-0000-4000-8000-000000000001','ATTACK_PRIORITY'
  );
  v_retry:=public.create_patrol_battle_replay(
    '13000000-0000-4000-8000-000000000001','ATTACK_PRIORITY'
  );
  if v_first->>'replay_session_id' is distinct from v_retry->>'replay_session_id' then
    raise exception 'duplicate retry created a second replay';
  end if;

  update public.battle_replay_sessions set status='RESOLVED'
  where id=(v_first->>'replay_session_id')::uuid;
  v_resolved_retry:=public.create_patrol_battle_replay(
    '13000000-0000-4000-8000-000000000001','ATTACK_PRIORITY'
  );
  if v_first->>'replay_session_id' is distinct from v_resolved_retry->>'replay_session_id' then
    raise exception 'resolved retry created a second replay';
  end if;

  select count(*) into v_count
  from public.battle_replay_sessions
  where requester_user_id='11000000-0000-4000-8000-000000000001'
    and battle_mode='QUEST'
    and source_reference_id='13000000-0000-4000-8000-000000000001';
  if v_count<>1 then
    raise exception 'expected one patrol replay, got %',v_count;
  end if;
end $$;

reset role;
rollback;

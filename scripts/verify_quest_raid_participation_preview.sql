-- Preview専用 READ ONLY。参加済み・未参加の実データ投影を照合する。
begin;
set transaction read only;
set local statement_timeout='10s';
do $test$
declare e record; p jsonb; expected boolean; started_count integer:=0; later_count integer:=0;
begin
 for e in select * from public.quest_raid_encounters loop
  p:=public.quest_raid_encounter_projection_v1(e.patrol_id);
  select exists(select 1 from public.raid_room_battle_start_requests s where s.room_id=e.room_id and s.user_id=e.user_id) into expected;
  if (p->>'participated')::boolean is distinct from expected then raise exception 'participation projection mismatch'; end if;
  if e.status='CREATED' and expected then started_count:=started_count+1; end if;
  if e.status='CREATED' and not expected then later_count:=later_count+1; end if;
  if e.room_id is null and (p->>'participated')::boolean then raise exception 'uncreated encounter incorrectly participated'; end if;
 end loop;
 if started_count=0 or later_count=0 then raise exception 'both started and unstarted Preview fixtures required'; end if;
end $test$;
select 'PASS: successful battle start suppresses banner; unstarted owner keeps entrance; no room stays unparticipated; read only' result;
rollback;
